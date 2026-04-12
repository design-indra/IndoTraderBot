'use client';
import { Shield, AlertTriangle, Target } from 'lucide-react';

const fmt    = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n||0));
const fmtPct = (n) => `${n>=0?'+':''}${(n||0).toFixed(2)}%`;

export function PositionCard({ position, currentPrice }) {
  if (!position) return null;
  const current  = currentPrice || position.entryPrice;
  const pnlPct   = ((current - position.entryPrice) / position.entryPrice) * 100;
  const pnl      = (pnlPct / 100) * position.idrAmount;
  const isProfit = pnl >= 0;
  return (
    <div className={`rounded-xl border p-3 ${isProfit?'border-emerald-200 bg-emerald-50':'border-red-200 bg-red-50'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-sky-100 text-sky-600 text-xs font-bold rounded-md">
            {position.pair?.replace('_idr','').toUpperCase()}/IDR
          </span>
          <span className="text-xs text-gray-400">BUY</span>
        </div>
        <span className={`text-xs font-bold mono ${isProfit?'text-emerald-600':'text-red-500'}`}>
          {isProfit?'+':''}Rp {fmt(Math.abs(pnl))} <span className="font-normal text-gray-400">({fmtPct(pnlPct)})</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-gray-400 block">Entry</span><span className="mono font-semibold text-gray-700">Rp {fmt(position.entryPrice)}</span></div>
        <div><span className="text-gray-400 block">Current</span><span className={`mono font-semibold ${isProfit?'text-emerald-600':'text-red-500'}`}>Rp {fmt(current)}</span></div>
        {position.stopLoss   && <div><span className="text-gray-400 block">Stop Loss</span><span className="mono font-medium text-red-500">Rp {fmt(position.stopLoss)}</span></div>}
        {position.takeProfit && <div><span className="text-gray-400 block">Take Profit</span><span className="mono font-medium text-emerald-600">Rp {fmt(position.takeProfit)}</span></div>}
      </div>
      {position.trailingStop && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1">
          <Shield size={10}/> Trailing: Rp {fmt(position.trailingStop)}
        </div>
      )}
    </div>
  );
}

export function StatCard({ label, value, icon, color='sky' }) {
  const colors = { sky:'bg-sky-50 text-sky-500', green:'bg-emerald-50 text-emerald-500', red:'bg-red-50 text-red-500', amber:'bg-amber-50 text-amber-500' };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center mb-1.5 ${colors[color]||colors.sky}`}>{icon}</div>
      <div className="mono font-bold text-gray-800 text-base leading-none">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

export function LevelBadge({ level, levels }) {
  const lv = levels?.find((l)=>l.id===level);
  if (!lv) return null;
  return <span className="hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{background:lv.color}}>{lv.icon} L{lv.id}</span>;
}

export function SignalPanel({ signal, level }) {
  if (!signal) return (
    <div className="py-4 text-center">
      <p className="text-xs text-gray-400">Menunggu sinyal pertama...</p>
    </div>
  );
  const action = signal.action || 'HOLD';
  const colors = { BUY:'bg-emerald-500', SELL:'bg-red-500', HOLD:'bg-gray-400' };
  const bgs    = { BUY:'bg-emerald-50 border-emerald-200', SELL:'bg-red-50 border-red-200', HOLD:'bg-gray-50 border-gray-200' };
  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between p-3 rounded-xl border ${bgs[action]||bgs.HOLD}`}>
        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm font-bold ${colors[action]}`}>
          {action==='BUY'?'↑':action==='SELL'?'↓':'→'} {action}
        </span>
        {signal.score!==undefined && (
          <div className="text-right">
            <div className="mono font-bold text-gray-800 text-lg">{Math.round(signal.score)}</div>
            <div className="text-xs text-gray-400">score</div>
          </div>
        )}
      </div>
      {signal.signals && Object.entries(signal.signals).map(([k,v])=>(
        <div key={k} className="flex justify-between text-xs">
          <span className="text-gray-400 uppercase">{k}</span>
          <span className={`font-semibold ${String(v).includes('bull')||String(v).includes('over')?'text-emerald-600':String(v).includes('bear')?'text-red-500':'text-gray-500'}`}>{v}</span>
        </div>
      ))}
      {signal.rsi!==undefined && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">RSI (14)</span>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${signal.rsi<30?'bg-emerald-400':signal.rsi>70?'bg-red-400':'bg-sky-400'}`} style={{width:`${signal.rsi}%`}}/>
            </div>
            <span className={`mono font-bold ${signal.rsi<30?'text-emerald-500':signal.rsi>70?'text-red-500':'text-gray-600'}`}>{signal.rsi?.toFixed(1)}</span>
          </div>
        </div>
      )}
      {signal.trend && (
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Trend</span>
          <span className={`font-semibold ${signal.trend==='bullish'?'text-emerald-500':signal.trend==='bearish'?'text-red-500':'text-gray-500'}`}>
            {signal.trend==='bullish'?'↑ Bullish':signal.trend==='bearish'?'↓ Bearish':'→ Sideways'}
          </span>
        </div>
      )}
    </div>
  );
}

export function RiskPanel({ consecutiveLosses=0, openPositions=0 }) {
  return (
    <div className="space-y-3">
      {[{label:'Consecutive Losses',val:consecutiveLosses,max:3,c:'#ef4444'},
        {label:'Open Positions',    val:openPositions,    max:2,c:'#0ea5e9'}].map((item)=>(
        <div key={item.label}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-500">{item.label}</span>
            <span className="mono font-bold" style={{color:item.c}}>{item.val}/{item.max}</span>
          </div>
          <div className="flex gap-1">
            {Array.from({length:item.max}).map((_,i)=>(
              <div key={i} className="h-2 flex-1 rounded-full" style={{background: i<item.val ? item.c : '#e5e7eb'}}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PositionCard;
