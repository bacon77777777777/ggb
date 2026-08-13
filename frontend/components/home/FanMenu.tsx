'use client';

/**
 * 首頁右下角的扇形懸浮選單
 *
 * 主鈕與子鈕都是**整張正方形圖片**（老闆會提供 1 主 + 3 副的 PNG），
 * 所以這裡不畫圓形底、不放文字標籤 —— 外觀全由圖決定，程式只管位置與動作。
 *
 * ── 版面 ──
 * 右下角能用的是左上那一象限，所以走四分之一圓弧：
 *
 *        ●  270°（正上）
 *     ●     225°（斜上）
 *   ●       180°（正左）
 *              (主鈕)
 *
 * ⚠️ **超過 4 顆就不要用扇形**。半徑 100px 的四分之一弧總長約 157px，
 * 均分給 N 顆時每顆只有 157/(N-1) px 的間距，子鈕本身 52px ——
 * 5 顆就開始疊。真的要加到第五顆時改用直排（首頁原本那套 FloatingEntry 就是），
 * 不要硬把半徑撐大，那會頂到畫面左緣。
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

export interface FanItem {
  /** 正方形 PNG 的路徑（public 底下） */
  icon: string;
  label: string;
  href: string;
}

/** 主鈕尺寸（px） */
const MAIN_SIZE = 64;
/** 子鈕尺寸（px） */
const ITEM_SIZE = 56;
/** 圓弧半徑（px）：手指按得開，最左那顆在 375px 的機器上離左緣還有 250px 以上 */
const RADIUS = 100;
/** 一顆接一顆彈出來的間隔 */
const STAGGER_MS = 60;

/**
 * 第 i 顆在四分之一弧上的位移（CSS 座標，直接餵給 framer-motion 的 x / y）。
 *
 * ⚠️ 這裡**不要再對 y 取負號**。數學上的角度是 +y 朝上、CSS 是 +y 朝下，
 * 而 `sin(225°)`、`sin(270°)` 本來就是負的 —— 也就是說算出來的 y 已經是
 * 「CSS 的往上」。再翻一次就會整排往下噴，壓到警語列與底部導航
 * （2026-08-13 就是這樣壞的，而且驗證腳本自己也翻了一次座標把錯誤抵銷掉，
 *   量出來看起來完全正常）。
 */
function offsetOf(index: number, total: number) {
  // 只有一顆時擺在 225°（斜上），不要貼著邊
  const deg = total <= 1 ? 225 : 180 + (90 / (total - 1)) * index;
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * RADIUS, y: Math.sin(rad) * RADIUS };
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

  const fan = items.slice(0, 4);   // 見檔頭：超過 4 顆這個版型會疊

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
        className="fixed right-2 z-40 md:hidden"
        /* 往下、往右各挪一點（老闆指定）：right 16→8px、bottom 5.5→4.5rem。
           下限就到這 —— 再往下會貼上警語列（實測只剩 11px 空隙） */
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + var(--promo-notice-h, 0px))' }}
      >
        {/* 子鈕：絕對定位在主鈕中心，再用 x/y 位移到弧上 */}
        <AnimatePresence>
          {open && fan.map((item, i) => {
            const { x, y } = offsetOf(i, fan.length);
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
                  title={item.label}
                  onClick={close}
                  className="block w-full h-full active:scale-90 transition-transform"
                >
                  <Image
                    src={item.icon}
                    alt={item.label}
                    width={ITEM_SIZE}
                    height={ITEM_SIZE}
                    className="w-full h-full object-contain drop-shadow-lg select-none"
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
