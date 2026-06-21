'use client';

import React from 'react';
import { DatePicker } from './DatePicker';
import { Input } from './Input';
import { Button } from './Button';

export interface SearchBarProps {
  /** Start date value (YYYY-MM-DD) */
  startDate?: string;
  /** End date value (YYYY-MM-DD) */
  endDate?: string;
  onStartDateChange?: (value: string) => void;
  onEndDateChange?: (value: string) => void;
  /** Whether to show the date range fields */
  showDateRange?: boolean;
  /** Search text value */
  searchText?: string;
  onSearchTextChange?: (value: string) => void;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
  /** Whether to show the text search input */
  showSearch?: boolean;
  /** Handler for the search/query button */
  onSearch: () => void;
  /** Handler for the reset button */
  onReset?: () => void;
  /** Label for the search button */
  searchButtonLabel?: string;
  /** Label for the reset button */
  resetButtonLabel?: string;
  /** Whether the search is currently loading */
  loading?: boolean;
  /** Additional filter controls rendered before the buttons */
  children?: React.ReactNode;
  /** Additional class name */
  className?: string;
}

export function SearchBar({
  startDate = '',
  endDate = '',
  onStartDateChange,
  onEndDateChange,
  showDateRange = true,
  searchText = '',
  onSearchTextChange,
  searchPlaceholder = '검색어를 입력하세요',
  showSearch = true,
  onSearch,
  onReset,
  searchButtonLabel = '조회',
  resetButtonLabel = '초기화',
  loading = false,
  children,
  className = '',
}: SearchBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div
      className={`flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 ${className}`}
    >
      {/* Date Range */}
      {showDateRange && (
        <div className="flex items-end gap-2">
          <DatePicker
            label="시작일"
            value={startDate}
            onChange={(e) => onStartDateChange?.(e.target.value)}
            max={endDate || undefined}
            containerClassName="min-w-[140px]"
          />
          <span className="pb-2.5 text-sm text-gray-500">~</span>
          <DatePicker
            label="종료일"
            value={endDate}
            onChange={(e) => onEndDateChange?.(e.target.value)}
            min={startDate || undefined}
            containerClassName="min-w-[140px]"
          />
        </div>
      )}

      {/* Search Input */}
      {showSearch && (
        <Input
          label="검색"
          placeholder={searchPlaceholder}
          value={searchText}
          onChange={(e) => onSearchTextChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          containerClassName="w-full sm:w-auto sm:min-w-[200px]"
          prefix={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          }
        />
      )}

      {/* Additional filters */}
      {children}

      {/* Action Buttons */}
      <div className="flex items-end gap-2">
        <Button
          variant="primary"
          onClick={onSearch}
          loading={loading}
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          }
        >
          {searchButtonLabel}
        </Button>
        {onReset && (
          <Button
            variant="outline"
            onClick={onReset}
            disabled={loading}
            icon={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            }
          >
            {resetButtonLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
