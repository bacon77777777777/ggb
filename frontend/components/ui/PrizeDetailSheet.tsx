'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import PinchZoomImage from '@/components/ui/PinchZoomImage';
import dynamic from 'next/dynamic';

// three.js 只能在瀏覽器跑，且只有卡包模式用得到 —— 動態載入不拖累其他玩法的彈窗
const CardShowcase3D = dynamic(() => import('@/components/card/CardShowcase3D'), { ssr: false });
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import GradeBadge from '@/components/ui/GradeBadge';
import { asset } from '@/lib/asset';

export interface PrizeInfo {
  name: string;
  image_url?: string | null;
  /** 圖區塊呈現方式（migration 593）：static 靜態圖｜showcase3d 360° 立體展示 */
  display_mode?: string | null;
  level?: string | null;
  total?: number;
  remaining?: number;
  recycle_value?: number | null;
}

interface Props {
  prize: PrizeInfo | null;
  onClose: () => void;
  /**
   * 一番賞／抽卡／自製賞這類「開賣前排定籤號」的玩法傳 true。
   * 只有這幾種會顯示「剩餘」—— 它們的商品頁配率表本來就公開張數，這裡是同一份資訊。
   * 轉蛋／盒玩不顯示：那些數字站上任何地方都沒公開，只在這個彈窗漏出來。
   */
  sealed?: boolean;
  /**
   * 允許 360° 立體展示（卡包模式）。實際用不用**由該品項自己的 `display_mode` 決定**
   * —— 同一檔裡不是每個品項都值得 3D，大賞卡值得轉，一般卡看靜態圖就好
   * （而且 3D 要載 three.js）。migration 593，預設 static。
   */
  showcase3d?: boolean;
  /** 360° 展示的背面圖（商品設定的卡牌背面）；沒設就只轉正面 */
  showcaseBackImage?: string | null;
  /** 疊在別的彈窗之上時要拉高（例：中獎結果彈窗是 3000，這裡要更高） */
  zIndex?: number;
  /**
   * 上一項／下一項。有給才會顯示左右箭頭，圖片也才吃左右滑手勢。
   * 品項總覽與配率表都是一整份清單，看完一項自然想看下一項 ——
   * 關掉再點下一列太囉唆。
   */
  onPrev?: () => void;
  onNext?: () => void;
}


export default function PrizeDetailSheet({ prize, onClose, sealed = false, showcase3d = false, showcaseBackImage, zIndex = 2700, onPrev, onNext }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* 鍵盤左右鍵切換、Esc 關閉。
     箭頭鈕拿掉之後，電腦上只剩「拖曳」這個操作，沒有任何提示；
     方向鍵是桌機使用者對「上一張／下一張」的直覺，補上才不會變成隱藏功能 */
  useEffect(() => {
    if (!prize) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev?.();
      else if (e.key === 'ArrowRight') onNext?.();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prize, onPrev, onNext, onClose]);

  if (!mounted) return null;

  const rows: { label: string; value: React.ReactNode }[] = [];
  if (prize?.level && prize.level !== prize.name) {
    rows.push({
      label: '賞等',
      value: <GradeBadge grade={prize.level} />,
    });
  }
  // 剩餘只給封存制的玩法看：它們的商品頁配率表本來就公開張數，這裡是同一份資訊。
  // 轉蛋／盒玩的收藏列表只列品名與圖，張數站上沒有任何地方公開
  if (sealed && prize?.remaining !== undefined && prize?.total !== undefined) {
    rows.push({
      label: '剩餘',
      value: (
        <span className="font-black text-neutral-800 dark:text-neutral-200">
          {prize.remaining.toLocaleString()}
          <span className="text-neutral-300 dark:text-neutral-600 mx-1">/</span>
          {prize.total.toLocaleString()}
        </span>
      ),
    });
  }
  if (prize?.recycle_value !== undefined && prize.recycle_value !== null && prize.recycle_value > 0) {
    rows.push({
      label: '回收幣值',
      value: (
        <span className="font-black text-amber-500 flex items-center gap-1">
          <span>{prize.recycle_value.toLocaleString()}</span>
          <span className="text-xs">G</span>
        </span>
      ),
    });
  }
  // 機率一律不顯示。
  // 封存制的玩法本來就不是靠機率決定（決定結果的是開賣前排好的籤號），
  // 轉蛋／盒玩則是平台不對外公開單品機率 —— 兩邊都沒有該露出的理由。

  return createPortal(
    <AnimatePresence>
      {prize && (
        <motion.div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* bottom sheet */}
          <motion.div
            className="relative w-full max-w-[560px] bg-white dark:bg-neutral-900 rounded-t-3xl overflow-y-auto max-h-[88dvh] shadow-2xl pb-[env(safe-area-inset-bottom)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* header */}
            <div className="sticky top-0 bg-white dark:bg-neutral-900 flex items-center justify-between px-5 pt-4 pb-2 z-10">
              <span className="font-black text-sm text-neutral-900 dark:text-neutral-100 tracking-wide">品項詳情</span>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 圖片：雙指縮放／拖移（放開彈回），沒放大時左右滑切換品項。
                不畫左右箭頭（老闆指定）—— 手機本來就用滑的，電腦滑鼠拖曳
                走的是同一套 pointer 事件，再擺兩顆鈕只是擋住圖 */}
            <div className="relative px-5 pt-1 pb-2">
              {showcase3d && prize?.display_mode === 'showcase3d' ? (
                /* 卡包模式：立體旋轉展示（可拖曳手動轉）。
                   這裡不接左右滑切換品項 —— 拖曳已經被旋轉吃掉了 */
                <CardShowcase3D
                  key={prize?.name ?? ''}
                  frontImage={prize?.image_url || asset('/images/item_defaulet.webp')}
                  backImage={showcaseBackImage || undefined}
                  height={320}
                />
              ) : (
                <PinchZoomImage
                  key={prize?.name ?? ''}
                  src={prize?.image_url || asset('/images/item_defaulet.webp')}
                  alt={prize?.name ?? ''}
                  className="mx-auto h-[36dvh] max-h-[320px] w-full rounded-xl"
                  onSwipeLeft={onNext}
                  onSwipeRight={onPrev}
                />
              )}
            </div>

            {/* name */}
            <div className="px-5 pb-2 text-center">
              <p className="font-black text-sm text-neutral-900 dark:text-neutral-100 leading-snug">{prize?.name}</p>
            </div>

            {/* detail rows */}
            {rows.length > 0 && (
              <>
                <div className="h-px bg-neutral-100 dark:bg-neutral-800 mx-5" />
                <div className="px-5 pt-1 pb-4 flex flex-col gap-0">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-neutral-50 dark:border-neutral-800 last:border-0">
                      <span className="text-[13px] text-neutral-400 dark:text-neutral-500">{row.label}</span>
                      <span className="text-[13px]">{row.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
