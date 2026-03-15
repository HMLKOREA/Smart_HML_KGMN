'use client';

import React, { forwardRef, useId } from 'react';

export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  containerClassName?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      containerClassName = '',
      className = '',
      id: providedId,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId ?? generatedId;

    return (
      <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          type="date"
          disabled={disabled}
          className={[
            'w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 transition-colors',
            'outline-none',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
            disabled ? 'cursor-not-allowed bg-gray-50 opacity-60' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${id}-error`} className="text-xs text-red-500">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${id}-helper`} className="text-xs text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';

/** Convenience wrapper for date range selection using two DatePicker inputs */
export interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  startLabel?: string;
  endLabel?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = '시작일',
  endLabel = '종료일',
  error,
  disabled,
  required,
  className = '',
}: DateRangePickerProps) {
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <DatePicker
        label={startLabel}
        value={startDate}
        onChange={(e) => onStartDateChange(e.target.value)}
        max={endDate || undefined}
        disabled={disabled}
        required={required}
        error={error}
      />
      <span className="pb-2.5 text-sm text-gray-500">~</span>
      <DatePicker
        label={endLabel}
        value={endDate}
        onChange={(e) => onEndDateChange(e.target.value)}
        min={startDate || undefined}
        disabled={disabled}
        required={required}
      />
    </div>
  );
}

export default DatePicker;
