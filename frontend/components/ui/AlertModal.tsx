'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertVariant = 'default' | 'confirm';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  variant?: AlertVariant;
  // Confirm props
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  isLoading?: boolean;
}

export function AlertModal({ 
  isOpen, 
  onClose, 
  title, 
  description,
  children, 
  className,
  variant = 'default',
  onConfirm,
  confirmText = '確認',
  cancelText = '取消',
  confirmButtonClass,
  isLoading = false
}: AlertModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-center items-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "relative z-10 bg-white dark:bg-neutral-900 w-[320px] rounded-2xl shadow-2xl flex flex-col",
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {variant === 'default' && (
              /* Header for Default Variant */
              <div className="h-[50px] flex items-center justify-between px-4 border-b border-neutral-100 dark:border-neutral-800 shrink-0 relative">
                <div className="absolute left-0 right-0 text-center pointer-events-none">
                  <h2 className="text-[17px] font-bold text-neutral-900 dark:text-white">{title}</h2>
                </div>
                <div className="w-8" /> {/* Spacer */}
                <button 
                  onClick={onClose} 
                  className="w-8 flex justify-end text-neutral-500 z-10 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Content */}
            <div className={cn("p-4", variant === 'confirm' && "text-center")}>
              {variant === 'confirm' && title && (
                 <h2 className="text-[18px] font-bold text-neutral-900 dark:text-white mb-3 pt-4">{title}</h2>
              )}
              
              {description && (
                <p className={cn(
                  "text-neutral-500 dark:text-neutral-400 text-[15px] leading-relaxed",
                  variant === 'confirm' ? "mb-8 px-2" : "mb-4"
                )}>
                  {description}
                </p>
              )}

              {children}

              {variant === 'confirm' && (
                <div className="flex items-center gap-3 mt-4">
                   <button
                    onClick={onClose}
                    className="flex-1 h-[44px] rounded-lg font-bold text-[15px] text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                   >
                     {cancelText}
                   </button>
                   <button
                    onClick={onConfirm}
                    disabled={isLoading}
                    className={cn(
                      "flex-1 h-[44px] rounded-lg font-bold text-[15px] text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2",
                      confirmButtonClass || "bg-primary shadow-primary/20"
                    )}
                   >
                     {isLoading ? (
                       <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                     ) : confirmText}
                   </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
