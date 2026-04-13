/**
 * lib/tradingEngine.js — Advanced Trading Engine v4 + Ultra Light Mode
 */

import {
  getLatestRSI, getLatestEMA, calculateMACD, calculateBollingerBands,
  detectVolumeSpike, detectMarketTrend, computeSignalScore, extractFeatures,
  calculateATR, detectCandlePattern, isGoodTradingSession, calculateAdaptiveTPSL,
  getHigherTFBias, getEquityMode, isPairBlacklisted, reportPairLoss, resetPairLoss,
  calculateStochRSI, detectSupportResistance, calculateFibonacci,
  calculateMomentumScore, detectDivergence, calculateVWAP, calculateTrendStrength,
} from './indicators.js';

import {
  calculatePositionSize, calculateUltraPositionSize, calculateUltraLightPositionSize,
  canOpenPosition, getStopLossPrice, getTakeProfitPrice, checkPositionExit,
  updateTrailingStop, getRiskSettings, isUltraProfitMode, isUltraLightMode,
} from './riskManager.js';

import { getMLSignal, addTrainingSample } from './mlModel.js';
import { getRLSignal, remember, computeReward, trainStep, buildState } from './rlEngine.js';

// ─── Bot State ────────────────────────────────────────────────────────────────
let botState = {
  running: false, 
  mode: 'demo', 
  level: 1, 
  pair: 'btc_idr',
  consecutiveLosses: 0, 
  consecutiveWins: 0, 
  totalPnl: 0,
  isPaused: false, 
  pauseReason: null,
  cooldownUntil: 0, 
  lastSignal: null, 
  lastActionTime: 0,
  featureHistory: [], 
  prevRLState: null, 
  prevAction: null,
  sessionSkipLogged: false,
  logs: [],
  stats: { 
    totalTrades: 0, 
    wins: 0, 
    losses: 0, 
    winRate: 0, 
    avgPnl: 0, 
    bestTrade: 0, 
    worstTrade: 0 
  },
};

export const getBotState = () => botState;
export const getLogs = (n = 50) => botState.logs.slice(0, n);

export function startBot(cfg = {}) {
  botState.running = true;
  botState.isPaused = false;
  botState.mode = cfg.mode || 'demo';
  botState.level = cfg.level || 1;
  botState.pair = cfg.pair || 'btc_idr';
  botState.cooldownUntil = 0;
  botState.lastActionTime = 0;
  botState.sessionSkipLogged = false;
  addLog(`🚀 Bot v4 + Ultra Light Mode started — L${botState.level} ${botState.mode.toUpperCase()}`, 'system');
}

export function stopBot() {
  botState.running = false;
  addLog('🛑 Bot stopped', 'system');
}

export function resumeBot() {
  botState.isPaused = false;
  botState.pauseReason = null;
  botState.consecutiveLosses = 0;
  addLog('▶️ Bot resumed', 'system');
}

export function resetBotState() {
  const savedLogs = botState.logs.slice(0, 5);
  botState = {
    ...botState,
    running: false,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    totalPnl: 0,
    isPaused: false,
    pauseReason: null,
    cooldownUntil: 0,
    lastSignal: null,
    lastActionTime: 0,
    featureHistory: [],
    sessionSkipLogged: false,
    logs: savedLogs,
    stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, avgPnl: 0, bestTrade: 0, worstTrade: 0 }
  };
}

function addLog(msg, type = 'info') {
  const entry = { id: Date.now() + Math.random(), time: new Date().toISOString(), message: msg, type };
  botState.logs.unshift(entry);
  if (botState.logs.length > 300) botState.logs = botState.logs.slice(0, 300);
}

// ── Advanced Context ───────────────────────────────────────────────────────
function getAdvancedContext(candles) {
  const closes = candles.map(c => c.close);
  const close = closes[closes.length - 1];

  const sr = detectSupportResistance(candles, 20, 0.004);
  const fib = calculateFibonacci(candles, Math.min(50, candles.length - 1));
  const momentum = calculateMomentumScore(candles);
  const divergence = detectDivergence(candles);
  const vwap = calculateVWAP(candles);
  const trendStrength = calculateTrendStrength(candles);

  const isBuyingLow = (
    (sr.nearSupport || sr.distanceToSupport < 1.5) &&
    (!sr.nearResistance) &&
    (vwap ? vwap.belowVWAP : true) &&
    (fib ? fib.position < 0.5 : true)
  );

  const goodRiskReward = sr.srRatio >= 1.5 || sr.distanceToResistance > sr.distanceToSupport * 2;

  return {
    sr, fib, momentum, divergence, vwap, trendStrength,
    isBuyingLow, goodRiskReward, close,
  };
}

