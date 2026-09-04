'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone } from 'lucide-react';
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

/**
 * `size="desktop"`：電腦端首頁用（老闆 2026-09-04：桌機上字太小太細、比例怪）——
 * 40px 高、14px 字、名字與獎品同樣粗同樣紅、不畫底線（滑過才出現）。預設維持手機那份，一字不動。
 */
export default function WinningMarquee({ size = 'default' }: { size?: 'default' | 'desktop' } = {}) {
  const desktop = size === 'desktop';
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
      <div className={desktop
        ? 'h-10 bg-primary/5 px-4 flex items-center gap-3 overflow-hidden rounded-lg'
        : 'h-[32px] bg-primary/5 px-3 flex items-center gap-2 overflow-hidden -mx-2 sm:mx-0'}>
        <div className={desktop
          ? 'flex-shrink-0 bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center'
          : 'flex-shrink-0 bg-primary text-white px-1.5 py-1 rounded-full'}>
          <Megaphone className={desktop ? 'w-3.5 h-3.5 stroke-[2.5]' : 'w-3 h-3 stroke-[2.5]'} />
        </div>
        <div className="flex-1 overflow-hidden relative h-full flex items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={hasRecords && currentRecord ? currentRecord.id : 'winning-marquee-placeholder'}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={desktop
                ? 'absolute w-full truncate text-[14px] leading-none text-neutral-700 dark:text-neutral-300 font-bold'
                : 'absolute w-full truncate text-[12px] text-neutral-700 dark:text-neutral-300 font-medium'}
            >
              {hasRecords && currentRecord ? (
                <>
                  <span
                    className={desktop
                      ? (currentRecord.user_id ? 'text-primary font-black cursor-pointer hover:underline underline-offset-2' : 'text-primary font-black')
                      : (currentRecord.user_id ? 'text-primary font-black cursor-pointer underline underline-offset-2' : 'text-primary font-black')}
                    onClick={handleNameClick}
                  >
                    {currentRecord.user_name}
                  </span>
                  {desktop ? ' 抽到 ' : '抽到'}<span className={desktop ? 'text-primary font-black' : 'text-primary/80'}>{currentRecord.prize_name || currentRecord.product_name}</span>
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
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </>
  );
}
