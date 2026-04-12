/**
 * app/api/balance/route.js
 * GET /api/balance
 * Returns demo or live balance
 */

import { NextResponse } from 'next/server';
import { getInfo } from '../../../lib/indodax.js';
import { getDemoState, getPortfolioValue } from '../../../lib/demoStore.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'demo';

  try {
    if (mode === 'demo') {
      const state = getDemoState();
      const portfolio = getPortfolioValue({});

      return NextResponse.json({
        success: true,
        mode: 'demo',
        balance: {
          idr: state.idrBalance,
          crypto: state.cryptoBalances,
          total: portfolio.totalValue,
          openPositions: state.openPositions.length,
          totalPnl: state.totalPnl,
          totalPnlPct: state.totalPnlPct,
          consecutiveLosses: state.consecutiveLosses,
          tradeCount: state.tradeCount,
        },
      });
    }

    // Live mode
    const info = await getInfo();
    const idrBalance = parseFloat(info.balance?.idr || 0);
    const cryptoBalances = {};

    const coins = ['btc', 'eth', 'bnb', 'sol', 'doge', 'trx', 'matic'];
    for (const coin of coins) {
      const val = parseFloat(info.balance?.[coin] || 0);
      if (val > 0) cryptoBalances[coin] = val;
    }

    return NextResponse.json({
      success: true,
      mode: 'live',
      balance: {
        idr: idrBalance,
        crypto: cryptoBalances,
        freeze: info.balance_hold,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
