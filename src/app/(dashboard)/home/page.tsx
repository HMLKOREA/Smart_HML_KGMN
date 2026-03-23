'use client';
export const dynamic = 'force-dynamic';

import { useAuth } from '@/lib/hooks/useAuth';
import AdminDashboard from '@/components/modules/dashboard/AdminDashboard';
import TransporterDashboard from '@/components/modules/dashboard/TransporterDashboard';

export default function HomePage() {
  const { profile } = useAuth();

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 운송사 계정 → 운송사 대시보드
  if (profile.role === 'transporter') {
    return (
      <TransporterDashboard
        userName={profile.name}
        companyName={profile.company_name || ''}
      />
    );
  }

  // admin, monitor, field → 관리자 대시보드
  return <AdminDashboard userName={profile.name} userRole={profile.role} />;
}
