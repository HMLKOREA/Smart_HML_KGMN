'use client';

import React from 'react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Confirm handler */
  onConfirm: () => void;
  /** Dialog title */
  title?: string;
  /** Description / question text */
  message: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Variant controls the confirm button styling */
  variant?: 'danger' | 'primary';
  /** Whether the confirm action is loading */
  loading?: boolean;
  /** Icon to display above the message */
  icon?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = '확인',
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'danger',
  loading = false,
  icon,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      confirmVariant={variant}
      confirmLoading={loading}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        {icon ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            {icon}
          </div>
        ) : variant === 'danger' ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <svg
              className="h-6 w-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        )}
        <p className="text-sm text-gray-600 whitespace-pre-line">{message}</p>
      </div>
    </Modal>
  );
}

/** Convenience wrapper for delete confirmations */
export interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** The name of the item being deleted */
  itemName?: string;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  itemName,
  loading = false,
}: DeleteConfirmDialogProps) {
  const message = itemName
    ? `"${itemName}"을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
    : '선택한 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.';

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="삭제 확인"
      message={message}
      confirmLabel="삭제"
      variant="danger"
      loading={loading}
    />
  );
}

export default ConfirmDialog;
