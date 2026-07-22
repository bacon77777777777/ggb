'use client'

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  hideClose?: boolean;
  /** AlertModal 相容模式：320px 窄框、圓角 2xl、標題置中 */
  compact?: boolean;
}

export function Modal({ isOpen, onClose, title, children, className, hideClose, compact }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hideClose) onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    } else {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, hideClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={overlayRef}
        className="absolute inset-0"
        onClick={() => !hideClose && onClose()}
      />
      <div
        className={cn(
          'relative z-10 bg-white dark:bg-neutral-900 shadow-xl animate-in zoom-in-95 duration-200 border border-neutral-100 dark:border-neutral-800',
          compact
            ? 'w-full max-w-[320px] rounded-2xl'
            : 'w-full max-w-lg rounded-xl',
          className
        )}
      >
        {/* Header */}
        {title && (
          compact ? (
            <div className="h-[50px] flex items-center justify-between px-4 border-b border-neutral-100 dark:border-neutral-800 shrink-0 relative">
              <div className="absolute inset-x-0 text-center pointer-events-none">
                <h2 className="text-[17px] font-bold text-neutral-900 dark:text-white">{title}</h2>
              </div>
              <div className="w-8" />
              {!hideClose && (
                <button
                  onClick={onClose}
                  className="w-8 flex justify-end text-neutral-400 z-10 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{title}</h3>
              {!hideClose && (
                <button
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )
        )}
        {/* Content */}
        <div className={cn('text-neutral-900 dark:text-neutral-50', compact ? 'p-4' : 'p-4 sm:p-5')}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
