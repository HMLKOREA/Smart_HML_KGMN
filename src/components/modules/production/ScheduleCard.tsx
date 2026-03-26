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

  return (
    <button
      type="button"
      onClick={() => onClick?.(s)}
      className={`w-full text-left rounded-lg border-l-[3px] ${colors.border} bg-white hover:shadow-md transition-all px-2.5 py-1.5 group ${compact ? 'text-xs' : 'text-sm'}`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colors.badge}`}>
          {s.sub_category}
        </span>
      </div>
      <p className="font-semibold text-gray-800 truncate leading-tight">
        {s.customer_name || '-'}
      </p>
      {!compact && (
        <div className="flex items-center justify-between mt-0.5 text-gray-500 text-[11px]">
          <span>{s.product_code || s.product_name || '-'}</span>
          <span className="tabular-nums font-medium">
            {s.planned_trucks > 0 ? `${s.planned_trucks}대` : ''}
            {s.planned_quantity > 0 ? ` ${s.planned_quantity}t` : ''}
          </span>
        </div>
      )}
    </button>
  );
}
