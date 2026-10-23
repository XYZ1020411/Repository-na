interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CWA_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_TARGET_USER_ID?: string;
  LINE_OA_URL?: string;
  ANNOUNCEMENTS_KV?: { put(key:string,value:string,options?:{expirationTtl?:number}):Promise<void>; get(key:string,type:'json'):Promise<any> };
}
interface CwaElement { elementName: string; time?: Array<{ startTime?: string; parameter?: { parameterName?: string } }> }
interface CwaLocation { locationName: string; weatherElement?: CwaElement[] }
interface CwaResponse { records?: { location?: CwaLocation[] } }
const DGPA_URL = 'https://www.dgpa.gov.tw/typh/daily/nds.html';
const CWA_URL = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
const TYPHOON_URL = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const CITY_NAMES = ['基隆市','臺北市','新北市','桃園市','新竹市','新竹縣','苗栗縣','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
const esc = (s: string) => s.replaceAll('&nbsp;',' ').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;','\'');
function plainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:tr|td|th|p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}
async function fetchOfficialSuspension() {
  const response = await fetch(DGPA_URL, { headers: { 'User-Agent': 'HolidayPredictor/1.0 (official announcement reader)', 'Accept': 'text/html' }, cf: { cacheTtl: 180, cacheEverything: true } });
  if (!response.ok) throw new Error('DGPA_HTTP_' + response.status);
  const html = await response.text();
  const text = plainText(html);
  const updated = text.match(/更新時間：?\s*([0-9]{4}[\/.-][0-9]{1,2}[\/.-][0-9]{1,2}\s+[0-9:]+)/)?.[1] ?? null;
  const today = text.match(/((?:\d{3,4})年\s*\d{1,2}月\s*\d{1,2}日)\s*天然災害停止上班及上課情形/)?.[1] ?? null;
  const globalNoNotice = /無停班停課訊息/.test(text);
  const rows = CITY_NAMES.map(city => {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pattern = new RegExp(escaped + '\\s+([\\s\\S]{0,100}?)(?=' + CITY_NAMES.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|') + '|備註：|外島地區|中部地區|南部地區|東部地區|北部地區|$)');
    const match = text.match(pattern);
    const detail = match?.[1]?.trim() ?? '';
    const isSuspended = /停止上班[、及與]?\s*停止上課|停止上班、停止上課/.test(detail);
    const partial = /照常上班[、及與]停止上課|停止上班[、及與]照常上課|未達停止上班[、及與]已達停止上課|已達停止上班[、及與]未達停止上課/.test(detail);
    const reachedOnly = /已達停止上班及上課標準|已達停止上班上課標準/.test(detail) && !isSuspended;
    const status = isSuspended ? 'suspended' : partial ? 'partial' : reachedOnly ? 'pending' : /未達停止上班|無停班停課訊息/.test(detail) || (!detail && globalNoNotice) ? 'no_closure_notice' : 'pending';
    return { city, status, isSuspended: status === 'suspended' ? true : status === 'no_closure_notice' ? false : null, detail: detail || '官方頁面未提供可解析的縣市狀態' };
  });
  return { source: '行政院人事行政總處', sourceUrl: DGPA_URL, fetchedAt: new Date().toISOString(), updatedAt: updated, bulletinDate: today, rows, pageText: text.slice(0, 12000) };
}
function findCwaValue(elements: CwaElement[] | undefined, key: string) {
  const item = elements?.find(e => e.elementName === key)?.time?.find(t => {
    const value = t.parameter?.parameterName;
    return Boolean(value && value !== '-99' && value !== 'X');
  });
  return item?.parameter?.parameterName ? { value: item.parameter.parameterName, time: item.startTime } : null;
}
async function weather(env: Env) {
  if (!env.CWA_API_KEY) return Response.json({ error:'CWA_API_KEY_REQUIRED', message:'請在 Cloudflare Worker Settings → Variables and Secrets 設定 CWA_API_KEY。' }, { status:503 });
  const url = new URL(CWA_URL); url.searchParams.set('Authorization', env.CWA_API_KEY); url.searchParams.set('format','JSON');
  try {
    const response = await fetch(url, { headers:{ accept:'application/json' }, cf:{cacheTtl:600,cacheEverything:true} });
    if (!response.ok) return Response.json({error:'CWA_UPSTREAM_ERROR',message:'中央氣象署資料暫時無法取得。',upstreamStatus:response.status},{status:502});
    const payload = await response.json() as CwaResponse;
    const locations = payload.records?.location ?? [];
    if (!locations.length) return Response.json({error:'CWA_EMPTY_RESPONSE',message:'中央氣象署回傳資料格式不符或沒有資料。'},{status:502});
    const forecasts = CITY_NAMES.map(name => {
      const loc = locations.find(x => x.locationName === name || x.locationName.replaceAll('臺','台') === name.replaceAll('臺','台'));
      const e = loc?.weatherElement;
      const wx=findCwaValue(e,'Wx'), pop=findCwaValue(e,'PoP'), min=findCwaValue(e,'MinT'), max=findCwaValue(e,'MaxT'), ci=findCwaValue(e,'CI');
      return {name,available:Boolean(loc),weather:wx?.value??null,rainProbability:pop?Number(pop.value):null,minTemperature:min?Number(min.value):null,maxTemperature:max?Number(max.value):null,comfort:ci?.value??null,forecastTime:wx?.time??pop?.time??null};
    });
    return Response.json({source:'中央氣象署開放資料平台',dataset:'F-C0032-001',fetchedAt:new Date().toISOString(),forecasts},{headers:{'Cache-Control':'public, max-age=300, s-maxage=600'}});
  } catch { return Response.json({error:'CWA_FETCH_FAILED',message:'連線中央氣象署失敗，請稍後再試。'},{status:502}); }
}

