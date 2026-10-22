interface Env { ASSETS: { fetch(request: Request): Promise<Response> }; CWA_API_KEY: string }
interface CwaElement { elementName: string; time?: Array<{ startTime?: string; parameter?: { parameterName?: string } }> }
interface CwaLocation { locationName: string; weatherElement?: CwaElement[] }
interface CwaResponse { records?: { location?: CwaLocation[] } }
const cityNames = ['基隆市','臺北市','新北市','桃園市','新竹市','新竹縣','苗栗縣','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
function value(elements: CwaElement[] | undefined, key: string) {
  const item = elements?.find(e => e.elementName === key)?.time?.find(t => {
    const v = t.parameter?.parameterName;
    return Boolean(v && v !== '-99' && v !== 'X');
  });
  return item?.parameter?.parameterName ? { value: item.parameter.parameterName, time: item.startTime } : null;
}
async function weather(env: Env) {
  if (!env.CWA_API_KEY) return Response.json({ error:'CWA_API_KEY_REQUIRED', message:'請在 Cloudflare Worker Settings → Variables and Secrets 新增加密變數 CWA_API_KEY。' }, {status:503});
  const url = new URL('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001');
  url.searchParams.set('Authorization', env.CWA_API_KEY); url.searchParams.set('format','JSON');
  try {
    const res = await fetch(url, {headers:{accept:'application/json'}});
    if (!res.ok) return Response.json({error:'CWA_UPSTREAM_ERROR',message:'中央氣象署資料暫時無法取得。',upstreamStatus:res.status},{status:502});
    const payload = await res.json() as CwaResponse;
    const locations = payload.records?.location ?? [];
    if (!locations.length) return Response.json({error:'CWA_EMPTY_RESPONSE',message:'中央氣象署回傳資料格式不符或沒有資料。'},{status:502});
    const forecasts = cityNames.map(name => {
      const loc = locations.find(x => x.locationName === name || x.locationName.replaceAll('臺','台') === name.replaceAll('臺','台'));
      const e = loc?.weatherElement;
      const wx=value(e,['Wx'][0]), pop=value(e,'PoP'), min=value(e,'MinT'), max=value(e,'MaxT'), ci=value(e,'CI');
      return {name,available:Boolean(loc),weather:wx?.value??null,rainProbability:pop?Number(pop.value):null,minTemperature:min?Number(min.value):null,maxTemperature:max?Number(max.value):null,comfort:ci?.value??null,forecastTime:wx?.time??pop?.time??null};
    });
    return Response.json({source:'中央氣象署開放資料平台',dataset:'F-C0032-001',fetchedAt:new Date().toISOString(),forecasts},{headers:{'Cache-Control':'public, max-age=300, s-maxage=600'}});
  } catch { return Response.json({error:'CWA_FETCH_FAILED',message:'連線中央氣象署失敗，請稍後再試。'},{status:502}); }
}
export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return Response.json({ok:true,service:'HolidayPredictor Worker',officialWeatherConfigured:Boolean(env.CWA_API_KEY)});
  if (url.pathname === '/api/weather') return weather(env);
  return env.ASSETS.fetch(request);
} } satisfies ExportedHandler<Env>;
