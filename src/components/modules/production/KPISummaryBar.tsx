'use client';

import type { ProductionSchedule, TransportCategory } from '@/types';
import { TRANSPORT_CATEGORIES } from './constants';

interface Props {
  schedules: ProductionSchedule[];
  dateLabel: string;
}

export default function KPISummaryBar({ schedules, dateLabel }: Props) {
  const stats = (cat: TransportCategory) => {
    const items = schedules.filter(s => s.transport_category === cat && s.status !== 'cancelled');
    const plannedQty = items.reduce((sum, s) => sum + Number(s.planned_quantity || 0), 0);
    const actualQty = items.reduce((sum, s) => sum + Number(s.actual_quantity || 0), 0);
    const plannedTrucks = items.reduce((sum, s) => sum + Number(s.planned_trucks || 0), 0);
    const actualTrucks = items.reduce((sum, s) => sum + Number(s.actual_trucks || 0), 0);
    const rate = plannedQty > 0 ? Math.round((actualQty / plannedQty) * 100) : 0;
    return { count: items.length, plannedQty, actualQty, plannedTrucks, actualTrucks, rate };
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      {TRANSPORT_CATEGORIES.map(cat => {
        const s = stats(cat.value);
        const isBlue = cat.value === 'cargo_truck';
        const gradFrom = isBlue ? 'from-blue-600' : 'from-emerald-600';
        const gradTo = isBlue ? 'to-indigo-700' : 'to-teal-700';
        const icon = isBlue ? (
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m20.893 13.393-1.135-1.135a2.252 2.252 0 0 1-.421-.585l-1.08-2.16a.414.414 0 0 0-.663-.107.827.827 0 0 1-.812.21l-1.273-.363a.89.89 0 0 0-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.212.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 0 1-1.81 1.025 1.055 1.055 0 0 1-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 0 1-1.383-2.46l.007-.042a2.25 2.25 0 0 1 .29-.787l.082-.147a2.25 2.25 0 0 0 .009-2.282L7.086 4.49a.75.75 0 0 1 .207-.88 2.246 2.246 0 0 1 1.53-.617h.582a3.75 3.75 0 0 1 3.75 3.75v1.875" />
          </svg>
        );

        return (
          <div key={cat.value} className={`bg-gradient-to-r ${gradFrom} ${gradTo} rounded-xl p-4 sm:p-5 text-white shadow-lg`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {icon}
                <h3 className="text-base sm:text-lg font-bold">{cat.label}</h3>
              </div>
              <span className="text-xs sm:text-sm opacity-75">{dateLabel}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div>
                <p className="text-xs opacity-70">건수</p>
                <p className="text-lg sm:text-xl font-bold">{s.count}<span className="text-xs opacity-60 ml-0.5">건</span></p>
              </div>
              <div>
                <p className="text-xs opacity-70">계획 대수</p>
                <p className="text-lg sm:text-xl font-bold">{s.plannedTrucks}<span className="text-xs opacity-60 ml-0.5">대</span></p>
              </div>
              <div>
                <p className="text-xs opacity-70">계획 물량</p>
                <p className="text-lg sm:text-xl font-bold">{s.plannedQty.toLocaleString(undefined, { maximumFractionDigits: 1 })}<span className="text-xs opacity-60 ml-0.5">t</span></p>
              </div>
              <div>
                <p className="text-xs opacity-70">달성률</p>
                <p className="text-lg sm:text-xl font-bold">{s.rate}<span className="text-xs opacity-60 ml-0.5">%</span></p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
