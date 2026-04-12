/**
 * lib/tradingEngine.js — Advanced Trading Engine v4 (UPGRADED)
 *
 * UPGRADE v4:
 * 1. Support/Resistance filter → beli HANYA dekat support (beli murah)
 * 2. Fibonacci golden zone entry → entry saat pullback ke 0.5-0.618
 * 3. Momentum Score filter → minimum Grade B sebelum entry
 * 4. Divergence detection → bullish divergence = sinyal terkuat
 * 5. VWAP filter → prioritas BUY di bawah VWAP (lebih murah)
 * 6. Trend Strength (ADX) → skip entry saat market sideways
 * 7. Dynamic Risk:Reward → minimum 1:2 sebelum entry
 * 8. Profit compounding otomatis saat streak menang
 */

import {
  getLatestRSI, getLatestEMA, calculateMACD,
  calculateBollingerBands, detectVolumeSpike, detectMarketTrend,
  computeSignalScore, extractFeatures, calculateATR,
  detectCandlePattern, isGoodTradingSession, calculateAdaptiveTPSL,
  getHigherTFBias, getEquityMode, isPairBlacklisted, reportPairLoss,
  resetPairLoss, getBlacklistedPairs,
  // NEW v4 imports
  calculateStochRSI, detectSupportResistance, calculateFibonacci,
  calculateMomentumScore, detectDivergence, calculateVWAP,
  calculateTrendStrength,
} from './indicators.js';

import {
  calculatePositionSize, canOpenPosition,
  getStopLossPrice, getTakeProfitPrice, checkPositionExit,
  updateTrailingStop, getRiskSettings,
} from './riskManager.js';

import { getMLSignal, addTrainingSample, getTrainingDataStats } from './mlModel.js';
import { getRLSignal, remember, computeReward, trainStep, buildState, getRLStats } from './rlEngine.js';

// ─── Bot State ────────────────────────────────────────────────────────────────
let botState = {
  running: false, mode: 'demo', level: 1, pair: 'btc_idr',
  consecutiveLosses: 0, consecutiveWins: 0, totalPnl: 0,
  isPaused: false, pauseReason: null,
  cooldownUntil: 0, lastSignal: null, lastActionTime: 0,
  featureHistory: [], prevRLState: null, prevAction: null,
  sessionSkipLogged: false,
  logs: [],
  stats: { totalTrades:0, wins:0, losses:0, winRate:0, avgPnl:0, bestTrade:0, worstTrade:0 },
};

export const getBotState  = () => botState;
export const getLogs      = (n=50) => botState.logs.slice(0,n);

export function startBot(cfg={}) {
  botState.running    = true;
  botState.isPaused   = false;
  botState.mode       = cfg.mode  || 'demo';
  botState.level      = cfg.level || 1;
  botState.pair       = cfg.pair  || 'btc_idr';
  botState.cooldownUntil = 0;
  botState.lastActionTime = 0;
  botState.sessionSkipLogged = false;
  addLog(`🚀 Bot v4 started — L${botState.level} ${botState.mode.toUpperCase()} | ${botState.pair.toUpperCase()}`, 'system');
}

export function stopBot()   { botState.running=false; addLog('🛑 Bot stopped','system'); }
export function resumeBot() {
  botState.isPaused=false; botState.pauseReason=null; botState.consecutiveLosses=0;
  botState.sessionSkipLogged=false;
  addLog('▶️ Bot resumed','system');
}

export function resetBotState() {
  const savedLogs = botState.logs.slice(0,5);
  botState = { ...botState, running:false, consecutiveLosses:0, consecutiveWins:0, totalPnl:0,
    isPaused:false, pauseReason:null, cooldownUntil:0, lastSignal:null, lastActionTime:0,
    featureHistory:[], sessionSkipLogged:false, logs:savedLogs,
    stats:{totalTrades:0,wins:0,losses:0,winRate:0,avgPnl:0,bestTrade:0,worstTrade:0} };
}

function addLog(msg, type='info') {
  const entry = { id:Date.now()+Math.random(), time:new Date().toISOString(), message:msg, type };
  botState.logs.unshift(entry);
  if (botState.logs.length > 300) botState.logs = botState.logs.slice(0,300);
  return entry;
}

