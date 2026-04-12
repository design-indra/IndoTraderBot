/**
 * lib/riskManager.js — Risk Management v4 (UPGRADED)
 *
 * UPGRADE v4:
 * - Risk default 40% (bukan 80%) — lebih aman, lebih konsisten
 * - Dynamic risk berdasarkan kualitas sinyal (grade A+ bisa lebih besar)
 * - Profit compounding tier: semakin banyak menang, size bisa naik bertahap
 * - Drawdown protection yang lebih ketat
 * - Maximum 60% per trade (bukan 95%) untuk survival jangka panjang
 *
 * FILOSOFI:
 * Bukan soal berapa besar per trade, tapi soal berapa banyak trade yang menang.
 * Bot yang survive lebih lama akan menghasilkan lebih banyak cuan.
 * Risk 40% dengan win rate 60% lebih menguntungkan dari risk 80% dengan win rate 40%.
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

  // ── Fitur baru ─────────────────────────────────────────────────────────
  maxProfitMode:        false, // Dynamic ATR SL/TP + Auto Compound setelah win streak
  autoScannerEnabled:   false, // Auto switch ke pair terbaik setiap scan
};

export function getRiskSettings()               { return { ...runtimeSettings }; }
export function updateRiskSettings(newSettings) {
  runtimeSettings = { ...runtimeSettings, ...newSettings };
  return runtimeSettings;
}

/**
 * Hitung position size secara dinamis berdasarkan:
 * 1. Saldo saat ini
 * 2. Streak menang/kalah
 * 3. Total PnL (profit reinforcement)
 * 4. Grade sinyal (A+ boleh lebih besar dari C)
 */
export function calculatePositionSize(totalBalance, openPositionsCount, botState = {}, signalGrade = 'C') {
  const { consecutiveLosses = 0, totalPnl = 0, consecutiveWins = 0 } = botState;
  const s = runtimeSettings;

  // Saldo yang boleh dipakai (sisakan reservePercent)
  const reserveAmount   = Math.floor(totalBalance * s.reservePercent / 100);
  const tradableBalance = Math.max(0, totalBalance - reserveAmount);

  if (tradableBalance < s.minTradeIDR) {
    return { idrAmount: 0, riskPercent: 0, reason: 'saldo_tidak_cukup', tradableBalance };
  }

  // ── Base risk berdasarkan streak kalah ────────────────────────────────────
  let baseRisk;
  if (consecutiveLosses >= 3)      baseRisk = 15;  // Sangat hati-hati: hanya 15%
  else if (consecutiveLosses === 2) baseRisk = 22;  // Hati-hati: 22%
  else if (consecutiveLosses === 1) baseRisk = 30;  // Kurangi: 30%
  else                              baseRisk = s.maxRiskPercent; // Normal: 40%

  // ── Bonus berdasarkan kualitas sinyal (grade) ─────────────────────────────
  // Sinyal A+ = bot sangat yakin → boleh sedikit lebih besar
  const gradeBonus = {
    'A+': 1.25, // 25% lebih besar untuk sinyal A+
    'A':  1.10, // 10% lebih besar untuk sinyal A
    'B':  1.00, // Standard
    'C':  0.85, // 15% lebih kecil untuk sinyal C (kurang yakin)
    'D':  0.60, // 40% lebih kecil untuk sinyal lemah
    'F':  0.40, // Tidak seharusnya entry, tapi kalau terpaksa: 40%
  };
  const gradeMult = gradeBonus[signalGrade] || 1.0;

  // ── Profit compounding bertahap ──────────────────────────────────────────
  // Semakin banyak total profit, boleh sedikit lebih agresif
  let profitMult = 1.0;
  if (totalPnl > 500000)       profitMult = 1.15; // Profit > 500rb: +15%
  else if (totalPnl > 200000)  profitMult = 1.08; // Profit > 200rb: +8%
  else if (totalPnl > 0)       profitMult = 1.03; // Profit > 0: +3%
  else if (totalPnl < -100000) profitMult = 0.80; // Loss > 100rb: -20% (proteksi)

  // ── Streak win bonus ─────────────────────────────────────────────────────
  let winStreakMult = 1.0;
  if (consecutiveWins >= 5)      winStreakMult = 1.20;
  else if (consecutiveWins >= 3) winStreakMult = 1.10;
  else if (consecutiveWins >= 2) winStreakMult = 1.05;

  // ── Final calculation ────────────────────────────────────────────────────
  const effectiveRisk = Math.min(
    baseRisk * gradeMult * profitMult * winStreakMult,
    s.maxRiskAbsolute  // HARD CAP: tidak pernah lebih dari 60%
  );
  const idrAmount = Math.floor(tradableBalance * effectiveRisk / 100);

  return {
    idrAmount:      Math.max(0, idrAmount),
    riskPercent:    parseFloat(effectiveRisk.toFixed(1)),
    tradableBalance,
    baseRisk,
    gradeMult, profitMult, winStreakMult,
    reason: consecutiveLosses > 0 ? `cautious_${consecutiveLosses}loss` : `grade_${signalGrade}`,
  };
}

