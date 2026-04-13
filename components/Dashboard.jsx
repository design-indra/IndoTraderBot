// Full 'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, TrendingDown, Activity, Zap, Shield, Brain, Play, Square,
  RefreshCw, Settings, ChevronDown, AlertTriangle, ArrowUpRight, ArrowDownRight,
  BarChart2, Target, Layers, Home, DollarSign, Wifi,
} from 'lucide-react';
import CandleChart  from './CandleChart';
import TradeLog     from './TradeLog';
import PositionCard from './PositionCard';
import StatCard     from './StatCard';
import SignalPanel  from './SignalPanel';
import RiskPanel    from './RiskPanel';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAIR_GROUPS = [
  { label:'🔵 Major',      pairs:['btc_idr','eth_idr','bnb_idr','sol_idr','xrp_idr','ada_idr','doge_idr','trx_idr','dot_idr','ltc_idr'] },
  { label:'⚡ Layer 1/2',  pairs:['avax_idr','atom_idr','near_idr','algo_idr','matic_idr','ftm_idr','theta_idr','vet_idr','eos_idr','xlm_idr','xtz_idr','waves_idr','qtum_idr','neo_idr','etc_idr'] },
  { label:'🏦 DeFi',       pairs:['link_idr','uni_idr','aave_idr','mkr_idr','snx_idr','comp_idr','yfi_idr','sushi_idr','crv_idr','bat_idr','zrx_idr'] },
  { label:'🎮 GameFi/NFT', pairs:['sand_idr','mana_idr','axs_idr','gala_idr','enj_idr','chz_idr'] },
  { label:'🐶 Meme',       pairs:['shib_idr','floki_idr'] },
];
const PAIRS     = PAIR_GROUPS.flatMap((g) => g.pairs);
const TIMEFRAMES= ['1m','5m','15m','1h','4h'];
const LEVELS    = [
  { id:1, label:'Scalper',        icon:'⚡', color:'#0ea5e9', desc:'RSI7 + EMA Ribbon cepat' },
  { id:2, label:'Smart Adaptive', icon:'🧠', color:'#6366f1', desc:'Market filter + confidence' },
  { id:3, label:'AI Scoring',     icon:'📊', color:'#8b5cf6', desc:'Multi-indicator score' },
  { id:4, label:'ML Model',       icon:'🤖', color:'#f59e0b', desc:'Machine Learning LSTM' },
  { id:5, label:'RL Agent',       icon:'🔴', color:'#ef4444', desc:'Reinforcement Learning' },
];

// Tab definitions - ONLY safe icons
const TABS = [
  { id:'home',     label:'Home',    icon: '🏠' },
  { id:'chart',    label:'Chart',   icon: '📈' },
  { id:'signal',   label:'Signal',  icon: '📡' },
  { id:'risk',     label:'Risk',    icon: '🛡️' },
  { id:'settings', label:'Setting', icon: '⚙️' },
];

