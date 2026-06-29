'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  rules: string[];
}

export default function RulesModal({ isOpen, onClose, title = '活動規則', rules }: RulesModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-modal z-10 flex flex-col items-center text-center p-6"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Title */}
            <h3 className="text-base font-black text-neutral-900 dark:text-white mb-6 tracking-tight mt-2">
              {title}
            </h3>

            {/* Rules List */}
            <div className="w-full text-left space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar px-2 mb-6">
              {rules.map((rule, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-black mt-0.5">
                    {index + 1}
                  </div>
                  <p className="text-[14px] text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">
                    {rule}
                  </p>
                </div>
              ))}
            </div>

            {/* Confirm Button */}
            <button
              onClick={onClose}
              className="w-full rounded-[8px] h-[40px] px-6 text-[15px] font-semibold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 text-white transition-all active:scale-95"
            >
              我知道了
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
