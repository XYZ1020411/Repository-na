import { useCallback, useEffect, useState } from 'react';
import { Bell, CloudSun, ExternalLink, LocateFixed, MapPin, Menu, RadioTower, RefreshCw, Send, ShieldCheck, Wind } from 'lucide-react';

type Forecast = { name:string; available:boolean; weather:string|null; rainProbability:number|null; minTemperature:number|null; maxTemperature:number|null; comfort:string|null; forecastTime:string|null };
type Notice = { id:string; title:string; summary?:string; message?:string; source:string; url?:string; publishedAt:string; category?:string; status?:string };
type Typhoon = { name:string; latitude:number; longitude:number; detail?:Array<{key:string;value:unknown}> };

const DGPA_URL = 'https://www.dgpa.gov.tw/typh/daily/nds.html';
const CWA_TYPHOON_URL = 'https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html';
const SATELLITE_URL = 'https://satimage.cwa.gov.tw/SPD/';
const SATELLITE_IMAGE = 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-B0029-002.jpg';

export default function App() {
  const [forecasts,setForecasts]=useState<Forecast[]>([]);
  const [weatherStatus,setWeatherStatus]=useState('正在連線中央氣象署');
  const [notices,setNotices]=useState<Notice[]>([]);
  const [adminNotices,setAdminNotices]=useState<Notice[]>([]);
  const [typhoons,setTyphoons]=useState<Typhoon[]>([]);
  const [typhoonStatus,setTyphoonStatus]=useState('正在取得官方颱風資料');
  const [typhoonTime,setTyphoonTime]=useState('');
  const [satelliteTime,setSatelliteTime]=useState(Date.now());
  const [location,setLocation]=useState<{lat:number;lon:number;name:string}|null>(null);
  const [locationStatus,setLocationStatus]=useState('尚未定位');
  const [pushStatus,setPushStatus]=useState('尚未啟用');
  const [adminPassword,setAdminPassword]=useState('');
  const [adminMode,setAdminMode]=useState(false);
  const [adminStatus,setAdminStatus]=useState('');
  const [title,setTitle]=useState('');
  const [message,setMessage]=useState('');
  const [lineMessage,setLineMessage]=useState('颱風與停班停課資訊有更新，請查看官方公告。');
  const [lineStatus,setLineStatus]=useState('');
  const [busy,setBusy]=useState(false);

  const refresh = useCallback(async () => {
    const [weatherResult,noticeResult,typhoonResult,adminNoticeResult] = await Promise.allSettled([
      fetch('/api/weather').then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||'天氣資料暫時無法取得');return d;}),
      fetch('/api/announcements').then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||'公告暫時無法取得');return d;}),
      fetch('/api/typhoon').then(async r=>{const d=await r.json();if(!r.ok&&r.status!==503&&r.status!==502)throw new Error(d.message||'颱風資料暫時無法取得');return d;}),
      fetch('/api/admin/notices').then(r=>r.json())
    ]);
    if(weatherResult.status==='fulfilled'){setForecasts(weatherResult.value.forecasts||[]);setWeatherStatus('中央氣象署開放資料 · '+(weatherResult.value.fetchedAt?new Date(weatherResult.value.fetchedAt).toLocaleString('zh-TW'):'更新時間未知'));}
    else {setForecasts([]);setWeatherStatus('目前無法取得官方天氣資料；請稍後重試或查看中央氣象署。');}
    if(noticeResult.status==='fulfilled'){setNotices(noticeResult.value.notices||[]);}
    else {setNotices([{id:'pending',title:'官方公告待確認',summary:'目前無法取得可驗證公告。這不代表正常上班上課，請查看官方原文。',source:'行政院人事行政總處',url:DGPA_URL,publishedAt:new Date().toISOString(),status:'pending'}]);}
    if(typhoonResult.status==='fulfilled'){setTyphoons(typhoonResult.value.items||[]);setTyphoonStatus(typhoonResult.value.message||'官方資料待確認');setTyphoonTime(typhoonResult.value.fetchedAt||'');}
    else {setTyphoons([]);setTyphoonStatus('目前無法取得官方颱風座標，請查看中央氣象署原始資訊。');}
    if(adminNoticeResult.status==='fulfilled')setAdminNotices(adminNoticeResult.value.notices||[]);
    setSatelliteTime(Date.now());
  },[]);

  useEffect(()=>{void refresh();const id=window.setInterval(()=>void refresh(),5*60*1000);return()=>window.clearInterval(id);},[refresh]);
  useEffect(()=>{if('Notification'in window)setPushStatus(Notification.permission==='granted'?'已允許通知':Notification.permission==='denied'?'已拒絕通知':'尚未啟用');},[]);

  const enableNotifications=async()=>{
    if(!('Notification'in window)){setPushStatus('此瀏覽器不支援通知');return;}
    const result=await Notification.requestPermission();
    setPushStatus(result==='granted'?'已允許通知（僅網頁開啟時檢查更新）':result==='denied'?'已拒絕通知':'尚未啟用');
  };
  const locate=()=>{
    if(!navigator.geolocation){setLocationStatus('此瀏覽器不支援定位');return;}
    setLocationStatus('正在取得定位…');
    navigator.geolocation.getCurrentPosition(async p=>{
      const lat=p.coords.latitude,lon=p.coords.longitude;
      try{const r=await fetch('/api/location?lat='+lat+'&lon='+lon);const d=await r.json();setLocation({lat,lon,name:d.displayName||'已取得座標'});setLocationStatus('定位成功');}
      catch{setLocation({lat,lon,name:'已取得座標（區域名稱暫時無法取得）'});setLocationStatus('已定位');}
    },e=>setLocationStatus(e.code===1?'定位權限被拒絕，請在瀏覽器設定允許定位':'定位失敗，請確認 GPS 與網站定位權限'),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  };
  const login=async()=>{
    setBusy(true);try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:adminPassword})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||'登入失敗');setAdminMode(true);setAdminStatus('管理員驗證成功');}
    catch(e){setAdminMode(false);setAdminStatus(e instanceof Error?e.message:'登入失敗');}finally{setBusy(false);}
  };
  const publish=async()=>{
    setBusy(true);try{const r=await fetch('/api/admin/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword,title,message})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||'發布失敗');setAdminStatus(d.message||'公告已發布');setTitle('');setMessage('');await refresh();}
    catch(e){setAdminStatus(e instanceof Error?e.message:'發布失敗');}finally{setBusy(false);}
  };
  const sendLine=async()=>{
    setBusy(true);try{const r=await fetch('/api/line/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword,message:lineMessage})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||'LINE 推播失敗');setLineStatus(d.message||'LINE 推播已送出');}
    catch(e){setLineStatus(e instanceof Error?e.message:'LINE 推播失敗');}finally{setBusy(false);}
  };
  const card='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5';
  const button='inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
  const outline='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800';
  const allNotices=[...adminNotices.map(n=>({...n,summary:n.message||n.summary||'',source:n.source||'網站管理員',status:'published'})),...notices];
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a href="#top" className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-700"><Wind size={22}/></div><div><div className="font-bold tracking-tight">颱風・停班停課</div><div className="text-xs text-slate-500">官方即時資訊</div></div></a>
        <nav className="hidden items-center gap-5 text-sm text-slate-600 sm:flex"><a href="#status">公告</a><a href="#typhoon">颱風</a><a href="#satellite">衛星雲圖</a><a href="#admin">管理員</a></nav>
        <button onClick={()=>void refresh()} className={outline}><RefreshCw size={16}/>更新</button>
      </div>
    </header>
    <main id="top" className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-3xl bg-slate-900 p-5 text-white sm:p-7">
          <div className="flex items-center gap-2 text-sm text-sky-300"><RadioTower size={17}/> 官方資料監測</div>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">掌握颱風與停班停課資訊</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">以官方來源為優先。若資料無法驗證，會標示「待確認」，不會推定正常上班上課。</p>
          <div className="mt-5 flex flex-wrap gap-2"><a className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900" href={DGPA_URL} target="_blank" rel="noreferrer">官方停班停課公告 <ExternalLink size={14} className="inline"/></a><a className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-white" href={CWA_TYPHOON_URL} target="_blank" rel="noreferrer">中央氣象署颱風資訊 <ExternalLink size={14} className="inline"/></a></div>
        </div>
        <div id="status" className={card}>
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700"><ShieldCheck size={18}/>停班停課公告狀態</div>
          <div className="mt-3 text-xl font-bold">待官方公告確認</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{notices[0]?.summary||'目前未取得可驗證的官方決定。'}</p>
          <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 underline" href={notices[0]?.url||DGPA_URL} target="_blank" rel="noreferrer">查看原始公告 <ExternalLink size={14}/></a>
          <p className="mt-2 text-xs text-slate-500">來源更新：{notices[0]?.publishedAt?new Date(notices[0].publishedAt).toLocaleString('zh-TW'):'時間未知'}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className={card}>
          <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Wind size={19} className="text-sky-700"/>颱風即時位置</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">官方資料</span></div>
          <p className="mt-2 text-sm text-slate-500">{typhoonStatus}</p><p className="mt-1 text-xs text-slate-400">資料取得時間：{typhoonTime?new Date(typhoonTime).toLocaleString('zh-TW'):'未知'}</p>
          {typhoons.length>0?<div className="mt-4 space-y-3">{typhoons.map((t,i)=><div key={t.name+t.latitude+t.longitude+i} className="rounded-xl border border-slate-200 p-3"><div className="font-semibold">{t.name}</div><div className="mt-1 text-sm text-slate-500">緯度 {t.latitude.toFixed(3)} · 經度 {t.longitude.toFixed(3)}</div><a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 underline" href={'https://maps.google.com/?q='+t.latitude+','+t.longitude} target="_blank" rel="noreferrer">地圖查看 <ExternalLink size={13}/></a></div>)}</div>:<div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">沒有可驗證的颱風座標。這不代表模擬位置或已確認無颱風，請查看官方來源。</div>}
        </div>
        <div className={card}>
          <h2 className="flex items-center gap-2 font-bold"><LocateFixed size={19} className="text-sky-700"/>我所在的區域</h2><p className="mt-2 text-sm text-slate-500">按下按鈕後才會向裝置要求定位權限。</p>
          <button onClick={locate} className={button+' mt-4'}><MapPin size={16}/>取得目前位置</button><p className="mt-3 text-sm text-slate-600">{locationStatus}</p>
          {location&&<div className="mt-3 rounded-xl bg-slate-50 p-3"><div className="font-semibold">{location.name}</div><div className="mt-1 text-xs text-slate-500">{location.lat.toFixed(5)}, {location.lon.toFixed(5)}</div><a className="mt-2 inline-block text-sm text-sky-700 underline" href={'https://maps.google.com/?q='+location.lat+','+location.lon} target="_blank" rel="noreferrer">在地圖查看</a></div>}
        </div>
      </section>

      <section id="satellite" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold"><CloudSun size={19} className="text-sky-700"/>即時衛星雲圖</h2><p className="mt-1 text-sm text-slate-500">中央氣象署官方衛星影像資料，非模擬圖片。</p></div><a className={outline} href={SATELLITE_URL} target="_blank" rel="noreferrer">開啟互動衛星系統 <ExternalLink size={14}/></a></div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={SATELLITE_IMAGE+'?refresh='+Math.floor(satelliteTime/600000)} alt="中央氣象署東亞紅外線黑白衛星雲圖" className="block max-h-[420px] min-h-40 w-full object-contain" onError={e=>{e.currentTarget.style.display='none';}}/><div className="p-3 text-xs text-slate-500">影像來源：中央氣象署開放資料 · 東亞紅外線黑白衛星雲圖。若官方影像端暫時無法載入，請開啟官方衛星系統。</div></div>
        <div className="mt-3 flex flex-wrap gap-2"><a href="https://qpeplus.cwa.gov.tw/" target="_blank" rel="noreferrer" className={outline}>即時雷達回波 <ExternalLink size={14}/></a><a href={SATELLITE_URL} target="_blank" rel="noreferrer" className={outline}>衛星動畫與其他頻道 <ExternalLink size={14}/></a></div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">官方天氣預報</h2><p className="mt-1 text-xs text-slate-500">{weatherStatus}</p></div><a href="https://www.cwa.gov.tw/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky-700 underline">中央氣象署 <ExternalLink size={13} className="inline"/></a></div>
        {forecasts.length? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{forecasts.filter(f=>f.available).slice(0,12).map(f=><div key={f.name} className="rounded-xl border border-slate-200 p-3"><div className="font-semibold">{f.name}</div><div className="mt-2 text-sm text-slate-700">{f.weather||'天氣待確認'}</div><div className="mt-1 text-sm text-slate-500">{f.minTemperature??'—'}–{f.maxTemperature??'—'}°C · 降雨機率 {f.rainProbability??'—'}%</div></div>)}</div>:<p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">官方天氣資料暫時無法取得，不顯示模擬數值。</p>}
      </section>

      <section className={card}>
        <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Bell size={19} className="text-sky-700"/>最新公告與管理員通知</h2><span className="text-xs text-slate-500">{allNotices.length} 則</span></div>
        <div className="mt-3 space-y-3">{allNotices.length?allNotices.map(n=><article key={n.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{n.title}</h3><span className={'rounded-full px-2 py-1 text-xs '+(n.status==='published'?'bg-sky-50 text-sky-700':'bg-amber-50 text-amber-800')}>{n.status==='published'?'管理員公告':'官方待確認'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{n.message||n.summary||''}</p><p className="mt-2 text-xs text-slate-400">{n.source||'官方來源'} · {n.publishedAt?new Date(n.publishedAt).toLocaleString('zh-TW'):'時間未知'}</p>{n.url&&<a className="mt-2 inline-flex items-center gap-1 text-sm text-sky-700 underline" href={n.url} target="_blank" rel="noreferrer">原始來源 <ExternalLink size={13}/></a>}</article>):<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">目前沒有管理員公告；官方停班停課資訊仍請以原始公告為準。</p>}</div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold"><Bell size={19} className="text-sky-700"/>通知設定</h2><p className="mt-1 text-sm text-slate-500">瀏覽器通知：{pushStatus}</p></div><button className={outline} onClick={()=>void enableNotifications()}>啟用通知</button></div><p className="mt-2 text-xs leading-5 text-slate-500">目前瀏覽器通知只會在網站開啟時檢查更新；關閉網頁後的背景推播需要額外設定 Web Push。</p>
      </section>

      <section id="admin" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={19} className="text-sky-700"/>管理員控制台</h2>
        {!adminMode?<><p className="mt-1 text-sm text-slate-500">登入後可發布公告並傳送 LINE 推播。</p><form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={e=>{e.preventDefault();void login();}}><input type="password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="管理員密碼" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3" autoComplete="current-password"/><button disabled={busy||!adminPassword} className={button} type="submit">登入管理員</button></form>{adminStatus&&<p className="mt-2 text-sm text-amber-800">{adminStatus}</p>}</>:<>
          <div className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">已登入管理員。公告發布需要先設定 Cloudflare KV Namespace；LINE 推播需要設定 LINE Messaging API Secrets。</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3"><h3 className="font-semibold">發布給所有網站訪客的公告</h3><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="公告標題" className="w-full rounded-xl border border-slate-300 px-3 py-3"/><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="公告內容（會顯示在客戶端）" className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-3"/><button disabled={busy||!title.trim()||!message.trim()} onClick={()=>void publish()} className={button}><Send size={16}/>發布公告並通知 LINE</button></div>
            <div className="space-y-3"><h3 className="font-semibold">單獨傳送 LINE 推播</h3><textarea value={lineMessage} onChange={e=>setLineMessage(e.target.value)} className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-3"/><button disabled={busy||!lineMessage.trim()} onClick={()=>void sendLine()} className={button}><Send size={16}/>傳送 LINE 推播</button>{lineStatus&&<p className="text-sm text-slate-600">{lineStatus}</p>}</div>
          </div><p className="mt-3 text-sm text-slate-600">{adminStatus}</p><button onClick={()=>{setAdminMode(false);setAdminPassword('');setAdminStatus('已登出');}} className={outline+' mt-3'}>登出管理員</button>
        </>}
      </section>
      <footer className="pb-5 text-center text-xs leading-5 text-slate-500">資料來源：中央氣象署、行政院人事行政總處及管理員公告。資料未能驗證時一律顯示待確認，不以示範資料取代官方資料。</footer>
    </main>
  </div>;
}
