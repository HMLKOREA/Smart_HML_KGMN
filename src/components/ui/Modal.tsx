'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { Button } from './Button';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: ModalSize;
  /** Label for confirm button. Pass null to hide. */
  confirmLabel?: string | null;
  /** Label for cancel button. Pass null to hide. */
  cancelLabel?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  confirmVariant?: 'primary' | 'danger';
  /** Hide the default footer buttons entirely */
  hideFooter?: boolean;
  /** Custom footer content */
  footer?: React.ReactNode;
  /** Whether clicking overlay closes the modal */
  closeOnOverlayClick?: boolean;
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean;
  className?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
  confirmLoading = false,
  confirmDisabled = false,
  confirmVariant = 'primary',
  hideFooter = false,
  footer,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [open, handleEscape]);

  // Focus trap: focus the panel when opened
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === overlayRef.current) {
      onClose();
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={[
          'relative w-full rounded-lg bg-white shadow-xl outline-none',
          'animate-in fade-in zoom-in-95 duration-200',
          sizeClasses[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
            <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-gray-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors"
              aria-label="닫기"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 max-h-[70vh] overflow-y-auto">{children}</div>

        {/* Footer */}
        {!hideFooter && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
            {footer ?? (
              <>
                {cancelLabel !== null && (
                  <Button variant="outline" onClick={handleCancel}>
                    {cancelLabel}
                  </Button>
                )}
                {confirmLabel !== null && onConfirm && (
                  <Button
                    variant={confirmVariant}
                    onClick={onConfirm}
                    loading={confirmLoading}
                    disabled={confirmDisabled}
                  >
                    {confirmLabel}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
