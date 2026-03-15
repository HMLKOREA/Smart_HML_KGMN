'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';

interface DashboardStats {
  todayShipments: number;
  pendingShipments: number;
  todayDispatches: number;
  activeDrivers: number;
  activeCompanies: number;
  totalCustomers: number;
  monthlySettlements: number;
  recentShipments: Array<Record<string, unknown>>;
}

/* ── SVG Icons for stat cards ── */
const StatIcons = {
  shipping: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  ),
  pending: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  truck: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
    </svg>
  ),
  driver: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  ),
  company: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  ),
  customer: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </svg>
  ),
};

export default function HomePage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [stats, setStats] = useState<DashboardStats>({
    todayShipments: 0,
    pendingShipments: 0,
    todayDispatches: 0,
    activeDrivers: 0,
    activeCompanies: 0,
    totalCustomers: 0,
    monthlySettlements: 0,
    recentShipments: [],
  });
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<string>('checking');

  const today = new Date().toISOString().split('T')[0];
  const monthStart = `${today.substring(0, 7)}-01`;

  const loadStats = useCallback(async () => {
    try {
      const [
        todayShipmentsRes, pendingRes, todayDispatchRes,
        driversRes, companiesRes, customersRes,
        settlementsRes, recentRes,
      ] = await Promise.all([
        supabase.from('shipments').select('*', { count: 'exact', head: true }).eq('shipment_date', today),
        supabase.from('shipments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('dispatches').select('*', { count: 'exact', head: true }).eq('dispatch_date', today),
        supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('transport_companies').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('settlements').select('*', { count: 'exact', head: true }).gte('settlement_date', monthStart),
        supabase.from('v_shipments').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      setStats({
        todayShipments: todayShipmentsRes.count || 0,
        pendingShipments: pendingRes.count || 0,
        todayDispatches: todayDispatchRes.count || 0,
        activeDrivers: driversRes.count || 0,
        activeCompanies: companiesRes.count || 0,
        totalCustomers: customersRes.count || 0,
        monthlySettlements: settlementsRes.count || 0,
        recentShipments: (recentRes.data as Array<Record<string, unknown>>) || [],
      });
    } catch (err) {
      console.error('Stats load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, today, monthStart]);

  useEffect(() => {
    loadStats();
    fetch('/api/health-check')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok') setHealthStatus('ok');
        else if (data.status === 'warning') setHealthStatus('warning');
        else setHealthStatus('error');
      })
      .catch(() => setHealthStatus('error'));
  }, [loadStats]);

  const statCards = [
    { label: '오늘 출하', value: stats.todayShipments, unit: '건', gradient: 'from-blue-500 to-blue-600', icon: StatIcons.shipping },
    { label: '대기중', value: stats.pendingShipments, unit: '건', gradient: 'from-amber-500 to-orange-500', icon: StatIcons.pending },
    { label: '오늘 배차', value: stats.todayDispatches, unit: '건', gradient: 'from-emerald-500 to-green-600', icon: StatIcons.truck },
    { label: '활성 기사', value: stats.activeDrivers, unit: '명', gradient: 'from-violet-500 to-purple-600', icon: StatIcons.driver },
    { label: '운송사', value: stats.activeCompanies, unit: '개사', gradient: 'from-cyan-500 to-teal-600', icon: StatIcons.company },
    { label: '거래처', value: stats.totalCustomers, unit: '개사', gradient: 'from-indigo-500 to-blue-600', icon: StatIcons.customer },
  ];

  const statusStyles: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    dispatched: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    in_transit: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    delivered: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    completed: 'bg-green-50 text-green-700 ring-1 ring-green-200',
    cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  };

  const statusLabel: Record<string, string> = {
    pending: '대기', dispatched: '배차완료', in_transit: '운송중',
    delivered: '배송완료', completed: '완료', cancelled: '취소',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            안녕하세요, <span className="text-blue-600">{profile?.name || '사용자'}</span>님
          </h2>
          <p className="text-gray-500 text-sm mt-1">{today} 현재 시스템 현황</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 shadow-sm">
          <span className={`w-2 h-2 rounded-full ${
            healthStatus === 'ok' ? 'bg-green-500 shadow-sm shadow-green-500/50' :
            healthStatus === 'warning' ? 'bg-yellow-500 shadow-sm shadow-yellow-500/50' :
            healthStatus === 'checking' ? 'bg-gray-400 animate-pulse' : 'bg-red-500 shadow-sm shadow-red-500/50'
          }`} />
          <span className="text-xs font-medium text-gray-600">
            {healthStatus === 'ok' ? '시스템 정상' :
             healthStatus === 'warning' ? '경고' :
             healthStatus === 'checking' ? '확인중...' : '연결 오류'}
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="relative overflow-hidden bg-white rounded-xl border border-gray-100 p-4 hover:shadow-lg hover:border-gray-200 transition-all duration-200 group">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-gray-900">{card.value.toLocaleString()}</span>
                  <span className="text-xs text-gray-400">{card.unit}</span>
                </div>
              </div>
              <div className={`p-2 rounded-lg bg-gradient-to-br ${card.gradient} text-white shadow-sm group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Shipments */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">최근 출하 내역</h3>
          <span className="text-xs text-gray-400">{stats.recentShipments.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>출하일자</th>
                <th>출하번호</th>
                <th>거래처</th>
                <th>제품</th>
                <th className="text-right">수량</th>
                <th>차량번호</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentShipments.length > 0 ? stats.recentShipments.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="text-gray-600">{String(s.shipment_date || '')}</td>
                  <td className="font-mono text-xs font-medium text-gray-700">{String(s.shipment_number || '')}</td>
                  <td className="font-medium text-gray-800">{String(s.customer_name || '-')}</td>
                  <td>{String(s.product_name || '-')}</td>
                  <td className="text-right tabular-nums font-medium">{Number(s.quantity || 0).toLocaleString()}</td>
                  <td className="font-mono text-xs">{String(s.vehicle_number || '-')}</td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusStyles[String(s.status)] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabel[String(s.status)] || String(s.status)}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                      </svg>
                      <p>출하 데이터가 없습니다</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Settlement */}
      {(profile?.role === 'admin' || profile?.role === 'monitor') && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-800 mb-1">이번 달 정산</h3>
              <p className="text-sm text-gray-400">{monthStart} ~ {today}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {stats.monthlySettlements}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">건</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
