'use client';

import { useState, useEffect } from 'react';
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
  '/settlement': '정산관리',
  '/admin/users': '사용자관리',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading, isAuthenticated } = useAuth();

  const pageTitle = Object.entries(pageTitles).find(
    ([path]) => pathname.startsWith(path)
  )?.[1] || '대시보드';

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-gray-500 text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        userRole={profile.role as UserRole}
        userName={profile.name}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <Header title={pageTitle} sidebarCollapsed={sidebarCollapsed} />
      <main
        style={{
          paddingTop: 56,
          marginLeft: sidebarCollapsed ? 64 : 260,
          transition: 'margin-left 0.3s',
        }}
      >
        <div style={{ padding: 24 }}>{children}</div>
      </main>
    </div>
  );
}
