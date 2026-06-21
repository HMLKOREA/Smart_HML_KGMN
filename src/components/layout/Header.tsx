'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth/session';

interface HeaderProps {
  title: string;
  sidebarWidth: number;
  isMobile?: boolean;
  onMenuClick?: () => void;
}

const PAGE_ICONS: Record<string, string> = {
  '대시보드': '🚛', '출하관리': '📦', '배차관리': '🚚', '운송사관리': '🏢',
  '거래처관리': '🤝', '기사관리': '👷', '제품코드관리': '🏷️', '성적서관리': '📋',
  '정산관리': '💰', '사용자관리': '👥', '생산현황': '📅', '일일보고': '📊',
};

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
    <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <div className="flex items-baseline gap-1.5">
        <span className="hidden lg:inline text-[12px] text-slate-400">{date}</span>
        <span className="text-[13px] font-mono font-semibold text-slate-700 tabular-nums tracking-wider">{time}</span>
      </div>
    </div>
  );
}

export default function Header({ title, sidebarWidth, isMobile, onMenuClick }: HeaderProps) {
  const router = useRouter();
  const icon = PAGE_ICONS[title] || '📄';

  const handleLogout = () => {
    clearSession();
    router.push('/login');
    router.refresh();
  };

  return (
    <header
      className="fixed top-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4 md:px-6 z-40 transition-[left] duration-300"
      style={{ left: sidebarWidth }}
    >
      {/* 좌측: 햄버거 + 제목 */}
      <div className="flex items-center gap-2 min-w-0">
        {isMobile && (
          <button
            onClick={onMenuClick}
            className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
            aria-label="메뉴 열기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        )}
        <span className="text-lg sm:text-xl">{icon}</span>
        <h1 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight truncate">
          {title}
        </h1>
      </div>

      {/* 우측: 시계 + 버튼 */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <KstClock />

        <div className="hidden sm:block w-px h-5 bg-gray-200" />

        <button
          onClick={() => router.refresh()}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
          title="새로고침"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </button>

        <button
          onClick={handleLogout}
          className="p-2 text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition"
          title="로그아웃"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
        </button>
      </div>
    </header>
  );
}