export function canOpenPosition(openPositionsCount, consecutiveLosses, isPaused) {
  const s = runtimeSettings;
  if (isPaused)                                    return { allowed: false, reason: 'Bot is paused' };
  if (openPositionsCount >= s.maxPositions)        return { allowed: false, reason: `Max ${s.maxPositions} positions` };
  if (consecutiveLosses >= s.maxConsecutiveLosses) return { allowed: false, reason: `Auto-paused: ${consecutiveLosses} losses` };
  return { allowed: true, reason: 'OK' };
}

export function getStopLossPrice(entryPrice, side, atr = null) {
  const pct      = runtimeSettings.stopLossPercent / 100;
  const stopDist = atr ? Math.max(atr * 1.0, entryPrice * pct) : entryPrice * pct;
  return side === 'buy' ? entryPrice - stopDist : entryPrice + stopDist;
}

export function getTakeProfitPrice(entryPrice, side) {
  const pct = runtimeSettings.takeProfitPercent / 100;
  return side === 'buy' ? entryPrice * (1 + pct) : entryPrice * (1 - pct);
}

export function updateTrailingStop(position, currentPrice) {
  const trailPct = runtimeSettings.trailingStopPercent / 100;
  const pos      = { ...position };
  if (pos.side === 'buy') {
    pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
    pos.trailingStop = pos.highestPrice * (1 - trailPct);
  } else {
    pos.lowestPrice  = Math.min(pos.lowestPrice || pos.entryPrice, currentPrice);
    pos.trailingStop = pos.lowestPrice * (1 + trailPct);
  }
  return pos;
}

export function checkPositionExit(position, currentPrice) {
  const { entryPrice, side, stopLoss, takeProfit, trailingStop, idrAmount } = position;
  const priceDiff = side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnlPct    = priceDiff / entryPrice;
  const pnl       = idrAmount * pnlPct;

  if (stopLoss)     { const hit = side==='buy'?currentPrice<=stopLoss    :currentPrice>=stopLoss;    if(hit) return {shouldClose:true,reason:'stop_loss',    pnl}; }
  if (takeProfit)   { const hit = side==='buy'?currentPrice>=takeProfit  :currentPrice<=takeProfit;  if(hit) return {shouldClose:true,reason:'take_profit',  pnl}; }
  if (trailingStop) { const hit = side==='buy'?currentPrice<=trailingStop:currentPrice>=trailingStop;if(hit) return {shouldClose:true,reason:'trailing_stop',pnl}; }

  return { shouldClose: false, reason: null, pnl };
}

export function calcPnL(position, currentPrice) {
  const { entryPrice, side, idrAmount } = position;
  const diff   = side === 'buy' ? currentPrice-entryPrice : entryPrice-currentPrice;
  const pnlPct = diff / entryPrice;
  return { pnl: idrAmount * pnlPct, pnlPct: pnlPct * 100 };
}

export { runtimeSettings as RISK_DEFAULTS };
