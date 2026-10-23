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
    title: '官方停班停課公告待確認',
    summary: '目前尚未取得可驗證的官方公告。這不代表正常上班上課，請查看官方原文及地方政府最新公告。',
    source: '行政院人事行政總處（待確認）',
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">HolidayPredictor</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">台灣停班停課資訊站</h1>
            <p className="mt-1 text-sm text-slate-400">官方公告優先 · 未取得資料時一律顯示待確認</p>
          </div>
          <button onClick={refreshAnnouncement} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm hover:bg-slate-800">
            <RefreshCw size={16} /> 更新官方公告
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-amber-300"><ShieldAlert size={20} /><span className="font-semibold">官方公告狀態</span></div>
            <h2 className="mt-4 text-2xl font-bold">{latestOfficialNotice.status === 'pending' ? '尚未取得可驗證公告' : latestOfficialNotice.title}</h2>
            <p className="mt-3 leading-7 text-slate-300">{latestOfficialNotice.summary}</p>
            <p className="mt-4 text-sm text-slate-400">資料來源：{latestOfficialNotice.source}</p>
            <p className="mt-1 text-sm text-slate-400">最後更新：{latestOfficialNotice.publishedAt ? new Date(latestOfficialNotice.publishedAt).toLocaleString('zh-TW') : '暫無更新時間'}</p>
            <a href={latestOfficialNotice.url || 'https://www.dgpa.gov.tw/typh/daily/nds.html'} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-semibold text-slate-950">
              查看人事行政總處原始公告 <ExternalLink size={16} />
            </a>
            <p className="mt-3 text-sm font-medium text-amber-200">注意：待確認不代表正常上班上課，請以地方政府正式公告為準。</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-cyan-300"><Cloud size={20} /><h2 className="text-lg font-semibold">官方天氣資料</h2></div>
            <p className="mt-3 text-sm text-slate-400">{officialStatus}</p>
            <p className="mt-4 text-3xl font-bold">{officialForecasts.length ? '已取得資料' : '暫無資料'}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">天氣資料不等同停班停課決定；是否停止上班上課由主管機關公告。</p>
            {officialForecasts.length > 0 && <div className="mt-4 space-y-2">{officialForecasts.slice(0, 3).map((forecast) => <div key={forecast.name} className="rounded-xl bg-slate-800/70 p-3"><div className="font-medium">{forecast.name}</div><div className="mt-1 text-sm text-slate-300">{forecast.weather || '天氣待確認'} · {forecast.minTemperature ?? '—'}–{forecast.maxTemperature ?? '—'}°C · 降雨 {forecast.rainProbability ?? '—'}%</div></div>)}</div>}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="text-sm text-slate-400">公告狀態</div><div className="mt-2 text-xl font-bold text-amber-300">待確認</div><div className="mt-1 text-xs text-slate-500">不會自動推定為正常上班</div></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="text-sm text-slate-400">資料來源</div><div className="mt-2 text-xl font-bold">官方公告</div><div className="mt-1 text-xs text-slate-500">人事行政總處／地方政府</div></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="text-sm text-slate-400">天氣預報</div><div className="mt-2 text-xl font-bold">{officialForecasts.length ? '已連線' : '待連線'}</div><div className="mt-1 text-xs text-slate-500">中央氣象署資料</div></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="text-sm text-slate-400">瀏覽器通知</div><div className="mt-2 text-xl font-bold">{pushEnabled ? '已啟用' : '未啟用'}</div><button onClick={openNotificationPermission} className="mt-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">{pushEnabled ? '通知已設定' : '設定通知'}</button><p className="mt-2 text-xs text-slate-500">{pushStatus}</p></div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="text-xl font-bold">全台縣市風險參考</h2><p className="mt-1 text-sm text-slate-400">下列風雨數值為示範情境，不是官方停班停課公告。</p></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="text-sm text-slate-400">情境<select value={scenario} onChange={(e) => setScenario(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">{scenarios.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm text-slate-400">地區<select value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm text-slate-400">搜尋縣市<div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="例如新竹市" className="w-full bg-transparent py-2 outline-none" /></div></label>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCities.map((city) => <button key={city.name} onClick={() => setSelected(city.name)} className={`rounded-2xl border p-4 text-left transition ${selected === city.name ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}>
              <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{city.name}</h3><span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-200">待確認</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><div className="text-slate-500">陣風</div><div className="mt-1 font-semibold">{city.gust} 級</div></div><div><div className="text-slate-500">風力</div><div className="mt-1 font-semibold">{city.wind} 級</div></div><div><div className="text-slate-500">降雨</div><div className="mt-1 font-semibold">{city.rain} mm</div></div></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{width: `${Math.min(100, city.probability)}%`}} /></div><div className="mt-1 text-xs text-slate-500">示範風險指標 {city.probability}%（非官方機率）</div>
            </button>)}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7"><div className="flex items-center gap-2"><Bell size={20} className="text-cyan-300" /><h2 className="text-xl font-bold">官方公告與更新</h2></div><div className="mt-4 space-y-3">{notices.map((notice) => <article key={notice.id} className="rounded-2xl border border-slate-800 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{notice.title}</h3><span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-200">{notice.status === 'holiday' ? '已公告停班停課' : notice.status === 'normal' ? '官方公告' : '待確認'}</span></div><p className="mt-2 text-sm leading-6 text-slate-300">{notice.summary}</p><div className="mt-2 text-xs text-slate-500">來源：{notice.source} · 更新：{notice.publishedAt ? new Date(notice.publishedAt).toLocaleString('zh-TW') : '時間未知'}</div><a className="mt-3 inline-flex items-center gap-2 text-sm text-cyan-300 underline" href={notice.url || 'https://www.dgpa.gov.tw/typh/daily/nds.html'} target="_blank" rel="noreferrer">查看原始公告 <ExternalLink size={14} /></a></article>)}</div></div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7"><div className="flex items-center gap-2"><Wind size={20} className="text-cyan-300" /><h2 className="text-xl font-bold">查詢與使用說明</h2></div><p className="mt-3 leading-7 text-slate-300">本網站整理官方公告及天氣資訊作為參考。只有主管機關正式發布的停班停課公告，才能視為正式決定。</p><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-400"><li>若官方資料無法取得，狀態保持「待確認」。</li><li>公告頁會提供官方原始連結及可取得的更新時間。</li><li>風雨風險指標目前是示範資料，不應當成放假機率。</li></ul><div className="mt-5 flex flex-wrap gap-3"><a href="https://www.dgpa.gov.tw/typh/daily/nds.html" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-700 px-4 py-3 text-sm hover:bg-slate-800">人事行政總處公告 <ExternalLink size={15} className="inline" /></a><a href="https://www.cwa.gov.tw/" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-700 px-4 py-3 text-sm hover:bg-slate-800">中央氣象署 <ExternalLink size={15} className="inline" /></a></div></div>
        </section>

        {adminMode && <section className="rounded-3xl border border-violet-500/30 bg-violet-500/5 p-5 sm:p-7"><h2 className="text-xl font-bold">管理員公告設定</h2><p className="mt-2 text-sm text-slate-400">此設定只儲存在目前瀏覽器，不會發布成政府公告。</p><textarea value={adminAnnouncement} onChange={(e) => setAdminAnnouncement(e.target.value)} className="mt-3 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /><button onClick={() => setPushStatus('管理員備註已儲存於本機瀏覽器')} className="mt-3 rounded-xl bg-violet-400 px-4 py-2 font-semibold text-slate-950">儲存備註</button></section>}
        {!adminMode && <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">管理員入口</h2><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="輸入管理員密碼" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" /><button onClick={loginAsAdmin} className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800">登入</button></div><p className="mt-2 text-xs text-slate-500">目前管理員登入為前端示範功能，正式環境請改用安全的伺服器端驗證。</p></section>}
        <footer className="pb-8 text-center text-xs text-slate-500">HolidayPredictor · 資料未能驗證時不推定為正常上班上課</footer>
      </main>
    </div>
  );
}
