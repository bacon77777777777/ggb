import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Prize } from '@/components/GachaMachine';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import { ChevronLeft } from 'lucide-react';

/**
 * 中獎結果彈窗（全站共用：轉蛋／盒玩／一番賞／自製賞）
 *
 * 抽多次時改成條列捲動（老闆指定）—— 原本是左右箭頭一個一個翻，
 * 十連要點九次才看得完，還記不住剛剛翻過什麼。條列一眼看完全部，
 * 想看大圖再點那一列。抽一次就直接顯示大圖，不用多一層列表。
 */

interface GachaResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: Prize[];
}

const ITEM_DEFAULT_IMG = '/images/item_defaulet.png';

/** 賞等膠囊配色：越大的賞越暖越搶眼，一眼看得出輕重 */
function gradeStyle(grade?: string): { bg: string; text: string } {
  const g = String(grade ?? '').trim();
  if (!g) return { bg: 'bg-neutral-100', text: 'text-neutral-500' };
  if (/最後賞|last\s*one/i.test(g)) return { bg: 'bg-purple-100', text: 'text-purple-700' };
  if (/隱藏/.test(g)) return { bg: 'bg-violet-100', text: 'text-violet-700' };
  if (/^A|SSR|SP/i.test(g)) return { bg: 'bg-red-100', text: 'text-red-700' };
  if (/^B|SR/i.test(g)) return { bg: 'bg-orange-100', text: 'text-orange-700' };
  if (/^C/i.test(g)) return { bg: 'bg-amber-100', text: 'text-amber-700' };
  if (/^D/i.test(g)) return { bg: 'bg-green-100', text: 'text-green-700' };
  if (/^E/i.test(g)) return { bg: 'bg-sky-100', text: 'text-sky-700' };
  return { bg: 'bg-neutral-100', text: 'text-neutral-500' };
}

function prizeImage(p: Prize, failed: boolean): string {
  if (failed) return ITEM_DEFAULT_IMG;
  return p.image_url || `/images/item/${(p.id ?? '').toString().padStart(5, '0')}.jpg`;
}

export function GachaResultModal({ isOpen, onClose, results }: GachaResultModalProps) {
  /** null = 顯示列表；數字 = 顯示該筆大圖。只有一筆時直接看大圖 */
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const resultSoundRef = React.useRef<HTMLAudioElement | null>(null);

  const single = results.length === 1;
  const activeIndex = single ? 0 : detailIndex;
  const activePrize = activeIndex === null ? null : results[activeIndex];

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/audio/getpopup.mp3');
    audio.preload = 'auto';
    resultSoundRef.current = audio;
    return () => {
      if (resultSoundRef.current) {
        resultSoundRef.current.pause();
        resultSoundRef.current.src = '';
        resultSoundRef.current.load();
      }
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const audio = resultSoundRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) { setDetailIndex(null); setFailedIds({}); }
  }, [isOpen]);

  const markFailed = (key: string) => setFailedIds(prev => ({ ...prev, [key]: true }));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div
              className={cn(
                'relative flex w-full flex-col overflow-hidden rounded-3xl border border-neutral-100 bg-white px-3.5 py-5 shadow-modal',
                'dark:border-neutral-800 dark:bg-neutral-900',
              )}
            >
              {/* 標題列：看大圖時左邊給返回，抽一次沒有列表可返回 */}
              <div className="relative mb-4 flex items-center justify-center">
                {activePrize && !single && (
                  <button
                    type="button"
                    onClick={() => setDetailIndex(null)}
                    className="absolute left-0 flex items-center justify-center rounded-full p-1 transition-transform hover:bg-neutral-100 active:scale-95 dark:hover:bg-neutral-800"
                    aria-label="回到列表"
                  >
                    <ChevronLeft className="h-5 w-5 text-neutral-500 dark:text-neutral-300" />
                  </button>
                )}
                <h3 className="text-base font-black tracking-tight text-neutral-900 dark:text-white">
                  {activePrize ? '恭喜獲得' : (
                    <>
                      恭喜獲得 <span className="text-accent-red">{results.length}</span> 項
                    </>
                  )}
                </h3>
              </div>

              {activePrize ? (
                /* ── 大圖 ── */
                <motion.div
                  key={activePrize.id ?? activeIndex}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className="flex flex-col items-center"
                >
                  <div className="mb-3 flex h-auto w-44 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-800">
                    <Image
                      src={prizeImage(activePrize, !!failedIds[`d${activeIndex}`])}
                      alt={activePrize.name}
                      width={176}
                      height={176}
                      className="h-auto w-full object-contain"
                      unoptimized
                      onError={() => markFailed(`d${activeIndex}`)}
                    />
                  </div>
                  {(activePrize.grade || activePrize.rarity) && (
                    <span
                      className={cn(
                        'mb-2 rounded-lg px-2.5 py-1 text-xs font-black',
                        gradeStyle(activePrize.grade || activePrize.rarity).bg,
                        gradeStyle(activePrize.grade || activePrize.rarity).text,
                      )}
                    >
                      {activePrize.grade || activePrize.rarity}
                    </span>
                  )}
                  <p className="mb-5 px-2 text-center text-[16px] font-bold text-neutral-900 dark:text-white">
                    {activePrize.name}
                  </p>
                </motion.div>
              ) : (
                /* ── 條列（可捲動）：小圖 ＋ 賞等 ＋ 名稱，點一列看大圖 ── */
                <div className="mb-4 max-h-[46vh] space-y-1.5 overflow-y-auto pr-0.5">
                  {results.map((p, i) => {
                    const g = p.grade || p.rarity;
                    const gs = gradeStyle(g);
                    return (
                      <button
                        key={`${p.id ?? 'x'}-${i}`}
                        type="button"
                        onClick={() => setDetailIndex(i)}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-neutral-100 bg-neutral-50 p-1.5 text-left transition-colors hover:bg-neutral-100 active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800"
                      >
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-neutral-900">
                          <Image
                            src={prizeImage(p, !!failedIds[`l${i}`])}
                            alt={p.name}
                            width={36}
                            height={36}
                            className="h-full w-full object-contain"
                            unoptimized
                            onError={() => markFailed(`l${i}`)}
                          />
                        </div>
                        {g && (
                          <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black', gs.bg, gs.text)}>
                            {g}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-neutral-900 dark:text-white">
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <Button
                onClick={onClose}
                size="lg"
                className="h-[40px] w-full rounded-[8px] px-6 text-[15px] font-semibold text-white shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90"
              >
                確定
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
