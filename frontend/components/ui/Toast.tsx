
'use client';
 
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'plain';

interface Toast {
  id: string;
  message: React.ReactNode;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: React.ReactNode, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: React.ReactNode, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted && createPortal(
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-20 md:right-4 md:left-auto md:translate-x-0 md:translate-y-0 z-[100] flex flex-col gap-3 pointer-events-none items-center md:items-end">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200",
                "bg-neutral-900/90 backdrop-blur text-white px-4 py-4 rounded-xl shadow-lg border-none min-w-[200px] max-w-[80vw]",
                "md:bg-white md:text-neutral-900 md:min-w-[260px] md:p-5 md:rounded-2xl md:shadow-modal md:border md:border-neutral-100 md:slide-in-from-top-4 md:duration-300",
                toast.type === 'success' && "md:text-accent-emerald",
                toast.type === 'error' && "md:text-accent-red",
                toast.type === 'info' && "md:text-primary"
              )}
            >
              <p className="text-sm font-black text-center">{toast.message}</p>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