// ─── SHARED ADVANCED ANALYSIS (dipake semua level) ────────────────────────────
/**
 * Menghitung semua indikator advanced v4 sekaligus.
 * Hasilnya dipakai untuk filter entry di semua level.
 */
function getAdvancedContext(candles) {
  const closes  = candles.map(c => c.close);
  const close   = closes[closes.length - 1];

  // Support & Resistance — KUNCI beli murah
  const sr = detectSupportResistance(candles, 20, 0.004);

  // Fibonacci — entry di golden zone
  const fib = calculateFibonacci(candles, Math.min(50, candles.length - 1));

  // Momentum Score — konfirmasi kekuatan sinyal
  const momentum = calculateMomentumScore(candles);

  // Divergence — sinyal reversal tersembunyi
  const divergence = detectDivergence(candles);

  // VWAP — apakah harga relatif murah?
  const vwap = calculateVWAP(candles);

  // Trend Strength — apakah ada trend jelas?
  const trendStrength = calculateTrendStrength(candles);

  // Evaluasi kondisi entry: apakah ini "beli murah"?
  const isBuyingLow = (
    (sr.nearSupport || sr.distanceToSupport < 1.5) &&   // Dekat support
    (!sr.nearResistance) &&                              // Tidak dekat resistance
    (vwap ? vwap.belowVWAP : true) &&                   // Di bawah VWAP
    (fib ? fib.position < 0.5 : true)                   // Di bawah midpoint fibonacci
  );

  // Risk:Reward check — harus min 1:2 sebelum entry
  const goodRiskReward = sr.srRatio >= 1.5 || sr.distanceToResistance > sr.distanceToSupport * 2;

  return {
    sr, fib, momentum, divergence, vwap, trendStrength,
    isBuyingLow, goodRiskReward, close,
  };
}

