'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

/**
 * 全站統一的小型對話彈窗（老闆 2026-09-02：「做完整這樣的彈窗通用元件，然後統一」）。
 *
 * 手機＝黑遮罩＋底部滑上來的圓角面板（跟結帳、地址的編輯／移除同一套動線），
 * 桌機＝置中卡片（跟購買確認桌機版同款）。高度隨內容，內容多時面板內捲動；
 * 底部自帶安全區（App 殼沒有網址列，home indicator 那段要自己留）。
 *
 * 開著時鎖 html+body 捲動 —— iOS 只鎖 body 會被捲動鏈繞過去。
 */
export function BottomModal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      window.removeEventListener('keydown', esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[120] touch-none"
          />
          <motion.div
            initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
            animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'fixed z-[121] bg-white dark:bg-[#1a1b1e] flex flex-col max-h-[85vh] overflow-hidden',
              isDesktop
                ? 'inset-0 m-auto w-[480px] h-fit rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl'
                : 'left-0 right-0 bottom-0 rounded-t-2xl border-t border-neutral-200 dark:border-white/10'
            )}
          >
            <div className="flex justify-between items-center border-b border-neutral-100 dark:border-neutral-800 px-4 py-3 shrink-0">
              <h3 className="font-black text-base text-neutral-900 dark:text-white">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 -mr-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-transform"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className={cn(
              'flex-1 overflow-y-auto overscroll-contain px-4 pt-4',
              isDesktop ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+16px)]'
            )}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default BottomModal;