// ── Level 1: Scalper ───────────────────────────────────────────────────────
function level1Signal(candles) {
  const closes = candles.map(c => c.close);
  const close = closes[closes.length - 1];
  const rsi7 = getLatestRSI(closes, 7);
  const ema9 = getLatestEMA(closes, 9);
  const ema21 = getLatestEMA(closes, 21);
  const htf = getHigherTFBias(candles);
  const candle = detectCandlePattern(candles);
  const ctx = getAdvancedContext(candles);

  let action = 'HOLD';
  let score = 50;

  if (rsi7 < 28 && ema9 > ema21 && htf.bias !== 'bearish' && ctx.isBuyingLow) {
    action = 'BUY';
    score = 85;
  } else if (candle.pattern === 'bullish_engulfing' && ema9 > ema21) {
    action = 'BUY';
    score = 78;
  }

  return { action, score, rsi: rsi7, ema9, ema21, htf, candle, context: ctx };
}

// ── Level 2: Smart Adaptive ────────────────────────────────────────────────
function level2Signal(candles) {
  const base = level1Signal(candles);
  const trend = detectMarketTrend(candles.map(c => c.close));
  const ctx = base.context || getAdvancedContext(candles);

  if (base.action === 'BUY' && trend === 'bearish') {
    return { ...base, action: 'HOLD', reason: 'bearish_filter' };
  }
  if (base.action === 'BUY' && !ctx.isBuyingLow) {
    return { ...base, action: 'HOLD', reason: 'not_at_support' };
  }

  return { ...base, trend };
}

// ── Level 3: AI Scoring ────────────────────────────────────────────────────
function level3Signal(candles) {
  const closes = candles.map(c => c.close);
  const close = closes[closes.length - 1];
  const rsi = getLatestRSI(closes, 14);
  const ema9 = getLatestEMA(closes, 9);
  const ema21 = getLatestEMA(closes, 21);
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes);
  const trend = detectMarketTrend(closes);
  const candle = detectCandlePattern(candles);
  const htf = getHigherTFBias(candles);
  const ctx = getAdvancedContext(candles);

  let score = 50;
  if (rsi < 35) score += 20;
  if (ema9 > ema21 && close > ema9) score += 15;
  if (macd.latest && macd.latest.histogram > 0) score += 10;
  if (ctx.isBuyingLow) score += 15;
  if (candle.direction === 'bullish') score += 10;

  let action = score >= 72 ? 'BUY' : score <= 35 ? 'SELL' : 'HOLD';

  return { action, score, rsi, ema9, ema21, macd: macd.latest, trend, candle, htf, context: ctx };
}

// ── Level 4: ML Model (fallback ke L3 untuk stabilitas) ─────────────────────
async function level4Signal(candles) {
  return level3Signal(candles);
}

// ── Level 5: RL Agent (fallback ke L3 untuk stabilitas) ─────────────────────
async function level5Signal(candles, openPositions) {
  return level3Signal(candles);
}

