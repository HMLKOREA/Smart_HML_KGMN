import type { TransportCategory } from '@/types';

export const TRANSPORT_CATEGORIES: { value: TransportCategory; label: string; color: string }[] = [
  { value: 'cargo_truck', label: 'Cargo Truck', color: 'blue' },
  { value: 'tank_lorry', label: 'Tank Lorry (BCT)', color: 'emerald' },
];

export const SUB_CATEGORIES: Record<TransportCategory, string[]> = {
  cargo_truck: ['K10', '광성화학', '기타'],
  tank_lorry: ['탈황용', '공업용'],
};

export const SCHEDULE_STATUS_MAP: Record<string, { label: string; style: string; dot: string }> = {
  planned:     { label: '계획', style: 'bg-gray-50 text-gray-700 ring-1 ring-gray-200', dot: 'bg-gray-400' },
  in_progress: { label: '진행중', style: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-400' },
  completed:   { label: '완료', style: 'bg-green-50 text-green-700 ring-1 ring-green-200', dot: 'bg-green-500' },
  cancelled:   { label: '취소', style: 'bg-red-50 text-red-700 ring-1 ring-red-200', dot: 'bg-red-400' },
};

export const CATEGORY_COLORS: Record<TransportCategory, { bg: string; border: string; text: string; badge: string }> = {
  cargo_truck: { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  tank_lorry:  { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
};
