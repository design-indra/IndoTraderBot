/**
 * app/api/auth/route.js
 * Simple auth — email + password, stored in env or in-memory
 * Token disimpan di httpOnly cookie
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Token store (in-memory — reset saat server restart, cukup untuk Vercel)
const sessions = new Map();

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'indotrader-salt-2024').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Default credentials dari env vars
function getCredentials() {
  return {
    email:    process.env.AUTH_EMAIL    || 'admin@indotrader.app',
    passHash: process.env.AUTH_PASS_HASH || hashPassword(process.env.AUTH_PASSWORD || 'indotrader123'),
  };
}

export async function POST(req) {
  const { action, email, password, token } = await req.json().catch(() => ({}));

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (action === 'login') {
    const creds = getCredentials();
    const inputHash = hashPassword(password || '');

    if (email !== creds.email || inputHash !== creds.passHash) {
      return NextResponse.json({ success: false, error: 'Email atau password salah' }, { status: 401 });
    }

    const newToken = generateToken();
    sessions.set(newToken, { email, loginAt: Date.now() });

    const res = NextResponse.json({ success: true, email });
    res.cookies.set('auth_token', newToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   60 * 60 * 24 * 7, // 7 hari
      path:     '/',
    });
    return res;
  }

  // ── LOGOUT ─────────────────────────────────────────────────────────────────
  if (action === 'logout') {
    if (token) sessions.delete(token);
    const res = NextResponse.json({ success: true });
    res.cookies.delete('auth_token');
    return res;
  }

  // ── VERIFY token ───────────────────────────────────────────────────────────
  if (action === 'verify') {
    const session = token ? sessions.get(token) : null;
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    return NextResponse.json({ success: true, email: session.email });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}

export async function GET(req) {
  // Check auth dari cookie
  const token = req.cookies.get('auth_token')?.value;
  const session = token ? sessions.get(token) : null;
  if (!session) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, email: session.email });
}
