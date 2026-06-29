
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
}

export function Modal({ isOpen, onClose, title, children, className, hideClose }: ModalProps) {
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
          "relative z-10 w-full max-w-lg bg-white dark:bg-neutral-900 rounded-lg shadow-xl animate-in zoom-in-95 duration-200 border border-neutral-100 dark:border-neutral-800",
          className
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h3>
          {!hideClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-4 sm:p-5 text-neutral-900 dark:text-neutral-50">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
