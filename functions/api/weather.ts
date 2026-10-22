interface Env { CWA_API_KEY: string }
interface CwaElement { elementName: string; time?: Array<{ startTime?: string; endTime?: string; parameter?: { parameterName?: string; parameterUnit?: string } }> }
interface CwaLocation { locationName: string; weatherElement?: CwaElement[] }
interface CwaResponse { success?: string; records?: { location?: CwaLocation[] } }
const cityNames = ['基隆市','臺北市','新北市','桃園市','新竹市','新竹縣','苗栗縣','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
function firstValue(elements: CwaElement[] | undefined, names: string[]): { value: string; time?: string } | null {
  for (const name of names) {
    const element = elements?.find(e => e.elementName === name);
    const item = element?.time?.find(t => t.parameter?.parameterName && t.parameter.parameterName !== '-99' && t.parameter.parameterName !== 'X');
    if (item?.parameter?.parameterName) return { value: item.parameter.parameterName, time: item.startTime };
  }
  return null;
}
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.CWA_API_KEY) return Response.json({ error: 'CWA_API_KEY_REQUIRED', message: '請在 Cloudflare Pages → Settings → Variables and Secrets 設定 CWA_API_KEY。' }, { status: 503 });
  const url = new URL('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001');
  url.searchParams.set('Authorization', env.CWA_API_KEY);
  url.searchParams.set('format', 'JSON');
  try {
    const response = await fetch(url.toString(), { headers: { accept: 'application/json' }, cf: { cacheTtl: 600, cacheEverything: true } });
    if (!response.ok) return Response.json({ error: 'CWA_UPSTREAM_ERROR', status: response.status, message: '中央氣象署資料暫時無法取得。' }, { status: 502 });
    const payload = await response.json() as CwaResponse;
    const locations = payload.records?.location ?? [];
    if (!locations.length) return Response.json({ error: 'CWA_EMPTY_RESPONSE', message: '中央氣象署回傳資料格式不符或沒有資料。' }, { status: 502 });
    const forecasts = cityNames.map(name => {
      const loc = locations.find(item => item.locationName === name || item.locationName.replace('臺','台') === name.replace('臺','台'));
      const elements = loc?.weatherElement;
      const wx = firstValue(elements, ['Wx']);
      const pop = firstValue(elements, ['PoP']);
      const min = firstValue(elements, ['MinT']);
      const max = firstValue(elements, ['MaxT']);
      const ci = firstValue(elements, ['CI']);
      return { name, available: Boolean(loc), weather: wx?.value ?? null, rainProbability: pop ? Number(pop.value) : null, minTemperature: min ? Number(min.value) : null, maxTemperature: max ? Number(max.value) : null, comfort: ci?.value ?? null, forecastTime: wx?.time ?? pop?.time ?? null };
    });
    return Response.json({ source: '中央氣象署開放資料平台', dataset: 'F-C0032-001', fetchedAt: new Date().toISOString(), forecasts }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600' } });
  } catch {
    return Response.json({ error: 'CWA_FETCH_FAILED', message: '連線中央氣象署失敗，請稍後再試。' }, { status: 502 });
  }
};
