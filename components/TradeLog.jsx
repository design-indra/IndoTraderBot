'use client';

import { ScrollText, TrendingUp, TrendingDown, AlertTriangle, Info, Zap } from 'lucide-react';

const LOG_ICONS = {
  buy: <TrendingUp size={11} className="text-emerald-500" />,
  sell: <TrendingDown size={11} className="text-sky-500" />,
  profit: <TrendingUp size={11} className="text-emerald-500" />,
  loss: <TrendingDown size={11} className="text-red-400" />,
  warning: <AlertTriangle size={11} className="text-amber-500" />,
  error: <AlertTriangle size={11} className="text-red-500" />,
  system: <Zap size={11} className="text-slate-400" />,
  info: <Info size={11} className="text-slate-400" />,
};

const LOG_COLORS = {
  buy: 'text-emerald-600 bg-emerald-50',
  sell: 'text-sky-600 bg-sky-50',
  profit: 'text-emerald-600 bg-emerald-50',
  loss: 'text-red-500 bg-red-50',
  warning: 'text-amber-700 bg-amber-50',
  error: 'text-red-600 bg-red-50',
  system: 'text-slate-500 bg-slate-50',
  info: 'text-slate-500 bg-slate-50',
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function TradeLog({ logs = [] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <ScrollText size={14} className="text-sky-500" />
        <span className="text-xs font-semibold text-slate-500">Trade Log</span>
        <span className="ml-auto mono text-xs text-slate-400">{logs.length} entries</span>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
        {logs.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-slate-300">
            <ScrollText size={24} />
            <p className="text-xs mt-2 text-slate-400">Log kosong — start bot</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {logs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-2.5 flex items-start gap-2.5 hover:bg-slate-50/50 transition-colors slide-in"
              >
                <div className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center mt-0.5 ${LOG_COLORS[log.type] || LOG_COLORS.info}`}>
                  {LOG_ICONS[log.type] || LOG_ICONS.info}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 leading-relaxed break-words">{log.message}</p>
                  <p className="mono text-xs text-slate-400 mt-0.5">{formatTime(log.time)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
