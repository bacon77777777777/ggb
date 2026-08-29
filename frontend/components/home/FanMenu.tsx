'use client';

/**
 * 首頁右下角的扇形懸浮選單
 *
 * 主鈕與子鈕都是**整張正方形圖片**（老闆會提供 1 主 + 3 副的 PNG），
 * 所以這裡不畫圓形底、不放文字標籤 —— 外觀全由圖決定，程式只管位置與動作。
 *
 * ── 版面 ──
 * 四分之一圓弧，位置由 `lib/fanLayout` 算（那支是純函式，驗證腳本直接 import 同一份，
 * 不會出現「腳本自己抄一遍公式、抄錯還互相抵銷」那種事）。
 * 顆數會影響排法：3 顆以內同一圈，4 顆以上內外交錯。
 *
 * ── 定位 ──
 * bottom 的算式與首頁既有的懸浮入口一致，三件事要一起避開：
 * 底部導航、iPhone 的安全區、以及高度會變的警語列（`--promo-notice-h`）。
 * 少算一項就會在某些機器上被蓋住。
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { fanOffset, FAN_MAX } from '@/lib/fanLayout';
import { useToast } from '@/components/ui/Toast';

/** 主鈕尺寸（px，老闆指定 1 主 5 副都 64） */
const MAIN_SIZE = 64;
/** 子鈕尺寸（px） */
const ITEM_SIZE = 64;
/** 一顆接一顆彈出來的間隔 */
const STAGGER_MS = 60;

export interface FanItem {
  /** 正方形去背圖的路徑（public 底下） */
  icon: string;
  label: string;
  href: string;
  /**
   * 'maintenance' 時圖示照樣顯示，但點下去不換頁、改跳提示（老闆指定）。
   * 直接藏掉會讓玩家以為功能被拿掉了；關閉（'off'）才是不顯示，
   * 那個由呼叫端先濾掉，不會傳進來。
   */
  state?: 'on' | 'maintenance';
  /**
   * 單顆圖示的垂直微調（px，正數往下）。
   *
   * 扇形的座標是幾何算出來的，每一格都在該在的位置；但四張圖的「畫面重心」
   * 不一樣 —— 商城那張店鋪的主體偏上，擺在同一格會看起來比鄰居高。
   * 與其去動 fanLayout 的角度（那會連帶影響其他顆），不如只把這張圖往下推。
   */
  nudgeY?: number;
}

export default function FanMenu({ mainIcon, mainIconOpen, items }: {
  /** 主鈕圖（正方形 PNG） */
  mainIcon: string;
  /** 展開時要換成的主鈕圖。沒給就沿用 `mainIcon`，不做旋轉 —— 
      「轉 135° 變 ✕」只適合本來就是加號的圖，套在有主題的美術圖上會很怪 */
  mainIconOpen?: string;
  items: FanItem[];
}) {
  const [open, setOpen] = useState(false);
  /** 主鈕被按下時的「彈一下」；子鈕要等這一下做完才出場 */
  const [bounce, setBounce] = useState(false);
  const reduceMotion = useReducedMotion();
  const { showToast } = useToast();

  const close = useCallback(() => setOpen(false), []);

  // 桌機用 ESC 收合；手機點遮罩
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const toggle = () => {
    setBounce(true);
    setTimeout(() => setBounce(false), 260);
    // 展開時：先讓主鈕彈完再噴子鈕；收合時不用等，立刻收
    if (open) setOpen(false);
    else setTimeout(() => setOpen(true), reduceMotion ? 0 : 140);
    // Android 有感，iOS Safari 會忽略 —— 有就加分，沒有也不影響操作
    if (!reduceMotion) navigator.vibrate?.(8);
  };

  const fan = items.slice(0, FAN_MAX);   // 見檔頭：超過這個數量扇形排不下

  return (
    <>
      {/*
        點外面收合用的透明感應層。老闆不要黑幕（會把整個首頁壓暗），
        所以這層完全透明、只負責接點擊 —— 拿掉它的話手機上只能再按一次主鈕才關得掉。
      */}
      {open && (
        <button
          type="button"
          aria-label="關閉選單"
          onClick={close}
          className="fixed inset-0 z-[39] bg-transparent"
        />
      )}

      <div
        className="fixed right-2 z-40 md:hidden transition-[bottom] duration-200 ease-out"
        /* 往下、往右各挪一點（老闆指定）：right 16→8px、bottom 5.5→4.5rem。
           下限就到這 —— 再往下會貼上警語列（實測只剩 11px 空隙）。
           `--bottom-nav-shift` 是底部欄往下滑時收起的距離（MobileTabbar 發佈），
           沒設就是 0px＝照舊；底欄收起時整顆跟著坐下來，不會浮在空白上。 */
        style={{
          bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + var(--promo-notice-h, 0px) - var(--bottom-nav-shift, 0px))',
        }}
      >
        {/* 子鈕：絕對定位在主鈕中心，再用 x/y 位移到弧上 */}
        <AnimatePresence>
          {open && fan.map((item, i) => {
            const { x, y } = fanOffset(i, items.length);
            return (
              <motion.div
                /* 用 index 當 key：這份清單是寫死的設定、不會重排也不會增刪。
                   原本用 href，三顆佔位圖都指 `#` 就撞 key 了 */
                key={`${i}-${item.label}`}
                className="absolute"
                style={{
                  left: (MAIN_SIZE - ITEM_SIZE) / 2,
                  bottom: (MAIN_SIZE - ITEM_SIZE) / 2,
                  width: ITEM_SIZE,
                  height: ITEM_SIZE,
                }}
                initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                animate={{ x, y, scale: 1, opacity: 1 }}
                exit={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                transition={reduceMotion
                  ? { duration: 0.12, delay: 0 }
                  // 依序彈出（收合時反序），spring 讓它有回彈
                  : { type: 'spring', stiffness: 400, damping: 22, delay: (i * STAGGER_MS) / 1000 }}
              >
                <Link
                  href={item.href}
                  aria-label={item.label}
                  title={item.state === 'maintenance' ? `${item.label}（維護中）` : item.label}
                  onClick={e => {
                    if (item.state === 'maintenance') {
                      e.preventDefault();
                      showToast(`${item.label}維護中，敬請見諒`, 'info');
                      return;
                    }
                    close();
                  }}
                  className="block w-full h-full active:scale-90 transition-transform"
                >
                  <Image
                    src={item.icon}
                    alt={item.label}
                    width={ITEM_SIZE}
                    height={ITEM_SIZE}
                    className="w-full h-full object-contain drop-shadow-lg select-none"
                    style={item.nudgeY ? { transform: `translateY(${item.nudgeY}px)` } : undefined}
                    unoptimized
                  />
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* 主鈕 */}
        <motion.button
          type="button"
          onClick={toggle}
          aria-label={open ? '收合選單' : '展開選單'}
          aria-expanded={open}
          className="relative block"
          style={{ width: MAIN_SIZE, height: MAIN_SIZE }}
          animate={reduceMotion
            ? {}
            // 按下去先縮再回彈 —— 老闆要的「點擊會彈一下」
            : { scale: bounce ? [1, 0.86, 1.08, 1] : 1 }}
          transition={{ scale: { duration: 0.26, times: [0, 0.3, 0.65, 1] } }}
        >
          <Image
            src={open ? (mainIconOpen ?? mainIcon) : mainIcon}
            alt=""
            width={MAIN_SIZE}
            height={MAIN_SIZE}
            className="w-full h-full object-contain drop-shadow-xl select-none pointer-events-none"
            unoptimized
            priority
          />
        </motion.button>
      </div>
    </>
  );
}