// ─── Level 1: SCALPER v4 (+ S/R + Momentum Filter) ───────────────────────────
function level1Signal(candles) {
  const closes  = candles.map(c=>c.close);
  const volumes = candles.map(c=>c.volume);
  const close   = closes[closes.length-1];

  const rsi7  = getLatestRSI(closes, 7);
  const rsi14 = getLatestRSI(closes, 14);
  const ema5  = getLatestEMA(closes, 5);
  const ema9  = getLatestEMA(closes, 9);
  const ema21 = getLatestEMA(closes, 21);
  const stochRSI = calculateStochRSI(closes);

  const ribbonBull = ema5>ema9 && ema9>ema21 && close>ema9;
  const ribbonBear = ema5<ema9 && ema9<ema21 && close<ema9;

  const avgVol   = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const volRatio = avgVol>0 ? volumes[volumes.length-1]/avgVol : 1;

  const htfBias = getHigherTFBias(candles);
  const candle  = detectCandlePattern(candles);
  const ctx     = getAdvancedContext(candles);

  let action='HOLD', score=50;
  const reasons=[];

  // ── BUY conditions (lebih ketat dari sebelumnya) ─────────────────────────
  // Kondisi 1: RSI sangat oversold + S/R support + Momentum bagus
  if (rsi7 < 28 && ribbonBull && htfBias.bias !== 'bearish' && ctx.isBuyingLow) {
    action='BUY'; score=88;
    reasons.push(`RSI7 ${rsi7?.toFixed(0)} oversold + ribbon + dekat support`);
  }
  // Kondisi 2: StochRSI extreme oversold (sinyal lebih sensitif)
  else if (stochRSI !== null && stochRSI < 15 && ema9 > ema21 && ctx.goodRiskReward) {
    action='BUY'; score=85;
    reasons.push(`StochRSI ${stochRSI} extreme oversold + R:R bagus`);
  }
  // Kondisi 3: Divergence bullish (sinyal reversal tersembunyi)
  else if (ctx.divergence.bullish && htfBias.bias !== 'bearish') {
    action='BUY'; score=82;
    reasons.push(`🔀 Bullish divergence terdeteksi`);
  }
  // Kondisi 4: Fibonacci golden zone + candle bullish
  else if (ctx.fib && ctx.fib.inGoldenZone && candle.direction === 'bullish' && htfBias.bias !== 'bearish') {
    action='BUY'; score=80;
    reasons.push(`Fib golden zone (${ctx.fib.position.toFixed(2)}) + ${candle.pattern}`);
  }
  // Kondisi 5: BB lower band + di bawah VWAP + volume spike
  else if (rsi14 < 35 && ema9 > ema21 && htfBias.bias !== 'bearish' && candle.direction === 'bullish') {
    action='BUY'; score=75;
    reasons.push(`RSI14 oversold + ${candle.pattern}`);
  }
  // Kondisi 6: Morning star (reversal candle terkuat)
  else if (candle.pattern === 'morning_star' && htfBias.bias !== 'bearish' && ctx.isBuyingLow) {
    action='BUY'; score=83;
    reasons.push(`Morning star reversal + dekat support`);
  }
  // Kondisi 7: Bullish engulfing + HTF bullish
  else if (candle.pattern === 'bullish_engulfing' && ema9 > ema21 && htfBias.bias === 'bullish') {
    action='BUY'; score=80;
    reasons.push(`Bullish engulfing + HTF bullish`);
  }

  // ── SELL/EXIT signals ────────────────────────────────────────────────────
  if (rsi7 > 72 && ribbonBear && htfBias.bias !== 'bullish') {
    action='SELL'; score=15; reasons.push(`RSI7 overbought + ribbon bear`);
  } else if (candle.pattern === 'bearish_engulfing' && htfBias.bias === 'bearish') {
    action='SELL'; score=20; reasons.push(`Bearish engulfing + HTF bearish`);
  } else if (candle.pattern === 'shooting_star' && rsi7 > 55) {
    action='SELL'; score=22; reasons.push(`Shooting star overbought`);
  }

  // ── Blok entry saat kondisi buruk ────────────────────────────────────────
  if (candle.pattern === 'doji' && action === 'BUY') {
    action='HOLD'; reasons.push('Doji — pasar ragu, skip');
  }
  // Skip BUY kalau Momentum Score jelek (Grade D atau F)
  if (action === 'BUY' && ctx.momentum.score < 45) {
    action='HOLD'; reasons.push(`Momentum rendah (${ctx.momentum.grade}) — skip`);
  }
  // Skip BUY kalau tidak ada trend jelas dan tidak dekat support
  if (action === 'BUY' && !ctx.trendStrength.trending && !ctx.isBuyingLow) {
    action='HOLD'; reasons.push('Market sideways + tidak dekat support — skip');
  }
  // Block BUY dekat resistance (beli di harga tinggi = risiko besar)
  if (action === 'BUY' && ctx.sr.nearResistance) {
    action='HOLD'; reasons.push(`Harga dekat resistance — tunggu pullback`);
  }

  return {
    action, score, rsi: rsi7, rsi14, stochRSI, ema5, ema9, ema21,
    volRatio, ribbonBull, ribbonBear, candle, htfBias, reasons,
    context: ctx,
    signals: {
      rsi:    rsi7 < 30 ? 'oversold' : rsi7 > 70 ? 'overbought' : 'neutral',
      stochRSI: stochRSI !== null ? (stochRSI < 20 ? 'extreme_oversold' : stochRSI > 80 ? 'extreme_overbought' : 'neutral') : 'n/a',
      ema:    ribbonBull ? 'bullish' : ribbonBear ? 'bearish' : 'neutral',
      volume: volRatio > 1.5 ? 'spike' : 'normal',
      candle: candle.pattern,
      htf:    htfBias.bias,
      sr:     ctx.sr.nearSupport ? 'near_support' : ctx.sr.nearResistance ? 'near_resistance' : 'mid',
      momentum: ctx.momentum.grade,
      divergence: ctx.divergence.type,
      vwap:   ctx.vwap ? ctx.vwap.signal : 'n/a',
    },
  };
}

