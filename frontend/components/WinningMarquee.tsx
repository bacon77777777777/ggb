'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import dynamic from 'next/dynamic';

const PlayerProfileCard = dynamic(() => import('@/components/ranking/PlayerProfileCard'), { ssr: false });

interface WinningRecord {
  id: number;
  user_id?: string | null;
  user_name: string;
  product_name: string;
  prize_level: string;
  prize_name: string;
}

export default function WinningMarquee() {
  const [records, setRecords] = useState<WinningRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedNickname, setSelectedNickname] = useState('');

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

  const handleNameClick = () => {
    if (!currentRecord?.user_id) return;
    setSelectedUserId(currentRecord.user_id);
    setSelectedNickname(currentRecord.user_name);
  };

  return (
    <>
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
                  🎊&nbsp;
                  <span
                    className={currentRecord.user_id ? 'text-primary font-black mx-0.5 cursor-pointer underline underline-offset-2' : 'text-primary font-black mx-0.5'}
                    onClick={handleNameClick}
                  >
                    {currentRecord.user_name}
                  </span>
                  從&nbsp;<span className="font-black text-neutral-800 dark:text-neutral-200">{currentRecord.product_name}</span>&nbsp;抽到&nbsp;<span className="text-primary font-black">{currentRecord.prize_name}</span>！
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

      {selectedUserId && (
        <PlayerProfileCard
          userId={selectedUserId}
          nickname={selectedNickname}
          onWorship={() => {}}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </>
  );
}
