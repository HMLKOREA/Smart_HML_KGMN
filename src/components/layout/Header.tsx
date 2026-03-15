'use client';

import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth/session';

interface HeaderProps {
  title: string;
  sidebarCollapsed: boolean;
}

export default function Header({ title, sidebarCollapsed }: HeaderProps) {
  const router = useRouter();

  const handleLogout = () => {
    clearSession();
    router.push('/login');
    router.refresh();
  };

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
      }}
      className="bg-white border-b border-gray-200 flex items-center justify-between px-8"
    >
      {/* 페이지 제목 */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-bold text-gray-900 tracking-tight whitespace-nowrap">
          {title}
        </h1>
      </div>

      {/* 우측 액션 버튼 */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => router.refresh()}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="새로고침"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          <span className="hidden sm:inline">새로고침</span>
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-colors ml-1"
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
