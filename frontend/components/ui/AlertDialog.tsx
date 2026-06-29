'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import Button from './Button';

type AlertType = 'success' | 'error' | 'info' | 'confirm';

interface AlertOptions {
  title?: string;
  message: ReactNode;
  type?: AlertType;
  variant?: 'default' | 'danger';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertOptions | null>(null);

  const showAlert = useCallback((options: AlertOptions) => {
    setAlert(options);
  }, []);

  const hideAlert = useCallback(() => {
    setAlert(null);
  }, []);

  const handleConfirm = () => {
    alert?.onConfirm?.();
    hideAlert();
  };

  const handleCancel = () => {
    alert?.onCancel?.();
    hideAlert();
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AnimatePresence>
        {alert && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={alert.type !== 'confirm' ? hideAlert : undefined}
            />

            {/* Alert Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "relative w-full max-w-sm overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-modal z-10",
                "flex flex-col items-center text-center p-6"
              )}
            >
              {/* Icon Section */}
            {alert.type !== 'confirm' && (
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-4",
                alert.type === 'success' && "bg-accent-emerald/10 text-accent-emerald",
                alert.type === 'error' && "bg-accent-red/10 text-accent-red",
                alert.type === 'info' && "bg-primary/10 text-primary",
                !alert.type && "bg-primary/10 text-primary"
              )}>
                {alert.type === 'success' && <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />}
                {alert.type === 'error' && <AlertCircle className="w-8 h-8 stroke-[2.5]" />}
                {alert.type === 'info' && <Info className="w-8 h-8 stroke-[2.5]" />}
                {!alert.type && <Info className="w-8 h-8 stroke-[2.5]" />}
              </div>
            )}

              {/* Text Section */}
              {alert.title && (
                <h3 className={cn(
                  "text-base font-black text-neutral-900 dark:text-white mb-2 tracking-tight",
                  alert.type === 'confirm' && "mt-2"
                )}>
                  {alert.title}
                </h3>
              )}
              <div className="text-neutral-500 dark:text-neutral-400 font-medium text-[16px] leading-[1.5] mb-6 w-full px-2">
                {alert.message}
              </div>

              {/* Action Section */}
              <div className="flex items-center gap-3 w-full">
                {alert.type === 'confirm' && (
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-0 h-[40px] px-6 rounded-[8px] text-[15px] font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all active:scale-95 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
                  >
                    {alert.cancelText || '取消'}
                  </button>
                )}
                <Button
                  onClick={handleConfirm}
                  size="lg"
                  className={cn(
                    "flex-1 rounded-[8px] h-[40px] px-6 text-[15px] font-semibold",
                    (alert.type === 'error' || alert.variant === 'danger')
                      ? "bg-accent-red hover:bg-accent-red/90 shadow-xl shadow-accent-red/20 text-white" 
                      : "bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 text-white"
                  )}
                >
                  {alert.confirmText || '確定'}
                </Button>
              </div>

              {/* Close Button (only for non-confirm alerts) */}
              {alert.type !== 'confirm' && (
                <button
                  onClick={hideAlert}
                  className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AlertContext.Provider>
  );
}

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