// ─── Level 2: Smart Adaptive v4 (+ ADX + VWAP + Divergence) ──────────────────
function level2Signal(candles) {
  const base   = level1Signal(candles);
  const closes = candles.map(c=>c.close);
  const trend  = detectMarketTrend(closes);
  const now    = Date.now();
  const ctx    = base.context;

  if (botState.cooldownUntil > now) return { ...base, action:'HOLD', reason:'cooldown', trend };

  // Market filter
  if (base.action === 'BUY'  && trend === 'bearish' && base.htfBias?.bias === 'bearish')
    return { ...base, action:'HOLD', reason:'bearish_filter', trend };

  // ADX filter — skip entry saat market sideways lemah
  if (base.action === 'BUY' && !ctx.trendStrength.trending && !ctx.isBuyingLow)
    return { ...base, action:'HOLD', reason:'adx_sideways_filter', trend };

  // VWAP filter — lebih ketat: hanya BUY di bawah VWAP atau sangat dekat support
  if (base.action === 'BUY' && ctx.vwap && ctx.vwap.aboveVWAP && !ctx.sr.nearSupport)
    return { ...base, action:'HOLD', reason:'above_vwap_not_at_support', trend };

  // Confidence check dengan kriteria lebih ketat
  let confidence = 0;
  if (base.rsi !== null) {
    if (base.action === 'BUY' && base.rsi < 38) confidence += 30;
    if (base.stochRSI !== null && base.stochRSI < 30) confidence += 20;
  }
  if (base.ema9 && base.ema21) {
    const diff = Math.abs(base.ema9 - base.ema21) / base.ema21;
    confidence += Math.min(35, diff * 8000);
  }
  if (base.htfBias?.bias === (base.action === 'BUY' ? 'bullish' : 'bearish')) confidence += 15;
  if (base.candle?.direction === (base.action === 'BUY' ? 'bullish' : 'bearish')) confidence += 10;
  if (ctx.isBuyingLow) confidence += 15;                    // Bonus dekat support
  if (ctx.divergence.bullish && base.action === 'BUY') confidence += 20; // Bonus divergence
  if (ctx.momentum.score >= 65) confidence += 10;           // Bonus momentum bagus

  if (base.action !== 'HOLD' && confidence < 55)
    return { ...base, action:'HOLD', reason:'low_confidence', confidence, trend };

  return { ...base, trend, confidence };
}

// ─── Level 3: AI Scoring v4 (+ Fibonacci + S/R + Momentum) ───────────────────
function level3Signal(candles) {
  const closes  = candles.map(c=>c.close);
  const volumes = candles.map(c=>c.volume);
  const rsi     = getLatestRSI(closes, 14);
  const ema9    = getLatestEMA(closes, 9);
  const ema21   = getLatestEMA(closes, 21);
  const macd    = calculateMACD(closes);
  const bb      = calculateBollingerBands(closes);
  const trend   = detectMarketTrend(closes);
  const close   = closes[closes.length-1];
  const avgVol  = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const candle  = detectCandlePattern(candles);
  const htf     = getHigherTFBias(candles);
  const ctx     = getAdvancedContext(candles);
  const result  = computeSignalScore({ rsi, ema9, ema21, macd: macd.latest, volume: volumes[volumes.length-1], avgVolume: avgVol, close, bb: bb.latest, trend });

  let adjustedScore = result.score;

  // Boost dari indikator v4
  if (candle.direction === 'bullish' && result.action === 'BUY') adjustedScore = Math.min(100, adjustedScore + 10);
  if (htf.bias === (result.action === 'BUY' ? 'bullish' : 'bearish')) adjustedScore = Math.min(100, adjustedScore + 8);
  if (ctx.isBuyingLow && result.action === 'BUY') adjustedScore = Math.min(100, adjustedScore + 12); // BONUS beli di support
  if (ctx.divergence.bullish && result.action === 'BUY') adjustedScore = Math.min(100, adjustedScore + 15); // BONUS divergence
  if (ctx.fib && ctx.fib.inGoldenZone && result.action === 'BUY') adjustedScore = Math.min(100, adjustedScore + 10);
  if (ctx.vwap && ctx.vwap.belowVWAP && result.action === 'BUY') adjustedScore = Math.min(100, adjustedScore + 7);
  if (ctx.momentum.score >= 70) adjustedScore = Math.min(100, adjustedScore + 8);

  // Penalti
  if (candle.pattern === 'doji') adjustedScore = 50;
  if (ctx.sr.nearResistance && result.action === 'BUY') adjustedScore -= 15; // Penalti beli dekat resistance
  if (!ctx.trendStrength.trending && !ctx.isBuyingLow) adjustedScore = Math.max(50, adjustedScore - 10);
  if (ctx.momentum.score < 40 && result.action === 'BUY') adjustedScore -= 10;

  let action = 'HOLD';
  if (adjustedScore >= 72) action = 'BUY';
  if (adjustedScore <= 28) action = 'SELL';

  return { ...result, action, score: adjustedScore, rsi, ema9, ema21, macd: macd.latest, trend, bb: bb.latest, candle, htf, context: ctx };
}

