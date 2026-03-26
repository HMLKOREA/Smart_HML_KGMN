'use client';

import type { ProductionSchedule } from '@/types';
import { CATEGORY_COLORS, SCHEDULE_STATUS_MAP } from './constants';

interface Props {
  schedule: ProductionSchedule;
  onClick?: (s: ProductionSchedule) => void;
  compact?: boolean;
}

export default function ScheduleCard({ schedule: s, onClick, compact }: Props) {
  const colors = CATEGORY_COLORS[s.transport_category];
  const st = SCHEDULE_STATUS_MAP[s.status] || SCHEDULE_STATUS_MAP.planned;

  const qtyLabel = [
    s.planned_trucks > 0 ? `${s.planned_trucks}대` : '',
    s.planned_quantity > 0 ? `${Number(s.planned_quantity).toLocaleString(undefined, { maximumFractionDigits: 1 })}t` : '',
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => onClick?.(s)}
      className={`w-full text-left rounded-lg border-l-[3px] ${colors.border} bg-white hover:shadow-md transition-all px-2 py-1.5 group ${compact ? 'text-[11px]' : 'text-xs'}`}
    >
      {/* 1줄: 뱃지 + 상태 */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none ${colors.badge}`}>
          {s.sub_category}
        </span>
        {qtyLabel && <span className="text-[9px] text-gray-400 font-medium ml-auto tabular-nums">{qtyLabel}</span>}
      </div>
      {/* 2줄: 거래처 */}
      <p className="font-semibold text-gray-800 leading-tight line-clamp-2" title={s.customer_name || ''}>
        {s.customer_name || '-'}
      </p>
      {/* 3줄: 제품 (compact에서는 숨김) */}
      {!compact && (s.product_name || s.product_code) && (
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
          {s.product_code && s.product_name
            ? `${s.product_code} ${s.product_name}`
            : s.product_name || s.product_code}
        </p>
      )}
    </button>
  );
}
