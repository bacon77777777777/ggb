'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';

interface WinningRecord {
  id: number;
  user_name: string;
  product_name: string;
  prize_level: string;
  prize_name: string;
}

export default function WinningMarquee() {
  const [records, setRecords] = useState<WinningRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      const res = await fetch('/api/winning-records', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      const next = Array.isArray(json?.records) ? (json.records as WinningRecord[]) : [];
      setRecords(next);
    };

    fetchRecords();
    const interval = setInterval(() => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        fetchRecords();
      }, 250);
    }, 30000);

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (records.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % records.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [records.length]);

  const hasRecords = records.length > 0;
  const currentRecord = hasRecords ? records[currentIndex] : null;

  return (
    <div className="h-[32px] bg-primary/5 px-3 flex items-center gap-2 overflow-hidden -mx-2 sm:mx-0">
      <div className="flex-shrink-0 bg-primary text-white px-1.5 py-1 rounded-full">
        <Trophy className="w-3 h-3 stroke-[3]" />
      </div>
      <div className="flex-1 overflow-hidden relative h-full flex items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={hasRecords && currentRecord ? currentRecord.id : 'winning-marquee-placeholder'}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute w-full truncate text-[12px] text-neutral-700 dark:text-neutral-300 font-medium"
          >
            {hasRecords && currentRecord ? (
              <>
                太神啦！<span className="text-primary font-black mx-0.5">{currentRecord.user_name}</span>
                抽到<span className="text-primary font-black mx-0.5">
                  {currentRecord.prize_level}賞 {currentRecord.prize_name}
                </span>
              </>
            ) : (
              <span className="font-black text-primary">
                日本超夯一番賞同步上線
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