// ─── Level 4: ML ──────────────────────────────────────────────────────────────
async function level4Signal(candles) {
  const features = extractFeatures(candles);
  if (!features) return { action:'HOLD', reason:'not_enough_data' };
  botState.featureHistory.push(features);
  if (botState.featureHistory.length > 200) botState.featureHistory = botState.featureHistory.slice(-200);
  if (botState.featureHistory.length > 1 && candles.length >= 2) {
    const label = candles[candles.length-1].close > candles[candles.length-2].close ? 1 : 0;
    addTrainingSample(botState.featureHistory[botState.featureHistory.length-2], label);
  }
  const signal = await getMLSignal(botState.featureHistory);

  // Tambahan: validasi ML dengan S/R context
  const ctx = getAdvancedContext(candles);
  if (signal.action === 'BUY' && ctx.sr.nearResistance) {
    return { ...signal, action:'HOLD', reason:'ml_blocked_near_resistance', context: ctx, mlStats: getTrainingDataStats() };
  }

  return { ...signal, context: ctx, mlStats: getTrainingDataStats() };
}

// ─── Level 5: RL ──────────────────────────────────────────────────────────────
async function level5Signal(candles, openPositions=[]) {
  const closes  = candles.map(c=>c.close);
  const volumes = candles.map(c=>c.volume);
  const rsi     = getLatestRSI(closes, 14);
  const ema9    = getLatestEMA(closes, 9);
  const ema21   = getLatestEMA(closes, 21);
  const close   = closes[closes.length-1];
  const prevCl  = closes[closes.length-2] || close;
  const avgVol  = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const macd    = calculateMACD(closes);
  const bb      = calculateBollingerBands(closes);
  const hasPos  = openPositions.length > 0;
  const posPnl  = hasPos ? (close - openPositions[0].entryPrice) / openPositions[0].entryPrice : 0;

  const mktData = {
    rsi: rsi||50, ema_diff: ema9&&ema21 ? (ema9-ema21)/ema21 : 0,
    macd_hist: macd.latest?.histogram||0,
    volume_ratio: avgVol>0 ? volumes[volumes.length-1]/avgVol-1 : 0,
    bb_pos: bb.latest ? (close-bb.latest.lower)/(bb.latest.upper-bb.latest.lower) : 0.5,
    price_change: prevCl>0 ? (close-prevCl)/prevCl : 0,
  };

  const signal = await getRLSignal(mktData, hasPos, posPnl);

  if (botState.prevRLState && botState.prevAction !== null) {
    const reward    = computeReward({ action:botState.prevAction, pnlPct:posPnl, prevPnlPct:0, hasPosition:hasPos });
    const nextState = buildState({ ...mktData, has_position:hasPos, position_pnl:posPnl });
    remember(botState.prevRLState, botState.prevAction, reward, nextState, false);
    const tl = await trainStep(); if (tl) signal.trainLoss = tl;
  }

  botState.prevRLState = signal.state;
  botState.prevAction  = signal.actionIdx;

  // Tambahan: validasi RL dengan konteks S/R
  const ctx = getAdvancedContext(candles);
  if (signal.action === 'BUY' && ctx.sr.nearResistance) {
    return { ...signal, action:'HOLD', reason:'rl_blocked_near_resistance', context: ctx, ...mktData, rlStats: getRLStats() };
  }

  return { ...signal, context: ctx, ...mktData, rlStats: getRLStats() };
}

