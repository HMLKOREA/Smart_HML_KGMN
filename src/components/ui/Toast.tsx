'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface ToastOptions {
  title?: string;
  duration?: number;
}

export interface ToastContextValue {
  toasts: ToastMessage[];
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

// ─── Context ────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// ─── Provider ───────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const id = `toast-${++counterRef.current}-${Date.now()}`;
      const toast: ToastMessage = {
        id,
        type,
        message,
        title: options?.title,
        duration: options?.duration ?? DEFAULT_DURATION,
      };

      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), toast]);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const success = useCallback((msg: string, opts?: ToastOptions) => addToast('success', msg, opts), [addToast]);
  const error = useCallback((msg: string, opts?: ToastOptions) => addToast('error', msg, opts), [addToast]);
  const warning = useCallback((msg: string, opts?: ToastOptions) => addToast('warning', msg, opts), [addToast]);
  const info = useCallback((msg: string, opts?: ToastOptions) => addToast('info', msg, opts), [addToast]);

  const value: ToastContextValue = useMemo(() => ({
    toasts,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  }), [toasts, success, error, warning, info, dismiss, dismissAll]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Toast Container ────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ─── Individual Toast ───────────────────────────────────────────────────────

const typeConfig: Record<
  ToastType,
  { bg: string; border: string; icon: React.ReactNode; titleColor: string }
> = {
  success: {
    bg: 'bg-white',
    border: 'border-green-500',
    titleColor: 'text-green-700',
    icon: (
      <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-white',
    border: 'border-red-500',
    titleColor: 'text-red-700',
    icon: (
      <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-white',
    border: 'border-yellow-500',
    titleColor: 'text-yellow-700',
    icon: (
      <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    ),
  },
  info: {
    bg: 'bg-white',
    border: 'border-blue-500',
    titleColor: 'text-blue-700',
    icon: (
      <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;

    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, toast.duration);

    const removeTimer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration + 300);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const config = typeConfig[toast.type];

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  return (
    <div
      className={[
        'flex w-80 items-start gap-3 rounded-lg border-l-4 p-4 shadow-lg transition-all duration-300',
        config.bg,
        config.border,
        isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100',
      ].join(' ')}
      role="alert"
    >
      <div className="shrink-0 pt-0.5">{config.icon}</div>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className={`text-sm font-semibold ${config.titleColor}`}>
            {toast.title}
          </p>
        )}
        <p className="text-sm text-gray-700">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="닫기"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

export default ToastProvider;
