'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // 이미 로그인 상태면 대시보드로 이동
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/home');
    }
  }, [isAuthenticated, router]);

  // 저장된 아이디 복원
  useEffect(() => {
    const saved = localStorage.getItem('remembered_login_id');
    if (saved) {
      setLoginId(saved);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      setError('아이디와 비밀번호를 입력하세요.');
      return;
    }
    setLoading(true);
    setError('');

    const success = await login(loginId, password);
    if (success) {
      if (rememberMe) {
        localStorage.setItem('remembered_login_id', loginId.trim().toUpperCase());
      } else {
        localStorage.removeItem('remembered_login_id');
      }
      router.push('/home');
    } else {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-200 via-stone-200 to-slate-300">

      {/* ─── Centered Card (6:4 ratio) ─── */}
      <div className="w-full max-w-[920px] mx-6 flex rounded-2xl overflow-hidden shadow-2xl shadow-slate-500/25"
           style={{ minHeight: '520px', maxHeight: '600px' }}>

        {/* ── Left: Branding Panel ── */}
        <div className="hidden md:flex w-[54%] relative overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center scale-105"
            style={{ backgroundImage: "url('/mine-bg3.jpg')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/85 via-blue-950/75 to-slate-900/80" />

          <div className="relative z-10 flex flex-col justify-between w-full" style={{ padding: '48px 36px 48px 40px' }}>
            <div>
              <Image
                src="/hamel-logo.png"
                alt="HAMEL Logo"
                width={110}
                height={44}
                className="brightness-0 invert opacity-90"
                priority
              />
            </div>

            <div className="space-y-5">
              <h1 className="text-3xl font-bold text-white leading-snug tracking-tight">
                Dig Smart.<br />
                Deliver Smarter.
              </h1>
              <div className="w-10 h-0.5 bg-blue-400 rounded-full" />
              <p className="text-blue-200/70 text-sm leading-relaxed">
                When your logistics meets intelligence
              </p>
              <p className="text-slate-400/80 text-xs tracking-wide">
                Smart Dispatch Management Solution
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-md border border-white/10">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-[10px] text-slate-300">System Online</span>
                </div>
                <span className="text-[10px] text-slate-500">MOQV 2026</span>
              </div>
              <p className="text-[10px] text-slate-600">
                &copy; 2026 HAMEL KOREA / MOQV All rights reserved.
              </p>
            </div>
          </div>
        </div>

        {/* ── Right: Login Form Panel ── */}
        <div className="flex-1 bg-white flex flex-col items-center justify-center" style={{ padding: '40px 24px' }}>
          <div style={{ width: '100%', maxWidth: 300 }}>

            {/* Logo & Title */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 32 }}>
              <div style={{ marginBottom: 12 }}>
                <Image
                  src="/hamel-logo.png"
                  alt="HAMEL Logo"
                  width={130}
                  height={52}
                  priority
                />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>SMART HML</h2>
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>경기광업 스마트 배차 시스템</p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin}>
              <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white outline-none transition text-sm placeholder:text-gray-400"
                style={{ height: 48, paddingLeft: 16, paddingRight: 16 }}
                placeholder="아이디"
                autoComplete="username"
                autoFocus
              />

              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white outline-none transition text-sm placeholder:text-gray-400"
                style={{ height: 48, paddingLeft: 16, paddingRight: 16, marginTop: 12 }}
                placeholder="비밀번호"
                autoComplete="current-password"
              />

              {/* Remember Me */}
              <label className="flex items-center cursor-pointer select-none" style={{ marginTop: 20, gap: 8 }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  style={{ width: 14, height: 14 }}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>아이디 저장</span>
              </label>

              {/* Error */}
              {error && (
                <div className="flex items-center bg-red-50 text-red-600 border border-red-100 rounded-lg" style={{ marginTop: 20, padding: 12, gap: 8, fontSize: 12 }}>
                  <svg className="shrink-0" style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-lg active:scale-[0.98]"
                style={{ height: 48, fontSize: 14, marginTop: 20 }}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </form>

            {/* Footer */}
            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#9ca3af' }}>
                문의: <a href="mailto:kgmn@hmlkorea.com" className="hover:text-blue-600 transition" style={{ color: '#6b7280', fontWeight: 500 }}>kgmn@hmlkorea.com</a>
              </p>
              <p style={{ fontSize: 10, color: '#d1d5db', marginTop: 4 }}>
                &copy; 2026 HAMEL KOREA / MOQV
              </p>
              <p style={{ fontSize: 10, color: '#d1d5db', marginTop: 3 }}>
                <a href="https://www.moqv.kr" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 transition">www.moqv.kr</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
