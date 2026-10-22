export const onRequestGet: PagesFunction = async () => {
  const sources = [
    { id: "dgpa", name: "行政院人事行政總處－天然災害停止上班及上課情形", url: "https://www.dgpa.gov.tw/typh/daily/nds.html?OpBrowser=1", authority: "各地方政府公告彙整" },
    { id: "ncdr", name: "民生示警公開資料平台－停班停課", url: "https://alerts.ncdr.nat.gov.tw/calamityAlertSearch_immediately.aspx", authority: "國家災害防救科技中心／人事行政總處" },
    { id: "cwa", name: "中央氣象署氣象資料開放平台", url: "https://opendata.cwa.gov.tw/", authority: "官方氣象資料" },
  ];
  return Response.json({ sources, status: "links_only", message: "官方公告頁面已列出；尚未把各地方政府公告解析成逐縣市狀態，因此不得推定為正常上班上課。" }, { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
};
