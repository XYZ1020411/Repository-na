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
      visibleCities.find((city) => city.name === selected) ??
      currentCityData.find((city) => city.name === selected) ??
      visibleCities[0] ??
      currentCityData[0] ??
      citiesBase[0]
    );
  }, [visibleCities, currentCityData, selected]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/weather');
        const data = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(data.message || '官方資料暫時無法取得');
        setOfficialForecasts(data.forecasts || []);
        setOfficialStatus(data.source || '中央氣象署');
        setStatusCode(response.status);
      } catch (error) {
        console.error(error);
        if (!active) return;
        setOfficialForecasts([]);
        setOfficialStatus('官方資料目前無法連線，顯示示範資料');
        setStatusCode(0);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const loadNotices = async () => {
      try {
        const response = await fetch('/api/announcements');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '公告資料取得失敗');
        const list = Array.isArray(data.notices) && data.notices.length ? data.notices : fallbackNotices;
        setNotices(list);
      } catch (error) {
        console.error(error);
        setNotices(fallbackNotices);
      }
    };

    void loadNotices();
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('service worker registration failed', error);
      });
    }
  }, []);

  useEffect(() => {
    if (!('Notification' in window)) {
      setPushStatus('此瀏覽器不支援背景通知');
      return;
    }

    const permission = Notification.permission;
    const isGranted = permission === 'granted';
    setPushEnabled(isGranted);
    setPushStatus(
      isGranted ? '已啟用背景推播' : permission === 'denied' ? '已拒絕通知' : '通知未啟用'
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(adminMode));
  }, [adminMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ANNOUNCEMENT_KEY, adminAnnouncement);
  }, [adminAnnouncement]);

  useEffect(() => {
    if (!adminMode || !pushEnabled) return;

    const intervalId = window.setInterval(async () => {
      try {
        const res = await fetch('/api/announcements');
        const payload = await res.json();
        const next = Array.isArray(payload.notices) && payload.notices.length ? payload.notices[0] : null;
        if (next && lastPushAt !== next.publishedAt) {
          setLastPushAt(next.publishedAt);
          new Notification('HolidayPredictor｜官方公告更新', {
            body: `${next.title}（${next.category}）`,
            tag: 'holiday-announcement',
          });
        }
      } catch (error) {
        console.warn('push interval failed', error);
      }
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [adminMode, pushEnabled, lastPushAt]);

  const openNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setPushStatus('此瀏覽器不支援 Web Notification');
      return;
    }

    const permission = await Notification.requestPermission();
    const isGranted = permission === 'granted';
    setPushEnabled(isGranted);
    setPushStatus(
      isGranted ? '已啟用背景推播' : permission === 'denied' ? '已拒絕通知' : '通知未啟用'
    );

    if (isGranted && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: 'NOTIFY',
        title: 'HolidayPredictor 已啟用背景推播',
        body: '現在會在官方公告更新時自動通知你。',
      });
    }
  };

  const refreshAnnouncement = async () => {
    try {
      const response = await fetch('/api/announcements');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '公告取得失敗');
      setNotices(Array.isArray(data.notices) && data.notices.length ? data.notices : fallbackNotices);
    } catch (error) {
      console.error(error);
      setNotices(fallbackNotices);
    }
  };

  const loginAsAdmin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminMode(true);
      setPushStatus('管理員模式已啟用');
      return;
    }

    if (adminPassword.trim().length >= 4) {
      setAdminMode(false);
      setPushStatus('管理員密碼錯誤');
    }
  };

  const latestOfficialNotice = notices[0] ?? fallbackNotices[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">HolidayPredictor</p>
            <h1 className="mt-2 text-3xl font-bold text-white">台灣停班停課預測與公告整合</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshAnnouncement}
              className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              <RefreshCw className="h-4 w-4" />
              更新公告
            </button>
            {!adminMode ? (
              <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-2">
                <ShieldAlert className="h-4 w-4 text-cyan-300" />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="管理員密碼"
                  className="w-28 bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
                />
                <button onClick={loginAsAdmin} className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950">
                  登入
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAdminMode(false)}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                管理員已登入
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/75 p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">預測資料</p>
                <h2 className="mt-2 text-2xl font-bold text-white">即時風雨與停班停課分析</h2>
              </div>
              <div className="rounded-full border border-cyan-700/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                {officialStatus}
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {regions.map((item) => (
                <button
                  key={item}
                  onClick={() => setRegion(item)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    region === item
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-800 text-slate-300 hover:border-cyan-500 hover:text-cyan-300'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {scenarios.map((item) => (
                <button
                  key={item}
                  onClick={() => setScenario(item)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    scenario === item
                      ? 'bg-violet-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-800 text-slate-300 hover:border-violet-500 hover:text-violet-300'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜尋縣市或區域"
                className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCities.map((item) => {
                const active = selectedCity?.name === item.name;
                return (
                  <button
                    key={item.name}
                    onClick={() => setSelected(item.name)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                        : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{item.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.status === 'holiday'
                          ? 'bg-rose-500/20 text-rose-200'
                          : item.status === 'normal'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-amber-500/20 text-amber-200'
                      }`}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-400"><Wind className="h-4 w-4" /> 風速</span>
                        <span>{item.wind} m/s</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-400"><CloudRain className="h-4 w-4" /> 累積雨量</span>
                        <span>{item.rain} mm</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-400"><Cloud className="h-4 w-4" /> 風險</span>
                        <span>{item.probability}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">選定城市</p>
              <h3 className="mt-3 text-2xl font-bold text-white">{selectedCity.name}</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between rounded-2xl bg-slate-800 p-3">
                  <span className="text-slate-400">判定狀態</span>
                  <span className="font-semibold text-cyan-300">{statusLabel(selectedCity.status)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-800 p-3">
                  <span className="text-slate-400">風力</span>
                  <span>{selectedCity.gust} 級</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-800 p-3">
                  <span className="text-slate-400">降雨機率</span>
                  <span>{selectedCity.probability}%</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-800 p-3">
                  <span className="text-slate-400">天氣狀態</span>
                  <span>{officialForecasts.find((item) => item.name === selectedCity.name)?.weather || '待更新'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">背景推播</p>
              <h3 className="mt-3 text-xl font-bold text-white">通知狀態</h3>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-slate-800 p-3 text-sm text-slate-200">
                  {pushStatus}
                </div>
                <button
                  onClick={openNotificationPermission}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-300"
                >
                  <Bell className="h-4 w-4" />
                  {pushEnabled ? '重新啟用通知' : '啟用背景推播'}
                </button>
                {adminMode && (
                  <button
                    onClick={() => {
                      if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('HolidayPredictor 測試推播', {
                          body: adminAnnouncement || '已收到測試推播訊息。',
                          tag: 'holiday-admin-test',
                        });
                      }
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 font-semibold text-slate-100 hover:border-cyan-500 hover:text-cyan-300"
                  >
                    測試推播
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">官方公告</p>
                <h2 className="mt-2 text-2xl font-bold text-white">停班停課與政府公告串接</h2>
              </div>
              {latestOfficialNotice && (
                <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200">
                  {latestOfficialNotice.category}
                </span>
              )}
            </div>

            <div className="space-y-4">
              {notices.map((notice) => (
                <article key={notice.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{notice.title}</h3>
                      <p className="mt-2 text-sm text-slate-300">{notice.summary}</p>
                    </div>
                    <a
                      href={notice.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-2 py-1 text-xs text-slate-300"
                    >
                      官方連結 <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>{notice.source}</span>
                    <span>•</span>
                    <span>{new Date(notice.publishedAt).toLocaleString('zh-TW')}</span>
                    <span>•</span>
                    <span className="font-medium text-cyan-300">{notice.status === 'holiday' ? '停班停課' : notice.status === 'normal' ? '正常上班' : '待確認'}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">管理員功能</p>
            <h3 className="mt-3 text-2xl font-bold text-white">公告覆蓋</h3>

            {!adminMode ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
                請先登入管理員密碼，才能覆寫官方公告或發送測試推播。預設管理員密碼為 <span className="font-semibold text-cyan-300">holiday-admin</span>。
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <textarea
                  value={adminAnnouncement}
                  onChange={(event) => setAdminAnnouncement(event.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none"
                  placeholder="輸入管理員公告內容"
                />
                <button
                  onClick={() => {
                    const note = adminAnnouncement.trim() || '管理員已更新公告';
                    setNotices((prev) => [
                      {
                        id: 'admin-override',
                        title: '管理員覆蓋公告',
                        summary: note,
                        source: '管理員後台',
                        url: 'https://www.dgpa.gov.tw/',
                        publishedAt: new Date().toISOString(),
                        category: '行政',
                        status: 'pending',
                      },
                      ...prev,
                    ]);
                    setPushStatus('已更新管理員公告，將同步通知');
                    if ('Notification' in window && Notification.permission === 'granted') {
                      new Notification('HolidayPredictor｜管理員公告已更新', {
                        body: note,
                        tag: 'holiday-admin-override',
                      });
                    }
                  }}
                  className="w-full rounded-2xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  儲存管理員公告
                </button>
              </div>
            )}
          </div>
        </section>
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
																																				
