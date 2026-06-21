'use client';

import React, { useState, useCallback, useMemo } from 'react';

// ─── Column Definition ───────────────────────────────────────────────────────

export interface ColumnDef<T> {
  /** Unique key matching a property of T, or a custom key when using render */
  key: string;
  /** Column header label */
  header: string;
  /** Column width (CSS value, e.g. '120px', '20%') */
  width?: string;
  /** Minimum width */
  minWidth?: string;
  /** Custom render function */
  render?: (value: unknown, row: T, rowIndex: number) => React.ReactNode;
  /** Whether the column is sortable */
  sortable?: boolean;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

// ─── Sort State ──────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

// ─── Selection Mode ──────────────────────────────────────────────────────────

type SelectionMode = 'none' | 'single' | 'multi';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Unique key extractor for each row */
  rowKey: (row: T) => string | number;
  /** Selection mode */
  selectionMode?: SelectionMode;
  /** Currently selected row keys */
  selectedKeys?: Set<string | number>;
  /** Selection change handler */
  onSelectionChange?: (selectedKeys: Set<string | number>) => void;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** External sort state (controlled) */
  sort?: SortState | null;
  /** Sort change handler */
  onSortChange?: (sort: SortState) => void;
  /** Loading state */
  loading?: boolean;
  /** Custom empty message */
  emptyMessage?: string;
  /** Custom empty state render */
  emptyState?: React.ReactNode;
  /** Sticky header */
  stickyHeader?: boolean;
  /** Max height for scrollable body (requires stickyHeader) */
  maxHeight?: string;
  /** Additional class name for the wrapper */
  className?: string;
  /** Row class name generator */
  rowClassName?: (row: T, index: number) => string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  rowKey,
  selectionMode = 'none',
  selectedKeys = new Set(),
  onSelectionChange,
  onRowClick,
  sort: controlledSort,
  onSortChange,
  loading = false,
  emptyMessage = '데이터가 없습니다.',
  emptyState,
  stickyHeader = true,
  maxHeight,
  className = '',
  rowClassName,
}: DataTableProps<T>) {
  // Internal sort state (uncontrolled fallback)
  const [internalSort, setInternalSort] = useState<SortState | null>(null);
  const activeSort = controlledSort !== undefined ? controlledSort : internalSort;

  const handleSort = useCallback(
    (key: string) => {
      const newDirection: SortDirection =
        activeSort?.key === key && activeSort.direction === 'asc' ? 'desc' : 'asc';
      const newSort: SortState = { key, direction: newDirection };

      if (onSortChange) {
        onSortChange(newSort);
      } else {
        setInternalSort(newSort);
      }
    },
    [activeSort, onSortChange]
  );

  // Client-side sort when uncontrolled
  const sortedData = useMemo(() => {
    if (onSortChange || !internalSort) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[internalSort.key];
      const bVal = (b as Record<string, unknown>)[internalSort.key];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal, 'ko');
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal), 'ko');
      }

      return internalSort.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, internalSort, onSortChange]);

  const displayData = onSortChange ? data : sortedData;

  // ─── Selection Handlers ──────────────────────────────────────────────────

  const isAllSelected =
    selectionMode === 'multi' && data.length > 0 && data.every((row) => selectedKeys.has(rowKey(row)));

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (isAllSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map((row) => rowKey(row))));
    }
  }, [data, isAllSelected, onSelectionChange, rowKey]);

  const handleSelectRow = useCallback(
    (row: T) => {
      if (!onSelectionChange) return;
      const key = rowKey(row);

      if (selectionMode === 'single') {
        const newSet = new Set<string | number>();
        if (!selectedKeys.has(key)) {
          newSet.add(key);
        }
        onSelectionChange(newSet);
      } else if (selectionMode === 'multi') {
        const newSet = new Set(selectedKeys);
        if (newSet.has(key)) {
          newSet.delete(key);
        } else {
          newSet.add(key);
        }
        onSelectionChange(newSet);
      }
    },
    [selectionMode, selectedKeys, onSelectionChange, rowKey]
  );

  // ─── Cell value accessor ─────────────────────────────────────────────────

  const getCellValue = (row: T, col: ColumnDef<T>, rowIndex: number): React.ReactNode => {
    const rawValue = (row as Record<string, unknown>)[col.key];
    if (col.render) {
      return col.render(rawValue, row, rowIndex);
    }
    if (rawValue == null) return '-';
    return String(rawValue);
  };

  // ─── Sort Icon ────────────────────────────────────────────────────────────

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    const isActive = activeSort?.key === columnKey;
    return (
      <span className="ml-1 inline-flex flex-col text-[10px] leading-none">
        <span className={isActive && activeSort?.direction === 'asc' ? 'text-blue-600' : 'text-gray-300'}>
          ▲
        </span>
        <span className={isActive && activeSort?.direction === 'desc' ? 'text-blue-600' : 'text-gray-300'}>
          ▼
        </span>
      </span>
    );
  };

  // ─── Column count for colSpan ─────────────────────────────────────────────

  const totalColumns = columns.length + (selectionMode !== 'none' ? 1 : 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`overflow-auto rounded-lg border border-gray-200 bg-white ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse text-xs sm:text-sm">
        <thead
          className={
            stickyHeader ? 'sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_theme(colors.gray.200)]' : 'bg-gray-50'
          }
        >
          <tr>
            {selectionMode !== 'none' && (
              <th className="w-12 border-b border-gray-200 px-3 py-3 text-center">
                {selectionMode === 'multi' && (
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label="전체 선택"
                  />
                )}
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  'border-b border-gray-200 px-2 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-600 whitespace-nowrap',
                  col.sortable ? 'cursor-pointer select-none hover:text-gray-900' : '',
                  col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  width: col.width,
                  minWidth: col.minWidth,
                }}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center">
                  {col.header}
                  {col.sortable && <SortIcon columnKey={col.key} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Loading */}
          {loading && (
            <tr>
              <td colSpan={totalColumns} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <svg
                    className="h-8 w-8 animate-spin text-blue-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm text-gray-500">데이터를 불러오는 중...</span>
                </div>
              </td>
            </tr>
          )}

          {/* Empty */}
          {!loading && displayData.length === 0 && (
            <tr>
              <td colSpan={totalColumns} className="px-4 py-16 text-center">
                {emptyState ?? (
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                      />
                    </svg>
                    <span className="text-sm">{emptyMessage}</span>
                  </div>
                )}
              </td>
            </tr>
          )}

          {/* Data rows */}
          {!loading &&
            displayData.map((row, rowIndex) => {
              const key = rowKey(row);
              const isSelected = selectedKeys.has(key);

              return (
                <tr
                  key={key}
                  className={[
                    'transition-colors',
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50',
                    onRowClick ? 'cursor-pointer' : '',
                    rowClassName ? rowClassName(row, rowIndex) : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onRowClick?.(row, rowIndex)}
                >
                  {selectionMode !== 'none' && (
                    <td className="px-3 py-3 text-center">
                      <input
                        type={selectionMode === 'multi' ? 'checkbox' : 'radio'}
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectRow(row);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        'px-2 sm:px-4 py-2 sm:py-3 text-gray-700',
                        col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        width: col.width,
                        minWidth: col.minWidth,
                      }}
                    >
                      {getCellValue(row, col, rowIndex)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
