'use client';

import { useMemo } from 'react';
import type { ProductionSchedule } from '@/types';
import ScheduleCard from './ScheduleCard';

interface Props {
  schedules: ProductionSchedule[];
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onCardClick: (s: ProductionSchedule) => void;
  onAddClick: (date: string) => void;
  canEdit: boolean;
  monitorMode: boolean;
}

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function dayLabel(d: Date) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[d.getDay()];
}

export default function WeeklyCalendarView({
  schedules, weekStart, onPrevWeek, onNextWeek, onToday,
  onCardClick, onAddClick, canEdit, monitorMode,
}: Props) {
  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      result.push(d);
    }
    return result;
  }, [weekStart]);

  const todayStr = useMemo(() => fmt(new Date()), []);

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const y = weekStart.getFullYear();
    const ms = String(weekStart.getMonth() + 1).padStart(2, '0');
    const ds = String(weekStart.getDate()).padStart(2, '0');
    const me = String(end.getMonth() + 1).padStart(2, '0');
    const de = String(end.getDate()).padStart(2, '0');
    return `${y}년 ${ms}/${ds} ~ ${me}/${de}`;
  }, [weekStart]);

  // 날짜별 그룹핑
  const byDate = useMemo(() => {
    const map = new Map<string, ProductionSchedule[]>();
    schedules.forEach(s => {
      const key = s.schedule_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return map;
  }, [schedules]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* 네비게이션 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button onClick={onPrevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h3 className={`font-bold text-gray-800 ${monitorMode ? 'text-xl' : 'text-base'}`}>{weekLabel}</h3>
          <button onClick={onNextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <button onClick={onToday} className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
          오늘
        </button>
      </div>

      {/* 주간 그리드 */}
      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {days.map(d => {
          const dateStr = fmt(d);
          const isToday = dateStr === todayStr;
          const isSunday = d.getDay() === 0;
          const isSaturday = d.getDay() === 6;
          const items = byDate.get(dateStr) || [];

          return (
            <div
              key={dateStr}
              className={`min-h-[200px] ${isToday ? 'bg-blue-50/40 ring-2 ring-inset ring-blue-300' : ''} ${monitorMode ? 'min-h-[300px]' : ''}`}
            >
              {/* 헤더 */}
              <div className={`flex items-center justify-between px-2 py-2 border-b border-gray-50 ${isToday ? 'bg-blue-100/50' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold ${isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-gray-500'}`}>
                    {dayLabel(d)}
                  </span>
                  <span className={`text-sm font-bold ${isToday ? 'bg-blue-600 text-white px-1.5 py-0.5 rounded-md' : 'text-gray-700'}`}>
                    {d.getDate()}
                  </span>
                </div>
                {canEdit && !monitorMode && (
                  <button
                    onClick={() => onAddClick(dateStr)}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                )}
              </div>
              {/* 카드 목록 */}
              <div className="p-1.5 space-y-1">
                {items.map(s => (
                  <ScheduleCard key={s.id} schedule={s} onClick={onCardClick} compact={monitorMode} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
