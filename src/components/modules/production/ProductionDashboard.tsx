'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSession } from '@/lib/auth/session';
import type { ProductionSchedule, UserRole } from '@/types';
import KPISummaryBar from './KPISummaryBar';
import WeeklyCalendarView from './WeeklyCalendarView';
import DetailTableView from './DetailTableView';
import ScheduleModal from './ScheduleModal';
import { useProductionCrud } from './useProductionCrud';
import { localDateStr } from './constants';

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function ProductionDashboard() {
  const supabase = createClient();
  const session = useMemo(() => getSession(), []);
  const userRole = (session?.profile?.role || 'monitor') as UserRole;
  const userId = session?.profile?.id;

  const canEdit = userRole === 'admin' || userRole === 'field';
  const canDelete = userRole === 'admin';

  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [monitorMode, setMonitorMode] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSchedule, setModalSchedule] = useState<ProductionSchedule | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string>('');

  const { saveSchedule, deleteSchedules } = useProductionCrud();

  // 주간 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const startStr = localDateStr(weekStart);
      const endStr = localDateStr(weekEnd);

      const { data, error } = await supabase
        .from('v_production_schedules')
        .select('*')
        .gte('schedule_date', startStr)
        .lte('schedule_date', endStr)
        .order('schedule_date', { ascending: true });

      if (error) {
        console.error('Supabase query error:', JSON.stringify(error));
        return;
      }
      setSchedules((data as ProductionSchedule[]) || []);
    } catch (err) {
      console.error('Production dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, weekStart]);

  useEffect(() => { loadData(); }, [loadData]);

  // 자동 새로고침 (30초)
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // 주 이동
  const prevWeek = useCallback(() => {
    setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  }, []);
  const nextWeek = useCallback(() => {
    setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
  }, []);
  const goToday = useCallback(() => setWeekStart(getMonday(new Date())), []);

  // 카드/추가 클릭
  const handleCardClick = useCallback((s: ProductionSchedule) => {
    setModalSchedule(s);
    setModalDefaultDate('');
    setModalOpen(true);
  }, []);
  const handleAddClick = useCallback((date: string) => {
    setModalSchedule(null);
    setModalDefaultDate(date);
    setModalOpen(true);
  }, []);

  // KPI용 날짜 라벨
  const kpiLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${weekStart.getMonth() + 1}/${weekStart.getDate()} ~ ${end.getMonth() + 1}/${end.getDate()}`;
  }, [weekStart]);

  if (loading && schedules.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">생산현황을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-[1600px] space-y-5 ${monitorMode ? 'text-lg' : ''}`}>
      {/* 헤더 바 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {userRole === 'monitor' && (
            <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full ring-1 ring-blue-200">
              모니터링 모드
            </span>
          )}
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !monitorMode && (
            <button onClick={() => { setModalSchedule(null); setModalDefaultDate(localDateStr(new Date())); setModalOpen(true); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              일정 등록
            </button>
          )}
          <button onClick={() => setMonitorMode(!monitorMode)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition ${monitorMode ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 12V5.25" />
            </svg>
            {monitorMode ? '모니터 모드 OFF' : '모니터 모드'}
          </button>
        </div>
      </div>

      {/* KPI 요약 */}
      <KPISummaryBar schedules={schedules} dateLabel={kpiLabel} />

      {/* 주간 캘린더 */}
      <WeeklyCalendarView
        schedules={schedules}
        weekStart={weekStart}
        onPrevWeek={prevWeek}
        onNextWeek={nextWeek}
        onToday={goToday}
        onCardClick={handleCardClick}
        onAddClick={handleAddClick}
        canEdit={canEdit}
        monitorMode={monitorMode}
      />

      {/* 상세 테이블 (모니터 모드에서는 숨김) */}
      {!monitorMode && (
        <DetailTableView
          schedules={schedules}
          onCardClick={handleCardClick}
          canEdit={canEdit}
        />
      )}

      {/* 모달 */}
      <ScheduleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={loadData}
        schedule={modalSchedule}
        defaultDate={modalDefaultDate}
        canEdit={canEdit}
        canDelete={canDelete}
        onSave={saveSchedule}
        onDelete={deleteSchedules}
        userId={userId}
      />
    </div>
  );
}
