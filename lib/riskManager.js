/**
 * lib/riskManager.js — Risk Management v4 + Ultra Light Mode
 */

let runtimeSettings = {
  maxPositions:         parseInt(process.env.MAX_POSITIONS           || '1'),
  maxRiskPercent:       parseFloat(process.env.MAX_RISK_PERCENT      || '40'),
  stopLossPercent:      parseFloat(process.env.STOP_LOSS_PERCENT     || '1.0'),
  takeProfitPercent:    parseFloat(process.env.TAKE_PROFIT_PERCENT   || '2.5'),
  trailingStopPercent:  parseFloat(process.env.TRAILING_STOP_PERCENT || '0.5'),
  maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES  || '3'),
  targetProfitIDR:      1000000,
  cooldownSeconds:      15,
  reservePercent:       10,
  minTradeIDR:          1000,
  maxRiskAbsolute:      60,

  maxProfitMode:        false,
  ultraProfitMode:      false,
  ultraLightMode:       false,     // ← Mode baru: Ultra Light
};

export function getRiskSettings() {
  return { ...runtimeSettings };
}

export function updateRiskSettings(newSettings) {
  runtimeSettings = { ...runtimeSettings, ...newSettings };
  return runtimeSettings;
}

export function isUltraProfitMode() {
  return runtimeSettings.ultraProfitMode === true;
}

export function isUltraLightMode() {
  return runtimeSettings.ultraLightMode === true;
}

// Base Position Sizing
export function calculatePositionSize(totalBalance, openPositionsCount, botState = {}, signalGrade = 'C') {
  const { consecutiveLosses = 0, totalPnl = 0, consecutiveWins = 0 } = botState;
  const s = runtimeSettings;

  const reserveAmount   = Math.floor(totalBalance * s.reservePercent / 100);
  const tradableBalance = Math.max(0, totalBalance - reserveAmount);

  if (tradableBalance < s.minTradeIDR) {
    return { idrAmount: 0, riskPercent: 0, reason: 'saldo_tidak_cukup' };
  }

  let baseRisk = consecutiveLosses >= 3 ? 15 :
                 consecutiveLosses === 2 ? 22 :
                 consecutiveLosses === 1 ? 30 : s.maxRiskPercent;

  const gradeBonus = { 'A+': 1.25, 'A': 1.10, 'B': 1.00, 'C': 0.85, 'D': 0.60, 'F': 0.40 };
  const gradeMult = gradeBonus[signalGrade] || 1.0;

  let profitMult = totalPnl > 500000 ? 1.15 : totalPnl > 200000 ? 1.08 : totalPnl > 0 ? 1.03 : totalPnl < -100000 ? 0.80 : 1.0;
  let winStreakMult = consecutiveWins >= 5 ? 1.20 : consecutiveWins >= 3 ? 1.10 : consecutiveWins >= 2 ? 1.05 : 1.0;

  const effectiveRisk = Math.min(baseRisk * gradeMult * profitMult * winStreakMult, s.maxRiskAbsolute);
  const idrAmount = Math.floor(tradableBalance * effectiveRisk / 100);

  return {
    idrAmount: Math.max(0, idrAmount),
    riskPercent: parseFloat(effectiveRisk.toFixed(1)),
    reason: consecutiveLosses > 0 ? `cautious_\( {consecutiveLosses}loss` : `grade_ \){signalGrade}`,
  };
}

