import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  toastHistory: Toast[];
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  toastHistory: [],
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeToast, setActiveToast] = useState<Toast | null>(null);
  const [toastHistory, setToastHistory] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const newToast: Toast = { ...toast, id: Date.now().toString() };
    setActiveToast(newToast);
    setToastHistory(prev => [newToast, ...prev].slice(0, 20));
  }, []);

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    if (!activeToast) return;
    const t = setTimeout(() => setActiveToast(null), 4000);
    return () => clearTimeout(t);
  }, [activeToast]);

  return (
    <ToastContext.Provider value={{ showToast, toastHistory }}>
      {children}
      {/* Toast Notification */}
      {activeToast && (
        <div
          className={cn(
            'fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-md border text-sm font-medium z-50',
            'animate-slide-in-up flex items-center gap-3 max-w-sm',
            activeToast.type === 'success' && 'bg-white border-emerald-200 text-emerald-700',
            activeToast.type === 'error' && 'bg-white border-red-200 text-red-700',
            activeToast.type === 'info' && 'bg-white border-blue-200 text-blue-700',
            activeToast.type === 'warning' && 'bg-white border-amber-200 text-amber-700',
          )}
        >
          <div className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            activeToast.type === 'success' && 'bg-emerald-500',
            activeToast.type === 'error' && 'bg-red-500',
            activeToast.type === 'info' && 'bg-blue-500',
            activeToast.type === 'warning' && 'bg-amber-500',
          )} />
          <span className="flex-1">{activeToast.message}</span>
          {activeToast.action && (
            <button
              onClick={() => { activeToast.action!.onClick(); setActiveToast(null); }}
              className="text-caption font-semibold underline underline-offset-2 hover:opacity-80 flex-shrink-0"
            >
              {activeToast.action.label}
            </button>
          )}
          <button
            onClick={() => setActiveToast(null)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
};
