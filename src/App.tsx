import { useEffect, useMemo, useState } from 'react';
import { Bell, Cloud, CloudRain, ExternalLink, RefreshCw, Search, ShieldAlert, Wind } from 'lucide-react';
import { citiesBase, regions, scenarios, scenarioData } from './data';
import type { City } from './types';

type OfficialForecast = {
  name: string;
  available: boolean;
  weather: string | null;
  rainProbability: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  comfort: string | null;
  forecastTime: string | null;
};

type OfficialNotice = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  category: '停班停課' | '天氣' | '行政';
  status: 'normal' | 'holiday' | 'pending';
};

const ADMIN_PASSWORD = 'holiday-admin';
const STORAGE_KEY = 'holiday-admin-enabled';
const ANNOUNCEMENT_KEY = 'holiday-admin-notice';

const fallbackNotices: OfficialNotice[] = [
  {
    id: 'f1',
    title: '示範公告：中部地區可能因大雨影響停班停課',
    summary: '依照示範情境，平台會在風雨警示升級時發出通知。',
    source: '政府示範資料',
    url: 'https://www.dgpa.gov.tw/',
    publishedAt: new Date().toISOString(),
    category: '停班停課',
    status: 'pending',
  },
];

const statusLabel = (status: City['status']) => {
  switch (status) {
    case 'holiday':
      return '停班停課';
    case 'normal':
      return '正常上班';
    default:
      return '待確認';
  }
};

