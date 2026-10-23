interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CWA_API_KEY?: string;
}
interface CwaElement { elementName: string; time?: Array<{ startTime?: string; parameter?: { parameterName?: string } }> }
interface CwaLocation { locationName: string; weatherElement?: CwaElement[] }
interface CwaResponse { records?: { location?: CwaLocation[] } }
const DGPA_URL = 'https://www.dgpa.gov.tw/typh/daily/nds.html';
const CWA_URL = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
const CITY_NAMES = ['基隆市','臺北市','新北市','桃園市','新竹市','新竹縣','苗栗縣','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
const esc = (s: string) => s.replaceAll('&nbsp;',' ').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;','\'');
function plainText(html: string): string {
  return html
    .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<\\/(?:tr|td|th|p|div|li|h[1-6])\\s*>/gi, '\\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[ \\t]+/g, ' ')
    .replace(/ *\\n */g, '\\n')
    .trim();
}
async function fetchOfficialSuspension() {
  const response = await fetch(DGPA_URL, { headers: { 'User-Agent': 'HolidayPredictor/1.0 (official announcement reader)', 'Accept': 'text/html' }, cf: { cacheTtl: 180, cacheEverything: true } });
  if (!response.ok) throw new Error('DGPA_HTTP_' + response.status);
  const html = await response.text();
  const text = plainText(html);
  const updated = text.match(/更新時間：?\s*([0-9]{4}[\/.-][0-9]{1,2}[\/.-][0-9]{1,2}\s+[0-9:]+)/)?.[1] ?? null;
  const today = text.match(/(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*天然災害停止上班及上課情形/)?.[1] ?? null;
  const globalNoNotice = /無停班停課訊息/.test(text);\n  const rows = CITY_NAMES.map(city => {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pattern = new RegExp(escaped + '\\s+(.{0,100}?)(?=' + CITY_NAMES.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|') + '|備註：|外島地區|中部地區|南部地區|東部地區|北部地區|$)');
    const match = text.match(pattern);
    const detail = match?.[1]?.trim() ?? '';
    const isSuspended = /停止上班[、及與]?\s*停止上課|停止上班、停止上課/.test(detail);
    const partial = /停止上班|停止上課/.test(detail) && !/未達停止上班|未達停止上課/.test(detail);
    const reachedOnly = /已達停止上班及上課標準|已達停止上班上課標準/.test(detail) && !isSuspended;
    const status = isSuspended ? 'suspended' : partial ? 'partial' : reachedOnly ? 'pending' : /未達停止上班|無停班停課訊息/.test(detail) || (!detail && globalNoNotice) ? 'no_closure_notice' : 'pending';\n    return { city, status, isSuspended: status === 'suspended' ? true : status === 'no_closure_notice' ? false : null, detail: detail || '官方頁面未提供可解析的縣市狀態' };
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
function suspensionPayload(data: Awaited<ReturnType<typeof fetchOfficialSuspension>>, city?: string) {
  const rows = city ? data.rows.filter(r => r.city === city || r.city.replaceAll('臺','台') === city.replaceAll('臺','台')) : data.rows;
  return { source:data.source, sourceUrl:data.sourceUrl, fetchedAt:data.fetchedAt, updatedAt:data.updatedAt, bulletinDate:data.bulletinDate, rows };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ok:true,service:'HolidayPredictor Worker',officialWeatherConfigured:Boolean(env.CWA_API_KEY),officialSuspensionSource:DGPA_URL});
    if (url.pathname === '/api/weather') return weather(env);
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
        return Response.json({error:'DGPA_FETCH_FAILED',message:'目前無法讀取人事行政總處官方頁面，請直接查看官方來源。',sourceUrl:DGPA_URL},{status:502});
      }
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
