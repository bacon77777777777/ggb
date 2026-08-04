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

/** 卡片版的統一模板底圖（含外框、緞帶、喇叭與按鈕），版位百分比由此圖量測而來 */
const TEMPLATE_BG = '/images/bg.png';

const APPEAR_DELAY_MS = 700;   // 首則：等首頁載入動畫跑完
const NEXT_DELAY_MS   = 260;   // 後續：讓上一則退場後再進場，不要疊在一起
const EXIT_MS         = 220;   // 與退場動畫時間相當

export default function PromoPopup({ placement = 'home' }: { placement?: string }) {
  const { promos, rules, isLoaded } = usePromos(placement);
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
    dismiss(promo.id, rules.dismissMode);
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
            className={`w-full max-w-[330px] ${isImageOnly ? 'rounded-3xl overflow-hidden shadow-2xl' : ''}`}
            initial={{ scale: 0.88, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            {/* 純圖片版：文案已經畫在圖裡，整張圖就是按鈕，比例由圖片自己決定 */}
            {isImageOnly ? (
              /* 與卡片版同比例，多則排隊時尺寸才不會忽大忽小。
                 比例不符用 fill 拉伸而不裁切：banner 的文案是畫在圖裡的，
                 裁掉的很可能就是標題，變形至少看得出來要換圖。 */
              <Link
                href={promo.cta_href || '#'}
                onClick={close}
                className="relative block w-full"
                style={{ aspectRatio: '800 / 1189' }}
              >
                <img
                  src={promo.image_url!}
                  alt={promo.body}
                  className="absolute inset-0 w-full h-full block"
                  style={{ objectFit: 'fill' }}
                />
              </Link>
            ) : (
              /* 卡片版＝統一模板：底圖已含外框、緞帶與按鈕，文字依量測出的版位疊上去。
                 模板不裁切也不自己畫底色，容器比例綁死 800/1189，
                 這樣喇叭超出卡片的部分才不會被切掉。 */
              <div className="relative w-full" style={{ aspectRatio: '800 / 1189' }}>
                <Image
                  src={TEMPLATE_BG}
                  alt=""
                  fill
                  priority
                  className="object-contain select-none pointer-events-none"
                  unoptimized
                />

                {/* 文字區：米白內板往內縮，下緣停在按鈕上方。
                    標題固定不捲動，內文吃剩餘高度並自行捲動 ——
                    整塊一起捲的話，標題會被捲出畫面，玩家就不知道在講什麼 */}
                <div
                  className="absolute flex flex-col"
                  /* top 用百分比而非固定 24px：卡片在小螢幕會等比縮小，
                     寫死 px 的話留白會相對變大 */
                  style={{ left: '9%', right: '9%', top: '27.9%', bottom: '17.5%' }}
                >
                  {promo.title && (
                    <h2
                      /* 不用 text-balance：它會為了讓每行等長而提早斷行，
                         右側明明還有空間卻換行。標題要盡量填滿一行 */
                      className="flex-shrink-0 text-[20px] font-black leading-[1.35] text-[#0b3b8c] overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 3,   // 超過三行以刪節號收尾
                      }}
                    >
                      {promo.title}
                    </h2>
                  )}
                  <p className="mt-2.5 flex-1 min-h-0 overflow-y-auto text-[15px] leading-[1.6] text-neutral-700 whitespace-pre-line">
                    {promo.body}
                  </p>
                </div>

                {/* 按鈕文字疊在底圖已經畫好的橘色藥丸上 */}
                {promo.cta_text && (
                  <Link
                    href={promo.cta_href || '#'}
                    onClick={close}
                    className="absolute flex items-center justify-center text-white text-[15px] font-black active:scale-[0.97] transition-transform"
                    style={{ left: '22.38%', top: '85.95%', width: '55.25%', height: '8.49%' }}
                  >
                    {promo.cta_text}
                  </Link>
                )}
              </div>
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
