'use client';

import { useState, useMemo } from 'react';
import type { ProductionSchedule, TransportCategory } from '@/types';
import { TRANSPORT_CATEGORIES, SUB_CATEGORIES, SCHEDULE_STATUS_MAP, CATEGORY_COLORS } from './constants';
import { exportToExcel } from '@/lib/utils/exportExcel';

interface Props {
  schedules: ProductionSchedule[];
  onCardClick: (s: ProductionSchedule) => void;
  canEdit: boolean;
}

type TabValue = 'all' | TransportCategory;

export default function DetailTableView({ schedules, onCardClick, canEdit }: Props) {
  const [tab, setTab] = useState<TabValue>('all');
  const [subFilter, setSubFilter] = useState<string>('');

  const filtered = useMemo(() => {
    let data = schedules;
    if (tab !== 'all') data = data.filter(s => s.transport_category === tab);
    if (subFilter) data = data.filter(s => s.sub_category === subFilter);
    return data.sort((a, b) => a.schedule_date.localeCompare(b.schedule_date) || a.priority - b.priority);
  }, [schedules, tab, subFilter]);

  const subOptions = useMemo(() => {
    if (tab === 'all') return [...SUB_CATEGORIES.cargo_truck, ...SUB_CATEGORIES.tank_lorry];
    return SUB_CATEGORIES[tab];
  }, [tab]);

  const handleExport = () => {
    const rows = filtered.map(s => ({
      '날짜': s.schedule_date,
      '운송구분': s.transport_category === 'cargo_truck' ? 'Cargo Truck' : 'Tank Lorry',
      '세부구분': s.sub_category,
      '거래처': s.customer_name || '',
      '제품': s.product_code || s.product_name || '',
      '계획수량(ton)': s.planned_quantity,
      '계획대수': s.planned_trucks,
      '실적수량(ton)': s.actual_quantity,
      '실적대수': s.actual_trucks,
      '상태': SCHEDULE_STATUS_MAP[s.status]?.label || s.status,
      '메모': s.notes || '',
    }));
    exportToExcel(rows, Object.keys(rows[0] || {}).map(k => ({ key: k, header: k })), '생산현황');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* 탭 + 필터 */}
      <div className="px-3 sm:px-5 py-3 border-b border-gray-100 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 flex-wrap">
            {[
              { value: 'all' as TabValue, label: '전체' },
              ...TRANSPORT_CATEGORIES.map(c => ({ value: c.value as TabValue, label: c.label })),
            ].map(t => (
              <button key={t.value} onClick={() => { setTab(t.value); setSubFilter(''); }}
                className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition ${tab === t.value ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={handleExport} disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            엑셀
          </button>
        </div>

        {/* 서브 필터 칩 */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setSubFilter('')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition ${!subFilter ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            전체
          </button>
          {subOptions.map(s => (
            <button key={s} onClick={() => setSubFilter(subFilter === s ? '' : s)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition ${subFilter === s ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>구분</th>
              <th>세부</th>
              <th>거래처</th>
              <th>제품</th>
              <th className="text-right">계획(t)</th>
              <th className="text-right">계획(대)</th>
              <th className="text-right">실적(t)</th>
              <th className="text-right">실적(대)</th>
              <th>상태</th>
              <th>메모</th>
              {canEdit && <th>관리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map(s => {
              const st = SCHEDULE_STATUS_MAP[s.status] || SCHEDULE_STATUS_MAP.planned;
              const colors = CATEGORY_COLORS[s.transport_category];
              return (
                <tr key={s.id} className="hover:bg-gray-50/50 transition">
                  <td className="text-gray-500 text-xs">{s.schedule_date}</td>
                  <td><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${colors.badge}`}>
                    {s.transport_category === 'cargo_truck' ? 'Cargo' : 'BCT'}
                  </span></td>
                  <td className="font-medium text-gray-700">{s.sub_category}</td>
                  <td className="font-medium text-gray-800">{s.customer_name || '-'}</td>
                  <td className="text-gray-600 text-xs">{s.product_code || s.product_name || '-'}</td>
                  <td className="text-right tabular-nums">{Number(s.planned_quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                  <td className="text-right tabular-nums">{s.planned_trucks || 0}</td>
                  <td className="text-right tabular-nums font-medium">{Number(s.actual_quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                  <td className="text-right tabular-nums font-medium">{s.actual_trucks || 0}</td>
                  <td><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${st.style}`}>{st.label}</span></td>
                  <td className="text-gray-400 text-xs max-w-[120px] truncate">{s.notes || ''}</td>
                  {canEdit && (
                    <td>
                      <button onClick={() => onCardClick(s)} className="p-1 text-gray-400 hover:text-blue-600 rounded transition">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={canEdit ? 12 : 11} className="text-center py-12 text-gray-400">
                  <p className="text-sm">등록된 생산 일정이 없습니다</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 하단 합계 */}
      {filtered.length > 0 && (
        <div className="px-3 sm:px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm">
          <span className="text-gray-500">총 <strong className="text-gray-800">{filtered.length}</strong>건</span>
          <span className="text-gray-500">계획 <strong className="text-gray-800">{filtered.reduce((s, r) => s + Number(r.planned_quantity || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>t</span>
          <span className="text-gray-500">실적 <strong className="text-blue-600">{filtered.reduce((s, r) => s + Number(r.actual_quantity || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>t</span>
        </div>
      )}
    </div>
  );
}