// Ultra Profit Position Sizing (agresif, untuk ultraProfitMode)
export function calculateUltraPositionSize(totalBalance, openPositionsCount, botState = {}, signalGrade = 'C') {
  let base = calculatePositionSize(totalBalance, openPositionsCount, botState, signalGrade);

  const { consecutiveWins = 0, totalPnl = 0 } = botState;
  let multiplier = 1.2; // Base multiplier lebih tinggi dari ultraLight

  if (consecutiveWins >= 5)      multiplier = 1.60;
  else if (consecutiveWins >= 3) multiplier = 1.45;
  else if (consecutiveWins >= 2) multiplier = 1.30;
  if (totalPnl > 800000)         multiplier = Math.max(multiplier, 1.50);
  else if (totalPnl > 400000)    multiplier = Math.max(multiplier, 1.35);

  base.idrAmount = Math.floor(base.idrAmount * multiplier);
  base.reason = `ultrapro_${consecutiveWins}win_x${multiplier.toFixed(2)}`;

  return base;
}

// Ultra Light Position Sizing (lebih longgar)
export function calculateUltraLightPositionSize(totalBalance, openPositionsCount, botState = {}, signalGrade = 'C') {
  let base = calculatePositionSize(totalBalance, openPositionsCount, botState, signalGrade);

  const { consecutiveWins = 0, totalPnl = 0 } = botState;
  let multiplier = 1.0;

  if (consecutiveWins >= 4)      multiplier = 1.32;
  else if (consecutiveWins >= 2) multiplier = 1.15;
  if (totalPnl > 400000)         multiplier = Math.max(multiplier, 1.18);

  base.idrAmount = Math.floor(base.idrAmount * multiplier);
  base.reason = `ultralight_${consecutiveWins}win_streak`;

  return base;
}

export function canOpenPosition(openPositionsCount, consecutiveLosses, isPaused) {
  const s = runtimeSettings;
  if (isPaused) return { allowed: false, reason: 'Bot is paused' };
  if (openPositionsCount >= s.maxPositions) return { allowed: false, reason: `Max ${s.maxPositions} positions` };
  if (consecutiveLosses >= s.maxConsecutiveLosses) return { allowed: false, reason: `Auto-paused: ${consecutiveLosses} losses` };
  return { allowed: true, reason: 'OK' };
}

export function getStopLossPrice(entryPrice, side, atr = null) {
  const pct = runtimeSettings.stopLossPercent / 100;
  const stopDist = atr ? Math.max(atr * 1.0, entryPrice * pct) : entryPrice * pct;
  return side === 'buy' ? entryPrice - stopDist : entryPrice + stopDist;
}

export function getTakeProfitPrice(entryPrice, side) {
  const pct = runtimeSettings.takeProfitPercent / 100;
  return side === 'buy' ? entryPrice * (1 + pct) : entryPrice * (1 - pct);
}

export function updateTrailingStop(position, currentPrice) {
  const trailPct = runtimeSettings.trailingStopPercent / 100;
  const pos = { ...position };
  if (pos.side === 'buy') {
    pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
    pos.trailingStop = pos.highestPrice * (1 - trailPct);
  } else {
    pos.lowestPrice = Math.min(pos.lowestPrice || pos.entryPrice, currentPrice);
    pos.trailingStop = pos.lowestPrice * (1 + trailPct);
  }
  return pos;
}

export function checkPositionExit(position, currentPrice) {
  const { entryPrice, side, stopLoss, takeProfit, trailingStop, idrAmount } = position;
  const priceDiff = side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnlPct = priceDiff / entryPrice;
  const pnl = idrAmount * pnlPct;

  if (stopLoss && ((side === 'buy' && currentPrice <= stopLoss) || (side === 'sell' && currentPrice >= stopLoss)))
    return { shouldClose: true, reason: 'stop_loss', pnl };
  if (takeProfit && ((side === 'buy' && currentPrice >= takeProfit) || (side === 'sell' && currentPrice <= takeProfit)))
    return { shouldClose: true, reason: 'take_profit', pnl };
  if (trailingStop && ((side === 'buy' && currentPrice <= trailingStop) || (side === 'sell' && currentPrice >= trailingStop)))
    return { shouldClose: true, reason: 'trailing_stop', pnl };

  return { shouldClose: false, reason: null, pnl };
}

export { runtimeSettings as RISK_DEFAULTS };
