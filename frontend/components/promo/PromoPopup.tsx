'use client';

/**
 * 首頁彈窗 —— 進站後蓋一層，卡片下方一個獨立的關閉鈕
 *
 * 版型比照常見的活動彈窗（卡片 + 卡片外的圓形叉叉），
 * 叉叉刻意放在卡片外面而不是右上角：放右上角時 CTA 與關閉太靠近，
 * 手機單手操作誤觸率高，玩家會覺得被騙點。
 *
 * 延遲一拍再出現，避免和首頁本身的載入動畫疊在一起閃。
 *
 * 有多則上架時排隊顯示：關掉一則後接著跳下一則，依 sort_order 排序。
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePromos, type SitePromo } from './usePromos';
import { dismiss } from '@/lib/promoDismiss';

const APPEAR_DELAY_MS = 700;   // 首則：等首頁載入動畫跑完
const NEXT_DELAY_MS   = 260;   // 後續：讓上一則退場後再進場，不要疊在一起
const EXIT_MS         = 220;   // 與退場動畫時間相當

export default function PromoPopup({ placement = 'home' }: { placement?: string }) {
  const { promos, isLoaded } = usePromos(placement);
  const [closedIds, setClosedIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<SitePromo | null>(null);
  const [visible, setVisible] = useState(false);

  const shownOnceRef = useRef(false);

  // 挑下一則。
  // 「正在顯示的那則」存成 state 而不是每次從 promos 取第一筆：
  // 關閉會寫 localStorage 並觸發 usePromos 重新過濾，promos 會當場少一筆，
  // 直接取第一筆的話退場動畫還沒跑完，卡片內容就先被換成下一則了。
  useEffect(() => {
    if (!isLoaded || current) return;
    const next = promos.find(p => !closedIds.includes(p.id));
    if (next) setCurrent(next);
  }, [isLoaded, promos, closedIds, current]);

  // 進場延遲。刻意與上面拆開且只相依 current：
  // 兩件事寫在同一個 effect 時，setCurrent 會讓 effect 重跑並執行 cleanup，
  // 把還沒觸發的計時器清掉，結果彈窗永遠不會顯示。
  useEffect(() => {
    if (!current) return;
    const delay = shownOnceRef.current ? NEXT_DELAY_MS : APPEAR_DELAY_MS;
    const t = setTimeout(() => { shownOnceRef.current = true; setVisible(true); }, delay);
    return () => clearTimeout(t);
  }, [current]);

  const promo = current;
  if (!promo) return null;

  // 沒圖就退回卡片版，否則會彈出一個全空的彈窗
  const isImageOnly = promo.layout === 'image' && !!promo.image_url;

  const close = () => {
    setVisible(false);
    dismiss(promo.id, promo.dismiss_mode);
    const id = promo.id;
    setTimeout(() => {
      setClosedIds(prev => [...prev, id]);
      setCurrent(null);          // 讓上面的 effect 接手挑下一則
    }, EXIT_MS);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center px-8 bg-black/60 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-testid="promo-popup"
        >
          <motion.div
            className={`w-full max-w-[330px] rounded-3xl overflow-hidden shadow-2xl ${
              isImageOnly ? '' : 'bg-white dark:bg-neutral-900'
            }`}
            initial={{ scale: 0.88, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            {/* 純圖片版：文案已經畫在圖裡，整張圖就是按鈕，比例由圖片自己決定 */}
            {isImageOnly ? (
              <Link href={promo.cta_href || '#'} onClick={close} className="block">
                <img
                  src={promo.image_url!}
                  alt={promo.body}
                  className="w-full h-auto block"
                />
              </Link>
            ) : (
              <>
            {promo.image_url && (
              /* 圖片本身也是入口——主視覺比按鈕更容易被點，只讓按鈕可點會浪費這個面積 */
              <Link
                href={promo.cta_href || '#'}
                onClick={close}
                className="relative block w-full aspect-[4/3] bg-neutral-100 dark:bg-neutral-800"
              >
                <Image src={promo.image_url} alt="" fill className="object-cover" unoptimized />
              </Link>
            )}

            <div className="px-6 pt-6 pb-5">
              {promo.title && (
                <h2 className="text-[19px] font-black leading-[1.35] text-neutral-900 dark:text-neutral-50 text-balance">
                  {promo.title}
                </h2>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300 whitespace-pre-line">
                {promo.body}
              </p>

              {promo.cta_href && promo.cta_text && (
                <Link
                  href={promo.cta_href}
                  onClick={close}
                  className="mt-5 flex items-center justify-center w-full h-12 rounded-full bg-primary text-white text-[15px] font-black shadow-lg active:scale-[0.98] transition-transform"
                >
                  {promo.cta_text}
                </Link>
              )}
            </div>
              </>
            )}
          </motion.div>

          <button
            type="button"
            onClick={close}
            aria-label="關閉"
            className="mt-6 w-10 h-10 rounded-full border border-white/50 flex items-center justify-center text-white/90 active:scale-95 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