// ── Main Cycle ─────────────────────────────────────────────────────────────
export async function runCycle(candles, currentState = {}) {
  if (!botState.running) return { action: 'HOLD', reason: 'bot_stopped' };

  const { balance = 100000, openPositions = [], startBalance, targetBalance } = currentState;
  const s = getRiskSettings();

  const session = isGoodTradingSession();
  if (!session.isGood && openPositions.length === 0) {
    if (!botState.sessionSkipLogged) {
      addLog(`🕐 Sesi sepi (${session.sessionName}) — bot standby`, 'info');
      botState.sessionSkipLogged = true;
    }
    return { action: 'HOLD', reason: 'off_session' };
  }
  botState.sessionSkipLogged = false;

  if (candles.length < 30) return { action: 'HOLD', reason: 'insufficient_data' };

  const close = candles[candles.length - 1].close;
  const equityMode = getEquityMode(balance, startBalance || 100000, targetBalance || s.targetProfitIDR || 1000000);

  let signal;
  try {
    switch (botState.level) {
      case 1: signal = level1Signal(candles); break;
      case 2: signal = level2Signal(candles); break;
      case 3: signal = level3Signal(candles); break;
      case 4: signal = await level4Signal(candles); break;
      case 5: signal = await level5Signal(candles, openPositions); break;
      default: signal = level1Signal(candles);
    }
  } catch (err) {
    addLog(`❌ Signal error: ${err.message}`, 'error');
    signal = { action: 'HOLD' };
  }

  botState.lastSignal = { ...signal, close, time: Date.now(), session, equityMode };

  const exitDecisions = [];
  for (const pos of openPositions) {
    if (pos.pair !== botState.pair) continue;
    const updated = updateTrailingStop(pos, close);
    const exitCheck = checkPositionExit(updated, close);
    if (exitCheck.shouldClose) {
      exitDecisions.push({ position: pos, reason: exitCheck.reason, pnl: exitCheck.pnl });
      addLog(`${exitCheck.pnl >= 0 ? '✅' : '❌'} EXIT ${exitCheck.reason} | ${exitCheck.pnl >= 0 ? '+' : ''}Rp ${Math.abs(exitCheck.pnl / 1000).toFixed(1)}K`, exitCheck.pnl >= 0 ? 'profit' : 'loss');
    }
  }

  // Entry Decision
  let entryDecision = null;
  const { allowed } = canOpenPosition(openPositions.length, botState.consecutiveLosses, botState.isPaused);
  const cooldown = (s.cooldownSeconds || 10) * 1000;

  if (allowed && signal.action === 'BUY' && openPositions.length === 0 && Date.now() - botState.lastActionTime >= cooldown) {
    let sizing;

    if (isUltraProfitMode()) {
      sizing = calculateUltraPositionSize(balance, openPositions.length, {
        consecutiveWins: botState.consecutiveWins,
        totalPnl: botState.totalPnl,
      }, signal.context?.momentum?.grade || 'C');
    } else if (isUltraLightMode()) {
      sizing = calculateUltraLightPositionSize(balance, openPositions.length, {
        consecutiveWins: botState.consecutiveWins,
        totalPnl: botState.totalPnl,
      }, signal.context?.momentum?.grade || 'C');
    } else if (s.maxProfitMode) {
      sizing = calculatePositionSize(balance, openPositions.length, {
        consecutiveLosses: botState.consecutiveLosses,
        totalPnl: botState.totalPnl,
        consecutiveWins: botState.consecutiveWins,
      });
    } else {
      sizing = calculatePositionSize(balance, openPositions.length, { consecutiveLosses: botState.consecutiveLosses });
    }

    if (sizing.idrAmount >= (s.minTradeIDR || 1000)) {
      const adaptive = calculateAdaptiveTPSL(candles, close, 'buy');
      const ctx = signal.context || getAdvancedContext(candles);

      let finalTP = adaptive.takeProfit;
      let finalSL = adaptive.stopLoss;

      if (ctx.sr?.closestResistance && ctx.sr.closestResistance < finalTP) finalTP = ctx.sr.closestResistance * 0.998;
      if (ctx.sr?.closestSupport && ctx.sr.closestSupport > finalSL) finalSL = ctx.sr.closestSupport * 0.998;

      const trailing = close * (1 - (s.trailingStopPercent || 0.5) / 100);
      const rr = finalTP > close && finalSL < close ? (finalTP - close) / (close - finalSL) : 0;

      if (rr >= 1.25) {
        entryDecision = {
          action: 'BUY',
          price: close,
          idrAmount: sizing.idrAmount,
          stopLoss: finalSL,
          takeProfit: finalTP,
          trailingStop: trailing,
          reason: sizing.reason,
          signal: signal.action,
          score: signal.score,
          level: botState.level,
          equityMode: equityMode.mode,
          isUltraLight: isUltraLightMode(),
          winStreak: botState.consecutiveWins,
          riskReward: parseFloat(rr.toFixed(2)),
        };

        const modeName = isUltraLightMode() ? 'ULTRA LIGHT' : isUltraProfitMode() ? 'ULTRA' : 'MAX';
        addLog(`🌟 ${modeName} BUY ${botState.pair.toUpperCase()} | Rp ${(sizing.idrAmount/1000).toFixed(0)}K | R:R ${rr.toFixed(1)}x`, 'buy');
        botState.lastActionTime = Date.now();
      }
    }
  }

  return {
    action: signal.action,
    signal,
    entry: entryDecision,
    exits: exitDecisions,
    close,
    level: botState.level,
    mode: botState.mode,
    pair: botState.pair,
    session,
    equityMode,
    timestamp: Date.now(),
  };
}

// Record trade result
export function recordTradeResult(pnl, pair = '') {
  botState.totalPnl += pnl;
  botState.stats.totalTrades++;

  if (pnl > 0) {
    botState.stats.wins++;
    botState.consecutiveLosses = 0;
    botState.consecutiveWins++;
    botState.stats.bestTrade = Math.max(botState.stats.bestTrade, pnl);
    if (pair) resetPairLoss(pair);
  } else {
    botState.stats.losses++;
    botState.consecutiveWins = 0;
    botState.consecutiveLosses++;
    botState.stats.worstTrade = Math.min(botState.stats.worstTrade, pnl);
    if (pair) reportPairLoss(pair);
  }

  botState.stats.winRate = botState.stats.totalTrades > 0 ? (botState.stats.wins / botState.stats.totalTrades) * 100 : 0;
}