export default function App() {
  const [officialForecasts, setOfficialForecasts] = useState<OfficialForecast[]>([]);
  const [officialStatus, setOfficialStatus] = useState('正在連線中央氣象署…');
  const [statusCode, setStatusCode] = useState(0);
  const [region, setRegion] = useState('全部地區');
  const [selected, setSelected] = useState('新竹市');
  const [scenario, setScenario] = useState(scenarios[0]);
  const [search, setSearch] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminMode, setAdminMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState('通知未啟用');
  const [notices, setNotices] = useState<OfficialNotice[]>(fallbackNotices);
  const [adminAnnouncement, setAdminAnnouncement] = useState<string>(() => {
    if (typeof window === 'undefined') return '不提供測試通報';
    return localStorage.getItem(ANNOUNCEMENT_KEY) ?? '不提供測試通報';
  });
  const [lastPushAt, setLastPushAt] = useState<string | null>(null);

  const currentCityData = useMemo(() => scenarioData(scenario), [scenario]);

  const visibleCities = useMemo(() => {
    const keyword = search.trim();
    return currentCityData.filter((city) => {
      const regionOk = region === '全部地區' || city.region === region;
      const text = `${city.name}${city.region}`.toLowerCase();
      const searchOk = !keyword || text.includes(keyword.toLowerCase());
      return regionOk && searchOk;
    });
  }, [currentCityData, region, search]);

  const selectedCity = useMemo(() => {
    return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/40">
              <CloudRain className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">HolidayPredictor</p>
              <h1 className="mt-1 text-lg font-bold sm:text-xl">台灣停班停課資訊站</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshAnnouncement} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-200 hover:border-cyan-400">
              <RefreshCw className="h-4 w-4" /> 更新公告
            </button>
            {!adminMode ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 p-1.5">
                <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="管理密碼" className="w-24 bg-transparent px-2 text-sm outline-none sm:w-32" />
                <button onClick={loginAsAdmin} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950">登入</button>
              </div>
            ) : (
              <button onClick={() => setAdminMode(false)} className="rounded-xl bg-emerald-400 px-3 py-2.5 text-sm font-bold text-slate-950">管理員登出</button>
            )}
          </div>
        </header>

        <section className="relative mb-6 overflow-hidden rounded-[2rem] border border-cyan-900/70 bg-gradient-to-br from-[#10283b] via-[#101c30] to-[#111827] p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1.15fr_0.85fr] md:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-300" /> 官方公告狀態：待確認
              </div>
              <p className="text-sm font-medium text-slate-400">台灣各縣市即時資訊</p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-white sm:text-4xl">今天是否停班停課？</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">整合官方天氣預報與停班停課公告。公告尚未取得或尚未確認時，不會直接推定為正常上班上課。</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href="https://www.dgpa.gov.tw/typh/daily/nds.html" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300">查看人事行政總處 <ExternalLink className="h-4 w-4" /></a>
                <a href="https://www.cwa.gov.tw/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-slate-100 hover:border-cyan-400">中央氣象署 <ExternalLink className="h-4 w-4" /></a>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">目前選取縣市</p>
                  <h3 className="mt-1 text-2xl font-black text-white">{selectedCity.name}</h3>
                </div>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-200">{statusLabel(selectedCity.status)}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 p-4">
                  <Wind className="mb-2 h-5 w-5 text-cyan-300" />
                  <p className="text-xs text-slate-400">風力指標</p>
                  <p className="mt-1 text-xl font-bold">{selectedCity.gust} <span className="text-xs font-normal text-slate-400">級</span></p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <CloudRain className="mb-2 h-5 w-5 text-sky-300" />
                  <p className="text-xs text-slate-400">降雨風險</p>
                  <p className="mt-1 text-xl font-bold">{selectedCity.probability}%</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">天氣預報</span>
                  <span className="font-semibold text-slate-100">{officialForecasts.find((item) => item.name === selectedCity.name)?.weather || '待更新'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-slate-400">天氣資料來源</span>
                  <span className="text-right text-xs text-cyan-200">{officialStatus}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs text-slate-400">縣市覆蓋</p><p className="mt-2 text-2xl font-black">22 <span className="text-sm font-medium text-slate-400">縣市</span></p>
            <p className="mt-1 text-xs text-slate-500">全台縣市公告狀態總覽</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs text-slate-400">官方公告</p><p className="mt-2 text-xl font-black text-amber-200">尚待確認</p>
            <p className="mt-1 text-xs text-slate-500">請以政府原始公告為準</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs text-slate-400">天氣資料來源</p><p className="mt-2 text-xl font-black">中央氣象署</p>
            <p className="mt-1 text-xs text-slate-500">狀態：{statusCode ? '已連線' : '待檢查連線'}</p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
          <section className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">City dashboard</p><h2 className="mt-1 text-2xl font-black">全台縣市公告總覽</h2><p className="mt-2 text-sm text-slate-400">選擇縣市查看風雨指標與目前判定。</p></div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5">
                <Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋縣市" className="w-28 bg-transparent text-sm outline-none sm:w-40" />
              </div>
            </div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {regions.map((item) => <button key={item} onClick={() => setRegion(item)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${region === item ? 'bg-cyan-400 text-slate-950' : 'border border-slate-700 bg-slate-800 text-slate-300 hover:border-cyan-400'}`}>{item}</button>)}
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-slate-500">情境模擬</span>
              {scenarios.map((item) => <button key={item} onClick={() => setScenario(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${scenario === item ? 'bg-violet-400 text-slate-950' : 'border border-slate-700 bg-slate-800 text-slate-300'}`}>{item}</button>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleCities.map((item) => {
                const active = selectedCity?.name === item.name;
                return <button key={item.name} onClick={() => setSelected(item.name)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${active ? 'border-cyan-400 bg-cyan-400/10 ring-1 ring-cyan-400/20' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'}`}>
                  <div className="flex items-start justify-between gap-2"><span className="font-bold">{item.name}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.status === 'holiday' ? 'bg-rose-400/15 text-rose-200' : item.status === 'normal' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>{statusLabel(item.status)}</span></div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>風力指標</span><span className="font-semibold text-slate-200">{item.gust} 級</span></div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>降雨風險</span><span className="font-semibold text-slate-200">{item.probability}%</span></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(0, Math.min(100, item.probability))}%` }} /></div>
                </button>;
              })}
            </div>
            {visibleCities.length === 0 && <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">找不到符合條件的縣市。</p>}
            <p className="mt-4 text-xs leading-5 text-slate-500">注意：風險與情境數值屬於平台分析／示範指標，不等於政府正式停班停課決定。</p>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[1.75rem] border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.08] to-slate-900 p-5 sm:p-6">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><ShieldAlert className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-wider text-amber-200">Official status</p><h2 className="text-lg font-black">官方公告狀態</h2></div></div>
              <p className="mt-4 text-sm font-bold text-amber-200">尚未取得可驗證公告</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">沒有取得公告不代表正常上班上課。請查看官方原文確認最新消息。</p>
              <a href="https://www.dgpa.gov.tw/typh/daily/nds.html" target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm font-semibold hover:border-amber-200"><span>人事行政總處公告</span><ExternalLink className="h-4 w-4 text-amber-200" /></a>
              <a href="https://www.cwa.gov.tw/" target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm font-semibold hover:border-cyan-300"><span>中央氣象署</span><ExternalLink className="h-4 w-4 text-cyan-200" /></a>
              <p className="mt-3 text-xs text-slate-500">公告資料：{latestOfficialNotice?.publishedAt ? new Date(latestOfficialNotice.publishedAt).toLocaleString('zh-TW') : '尚無更新時間'}</p>
            </section>

            <section className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200"><Bell className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Notifications</p><h2 className="text-lg font-black">公告通知</h2></div></div>
              <p className="mt-3 text-sm leading-6 text-slate-400">{pushStatus}</p>
              <button onClick={openNotificationPermission} className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 hover:bg-cyan-300">{pushEnabled ? '重新設定通知' : '啟用瀏覽器通知'}</button>
              <p className="mt-3 text-xs leading-5 text-slate-500">目前為瀏覽器通知權限；若要可靠的背景推播，仍需另行完成推播服務設定。</p>
              {adminMode && <button onClick={() => { if ('Notification' in window && Notification.permission === 'granted') new Notification('HolidayPredictor 測試通知', { body: adminAnnouncement || '測試通知', tag: 'holiday-admin-test' }); }} className="mt-3 w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold hover:border-cyan-400">發送測試通知</button>}
            </section>
          </aside>
        </div>

        <section className="mt-6 rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Latest updates</p><h2 className="mt-1 text-2xl font-black">官方公告與更新紀錄</h2></div><button onClick={refreshAnnouncement} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold hover:border-cyan-400"><RefreshCw className="h-4 w-4" />重新載入</button></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {notices.map((notice) => <article key={notice.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-start justify-between gap-3"><h3 className="font-bold leading-6">{notice.title}</h3><span className="shrink-0 rounded-full bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold text-amber-200">{notice.status === 'holiday' ? '停班停課' : notice.status === 'normal' ? '公告資訊' : '待確認'}</span></div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{notice.summary}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs text-slate-500"><span>{notice.source} · {new Date(notice.publishedAt).toLocaleString('zh-TW')}</span><a href={notice.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-200 hover:text-cyan-100">查看原文 <ExternalLink className="h-3.5 w-3.5" /></a></div>
            </article>)}
          </div>
        </section>

        {adminMode && <section className="mt-6 rounded-[1.75rem] border border-violet-400/20 bg-slate-900/80 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Admin tools</p><h2 className="mt-1 text-xl font-black">管理員公告工具</h2>
          <label className="mt-4 block text-sm font-semibold text-slate-300">公告內容</label>
          <textarea value={adminAnnouncement} onChange={(event) => setAdminAnnouncement(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-violet-400" />
          <button onClick={() => { const note = adminAnnouncement.trim(); if (!note) return; setNotices((prev) => [{ id: `admin-${Date.now()}`, title: '管理員公告', summary: note, source: 'HolidayPredictor 管理員', url: 'https://www.dgpa.gov.tw/typh/daily/nds.html', publishedAt: new Date().toISOString(), category: '行政', status: 'pending' }, ...prev]); setPushStatus('已更新管理員公告'); if ('Notification' in window && Notification.permission === 'granted') new Notification('HolidayPredictor｜管理員公告已更新', { body: note, tag: 'holiday-admin-override' }); }} className="mt-3 w-full rounded-xl bg-violet-400 px-4 py-3 font-bold text-slate-950 hover:bg-violet-300">發布管理員公告</button>
        </section>}

        <footer className="mt-8 border-t border-slate-800 pt-5 text-center text-xs leading-6 text-slate-500">HolidayPredictor · 官方公告以政府原始來源為準 · 風險分析僅供參考，不取代正式公告。</footer>
      </div>
    </div>
  );
}





















































































































































































				
																																																																												t																																										t																																													
																																																																																																																																																																																																						t																																																																																													t																																																																	t																																																																																																						
																																																																	t																																																																																																																																																																																																																																																																																																																																																																																t																																																																																																																																																																						t																																																																																																						t																										t																																																																																																																																																																																											t																																																																																																										t																																																																																																					t																																																																																																																																					t																																																																																												t																																																																			t																																																																																								t																																																																																									t																																																																																																																																t																																																																																																t																														t																																																																														t																																																																																					t																																																																																																																																																												t																																																																																																																																																																																																			t																																								t																																																																													t																																																																						t																																																																																																												t																																																																																												t																																																														t																																																																																																t																																																																																													t																																					t																																																																																																					t																																																																		t																																																															t																																																																																																																												t																																																																									t																																																																																												t																																																																																			t																																																																t																																																						t																																																														t																																																																		t																																																															t																																																	t																																																					t																																																																					t																																																									t																																						t																																				t																																	t																																						t																											t																										t																																																							t																								t																				t																																								t																															t																							t																					t														t																				t																							t																t															t																								t																											t																														t																																	t																																						t																					t																t										t																																				t																																	t															t																					t																			t																			t																t										t																													t																t								t																t								t																							t													t								t											t															t									t															t												t								t								t												t								t														t									t											t															t								t														t										t								t									t							t								t								t								t								t							t																t								t								t								t								t								t								t								t								t								t								t								t																		t								t									t									t								t								t								t								t			t								t																	t																t									
t																																																		
t																																																																																								
t																																		t																																																																															
t																																																	
t																																									
t																																																													
t																																								t																																								
t																																			
t																																																																
t																																																								
t																																											
t																																														
t																																																
t																																		
t																	t																		
t																										t																	
t																							
t																			
t										
t																							
t																	
t																	
t																t																																	
t																		
t																
t								t															
t									t																								
t																		
t																							
t																		
t																																			
t																t															" 
																t																														
t														t																						
t																																				
t																t																		
t																		
t																			
t											
t																	t																																
t																t																															
t																			
t															t																					
t																																				
t													t																	
t																							
t																																		
t																				
t																	
t																
t																	
t																	
t																	
t															t																																									
t																t																																	
t																			
t																	
t																
t																
t																t																												
t																						
t															
t																	
t															
t																								
t																							
t																					
t															t																							
t																t																							
t										t																									
t										t															t												
t									
t														t																					
t																t																														
t																
t																						
t																			
t															t																	
t																			
t																
t															
t										t																						
t										
t								t														
t										
t															
t															t									
t								t														
t								t																	
t								t																				
t								t										t																
t								t																
t										t														
t								t									
t										t											}
																																				
