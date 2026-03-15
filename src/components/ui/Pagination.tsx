'use client';

import React, { useMemo } from 'react';

export interface PaginationProps {
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Total number of items */
  totalItems: number;
  /** Items per page */
  pageSize: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Page size change handler */
  onPageSizeChange?: (pageSize: number) => void;
  /** Available page sizes */
  pageSizeOptions?: number[];
  /** Maximum number of page buttons to show */
  maxVisiblePages?: number;
  /** Whether to show item count info */
  showInfo?: boolean;
  /** Whether to show page size selector */
  showPageSizeSelector?: boolean;
  /** Additional class name */
  className?: string;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  maxVisiblePages = 5,
  showInfo = true,
  showPageSizeSelector = true,
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp current page
  const page = Math.max(1, Math.min(currentPage, totalPages));

  // Calculate item range for display
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  // Generate visible page numbers
  const visiblePages = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];

    if (totalPages <= maxVisiblePages + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      const halfVisible = Math.floor(maxVisiblePages / 2);
      let start = Math.max(2, page - halfVisible);
      let end = Math.min(totalPages - 1, page + halfVisible);

      // Adjust range
      if (page - halfVisible < 2) {
        end = Math.min(totalPages - 1, maxVisiblePages);
      }
      if (page + halfVisible > totalPages - 1) {
        start = Math.max(2, totalPages - maxVisiblePages + 1);
      }

      if (start > 2) {
        pages.push('ellipsis');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('ellipsis');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  }, [totalPages, page, maxVisiblePages]);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 ${className}`}
    >
      {/* Left: Info & page size */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        {showInfo && (
          <span>
            {totalItems === 0
              ? '데이터 없음'
              : `총 ${totalItems.toLocaleString('ko-KR')}건 중 ${startItem.toLocaleString('ko-KR')}-${endItem.toLocaleString('ko-KR')}`}
          </span>
        )}
        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1); // Reset to first page
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}건
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page navigation */}
      <nav className="flex items-center gap-1" aria-label="페이지 탐색">
        {/* Previous */}
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="이전 페이지"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Page numbers */}
        {visiblePages.map((item, index) => {
          if (item === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${index}`}
                className="inline-flex h-8 w-8 items-center justify-center text-sm text-gray-400"
              >
                ...
              </span>
            );
          }

          const isActive = item === page;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={[
                'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              {item}
            </button>
          );
        })}

        {/* Next */}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="다음 페이지"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </nav>
    </div>
  );
}

export default Pagination;
