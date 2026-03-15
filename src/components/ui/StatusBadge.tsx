'use client';

import React from 'react';

// ─── Status Type Definitions ────────────────────────────────────────────────

/** Shipment / dispatch statuses */
export type ShipmentStatus =
  | 'pending'      // 대기
  | 'assigned'     // 배차완료
  | 'in_transit'   // 운송중
  | 'delivered'    // 배송완료
  | 'cancelled'    // 취소
  | 'delayed';     // 지연

/** Settlement / billing statuses */
export type SettlementStatus =
  | 'unsettled'    // 미정산
  | 'partial'      // 부분정산
  | 'settled'      // 정산완료
  | 'invoiced'     // 청구완료
  | 'overdue';     // 연체

/** General statuses */
export type GeneralStatus =
  | 'active'       // 활성
  | 'inactive'     // 비활성
  | 'draft'        // 임시저장
  | 'confirmed'    // 확정
  | 'rejected';    // 반려

export type StatusType = ShipmentStatus | SettlementStatus | GeneralStatus;

// ─── Color & Label Maps ─────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  bgColor: string;
  textColor: string;
  dotColor: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // Shipment
  pending:     { label: '대기',     bgColor: 'bg-yellow-50',  textColor: 'text-yellow-700', dotColor: 'bg-yellow-500' },
  assigned:    { label: '배차완료', bgColor: 'bg-blue-50',    textColor: 'text-blue-700',   dotColor: 'bg-blue-500' },
  in_transit:  { label: '운송중',   bgColor: 'bg-indigo-50',  textColor: 'text-indigo-700', dotColor: 'bg-indigo-500' },
  delivered:   { label: '배송완료', bgColor: 'bg-green-50',   textColor: 'text-green-700',  dotColor: 'bg-green-500' },
  cancelled:   { label: '취소',     bgColor: 'bg-red-50',     textColor: 'text-red-700',    dotColor: 'bg-red-500' },
  delayed:     { label: '지연',     bgColor: 'bg-orange-50',  textColor: 'text-orange-700', dotColor: 'bg-orange-500' },

  // Settlement
  unsettled:   { label: '미정산',   bgColor: 'bg-gray-50',    textColor: 'text-gray-700',   dotColor: 'bg-gray-400' },
  partial:     { label: '부분정산', bgColor: 'bg-amber-50',   textColor: 'text-amber-700',  dotColor: 'bg-amber-500' },
  settled:     { label: '정산완료', bgColor: 'bg-green-50',   textColor: 'text-green-700',  dotColor: 'bg-green-500' },
  invoiced:    { label: '청구완료', bgColor: 'bg-purple-50',  textColor: 'text-purple-700', dotColor: 'bg-purple-500' },
  overdue:     { label: '연체',     bgColor: 'bg-red-50',     textColor: 'text-red-700',    dotColor: 'bg-red-500' },

  // General
  active:      { label: '활성',     bgColor: 'bg-green-50',   textColor: 'text-green-700',  dotColor: 'bg-green-500' },
  inactive:    { label: '비활성',   bgColor: 'bg-gray-50',    textColor: 'text-gray-500',   dotColor: 'bg-gray-400' },
  draft:       { label: '임시저장', bgColor: 'bg-slate-50',   textColor: 'text-slate-600',  dotColor: 'bg-slate-400' },
  confirmed:   { label: '확정',     bgColor: 'bg-blue-50',    textColor: 'text-blue-700',   dotColor: 'bg-blue-500' },
  rejected:    { label: '반려',     bgColor: 'bg-red-50',     textColor: 'text-red-700',    dotColor: 'bg-red-500' },
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  status: StatusType | string;
  /** Override the displayed label */
  label?: string;
  /** Show a leading dot indicator */
  showDot?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class name */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StatusBadge({
  status,
  label: labelOverride,
  showDot = true,
  size = 'sm',
  className = '',
}: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-600',
    dotColor: 'bg-gray-400',
  };

  const displayLabel = labelOverride ?? config.label;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        config.bgColor,
        config.textColor,
        sizeClasses,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showDot && (
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotColor}`} />
      )}
      {displayLabel}
    </span>
  );
}

/** Helper to get the Korean label for a given status key */
export function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

export default StatusBadge;