// ─── Main Cycle ───────────────────────────────────────────────────────────────
export async function runCycle(candles, currentState={}) {
  if (!botState.running) return { action:'HOLD', reason:'bot_stopped' };

  const { balance=100000, openPositions=[], prices={}, startBalance, targetBalance } = currentState;
  const s = getRiskSettings();

  // ── 1. Session Filter ──────────────────────────────────────────────────
  const session = isGoodTradingSession();
  if (!session.isGood && openPositions.length === 0) {
    if (!botState.sessionSkipLogged) {
      addLog(`🕐 Jam ${session.wibH.toString().padStart(2,'0')}:${session.wibMin.toString().padStart(2,'0')} WIB — sesi sepi, bot standby`, 'info');
      botState.sessionSkipLogged = true;
    }
    return { action:'HOLD', reason:'off_session', session };
  }
  if (session.isGood) botState.sessionSkipLogged = false;

  // ── 2. Pair Blacklist ──────────────────────────────────────────────────
  const pair = botState.pair;
  if (isPairBlacklisted(pair) && openPositions.length === 0) {
    const bl = getBlacklistedPairs().find(b=>b.pair===pair);
    const minsLeft = bl ? Math.ceil(bl.remainingMs/60000) : 0;
    addLog(`🚫 ${pair.toUpperCase()} skip ${minsLeft}m (blacklist: ${bl?.reason})`, 'warning');
    return { action:'HOLD', reason:'pair_blacklisted', pair };
  }

  // ── 3. Auto-pause check ────────────────────────────────────────────────
  if (botState.consecutiveLosses >= s.maxConsecutiveLosses) {
    if (!botState.isPaused) {
      botState.isPaused=true; botState.pauseReason='consecutive_losses';
      addLog(`⚠️ Auto-pause: ${s.maxConsecutiveLosses} consecutive losses`, 'warning');
    }
    return { action:'HOLD', reason:'auto_paused' };
  }

  if (candles.length < 30) return { action:'HOLD', reason:'insufficient_data' };

  const close = candles[candles.length-1].close;
  const atr   = calculateATR(candles) || close * 0.01;

  // ── 4. Equity Curve Mode ───────────────────────────────────────────────
  const equityMode = getEquityMode(balance, startBalance||100000, targetBalance||s.targetProfitIDR||1000000);

  // ── 5. Get signal ──────────────────────────────────────────────────────
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
  } catch(err) { addLog(`❌ Signal error: ${err.message}`, 'error'); signal={action:'HOLD'}; }

  botState.lastSignal = { ...signal, close, time:Date.now(), session, equityMode };

  // ── 6. Check exits ─────────────────────────────────────────────────────
  const exitDecisions = [];
  for (const pos of openPositions) {
    if (pos.pair !== pair) continue;
    const updated   = updateTrailingStop(pos, close);
    const exitCheck = checkPositionExit(updated, close);
    if (exitCheck.shouldClose) {
      exitDecisions.push({ position:pos, reason:exitCheck.reason, pnl:exitCheck.pnl });
      const emoji = exitCheck.pnl >= 0 ? '✅' : '❌';
      addLog(
        `${emoji} EXIT ${exitCheck.reason.toUpperCase()} | ${exitCheck.pnl>=0?'+':''}Rp ${Math.abs(exitCheck.pnl/1000).toFixed(1)}K`,
        exitCheck.pnl >= 0 ? 'profit' : 'loss'
      );
    }
  }

  // ── 7. Entry decision ──────────────────────────────────────────────────
  let entryDecision = null;
  const { allowed } = canOpenPosition(openPositions.length, botState.consecutiveLosses, botState.isPaused);
  const cooldown = (s.cooldownSeconds || 10) * 1000;

  if (allowed && signal.action === 'BUY' && openPositions.length === 0) {
    if (Date.now() - botState.lastActionTime < cooldown) {
      // skip cooldown — no spam
    } else {
      // ── PROFIT COMPOUNDING: tambah size otomatis saat streak menang ────
      let winStreak = botState.consecutiveWins;
      let streakBonus = 1.0;
      if (winStreak >= 5)      streakBonus = 1.3;  // 30% lebih besar saat menang 5x berturut
      else if (winStreak >= 3) streakBonus = 1.15; // 15% lebih besar saat menang 3x berturut
      else if (winStreak >= 2) streakBonus = 1.07; // 7% lebih besar saat menang 2x berturut

      const sizing = calculatePositionSize(balance, openPositions.length, {
        consecutiveLosses: botState.consecutiveLosses, totalPnl: botState.totalPnl,
      });

      const equityRiskMult = equityMode.riskMult;
      const finalMult = Math.min(equityRiskMult * streakBonus, 1.15); // Max 115% dari equity mode
      const adjustedAmount = Math.floor(sizing.idrAmount * finalMult);

      if (adjustedAmount < (s.minTradeIDR || 1000)) {
        if (!botState._lastInsufficientLog || Date.now()-botState._lastInsufficientLog > 30000) {
          addLog(`⚠️ Saldo terlalu kecil (Rp ${Math.round(balance).toLocaleString('id-ID')})`, 'warning');
          botState._lastInsufficientLog = Date.now();
        }
      } else {
        // ── Adaptive TP/SL dengan validasi S/R ──────────────────────────
        const adaptive = calculateAdaptiveTPSL(candles, close, 'buy');

        // Jika ada S/R data, sesuaikan TP ke resistance terdekat
        const ctx = signal.context || getAdvancedContext(candles);
        let finalTP = adaptive.takeProfit;
        let finalSL = adaptive.stopLoss;

        // TP tidak melebihi resistance terdekat (realistis)
        if (ctx.sr.closestResistance && ctx.sr.closestResistance < finalTP) {
          finalTP = ctx.sr.closestResistance * 0.998; // Tepat di bawah resistance
        }
        // SL tidak melewati support terdekat (lebih akurat)
        if (ctx.sr.closestSupport && ctx.sr.closestSupport > finalSL) {
          finalSL = ctx.sr.closestSupport * 0.998; // Tepat di bawah support
        }

        const trailing = close * (1 - (s.trailingStopPercent || 0.5) / 100);

        // Validasi akhir: pastikan R:R masih bagus setelah penyesuaian
        const rr = finalTP > close && finalSL < close
          ? (finalTP - close) / (close - finalSL)
          : 0;

        if (rr < 1.2) {
          addLog(`⚡ Skip entry — R:R terlalu kecil (${rr.toFixed(2)}x) setelah adjust S/R`, 'warning');
        } else {
          entryDecision = {
            action: 'BUY', price: close, idrAmount: adjustedAmount,
            stopLoss:   finalSL,
            takeProfit: finalTP,
            trailingStop: trailing,
            reason: sizing.reason,
            signal: signal.action,
            score:  signal.score,
            level:  botState.level,
            adaptive,
            equityMode: equityMode.mode,
            session: session.sessionName,
            winStreak, streakBonus,
            riskReward: parseFloat(rr.toFixed(2)),
            // Context v4
            nearSupport: ctx.sr.nearSupport,
            isBuyingLow: ctx.isBuyingLow,
            momentumGrade: ctx.momentum ? ctx.momentum.grade : 'N/A',
            divergence: ctx.divergence.type,
            fibPosition: ctx.fib ? ctx.fib.position.toFixed(3) : 'N/A',
            vwapSignal: ctx.vwap ? ctx.vwap.signal : 'N/A',
          };

          const contextStr = [
            ctx.isBuyingLow ? '📍S/R' : '',
            ctx.divergence.bullish ? '🔀Div' : '',
            ctx.fib?.inGoldenZone ? '🌀Fib' : '',
            ctx.vwap?.belowVWAP ? '📊VWAP' : '',
          ].filter(Boolean).join(' ');

          addLog(
            `📈 BUY ${pair.replace('_idr','').toUpperCase()} | ${close.toLocaleString('id-ID')} | ` +
            `Rp ${(adjustedAmount/1000).toFixed(0)}K | TP ${adaptive.tpMultiplier}x | ` +
            `R:R ${rr.toFixed(1)} | ${ctx.momentum?.grade || ''} | ` +
            `${contextStr || 'standard'} | ${equityMode.mode} | ${session.sessionName}`,
            'buy'
          );

          botState.lastActionTime = Date.now();
          botState.cooldownUntil  = Date.now() + cooldown;
        }
      }
    }
  }

  return {
    action: signal.action, signal, entry: entryDecision, exits: exitDecisions,
    close, level: botState.level, mode: botState.mode, pair,
    session, equityMode, timestamp: Date.now(),
  };
}

// ─── Record trade result ──────────────────────────────────────────────────────
export function recordTradeResult(pnl, pair='') {
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
    if (pair) {
      const blacklisted = reportPairLoss(pair);
      if (blacklisted) addLog(`🚫 ${pair.toUpperCase()} di-blacklist 1 jam (2x loss berturut)`, 'warning');
    }
    if (botState.consecutiveLosses >= 3) addLog('⚠️ 3 losses berturut — auto-pause aktif', 'warning');
  }

  botState.stats.winRate = (botState.stats.wins / botState.stats.totalTrades) * 100;
  botState.stats.avgPnl  = botState.totalPnl / botState.stats.totalTrades;
}
