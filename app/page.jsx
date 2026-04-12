'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap } from 'lucide-react';
import Dashboard   from '../components/Dashboard';
import LoginScreen from '../components/LoginScreen';

export default function Home() {
  const [authState,     setAuthState]     = useState('loading');
  const [userEmail,     setUserEmail]     = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [bestPair,      setBestPair]      = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const scanIntervalRef = useRef(null);

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) { setUserEmail(d.email); setAuthState('authenticated'); }
        else                 { setAuthState('unauthenticated'); }
      })
      .catch(() => setAuthState('unauthenticated'));
  }, []);

  // ── PWA Install prompt ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Auto Pair Scanner ──────────────────────────────────────────────────────
  const runScanner = useCallback(async () => {
    try {
      const res  = await fetch('/api/scanner');
      const data = await res.json();
      if (data.success && data.bestPair) {
        setBestPair({
          pair:  data.bestPair.pair,
          score: data.bestPair.score,
          display: data.bestPair.displayPair,
          rsi:   data.bestPair.details?.momentum?.rsi,
          trend: data.bestPair.details?.trend?.direction,
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!scannerActive) {
      clearInterval(scanIntervalRef.current);
      setBestPair(null);
      return;
    }
    runScanner();
    scanIntervalRef.current = setInterval(runScanner, 4 * 60 * 1000); // setiap 4 menit
    return () => clearInterval(scanIntervalRef.current);
  }, [scannerActive, runScanner]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const handleLogout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setAuthState('unauthenticated');
    setUserEmail('');
  };

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Zap size={32} className="text-white" />
          </div>
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">Memuat IndoTrader...</p>
        </div>
      </div>
    );
  }

  // ── Login screen ───────────────────────────────────────────────────────────
  if (authState === 'unauthenticated') {
    return (
      <LoginScreen onLogin={(email) => {
        setUserEmail(email);
        setAuthState('authenticated');
      }} />
    );
  }

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* PWA install banner */}
      {installPrompt && (
        <div className="fixed top-0 left-0 right-0 z-[200] bg-sky-500 px-4 py-2 flex items-center justify-between shadow">
          <p className="text-xs text-white font-semibold">📲 Install IndoTrader ke homescreen</p>
          <div className="flex gap-2">
            <button onClick={() => setInstallPrompt(null)} className="text-xs text-sky-100 px-2 py-1">Nanti</button>
            <button onClick={handleInstall} className="text-xs bg-white text-sky-600 font-bold px-3 py-1 rounded-lg">Install</button>
          </div>
        </div>
      )}

      <Dashboard
        userEmail={userEmail}
        onLogout={handleLogout}
        bestPair={bestPair}
        scannerActive={scannerActive}
        onScannerToggle={setScannerActive}
        onRunScanner={runScanner}
      />
    </>
  );
}
