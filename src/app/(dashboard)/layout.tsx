'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { useAuth } from '@/lib/hooks/useAuth';
import type { UserRole } from '@/types';

const pageTitles: Record<string, string> = {
  '/home': '대시보드',
  '/shipping': '출하관리',
  '/dispatch': '배차관리',
  '/transport-company': '운송사관리',
  '/customer': '거래처관리',
  '/driver': '기사관리',
  '/product-code': '제품코드관리',
  '/report': '성적서관리',
  '/production': '생산현황',
  '/settlement': '정산관리',
  '/daily-report': '일일보고',
  '/admin/users': '사용자관리',
};

/** 브레이크포인트: 768px 미만 = 모바일, 1024px 미만 = 태블릿 */
function useBreakpoint() {
  const [bp, setBp] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setBp(w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return bp;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const bp = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading, isAuthenticated } = useAuth();

  const pageTitle = Object.entries(pageTitles).find(
    ([path]) => pathname.startsWith(path)
  )?.[1] || '대시보드';

  // 모바일: 페이지 이동 시 사이드바 닫기
  useEffect(() => {
    if (bp === 'mobile') setSidebarOpen(false);
  }, [pathname, bp]);

  // 태블릿: 자동 축소
  useEffect(() => {
    if (bp === 'tablet') setSidebarCollapsed(true);
    else if (bp === 'desktop') setSidebarCollapsed(false);
  }, [bp]);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push('/login');
  }, [loading, isAuthenticated, router]);

  const toggleSidebar = useCallback(() => {
    if (bp === 'mobile') setSidebarOpen(v => !v);
    else setSidebarCollapsed(v => !v);
  }, [bp]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !profile) return null;

  // 모바일: 사이드바 = 오버레이 드로어
  // 태블릿: 축소 사이드바 (64px)
  // 데스크톱: 풀 사이드바 (260px)
  const isMobile = bp === 'mobile';
  const showSidebar = isMobile ? sidebarOpen : true;
  const collapsed = isMobile ? false : sidebarCollapsed;
  const sidebarWidth = isMobile ? 280 : collapsed ? 64 : 260;
  const mainMarginLeft = isMobile ? 0 : sidebarWidth;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 모바일 오버레이 */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      {showSidebar && (
        <Sidebar
          userRole={profile.role as UserRole}
          userName={profile.name}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          isMobile={isMobile}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* 헤더 */}
      <Header
        title={pageTitle}
        sidebarWidth={mainMarginLeft}
        isMobile={isMobile}
        onMenuClick={toggleSidebar}
      />

      {/* 메인 콘텐츠 */}
      <main
        className="transition-[margin-left] duration-300"
        style={{ paddingTop: 56, marginLeft: mainMarginLeft }}
      >
        <div className="p-3 sm:p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
