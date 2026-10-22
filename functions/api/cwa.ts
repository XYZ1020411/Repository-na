interface Env { CWA_API_KEY: string; }
const DATASETS = {
  weeklyForecast: "F-C0032-005",
  townshipForecast: "F-D0047-091",
  warningByCounty: "W-C0033-002",
  warningContent: "W-C0034-005",
} as const;
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "weeklyForecast";
  const dataid = DATASETS[kind as keyof typeof DATASETS];
  if (!dataid) return Response.json({ error: "UNKNOWN_DATASET", allowed: Object.keys(DATASETS) }, { status: 400 });
  if (!env.CWA_API_KEY) return Response.json({ error: "CWA_API_KEY_REQUIRED", message: "請在 Cloudflare Pages 設定 CWA_API_KEY secret。" }, { status: 503 });
  const endpoint = new URL(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${dataid}`);
  endpoint.searchParams.set("Authorization", env.CWA_API_KEY);
  endpoint.searchParams.set("format", "JSON");
  const upstream = await fetch(endpoint.toString(), { headers: { accept: "application/json" } });
  const body = await upstream.text();
  if (!upstream.ok) return Response.json({ error: "CWA_UPSTREAM_ERROR", status: upstream.status }, { status: 502 });
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return Response.json({ error: "CWA_INVALID_JSON" }, { status: 502 }); }
  return Response.json({ source: "中央氣象署氣象資料開放平台", dataset: dataid, fetchedAt: new Date().toISOString(), data: parsed }, { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
};
