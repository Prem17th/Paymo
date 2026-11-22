import React from 'react';
import { usePaymo } from '../context/PaymoContext';
import { X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = usePaymo();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full px-4 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-black border border-white p-3 shadow-none flex items-start justify-between gap-3 text-white text-xs font-mono"
        >
          <div className="flex items-start gap-2">
            <span className="font-bold">
              {toast.type === 'success' ? '[OK]' : toast.type === 'warn' ? '[NOTE]' : '[INFO]'}
            </span>
            <span className="leading-tight">{toast.message}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-neutral-400 hover:text-white p-0.5 focus:outline-none"
            aria-label="Dismiss toast"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