async function typhoon(env: Env) {
  if (!env.CWA_API_KEY) return Response.json({status:'pending',message:'尚未設定中央氣象署 API 金鑰',sourceUrl:'https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html',fetchedAt:new Date().toISOString(),items:[]},{status:503});
  const url=new URL(TYPHOON_URL); url.searchParams.set('Authorization',env.CWA_API_KEY); url.searchParams.set('format','JSON');
  try {
    const response=await fetch(url,{headers:{accept:'application/json'},cf:{cacheTtl:300,cacheEverything:true}});
    if(!response.ok) return Response.json({status:'pending',message:'中央氣象署颱風資料暫時無法取得',sourceUrl:'https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html',fetchedAt:new Date().toISOString(),items:[]},{status:502});
    const payload=await response.json() as any;
    const records=payload?.records;
    const items:any[]=[];
    const seen=new Set<string>();
    const walk=(node:any,path='')=>{
      if(!node||typeof node!=='object') return;
      if(Array.isArray(node)){for(const value of node) walk(value,path);return;}
      const entries=Object.entries(node);
      const pick=(keys:string[])=>entries.find(([k,v])=>keys.some(key=>key.test(k)) && (typeof v==='number'||typeof v==='string'))?.[1];
      const lat=pick([/latitude/i,/lat$/i,/緯度/]); const lon=pick([/longitude/i,/lon$/i,/lng/i,/經度/]);
      if(lat!==undefined&&lon!==undefined){
        const latitude=Number(String(lat).replace(/[°Nn]/g,'')); const longitude=Number(String(lon).replace(/[°Ee]/g,''));
        if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180){
          const name=String(pick([/typhoonName/i,/stormName/i,/name/i,/颱風名稱/])??'颱風中心');
          const key=latitude.toFixed(3)+','+longitude.toFixed(3)+','+name;
          if(!seen.has(key)){seen.add(key);items.push({name,latitude,longitude,detail:entries.filter(([k,v])=>/time|date|intensity|status|強度|時間/i.test(k)&&typeof v!=='object').slice(0,8).map(([key,value])=>({key,value}))});}
        }
      }
      for(const [key,value] of entries) walk(value,path+'/'+key);
    };
    walk(records);
    return Response.json({status:items.length?'available':'pending',source:'中央氣象署開放資料平台',dataset:'W-C0034-005',sourceUrl:'https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html',fetchedAt:new Date().toISOString(),message:items.length?'已取得颱風位置資料':'目前沒有可辨識的颱風座標；可能目前沒有颱風警報，或官方資料格式已更新',items:items.slice(0,30)},{headers:{'Cache-Control':'public, max-age=180, s-maxage=300'}});
  } catch {
    return Response.json({status:'pending',message:'連線中央氣象署颱風資料失敗',sourceUrl:'https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html',fetchedAt:new Date().toISOString(),items:[]},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
async function linePush(request:Request,env:Env) {
  if(!env.ADMIN_PASSWORD || !env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_TARGET_USER_ID) return Response.json({ok:false,message:'LINE 推播尚未設定；請在 Cloudflare Worker Secrets 設定 ADMIN_PASSWORD、LINE_CHANNEL_ACCESS_TOKEN、LINE_TARGET_USER_ID。'},{status:503});
  let body:any={}; try{body=await request.json();}catch{}
  if(body.adminPassword!==env.ADMIN_PASSWORD) return Response.json({ok:false,message:'管理員驗證失敗'},{status:401});
  const message=String(body.message??'官方公告有更新，請查看 HolidayPredictor。').slice(0,1000);
  try{
    const response=await fetch(LINE_PUSH_URL,{method:'POST',headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({to:env.LINE_TARGET_USER_ID,messages:[{type:'text',text:message}]})});
    if(!response.ok) return Response.json({ok:false,message:'LINE API 推播失敗',status:response.status},{status:502});
    return Response.json({ok:true,message:'LINE 推播已送出'});
  }catch{return Response.json({ok:false,message:'無法連線 LINE API'},{status:502});}
}

function suspensionPayload(data: Awaited<ReturnType<typeof fetchOfficialSuspension>>, city?: string) {
  const rows = city ? data.rows.filter(r => r.city === city || r.city.replaceAll('臺','台') === city.replaceAll('臺','台')) : data.rows;
  return { source:data.source, sourceUrl:data.sourceUrl, fetchedAt:data.fetchedAt, updatedAt:data.updatedAt, bulletinDate:data.bulletinDate, rows };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ok:true,service:'HolidayPredictor Worker',officialWeatherConfigured:Boolean(env.CWA_API_KEY),officialSuspensionSource:DGPA_URL});
    if (url.pathname === '/api/weather') return weather(env);
    if (url.pathname === '/api/typhoon') return typhoon(env);
    if (url.pathname === '/api/admin/login' && request.method === 'POST') { let body:any={}; try{body=await request.json();}catch{}; if(!env.ADMIN_PASSWORD) return Response.json({ok:false,message:'尚未在 Cloudflare 設定 ADMIN_PASSWORD'},{status:503}); return body.password===env.ADMIN_PASSWORD ? Response.json({ok:true}) : Response.json({ok:false,message:'管理員密碼錯誤'},{status:401}); }
    if (url.pathname === '/api/admin/publish' && request.method === 'POST') {
      if (!env.ADMIN_PASSWORD) return Response.json({ok:false,message:'尚未設定 ADMIN_PASSWORD'},{status:503});
      let body:any={}; try { body=await request.json(); } catch {}
      if (body.adminPassword !== env.ADMIN_PASSWORD) return Response.json({ok:false,message:'管理員驗證失敗'},{status:401});
      const title=String(body.title??'').trim().slice(0,100);
      const message=String(body.message??'').trim().slice(0,1500);
      if (!title || !message) return Response.json({ok:false,message:'請填寫公告標題與內容'},{status:400});
      if (!env.ANNOUNCEMENTS_KV) return Response.json({ok:false,message:'公告資料庫尚未連接。請在 Cloudflare 建立 KV Namespace，並綁定 Worker 變數 ANNOUNCEMENTS_KV。'},{status:503});
      const item={id:crypto.randomUUID(),title,message,publishedAt:new Date().toISOString(),source:'網站管理員',status:'published'};
      const current=await env.ANNOUNCEMENTS_KV.get('public-notices','json') ?? [];
      const list=[item,...(Array.isArray(current)?current:[])].slice(0,50);
      await env.ANNOUNCEMENTS_KV.put('public-notices',JSON.stringify(list));
      let lineSent=false; let lineWarning='';
      if (env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_TARGET_USER_ID) {
        try {
          const lr=await fetch(LINE_PUSH_URL,{method:'POST',headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({to:env.LINE_TARGET_USER_ID,messages:[{type:'text',text:title+'\n'+message}]})});
          lineSent=lr.ok; if(!lr.ok) lineWarning='公告已發布，但 LINE API 傳送失敗（HTTP '+lr.status+'）';
        } catch { lineWarning='公告已發布，但 LINE API 暫時無法連線'; }
      } else lineWarning='公告已發布；LINE 尚未設定，因此未發送 LINE 推播';
      return Response.json({ok:true,item,lineSent,message:lineWarning || '公告已發布並已傳送 LINE 推播'});
    }
    if (url.pathname === '/api/admin/notices' && request.method === 'GET') {
      if (!env.ANNOUNCEMENTS_KV) return Response.json({notices:[],configured:false,message:'公告資料庫尚未連接'});
      const notices=await env.ANNOUNCEMENTS_KV.get('public-notices','json') ?? [];
      return Response.json({notices:Array.isArray(notices)?notices:[],configured:true},{headers:{'Cache-Control':'no-store'}});
    }
    if (url.pathname === '/api/line/status') return Response.json({configured:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN&&env.LINE_TARGET_USER_ID),accountUrl:env.LINE_OA_URL||null,displayName:'LINE 官方帳號（名稱尚未設定）',logoConfigured:false});
    if (url.pathname === '/api/line/push' && request.method === 'POST') return linePush(request,env);
    if (url.pathname === '/api/location' && request.method === 'GET') {
      const lat=Number(url.searchParams.get('lat')); const lon=Number(url.searchParams.get('lon'));
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return Response.json({error:'INVALID_COORDINATES'},{status:400});
      try { const geo=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+lat+'&lon='+lon+'&zoom=10&accept-language=zh-TW',{headers:{'User-Agent':'HolidayPredictor/1.0 contact: support@holidaypredictor.invalid'},cf:{cacheTtl:3600,cacheEverything:true}}); if(!geo.ok) throw new Error('reverse geocode failed'); const data:any=await geo.json(); return Response.json({latitude:lat,longitude:lon,displayName:data.display_name||'已取得座標',address:data.address||{},source:'OpenStreetMap Nominatim'},{headers:{'Cache-Control':'public, max-age=1800'}}); } catch { return Response.json({latitude:lat,longitude:lon,displayName:'已取得座標，無法反查區域名稱',sourceUrl:'https://www.openstreetmap.org/'},{status:200}); }
    }
    if (url.pathname === '/api/suspension' || url.pathname === '/api/announcements') {
      try {
        const data = await fetchOfficialSuspension();
        if (url.pathname === '/api/suspension') {
          const city = url.searchParams.get('city') ?? undefined;
          const result = suspensionPayload(data, city);
          const row = result.rows[0];
          if (city && !row) return Response.json({error:'CITY_NOT_FOUND',message:'官方資料中找不到此縣市。'},{status:404});
          return Response.json(city && row ? {city:row.city,date:data.bulletinDate??new Date().toISOString().slice(0,10),isSuspended:row.isSuspended,status:row.status,note:row.detail,source:data.source,sourceUrl:data.sourceUrl,updatedAt:data.updatedAt??data.fetchedAt} : result, {headers:{'Cache-Control':'public, max-age=120, s-maxage=180'}});
        }
        const notices = data.rows.filter(r => r.status === 'suspended' || r.status === 'partial').map(r => ({id:r.city,title:r.city + ' 停班停課官方訊息',summary:r.detail,source:data.source,url:data.sourceUrl,publishedAt:data.updatedAt??data.fetchedAt,category:'停班停課',status:r.status==='suspended'?'holiday':'pending'}));
        if (!notices.length) notices.push({id:'dgpa-current',title:'官方停班停課公告查詢結果',summary:'目前官方頁面未解析到明確的停止上班／上課公告。這不代表已確認正常上班上課，請查看官方原文及地方政府最新公告。',source:data.source,url:data.sourceUrl,publishedAt:data.updatedAt??data.fetchedAt,category:'停班停課',status:'pending'});
        return Response.json({source:data.source,sourceUrl:data.sourceUrl,fetchedAt:data.fetchedAt,updatedAt:data.updatedAt,bulletinDate:data.bulletinDate,notices},{headers:{'Cache-Control':'public, max-age=120, s-maxage=180'}});
      } catch {
        const now = new Date().toISOString();
        if (url.pathname === '/api/announcements') {
          return Response.json({
            source:'行政院人事行政總處', sourceUrl:DGPA_URL, fetchedAt:now, updatedAt:null,
            parseStatus:'unavailable',
            notices:[{id:'dgpa-pending',title:'官方停班停課公告待確認',summary:'目前無法取得官方公告。這不代表正常上班上課；狀態維持待確認。請查看官方原文及地方政府公告。',source:'行政院人事行政總處',url:DGPA_URL,publishedAt:now,category:'停班停課',status:'pending'}]
          }, {headers:{'Cache-Control':'no-store'}});
        }
        return Response.json({error:'DGPA_FETCH_FAILED',message:'目前無法取得官方公告，狀態維持待確認。',source:'行政院人事行政總處',sourceUrl:DGPA_URL,fetchedAt:now,updatedAt:null,status:'pending',isSuspended:null},{status:502,headers:{'Cache-Control':'no-store'}});
      }
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
