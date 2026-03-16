'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth/session';

interface HeaderProps {
  title: string;
  sidebarCollapsed: boolean;
}

/* ── 페이지별 아이콘 ── */
const PAGE_ICONS: Record<string, string> = {
  '대시보드': '🚛',
  '출하관리': '📦',
  '배차관리': '🚚',
  '운송사관리': '🏢',
  '거래처관리': '🤝',
  '기사관리': '👷',
  '제품코드관리': '🏷️',
  '성적서관리': '📋',
  '정산관리': '💰',
  '사용자관리': '👥',
};

/* ── KST 실시간 시계 ── */
function KstClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const h = String(kst.getHours()).padStart(2, '0');
      const m = String(kst.getMinutes()).padStart(2, '0');
      const s = String(kst.getSeconds()).padStart(2, '0');
      setTime(`${h}:${m}:${s}`);

      const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
      const y = kst.getFullYear();
      const mon = String(kst.getMonth() + 1).padStart(2, '0');
      const d = String(kst.getDate()).padStart(2, '0');
      const w = weekdays[kst.getDay()];
      setDate(`${y}.${mon}.${d} (${w})`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] text-slate-400">{date}</span>
        <span className="text-[15px] font-mono font-semibold text-slate-700 tabular-nums tracking-wider">{time}</span>
      </div>
    </div>
  );
}

export default function Header({ title, sidebarCollapsed }: HeaderProps) {
  const router = useRouter();

  const handleLogout = () => {
    clearSession();
    router.push('/login');
    router.refresh();
  };

  const icon = PAGE_ICONS[title] || '📄';

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: sidebarCollapsed ? 64 : 260,
        right: 0,
        height: 56,
        zIndex: 40,
        transition: 'left 0.3s',
        paddingLeft: 32,
        paddingRight: 32,
      }}
      className="bg-white border-b border-gray-200 flex items-center justify-between"
    >
      {/* 페이지 제목 */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-2xl">{icon}</span>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight whitespace-nowrap">
          {title}
        </h1>
      </div>

      {/* 우측: 시계 + 액션 버튼 */}
      <div className="flex items-center gap-3 shrink-0">
        <KstClock />

        <div className="w-px h-5 bg-gray-200" />

        <button
          onClick={() => router.refresh()}
          className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="새로고침"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          <span className="hidden sm:inline">새로고침</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          <span className="hidden sm:inline">로그아웃</span>
        </button>
      </div>
    </header>
  );
}
