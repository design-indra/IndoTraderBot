/**
 * app/api/settings/route.js
 * GET  /api/settings
 * POST /api/settings
 */
import { NextResponse } from 'next/server';
import { getRiskSettings, updateRiskSettings } from '../../../lib/riskManager.js';
import { resetDemo, setStartBalance }           from '../../../lib/demoStore.js';

export async function GET() {
  const risk = getRiskSettings();
  const hasApiKey = !!(process.env.INDODAX_API_KEY && process.env.INDODAX_SECRET_KEY);
  return NextResponse.json({
    success: true,
    risk,
    api: {
      configured: hasApiKey,
      keyPreview: hasApiKey ? `${process.env.INDODAX_API_KEY?.slice(0,6)}...` : null,
    },
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { action, settings } = body;

  if (action === 'updateRisk') {
    const updated = updateRiskSettings(settings);
    return NextResponse.json({ success: true, risk: updated });
  }

  if (action === 'toggleMaxProfitMode') {
    const current = getRiskSettings();
    const updated  = updateRiskSettings({ maxProfitMode: !current.maxProfitMode });
    return NextResponse.json({ success: true, maxProfitMode: updated.maxProfitMode, risk: updated });
  }

  if (action === 'toggleScanner') {
    const current = getRiskSettings();
    const updated  = updateRiskSettings({ autoScannerEnabled: !current.autoScannerEnabled });
    return NextResponse.json({ success: true, autoScannerEnabled: updated.autoScannerEnabled, risk: updated });
  }

  if (action === 'resetDemoBalance') {
    const amount = parseInt(settings?.balance || '100000');
    setStartBalance(amount);
    resetDemo(amount);
    return NextResponse.json({
      success: true,
      message: `Demo balance reset ke Rp ${amount.toLocaleString('id-ID')}`,
    });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}
