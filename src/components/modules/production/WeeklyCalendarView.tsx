'use client';

import { useMemo } from 'react';
import type { ProductionSchedule } from '@/types';
import ScheduleCard from './ScheduleCard';
import { localDateStr, todayStr as getTodayStr } from './constants';

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

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

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

  const todayDate = useMemo(() => getTodayStr(), []);

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const startS = localDateStr(weekStart); // YYYY-MM-DD
    const endS = localDateStr(end);
    return `${startS.substring(0, 4)}년 ${startS.substring(5, 7)}/${startS.substring(8)} ~ ${endS.substring(5, 7)}/${endS.substring(8)}`;
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
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={onPrevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h3 className={`font-bold text-gray-800 ${monitorMode ? 'text-base sm:text-xl' : 'text-sm sm:text-base'}`}>{weekLabel}</h3>
          <button onClick={onNextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <button onClick={onToday} className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
          오늘
        </button>
      </div>

      {/* 주간 그리드 - 모바일에서 가로 스크롤 */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 divide-x divide-gray-100 min-w-[560px]">
          {days.map(d => {
            const dateStr = localDateStr(d);
            const isToday = dateStr === todayDate;
            const isSunday = d.getDay() === 0;
            const isSaturday = d.getDay() === 6;
            const items = byDate.get(dateStr) || [];

            return (
              <div
                key={dateStr}
                className={`min-h-[160px] sm:min-h-[200px] ${isToday ? 'bg-blue-50/40 ring-2 ring-inset ring-blue-300' : ''} ${monitorMode ? 'sm:min-h-[300px]' : ''}`}
              >
                {/* 헤더 */}
                <div className={`flex items-center justify-between px-1.5 sm:px-2 py-1.5 sm:py-2 border-b border-gray-50 ${isToday ? 'bg-blue-100/50' : ''}`}>
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <span className={`text-[10px] sm:text-xs font-bold ${isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-gray-500'}`}>
                      {DAY_LABELS[d.getDay()]}
                    </span>
                    <span className={`text-xs sm:text-sm font-bold ${isToday ? 'bg-blue-600 text-white px-1 sm:px-1.5 py-0.5 rounded-md' : 'text-gray-700'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                  {canEdit && !monitorMode && (
                    <button
                      onClick={() => onAddClick(dateStr)}
                      className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                    >
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* 카드 목록 */}
                <div className="p-1 sm:p-1.5 space-y-1">
                  {items.map(s => (
                    <ScheduleCard key={s.id} schedule={s} onClick={onCardClick} compact={monitorMode} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
