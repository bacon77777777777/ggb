import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Prize } from '@/components/GachaMachine';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import PrizeDetailSheet from '@/components/ui/PrizeDetailSheet';
import { gradeStyle } from '@/lib/prizeGrade';

/**
 * 中獎結果彈窗（全站共用：轉蛋／盒玩／一番賞／自製賞）
 *
 * 一律條列捲動（老闆指定，含單抽）—— 原本是左右箭頭一個一個翻，
 * 十連要點九次才看得完。條列一眼看完全部；想看大圖點那一列，
 * 開的是總覽同一個全螢幕 PrizeDetailSheet（大圖＋賞等＋品名），
 * 不在彈窗內換頁。
 */

interface GachaResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: Prize[];
}

const ITEM_DEFAULT_IMG = '/images/item_defaulet.png';

function prizeImage(p: Prize, failed: boolean): string {
  if (failed) return ITEM_DEFAULT_IMG;
  return p.image_url || `/images/item/${(p.id ?? '').toString().padStart(5, '0')}.jpg`;
}

export function GachaResultModal({ isOpen, onClose, results }: GachaResultModalProps) {
  /** 被點開看大圖的那一項（走總覽同一個全螢幕 sheet） */
  const [detail, setDetail] = useState<Prize | null>(null);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const resultSoundRef = React.useRef<HTMLAudioElement | null>(null);

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
    if (!isOpen) { setDetail(null); setFailedIds({}); }
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
              <h3 className="mb-4 text-center text-base font-black tracking-tight text-neutral-900 dark:text-white">
                恭喜獲得 <span className="text-accent-red">{results.length}</span> 項
              </h3>

              {/* 條列（可捲動）：小圖 ＋ 賞等 ＋ 名稱，點一列開全螢幕大圖。
                  高度固定（不是 max-h）—— 老闆指定彈窗大小不隨抽數變，
                  抽 1 次跟抽 10 次一樣高，位置不會跳 */}
              <div className="mb-4 h-[46vh] space-y-1.5 overflow-y-auto pr-0.5">
                {results.map((p, i) => {
                  const g = p.grade || p.rarity;
                  const gs = gradeStyle(g);
                  return (
                    <button
                      key={`${p.id ?? 'x'}-${i}`}
                      type="button"
                      onClick={() => setDetail(p)}
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

              <Button
                onClick={onClose}
                size="lg"
                className="h-[40px] w-full rounded-[8px] px-6 text-[15px] font-semibold text-white shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90"
              >
                確定
              </Button>
            </div>
          </motion.div>

          {/* 大圖走總覽同一個元件：全螢幕黑遮罩 ＋ 大圖 ＋ 賞等 ＋ 品名 */}
          <PrizeDetailSheet
            zIndex={3100}
            prize={detail ? {
              name: detail.name,
              image_url: detail.image_url ?? null,
              level: detail.grade || detail.rarity || null,
            } : null}
            onClose={() => setDetail(null)}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