const fmt    = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n||0));
const fmtPct = (n) => `${n>=0?'+':''}${(n||0).toFixed(2)}%`;

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ userEmail='', onLogout=null, bestPair=null, scannerActive=false, onScannerToggle=null, onRunScanner=null }) {
  const [tab,           setTab]           = useState('home');
  const [botData,       setBotData]       = useState(null);
  const [marketData,    setMarketData]    = useState(null);
  const [liveBalance,   setLiveBalance]   = useState(null);
  const [riskSettings,  setRiskSettings]  = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [liveConfirm,   setLiveConfirm]   = useState(false);
  const [config, setConfig] = useState(() => {
    try { const s = localStorage.getItem('it_config'); return s ? JSON.parse(s) : { mode:'demo', level:1, pair:'btc_idr', tf:'5m' }; }
    catch { return { mode:'demo', level:1, pair:'btc_idr', tf:'5m' }; }
  });
  const [localDemo, setLocalDemo] = useState(() => {
    try { const s = localStorage.getItem('it_demo'); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const wakeLockRef = useRef(null);
  const cycleRef    = useRef(null);

  // ── Persist config changes ─────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('it_config', JSON.stringify(config)); } catch {}
  }, [config]);

  // ── Wake Lock — keep screen on while bot running ───────────────────────────
  useEffect(() => {
    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {}
    }
    if (botData?.bot?.running) requestWakeLock();
    else { if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; } }
  }, [botData?.bot?.running]);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const fn = () => { if (botData?.bot?.running && document.visibilityState === 'visible' && !wakeLockRef.current) {
      if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(l => { wakeLockRef.current = l; }).catch(()=>{});
    }};
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [botData?.bot?.running]);

  // Save demo state to localStorage for persistence
  const saveDemoState = useCallback((demo) => {
    if (!demo) return;
    try { localStorage.setItem('it_demo', JSON.stringify(demo)); } catch {}
    setLocalDemo(demo);
  }, []);

  const fetchBot = useCallback(async (clientState = null) => {
    try {
      const body = clientState ? { action:'sync', clientState } : undefined;
      const res  = body
        ? await fetch('/api/bot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
        : await fetch('/api/bot');
      const d = await res.json();
      if (d.success) {
        setBotData(d);
        if (d.demo) saveDemoState(d.demo);
      }
    } catch{} finally{ setLoading(false); }
  }, [saveDemoState]);

  const fetchMarket = useCallback(async () => {
    try { const d=await fetch(`/api/market?pair=${config.pair}&tf=${config.tf}&count=100`).then(r=>r.json()); if(d.success) setMarketData(d); }
    catch{}
  }, [config.pair, config.tf]);

  const fetchLiveBalance = useCallback(async () => {
    if(config.mode!=='live') return;
    try { const d=await fetch('/api/balance?mode=live').then(r=>r.json()); if(d.success) setLiveBalance(d.balance); else setLiveBalance(null); }
    catch{ setLiveBalance(null); }
  }, [config.mode]);

  const fetchRiskSettings = useCallback(async () => {
    try { const d=await fetch('/api/settings').then(r=>r.json()); if(d.success) setRiskSettings(d.risk); }
    catch{}
  }, []);

  useEffect(() => {
    fetchBot(); fetchMarket(); fetchRiskSettings();
    const b=setInterval(fetchBot,3000), m=setInterval(fetchMarket,5000), l=setInterval(fetchLiveBalance,10000);
    return ()=>{ clearInterval(b); clearInterval(m); clearInterval(l); };
  }, [fetchBot,fetchMarket,fetchLiveBalance,fetchRiskSettings]);

  useEffect(()=>{ fetchLiveBalance(); },[config.mode,fetchLiveBalance]);

  useEffect(()=>{
    if(botData?.bot?.running){
      cycleRef.current=setInterval(async()=>{
        try{
          // Send current local state so server can restore it (stateless fix)
          const storedDemo = (() => { try { const s=localStorage.getItem('it_demo'); return s?JSON.parse(s):null; } catch{return null;} })();
          const res = await fetch('/api/bot',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              action:'cycle',
              config:{ pair:config.pair, tf:config.tf },
              clientState: storedDemo,
            }),
          });
          const d = await res.json();
          if (d.success && d.demo) { saveDemoState(d.demo); setBotData(prev => prev ? {...prev, demo: d.demo} : prev); }
        }catch{}
      },5000);
    } else clearInterval(cycleRef.current);
    return ()=>clearInterval(cycleRef.current);
  },[botData?.bot?.running,config.pair,config.tf,saveDemoState]);

  const handleAction = async (action, extra={}) => {
    setActionLoading(true);
    try {
      const storedDemo = (() => { try { const s=localStorage.getItem('it_demo'); return s?JSON.parse(s):null; } catch{return null;} })();
      const d = await fetch('/api/bot',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, config:{...config,...extra}, clientState: storedDemo }),
      }).then(r=>r.json());
      if(d.requireConfirmation){ setLiveConfirm(true); return; }
      if(d.demo) saveDemoState(d.demo);
      await fetchBot();
    } catch{} finally{ setActionLoading(false); }
  };

  // Delete single trade from history
  const handleDeleteTrade = async (tradeId) => {
    const storedDemo = (() => { try { const s=localStorage.getItem('it_demo'); return s?JSON.parse(s):null; } catch{return null;} })();
    const d = await fetch('/api/bot',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'deleteTrade', config:{tradeId}, clientState: storedDemo }),
    }).then(r=>r.json());
    if(d.success && d.demo){ saveDemoState(d.demo); setBotData(prev => prev?{...prev,demo:d.demo}:prev); }
  };

  // Clear all trade history
  const handleClearHistory = async () => {
    if(!confirm('Hapus semua riwayat trade?')) return;
    const storedDemo = (() => { try { const s=localStorage.getItem('it_demo'); return s?JSON.parse(s):null; } catch{return null;} })();
    const d = await fetch('/api/bot',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'clearHistory', clientState: storedDemo }),
    }).then(r=>r.json());
    if(d.success && d.demo){ saveDemoState(d.demo); setBotData(prev => prev?{...prev,demo:d.demo}:prev); }
  };

  // Derived — prefer localDemo (persisted) over server demo (may be stale after cold start)
  const bot       = botData?.bot  || {};
  const serverDemo = botData?.demo || {};
  const demo      = localDemo
    ? { ...serverDemo, ...localDemo,
        openPositions: localDemo.openPositions ?? serverDemo.openPositions,
        closedTrades:  localDemo.closedTrades  ?? serverDemo.closedTrades }
    : serverDemo;
  const logs      = botData?.logs || [];
  const ticker    = marketData?.ticker     || {};
  const indicators= marketData?.indicators || {};
  const candles   = marketData?.candles    || [];
  const isLive    = config.mode==='live';
  const isRunning = bot.running;
  const isPaused  = bot.isPaused;
  const openPos   = demo.openPositions || [];
  const totalBal  = isLive?(liveBalance?.idr||0):(demo.idrBalance||0);
  const totalPnl  = demo.totalPnl||0;
  const pnlPct    = demo.totalPnlPct||0;
  const startBal  = demo.startBalance||100000;
  const target    = riskSettings?.targetProfitIDR||1000000;
  const progress  = Math.min(100,Math.max(0,((totalBal-startBal)/(target-startBal))*100));

  if(loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Zap size={32} className="text-white"/>
        </div>
        <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto"/>
        <p className="text-gray-500 text-sm mt-3">Memuat IndoTrader...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{background:'#f0f4f8'}}>

      {/* ── TOP HEADER — hanya logo + pair + harga ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm px-3 flex items-center justify-between gap-2 sticky top-0 z-40" style={{height:52}}>
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-blue-500 rounded-xl flex items-center justify-center shadow">
            <Zap size={16} className="text-white"/>
          </div>
          <span className="font-bold text-gray-800 text-sm">Indo<span className="text-sky-500">Trader</span></span>
          {scannerActive && bestPair && (
            <span className="hidden sm:flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
              🔍 {bestPair.display} {bestPair.score}pts
            </span>
          )}
        </div>

        {/* Pair + Price — center */}
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
          <PairSelector value={config.pair} onChange={(p)=>setConfig(c=>({...c,pair:p}))}/>
          {ticker.last && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="mono font-bold text-gray-800 text-sm truncate">{fmt(ticker.last)}</span>
              {ticker.change24h!==undefined && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${ticker.change24h>=0?'bg-emerald-100 text-emerald-600':'bg-red-100 text-red-500'}`}>
                  {fmtPct(ticker.change24h)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status dot only */}
        <div className="shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${isRunning?'bg-emerald-400 pulse':isPaused?'bg-amber-400':'bg-gray-300'}`}/>
        </div>
      </header>

      {/* Banners */}
      {isPaused && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={13} className="text-amber-500 shrink-0"/>
          <span className="text-xs text-amber-700 font-medium flex-1">Auto-pause: {bot.consecutiveLosses} consecutive losses</span>
          <button onClick={()=>handleAction('resume')} className="text-xs bg-amber-500 text-white px-3 py-1 rounded-lg font-bold">Resume</button>
        </div>
      )}
      {isLive && liveBalance===null && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2">
          <p className="text-xs text-red-600">⚠️ Saldo Indodax gagal dimuat — cek konfigurasi API Key di Vercel Dashboard</p>
        </div>
      )}

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-y-auto pb-20">

        {/* ═══ HOME ═══ */}
        {tab==='home' && (
          <div className="p-3 space-y-3">

            {/* ── Control Bar: Mode + Start/Stop ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
              {/* Status */}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isRunning?'bg-emerald-400 pulse':isPaused?'bg-amber-400':'bg-gray-300'}`}/>
                <span className={`text-xs font-semibold ${isRunning?'text-emerald-500':isPaused?'text-amber-500':'text-gray-400'}`}>
                  {isRunning?'Running':isPaused?'Paused':'Stopped'}
                </span>
              </div>

              <div className="flex-1"/>

              {/* Demo / Live toggle */}
              <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs shadow-sm">
                {['demo','live'].map((m)=>(
                  <button key={m} onClick={()=>setConfig(c=>({...c,mode:m}))}
                    className={`px-4 py-2 font-bold transition-colors ${config.mode===m?(m==='live'?'bg-red-500 text-white':'bg-sky-500 text-white'):'text-gray-400 bg-white'}`}>
                    {m === 'demo' ? '🎮 Demo' : '🔴 Live'}
                  </button>
                ))}
              </div>

              {/* Start / Stop */}
              {isRunning
                ? <button onClick={()=>handleAction('stop')} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white text-xs font-bold rounded-xl shadow">
                    <Square size={11}/> Stop
                  </button>
                : <button onClick={()=>handleAction('start')} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white text-xs font-bold rounded-xl shadow">
                    <Play size={11}/> Start
                  </button>
              }
            </div>

            {/* Balance Card */}
            <div className={`rounded-2xl p-4 shadow-md ${isLive?'bg-gradient-to-br from-red-500 to-orange-400':'bg-gradient-to-br from-sky-500 to-blue-600'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white/80 uppercase tracking-wide">{isLive?'🔴 Live — Indodax':'Demo Portfolio'}</span>
                <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${isRunning?'bg-white/20 text-white':isPaused?'bg-yellow-300/30 text-yellow-100':'bg-white/10 text-white/60'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning?'bg-white pulse':isPaused?'bg-yellow-300':'bg-white/40'}`}/>
                  {isRunning?'Running':isPaused?'Paused':'Stopped'}
                </span>
              </div>
              <div className="mono text-3xl font-bold text-white mb-0.5">Rp {fmt(totalBal)}</div>
              <div className="text-xs text-white/60 mb-3">Saldo IDR tersedia</div>

              {!isLive && (
                <>
                  <div className="flex justify-between text-xs text-white/80 mb-1">
                    <span>Progress ke Rp {fmt(target)}</span>
                    <span className="font-bold">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-white rounded-full transition-all duration-500" style={{width:`${progress}%`}}/>
                  </div>
                  <div className={`flex items-center gap-2 p-2.5 rounded-xl ${pnlPct>=0?'bg-white/15':'bg-red-600/30'}`}>
                    {pnlPct>=0?<TrendingUp size={16} className="text-white"/>:<TrendingDown size={16} className="text-white"/>}
                    <div>
                      <div className="mono font-bold text-white text-sm">{totalPnl>=0?'+':''}Rp {fmt(Math.abs(totalPnl))}</div>
                      <div className="text-xs text-white/70">{fmtPct(pnlPct)} total return</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                {label:'Trade', val:demo.tradeCount||0,                             color:'#0ea5e9'},
                {label:'Win%',  val:`${(bot.stats?.winRate||0).toFixed(0)}%`,       color:bot.stats?.winRate>=50?'#10b981':'#ef4444'},
                {label:'Wins',  val:bot.stats?.wins||0,                             color:'#10b981'},
                {label:'Loss',  val:bot.stats?.losses||0,                           color:'#ef4444'},
              ].map((s)=>(
                <div key={s.label} className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-100 text-center">
                  <div className="mono font-bold text-lg leading-none" style={{color:s.color}}>{s.val}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Running status + Session + Equity */}
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${isRunning?'bg-emerald-400 pulse':isPaused?'bg-amber-400':'bg-gray-300'}`}/>
                  <span className="text-sm font-semibold text-gray-700">{isRunning?'Bot Berjalan':isPaused?'Bot Dijeda':'Bot Berhenti'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full font-semibold">L{config.level}</span>
                  <span>{config.pair.replace('_idr','').toUpperCase()}</span>
                  <span>{config.tf}</span>
                </div>
              </div>
              {bot.lastSignal && (
                <div className="flex flex-wrap gap-1.5">
                  {bot.lastSignal.session?.isGood!==undefined && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bot.lastSignal.session.isGood?'bg-emerald-50 text-emerald-600':'bg-gray-100 text-gray-400'}`}>
                      {bot.lastSignal.session.isGood?'🟢':'😴'} {bot.lastSignal.session.sessionName||'Sepi'}
                    </span>
                  )}
                  {bot.lastSignal.equityMode?.mode && bot.lastSignal.equityMode.mode!=='normal' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bot.lastSignal.equityMode.mode==='protect'||bot.lastSignal.equityMode.mode==='conservative'?'bg-amber-50 text-amber-600':bot.lastSignal.equityMode.mode==='recovery'?'bg-red-50 text-red-500':'bg-purple-50 text-purple-600'}`}>
                      ⚖️ {bot.lastSignal.equityMode.mode}
                    </span>
                  )}
                  {bot.lastSignal.candle?.pattern && bot.lastSignal.candle.pattern!=='none' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                      🕯️ {bot.lastSignal.candle.pattern.replace(/_/g,' ')}
                    </span>
                  )}
                  {bot.lastSignal.htfBias?.bias && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bot.lastSignal.htfBias.bias==='bullish'?'bg-emerald-50 text-emerald-600':bot.lastSignal.htfBias.bias==='bearish'?'bg-red-50 text-red-500':'bg-gray-100 text-gray-400'}`}>
                      HTF: {bot.lastSignal.htfBias.bias}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Open Positions */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-700">📂 Open Positions ({openPos.length})</span>
              </div>
              <div className="p-3">
                {openPos.length>0
                  ? <div className="space-y-2">{openPos.map((p)=><PositionCard key={p.id} position={p} currentPrice={ticker.last}/>)}</div>
                  : <EmptyState icon="📭" label="Tidak ada posisi terbuka"/>
                }
              </div>
            </div>

            {/* Trade History */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-700">📋 Trade History <span className="text-gray-400 font-normal">({demo.closedTrades?.length||0})</span></span>
                {demo.closedTrades?.length>0 && (
                  <button onClick={handleClearHistory} className="text-xs text-red-400 font-semibold px-2 py-1 hover:bg-red-50 rounded-lg">🗑️ Hapus Semua</button>
                )}
              </div>
              <div className="p-3">
                {demo.closedTrades?.length>0
                  ? <div className="space-y-1">{demo.closedTrades.slice(0,30).map((t)=><TradeRow key={t.id} trade={t} onDelete={handleDeleteTrade}/>)}</div>
                  : <EmptyState icon="📊" label="Belum ada riwayat trade"/>
                }
              </div>
            </div>
          </div>
        )}

        {/* ═══ CHART ═══ */}
        {tab==='chart' && (
          <div className="p-3 space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TIMEFRAMES.map((tf)=>(
                <button key={tf} onClick={()=>setConfig(c=>({...c,tf}))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 shadow-sm ${config.tf===tf?'bg-sky-500 text-white':'bg-white border border-gray-200 text-gray-600'}`}>{tf}</button>
              ))}
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-800">{config.pair.replace('_idr','').toUpperCase()}/IDR</span>
                  <span className="text-xs text-gray-400">{config.tf}</span>
                  {indicators.trend && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${indicators.trend==='bullish'?'bg-emerald-100 text-emerald-600':indicators.trend==='bearish'?'bg-red-100 text-red-500':'bg-gray-100 text-gray-500'}`}>
                      {indicators.trend==='bullish'?'↑ Bull':indicators.trend==='bearish'?'↓ Bear':'→ Side'}
                    </span>
                  )}
                </div>
                {indicators.rsi!=null && (
                  <span className={`mono text-sm font-bold ${indicators.rsi<30?'text-emerald-500':indicators.rsi>70?'text-red-500':'text-gray-600'}`}>RSI {indicators.rsi}</span>
                )}
              </div>
              <CandleChart candles={candles} trades={demo.closedTrades||[]} openPositions={openPos} pair={config.pair}/>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm font-bold text-gray-700 mb-3">📊 Market Info</p>
              <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                {[
                  {l:'Last Price', v:`Rp ${fmt(ticker.last)}`,   c:'text-sky-600 font-bold'},
                  {l:'24h Change', v:fmtPct(ticker.change24h),   c:ticker.change24h>=0?'text-emerald-600 font-bold':'text-red-500 font-bold'},
                  {l:'Bid',        v:`Rp ${fmt(ticker.buy)}`,    c:'text-gray-700'},
                  {l:'Ask',        v:`Rp ${fmt(ticker.sell)}`,   c:'text-gray-700'},
                  {l:'24h High',   v:`Rp ${fmt(ticker.high)}`,   c:'text-emerald-600'},
                  {l:'24h Low',    v:`Rp ${fmt(ticker.low)}`,    c:'text-red-500'},
                ].map((row)=>(
                  <div key={row.l} className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">{row.l}</span>
                    <span className={`mono text-xs ${row.c||'text-gray-700'}`}>{row.v}</span>
                  </div>
                ))}
              </div>
            </div>

            {indicators.macd && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm font-bold text-gray-700 mb-3">📉 Indicators</p>
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                  {[
                    {l:'MACD',      v:fmt(indicators.macd.macd),     c:indicators.macd.macd>=0?'text-emerald-600':'text-red-500'},
                    {l:'Signal',    v:fmt(indicators.macd.signal),   c:'text-gray-700'},
                    {l:'EMA9',      v:fmt(indicators.ema9),          c:'text-sky-600'},
                    {l:'EMA21',     v:fmt(indicators.ema21),         c:'text-orange-500'},
                    ...(indicators.bb?[
                      {l:'BB Upper',v:fmt(indicators.bb.upper),      c:'text-gray-600'},
                      {l:'BB Lower',v:fmt(indicators.bb.lower),      c:'text-gray-600'},
                    ]:[]),
                  ].map((row)=>(
                    <div key={row.l} className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">{row.l}</span>
                      <span className={`mono text-xs font-semibold ${row.c}`}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ SIGNAL ═══ */}
        {tab==='signal' && (
  <div className="p-3 space-y-3">
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="text-sm font-bold text-gray-700 mb-3">🎯 Strategy Level</p>
      <div className="space-y-2">
        {LEVELS.map((lv)=>(
          <button key={lv.id} onClick={()=>setConfig(c=>({...c,level:lv.id}))}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${config.level===lv.id?'border-sky-300 bg-sky-50':'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}>
            <span className="text-xl">{lv.icon}</span>
            <div className="flex-1">
              <div className={`text-sm font-bold ${config.level===lv.id?'text-sky-600':'text-gray-700'}`}>L{lv.id} — {lv.label}</div>
              <div className="text-xs text-gray-400">{lv.desc}</div>
            </div>
            {config.level===lv.id && <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0"/>}
          </button>
        ))}
      </div>
    </div>

    {/* Auto Pair Scanner */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-700">🔍 Auto Pair Scanner</p>
          <p className="text-xs text-gray-400 mt-0.5">Otomatis pilih pair cuan terbaik setiap 4 menit</p>
        </div>
        <button
          onClick={() => onScannerToggle && onScannerToggle(!scannerActive)}
          className={`relative w-12 h-6 rounded-full transition-colors ${scannerActive ? 'bg-sky-500' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${scannerActive ? 'translate-x-6' : 'translate-x-0.5'}`}/>
        </button>
      </div>
      {scannerActive && bestPair && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-700">🏆 {bestPair.display}</p>
              <p className="text-xs text-emerald-600">Score: {bestPair.score} | RSI: {bestPair.rsi} | Trend: {bestPair.trend}</p>
            </div>
            <button onClick={() => onRunScanner && onRunScanner()} className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-semibold">Refresh</button>
          </div>
        </div>
      )}
    </div>

    {/* Max Profit Mode */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-gray-700">🚀 Max Profit Mode</p>
          <p className="text-xs text-gray-400 mt-0.5">Dynamic ATR SL/TP + Auto Compound</p>
        </div>
        <button
          onClick={async () => {
            if (!riskSettings) return;
            const currentValue = riskSettings.maxProfitMode ?? false;
            const newValue = !currentValue;
            setRiskSettings(prev => prev ? { ...prev, maxProfitMode: newValue } : { maxProfitMode: newValue });
            try {
              const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggleMaxProfitMode' }),
              });
              const d = await res.json();
              if (d.success && d.risk) setRiskSettings(d.risk);
            } catch {
              setRiskSettings(prev => prev ? { ...prev, maxProfitMode: currentValue } : { maxProfitMode: currentValue });
            }
          }}
          className={`relative w-12 h-6 rounded-full transition-colors ${riskSettings?.maxProfitMode ? 'bg-emerald-500' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${riskSettings?.maxProfitMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {riskSettings?.maxProfitMode && (
        <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700 space-y-1">
          <p>✅ ATR Dinamis — SL/TP menyesuaikan volatilitas</p>
          <p>✅ Auto Compound saat win streak 3+</p>
          <p>✅ Entry hanya di zona support/oversold</p>
        </div>
      )}
    </div>

    {/* Ultra Profit Mode */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-gray-700">🔥 Ultra Profit Mode</p>
          <p className="text-xs text-gray-400 mt-0.5">Maximal profit dengan filter ketat</p>
        </div>
        <button
          onClick={async () => {
            if (!riskSettings) return;
            const current = !!riskSettings.ultraProfitMode;
            const newValue = !current;
            setRiskSettings(prev => prev ? { ...prev, ultraProfitMode: newValue } : { ultraProfitMode: newValue });
            try {
              const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggleUltraProfitMode' }),
              });
              const d = await res.json();
              if (d.success && d.risk) setRiskSettings(d.risk);
            } catch {
              setRiskSettings(prev => prev ? { ...prev, ultraProfitMode: current } : { ultraProfitMode: current });
            }
          }}
          className={`relative w-12 h-6 rounded-full transition-colors ${riskSettings?.ultraProfitMode ? 'bg-red-500' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${riskSettings?.ultraProfitMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {riskSettings?.ultraProfitMode && (
        <div className="mt-4 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-2xl p-4 text-sm">
          <p className="font-bold mb-2">🔥 ULTRA PROFIT MODE AKTIF</p>
          <ul className="text-xs space-y-1">
            <li>✓ Filter High Probability sangat ketat</li>
            <li>✓ Compounding agresif</li>
            <li>✓ Partial TP + Trailing Stop</li>
          </ul>
        </div>
      )}
    </div>

    {/* Ultra Light Mode (Baru) */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-gray-700">🌟 Ultra Light Mode</p>
          <p className="text-xs text-gray-400 mt-0.5">Entry lebih sering dengan compounding tetap bagus</p>
        </div>
        <button
          onClick={async () => {
            if (!riskSettings) return;
            const current = !!riskSettings.ultraLightMode;
            const newValue = !current;
            setRiskSettings(prev => prev ? { ...prev, ultraLightMode: newValue } : { ultraLightMode: newValue });
            try {
              const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggleUltraLightMode' }),
              });
              const d = await res.json();
              if (d.success && d.risk) setRiskSettings(d.risk);
            } catch {
              setRiskSettings(prev => prev ? { ...prev, ultraLightMode: current } : { ultraLightMode: current });
            }
          }}
          className={`relative w-12 h-6 rounded-full transition-colors ${riskSettings?.ultraLightMode ? 'bg-amber-500' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${riskSettings?.ultraLightMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {riskSettings?.ultraLightMode && (
        <div className="mt-4 bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-2xl p-4 text-sm">
          <p className="font-bold mb-2">🌟 ULTRA LIGHT MODE AKTIF</p>
          <ul className="text-xs space-y-1">
            <li>✓ Entry lebih mudah & sering</li>
            <li>✓ Compounding win streak tetap aktif</li>
            <li>✓ Risk:Reward minimal 1.25x</li>
            <li>✓ Cocok untuk market sideways</li>
          </ul>
        </div>
      )}
    </div>

    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="text-sm font-bold text-gray-700 mb-3">📡 Last Signal <span className="text-gray-400 font-normal text-xs ml-1">L{config.level}</span></p>
      <SignalPanel signal={bot.lastSignal} level={config.level}/>
    </div>

    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">📝 Trade Log</span>
        <span className="text-xs text-gray-400">{logs.length} entries</span>
      </div>
      <div className="overflow-y-auto" style={{maxHeight:300}}>
        {logs.length===0
          ? <div className="py-8 text-center text-xs text-gray-400">Log kosong — start bot</div>
          : logs.map((log)=>(
              <div key={log.id} className="px-4 py-2.5 flex items-start gap-2.5 border-b border-gray-50 last:border-0">
                <span className={`text-sm shrink-0 mt-0.5 ${log.type==='buy'||log.type==='profit'?'text-emerald-500':log.type==='loss'?'text-red-400':log.type==='warning'?'text-amber-500':'text-gray-400'}`}>
                  {log.type==='buy'?'↑':log.type==='profit'?'✓':log.type==='loss'?'✗':log.type==='warning'?'⚠':'·'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 break-words">{log.message}</p>
                  <p className="mono text-xs text-gray-400 mt-0.5">{new Date(log.time).toLocaleTimeString('id-ID')}</p>
                </div>
              </div>
            ))
        }
      </div>
    </div>
  </div>
)}
                <button
                  onClick={async () => {
                    if (!riskSettings) return;

                    const currentValue = riskSettings.maxProfitMode ?? false;
                    const newValue = !currentValue;

                    // Optimistic update
                    setRiskSettings(prev => prev ? { ...prev, maxProfitMode: newValue } : { maxProfitMode: newValue });

                    try {
                      const res = await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'toggleMaxProfitMode' }),
                      });

                      const d = await res.json();

                      if (d.success && d.risk) {
                        setRiskSettings(d.risk);
                      } else {
                        // Rollback
                        setRiskSettings(prev => prev ? { ...prev, maxProfitMode: currentValue } : { maxProfitMode: currentValue });
                        alert('Gagal mengubah Max Profit Mode');
                      }
                    } catch (err) {
                      console.error('Toggle error:', err);
                      // Rollback
                      setRiskSettings(prev => prev ? { ...prev, maxProfitMode: currentValue } : { maxProfitMode: currentValue });
                      alert('Terjadi kesalahan koneksi');
                    }
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                    riskSettings?.maxProfitMode ? 'bg-emerald-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${
                      riskSettings?.maxProfitMode ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              
              {/* ── ULTRA PROFIT MODE ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    🔥 Ultra Profit Mode
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Maximal profit + compounding agresif dengan filter ketat
                  </p>
                </div>

                <button
                  onClick={async () => {
                    if (!riskSettings) return;
                    const currentValue = !!riskSettings.ultraProfitMode;
                    const newValue = !currentValue;

                    setRiskSettings(prev => prev ? { ...prev, ultraProfitMode: newValue } : { ultraProfitMode: newValue });

                    try {
                      const res = await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'toggleUltraProfitMode' }),
                      });
                      const d = await res.json();
                      if (d.success && d.risk) setRiskSettings(d.risk);
                    } catch (err) {
                      console.error(err);
                      setRiskSettings(prev => prev ? { ...prev, ultraProfitMode: currentValue } : { ultraProfitMode: currentValue });
                      alert('Terjadi kesalahan koneksi');
                    }
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                    riskSettings?.ultraProfitMode ? 'bg-red-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${
                    riskSettings?.ultraProfitMode ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {riskSettings?.ultraProfitMode && (
                <div className="mt-4 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-2xl p-4 text-sm">
                  <p className="font-bold mb-2">🔥 ULTRA PROFIT MODE AKTIF</p>
                  <ul className="text-xs space-y-1">
                    <li>✓ Entry hanya di zona High Probability</li>
                    <li>✓ Compounding agresif saat win streak</li>
                    <li>✓ Partial TP 50% + Trailing Stop</li>
                    <li>✓ Drawdown protection ketat</li>
                  </ul>
                </div>
              )}
            </div>

              {riskSettings?.maxProfitMode && (
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700 space-y-1">
                  <p>✅ <strong>ATR Dinamis</strong> — SL/TP menyesuaikan volatilitas realtime</p>
                  <p>✅ <strong>Auto Compound</strong> — size bertambah otomatis saat win streak 3+</p>
                  <p>✅ <strong>Buy Low Sell High</strong> — entry hanya di zona support/oversold</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm font-bold text-gray-700 mb-3">📡 Last Signal <span className="text-gray-400 font-normal text-xs ml-1">L{config.level}</span></p>
              <SignalPanel signal={bot.lastSignal} level={config.level}/>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">📝 Trade Log</span>
                <span className="text-xs text-gray-400">{logs.length} entries</span>
              </div>
              <div className="overflow-y-auto" style={{maxHeight:300}}>
                {logs.length===0
                  ? <div className="py-8 text-center text-xs text-gray-400">Log kosong — start bot</div>
                  : logs.map((log)=>(
                      <div key={log.id} className="px-4 py-2.5 flex items-start gap-2.5 border-b border-gray-50 last:border-0">
                        <span className={`text-sm shrink-0 mt-0.5 ${log.type==='buy'||log.type==='profit'?'text-emerald-500':log.type==='loss'?'text-red-400':log.type==='warning'?'text-amber-500':'text-gray-400'}`}>
                          {log.type==='buy'?'↑':log.type==='profit'?'✓':log.type==='loss'?'✗':log.type==='warning'?'⚠':'·'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 break-words">{log.message}</p>
                          <p className="mono text-xs text-gray-400 mt-0.5">{new Date(log.time).toLocaleTimeString('id-ID')}</p>
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>
        )}

        {/* ═══ RISK ═══ */}
        {tab==='risk' && (
          <div className="p-3 space-y-3">
            {riskSettings
              ? <RiskTab
                  riskSettings={riskSettings}
                  onUpdate={async(s)=>{
                    const d=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'updateRisk',settings:s})}).then(r=>r.json());
                    if(d.success) setRiskSettings(d.risk);
                  }}
                  consecutiveLosses={bot.consecutiveLosses||0}
                  openPositions={openPos.length}
                />
              : <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
                    <p className="text-gray-400 text-sm">Memuat pengaturan...</p>
                  </div>
                </div>
            }
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab==='settings' && (
          <SettingsTab config={config} setConfig={setConfig}
            onResetDemo={async(bal)=>{
              const d=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'resetDemoBalance',settings:{balance:bal}})}).then(r=>r.json());
              if(d.success){ await fetchBot(); }
              return d;
            }}
            onReset={()=>{ if(confirm('Reset semua data bot dan demo?')) handleAction('reset'); }}
            userEmail={userEmail} onLogout={onLogout}
          />
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg flex z-50">
        {TABS.map(({id,label,icon})=>(
          <button key={id} onClick={()=>setTab(id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${tab===id?'text-sky-500':'text-gray-400'}`}>
            <span className="text-xl leading-none">{icon}</span>
            <span className={`text-xs font-semibold ${tab===id?'text-sky-500':'text-gray-400'}`}>{label}</span>
            {tab===id && <div className="w-1 h-1 rounded-full bg-sky-500"/>}
          </button>
        ))}
      </nav>

      {/* Live Confirm Modal */}
      {liveConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><AlertTriangle size={20} className="text-red-500"/></div>
              <div><h3 className="font-bold text-gray-900">Aktifkan LIVE Mode?</h3><p className="text-xs text-gray-500">Trading dengan uang nyata</p></div>
            </div>
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3 mb-4">⚠️ Akan eksekusi transaksi NYATA dengan API Indodax Anda.</p>
            <div className="flex gap-2">
              <button onClick={()=>setLiveConfirm(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl">Batal</button>
              <button onClick={()=>{setLiveConfirm(false);handleAction('start',{confirmed:true});}} className="flex-1 py-2.5 bg-red-500 text-white text-sm font-bold rounded-xl">Ya, LIVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RiskSlider (standalone - OUTSIDE RiskTab) ────────────────────────────────
function RiskSlider({ label, field, min, max, step=1, unit='', vals, setVals }) {
  const val     = vals[field] ?? min;
  const display = field==='targetProfitIDR' ? 'Rp '+new Intl.NumberFormat('id-ID').format(val) : val+unit;
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex justify-between text-xs mb-2">
        <span className="text-gray-500 font-medium">{label}</span>
        <span className="mono font-bold text-sky-600">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e)=>setVals(v=>({...v,[field]:parseFloat(e.target.value)}))}
        className="w-full accent-sky-500"/>
      <div className="flex justify-between text-xs text-gray-300 mt-1">
        <span>{field==='targetProfitIDR'?'Rp '+new Intl.NumberFormat('id-ID').format(min):min+unit}</span>
        <span>{field==='targetProfitIDR'?'Rp '+new Intl.NumberFormat('id-ID').format(max):max+unit}</span>
      </div>
    </div>
  );
}

// ─── RiskTab ──────────────────────────────────────────────────────────────────
function RiskTab({ riskSettings: s, onUpdate, consecutiveLosses, openPositions }) {
  const defaults = { stopLossPercent:1,takeProfitPercent:2,trailingStopPercent:0.5,maxRiskPercent:80,maxPositions:1,maxConsecutiveLosses:3,cooldownSeconds:10,targetProfitIDR:1000000 };
  const [vals,   setVals]   = useState({ ...defaults, ...(s||{}) });
  const [saved,  setSaved]  = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await onUpdate(vals); setSaved(true); setTimeout(()=>setSaved(false),2500); }
    catch{} finally{ setSaving(false); }
  };

  const sliders = [
    {label:'Stop Loss',         field:'stopLossPercent',      min:0.2,    max:5,       step:0.1,    unit:'%'},
    {label:'Take Profit',       field:'takeProfitPercent',    min:0.5,    max:10,      step:0.1,    unit:'%'},
    {label:'Trailing Stop',     field:'trailingStopPercent',  min:0.1,    max:3,       step:0.1,    unit:'%'},
    {label:'Max Risk/Trade',    field:'maxRiskPercent',       min:5,      max:95,      step:5,      unit:'%'},
    {label:'Max Posisi',        field:'maxPositions',         min:1,      max:3,       step:1,      unit:''},
    {label:'Max Loss Berturut', field:'maxConsecutiveLosses', min:1,      max:10,      step:1,      unit:'x'},
    {label:'Cooldown',          field:'cooldownSeconds',      min:5,      max:120,     step:5,      unit:'s'},
    {label:'Target Profit',     field:'targetProfitIDR',      min:200000, max:5000000, step:100000, unit:''},
  ];

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-700 mb-3">🛡️ Risk Monitor Live</p>
        <div className="space-y-3">
          {[{label:'Consecutive Losses',val:consecutiveLosses,max:3,color:'#ef4444'},
            {label:'Open Positions',    val:openPositions,    max:2,color:'#0ea5e9'}].map((item)=>(
            <div key={item.label}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500">{item.label}</span>
                <span className="mono font-bold" style={{color:item.color}}>{item.val}/{item.max}</span>
              </div>
              <div className="flex gap-1">
                {Array.from({length:item.max}).map((_,i)=>(
                  <div key={i} className={`h-2 flex-1 rounded-full transition-all`}
                    style={{background: i<item.val ? item.color : '#e5e7eb'}}/>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-700 mb-3">⚙️ Risk Parameters</p>
        <div className="space-y-3">
          {sliders.map((sl)=>(
            <RiskSlider key={sl.field} {...sl} vals={vals} setVals={setVals}/>
          ))}
        </div>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-700 space-y-1">
        <p className="font-bold">💡 Rekomendasi Scalping 100K → 1Jt</p>
        <p>• SL 1% / TP 2% → Risk:Reward = 1:2</p>
        <p>• Risk/Trade 80% saldo (agresif)</p>
        <p>• Cooldown 10 detik antar entry</p>
        <p>• Win rate min 55% agar profit konsisten</p>
      </div>

      <button onClick={save} disabled={saving}
        className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-md transition-all ${saved?'bg-emerald-500':'bg-sky-500'} text-white disabled:opacity-60`}>
        {saving?'⏳ Menyimpan...':saved?'✅ Tersimpan!':'💾 Simpan Pengaturan'}
      </button>
    </>
  );
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────
function SettingsTab({ config, setConfig, onResetDemo, onReset, userEmail, onLogout }) {
  const [balInput,  setBalInput]  = useState('100000');
  const [resetMsg,  setResetMsg]  = useState('');
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    const bal = parseInt(balInput.replace(/\D/g,''));
    if(!bal||bal<1000){ setResetMsg('Minimal Rp 1.000'); return; }
    setResetting(true);
    try {
      const d = await onResetDemo(bal);
      setResetMsg('✅ Reset ke Rp '+new Intl.NumberFormat('id-ID').format(bal));
      setTimeout(()=>setResetMsg(''),3000);
    } catch{ setResetMsg('Gagal reset'); } finally{ setResetting(false); }
  };

  return (
    <div className="p-3 space-y-3">

      {/* Demo Balance */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-700 mb-3">💰 Saldo Demo Awal</p>
        <div className="flex gap-2 mb-2">
          <input type="number" value={balInput} onChange={(e)=>setBalInput(e.target.value)}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 mono outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="100000"/>
          <button onClick={handleReset} disabled={resetting}
            className="px-4 py-2 bg-sky-500 text-white text-xs font-bold rounded-xl shadow disabled:opacity-50">
            {resetting?'...':'Reset'}
          </button>
        </div>
        {resetMsg && <p className="text-xs text-emerald-600 font-medium">{resetMsg}</p>}
        <div className="flex flex-wrap gap-2 mt-2">
          {[100000,500000,1000000,5000000].map((v)=>(
            <button key={v} onClick={()=>setBalInput(String(v))}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium hover:bg-sky-50 hover:text-sky-600 border border-gray-200">
              Rp {(v/1000).toFixed(0)}K
            </button>
          ))}
        </div>
      </div>

      {/* Bot Config */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-700 mb-3">🤖 Konfigurasi Bot</p>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">Trading Pair</p>
            <PairSelector value={config.pair} onChange={(p)=>setConfig(c=>({...c,pair:p}))}/>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">Timeframe</p>
            <div className="flex gap-1.5 flex-wrap">
              {['1m','5m','15m','1h','4h'].map((tf)=>(
                <button key={tf} onClick={()=>setConfig(c=>({...c,tf}))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${config.tf===tf?'bg-sky-500 text-white shadow':'bg-gray-100 text-gray-600 border border-gray-200'}`}>{tf}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account */}
      {userEmail && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">👤 Akun</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">{userEmail}</p>
              <p className="text-xs text-gray-400">IndoTrader v3.0</p>
            </div>
            {onLogout && (
              <button onClick={()=>{ if(confirm('Logout?')) onLogout(); }}
                className="px-4 py-2 bg-red-50 border border-red-200 text-red-500 text-xs font-bold rounded-xl">Logout</button>
            )}
          </div>
        </div>
      )}

      {/* Reset */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
        <p className="text-sm font-bold text-red-400 mb-3">⚠️ Reset Data</p>
        <button onClick={onReset} className="w-full py-2.5 border border-red-200 text-red-400 text-xs font-bold rounded-xl">
          Reset Bot + Demo Data
        </button>
      </div>

      <p className="text-center text-xs text-gray-300 pb-2">IndoTrader v3.0 — Scalping Engine</p>
    </div>
  );
}

// ─── PairSelector ─────────────────────────────────────────────────────────────
function PairSelector({ value, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useEffect(()=>{
    const fn=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',fn);
    return ()=>document.removeEventListener('mousedown',fn);
  },[]);
  const filtered = search.trim()
    ? PAIR_GROUPS.map(g=>({...g,pairs:g.pairs.filter(p=>p.toUpperCase().includes(search.toUpperCase()))})).filter(g=>g.pairs.length>0)
    : PAIR_GROUPS;
  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>{setOpen(v=>!v);setSearch('');}}
        className="flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200 shadow-sm">
        <span className="text-sky-500 text-xs">●</span>
        {value.replace('_idr','').toUpperCase()}<span className="text-gray-400 text-xs">/IDR</span>
        <ChevronDown size={12} className={`transition-transform text-gray-400 ${open?'rotate-180':''}`}/>
      </button>
      {open && (
        <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-2xl shadow-xl z-[100] w-56 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input type="text" placeholder="Cari pair..." value={search} onChange={(e)=>setSearch(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-sky-400 text-gray-700" autoFocus/>
          </div>
          <div className="overflow-y-auto" style={{maxHeight:280}}>
            {filtered.map((g)=>(
              <div key={g.label}>
                <div className="px-3 py-1.5 text-xs font-bold text-gray-400 bg-gray-50 sticky top-0">{g.label}</div>
                {g.pairs.map((p)=>(
                  <button key={p} onClick={()=>{onChange(p);setOpen(false);setSearch('');}}
                    className={`w-full px-4 py-2 text-left text-xs font-semibold flex justify-between ${p===value?'bg-sky-50 text-sky-600':'text-gray-700 hover:bg-gray-50'}`}>
                    <span>{p.replace('_idr','').toUpperCase()}</span>
                    <span className="text-gray-300">IDR</span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length===0 && <div className="py-6 text-center text-xs text-gray-400">Tidak ditemukan</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TradeRow ─────────────────────────────────────────────────────────────────
function TradeRow({ trade, onDelete }) {
  const pos = trade.pnl >= 0;
  const dur = trade.duration ? (trade.duration < 60000 ? `${Math.round(trade.duration/1000)}d` : `${Math.round(trade.duration/60000)}m`) : '';
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${pos?'bg-emerald-50':'bg-red-50'}`}>
        {pos?<ArrowUpRight size={13} className="text-emerald-500"/>:<ArrowDownRight size={13} className="text-red-400"/>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-gray-700">{trade.pair?.replace('_idr','').toUpperCase()}/IDR</span>
          {dur && <span className="text-xs text-gray-300">{dur}</span>}
        </div>
        <div className="text-xs text-gray-400">{trade.exitReason?.replace(/_/g,' ')}</div>
      </div>
      <div className="text-right mr-1">
        <div className={`mono text-xs font-bold ${pos?'text-emerald-500':'text-red-500'}`}>{pos?'+':''}Rp {fmt(Math.abs(trade.pnl))}</div>
        <div className={`text-xs ${pos?'text-emerald-400':'text-red-400'}`}>{fmtPct(trade.pnlPct)}</div>
      </div>
      {onDelete && (
        <button onClick={()=>onDelete(trade.id)} className="text-gray-200 hover:text-red-400 shrink-0 p-1 rounded-lg hover:bg-red-50 transition-colors text-xs">✕</button>
      )}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
function EmptyState({ icon, label }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-gray-300">
      <span className="text-3xl mb-2">{icon}</span>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
