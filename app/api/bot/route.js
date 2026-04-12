/**
 * app/api/bot/route.js
 * Stateless bot engine — client sends state, server returns updates
 */
import { NextResponse } from 'next/server';
import { getBotState, startBot, stopBot, resetBotState, resumeBot, getLogs, runCycle, recordTradeResult } from '../../../lib/tradingEngine.js';
import { getDemoState, resetDemo, demoBuy, demoSell, updatePositions, setStartBalance } from '../../../lib/demoStore.js';
import { getOHLCV, trade, openOrders } from '../../../lib/indodax.js';

export async function GET() {
  const state = getBotState();
  const demo  = getDemoState();
  const logs  = getLogs(50);
  return NextResponse.json({
    success: true,
    bot: {
      running: state.running, mode: state.mode, level: state.level, pair: state.pair,
      isPaused: state.isPaused, pauseReason: state.pauseReason,
      consecutiveLosses: state.consecutiveLosses, consecutiveWins: state.consecutiveWins,
      totalPnl: state.totalPnl, lastSignal: state.lastSignal, stats: state.stats,
    },
    demo: {
      idrBalance: demo.idrBalance, startBalance: demo.startBalance,
      totalPnl: demo.totalPnl, totalPnlPct: demo.totalPnlPct,
      openPositions: demo.openPositions,
      closedTrades: demo.closedTrades.slice(0, 50),
      tradeCount: demo.tradeCount, consecutiveLosses: demo.consecutiveLosses,
    },
    logs,
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { action, config, clientState } = body;

  // ── Restore client state into server memory (fix stateless issue) ──────────
  if (clientState) {
    const demo = getDemoState();
    // Only restore if client has newer data (higher tradeCount or balance differs)
    if (clientState.idrBalance !== undefined) {
      demo.idrBalance        = clientState.idrBalance;
      demo.startBalance      = clientState.startBalance      || demo.startBalance;
      demo.totalPnl          = clientState.totalPnl          || 0;
      demo.totalPnlPct       = clientState.totalPnlPct       || 0;
      demo.tradeCount        = clientState.tradeCount        || 0;
      demo.consecutiveLosses = clientState.consecutiveLosses || 0;
      demo.consecutiveWins   = clientState.consecutiveWins   || 0;
      // Restore open positions
      if (Array.isArray(clientState.openPositions)) demo.openPositions = clientState.openPositions;
      // Restore closed trades (merge, deduplicate by id)
      if (Array.isArray(clientState.closedTrades)) {
        const existing = new Set(demo.closedTrades.map(t => t.id));
        for (const t of clientState.closedTrades) {
          if (!existing.has(t.id)) { demo.closedTrades.unshift(t); existing.add(t.id); }
        }
        demo.closedTrades = demo.closedTrades.slice(0, 200);
      }
    }
  }

  try {
    switch (action) {

      case 'start': {
        if (config?.mode === 'live' && !config.confirmed) {
          return NextResponse.json({ success: false, requireConfirmation: true });
        }
        startBot(config || {});
        return NextResponse.json({ success: true, message: 'Bot started', state: getBotState() });
      }

      case 'sync': {
        // Client just wants to sync its state to server — return current state
        return NextResponse.json({ success: true, bot: getBotState(), demo: getDemoState(), logs: getLogs(50) });
      }

      case 'stop':   stopBot();   return NextResponse.json({ success: true });
      case 'resume': resumeBot(); return NextResponse.json({ success: true });

      case 'reset': {
        resetBotState();
        const amount = config?.balance || 100000;
        setStartBalance(amount);
        resetDemo(amount);
        return NextResponse.json({ success: true, demo: getDemoState() });
      }

      case 'deleteTrade': {
        const demo = getDemoState();
        const tradeId = config?.tradeId;
        if (tradeId) {
          demo.closedTrades = demo.closedTrades.filter(t => t.id !== tradeId);
          // Recalculate totalPnl from remaining trades
          demo.totalPnl    = demo.closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
          demo.tradeCount  = demo.closedTrades.length;
          demo.totalPnlPct = demo.startBalance > 0 ? (demo.totalPnl / demo.startBalance) * 100 : 0;
        }
        return NextResponse.json({ success: true, demo: getDemoState() });
      }

      case 'clearHistory': {
        const demo = getDemoState();
        demo.closedTrades  = [];
        demo.totalPnl      = 0;
        demo.totalPnlPct   = 0;
        demo.tradeCount    = 0;
        return NextResponse.json({ success: true, demo: getDemoState() });
      }

      case 'cycle': {
        const state = getBotState();
        if (!state.running) return NextResponse.json({ success: false, error: 'Bot not running' });

        const pair = config?.pair || state.pair || 'btc_idr';
        const tf   = config?.tf   || state.tf   || '5m';

        const candles = await getOHLCV(pair, tf, 100);
        if (!candles || candles.length < 30) {
          return NextResponse.json({ success: false, error: 'Insufficient candle data' });
        }

        const demo = getDemoState();
        updatePositions(pair, candles[candles.length - 1].close);
        let openPositions = demo.openPositions.filter(p => p.pair === pair);

        const close    = candles[candles.length - 1].close;
        const riskCfg = await import('../../../lib/riskManager.js').then(m => m.getRiskSettings());
        const decision = await runCycle(candles, {
          balance:       demo.idrBalance,
          startBalance:  demo.startBalance  || 100000,
          targetBalance: riskCfg.targetProfitIDR || 1000000,
          openPositions,
          prices:  { [pair]: close },
        });

        // ── Process exits ──────────────────────────────────────────────────
        for (const exitDec of (decision.exits || [])) {
          try {
            if (state.mode === 'demo') {
              const result = demoSell(exitDec.position.id, close, exitDec.reason);
              recordTradeResult(result.pnl, pair);
              decision.executedSell = result;
            } else if (state.mode === 'live') {
              const pos = exitDec.position;
              await trade(pair, 'sell', close, null, pos.cryptoAmount);
            }
          } catch (err) { console.error('Exit error:', err); }
        }

        // ── Process entry ──────────────────────────────────────────────────
        if (decision.entry) {
          try {
            if (state.mode === 'demo') {
              const position = demoBuy(pair, close, decision.entry.idrAmount, {
                stopLoss: decision.entry.stopLoss, takeProfit: decision.entry.takeProfit,
                trailingStop: decision.entry.trailingStop,
              });
              decision.executedBuy = position;
            } else if (state.mode === 'live') {
              await trade(pair, 'buy', close, decision.entry.idrAmount, null);
            }
          } catch (err) { decision.entryError = err.message; }
        }

        // Return full updated demo state so client can persist it
        return NextResponse.json({ success: true, decision, demo: getDemoState() });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
