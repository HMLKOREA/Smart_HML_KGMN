'use client';

import React, { forwardRef, useId } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      prefix,
      suffix,
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
        <div
          className={[
            'flex items-center rounded-md border bg-white transition-colors',
            error
              ? 'border-red-500 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500'
              : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
            disabled ? 'cursor-not-allowed bg-gray-50 opacity-60' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {prefix && (
            <span className="flex shrink-0 items-center pl-3 text-gray-500">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            className={[
              'w-full rounded-md bg-transparent px-3 py-2 text-sm text-gray-900 placeholder-gray-400',
              'outline-none',
              prefix ? 'pl-2' : '',
              suffix ? 'pr-2' : '',
              disabled ? 'cursor-not-allowed' : '',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
            {...props}
          />
          {suffix && (
            <span className="flex shrink-0 items-center pr-3 text-gray-500">
              {suffix}
            </span>
          )}
        </div>
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

Input.displayName = 'Input';

export default Input;
