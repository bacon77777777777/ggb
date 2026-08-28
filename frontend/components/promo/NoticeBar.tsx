'use client';

/**
 * 公平性警語列 —— 貼在 MobileTabbar 上緣
 *
 * 內容寫死、不做後台設定：這條就是為公平性而存在的。
 * 做成可編輯只會讓人以為它是通用通知列，之後被拿去放不相干的訊息。
 *
 * 出現規則依登入狀態而定，是規則不是設定值：
 *   未登入 —— 每次進到頁面都重新顯示。他們才是最需要被說服的人，
 *             而且關閉狀態存在瀏覽器，關一次就再也不出現等於白做。
 *   已登入 —— 按叉叉後 7 天再出現。已經是會員了，一直提醒只會煩。
 *
 * 樣式沿用倉庫頂部那條深底淺字警語，差別是多了圖標與右側叉叉。
 * 桌機的 MobileTabbar 是 md:hidden，所以這條也只在手機顯示。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dismiss, shouldShow } from '@/lib/promoDismiss';
import { asset } from '@/lib/asset';

const NOTICE_ID = 'fairness-notice';
const LOGGED_IN_DISMISS_DAYS = 7;

const TEXT = '吉吉比使用 HASH 公平可驗證的技術建立，';
const CTA_TEXT = '查看說明';
const CTA_HREF = '/events/fairness';

/**
 * 找出底部欄本體，警語列直接掛進去（見 render 的說明）。
 *
 * 兩種底部欄都要認：首頁是 MobileTabbar，商品內頁是底部操作欄
 * （立即抽獎／立即開包…）。兩者不會同時出現，取有高度的那個。
 *
 * 不抓著同一個節點：導航列先渲染 Suspense 骨架再換成本體，
 * 骨架被卸載後 portal 會掛在孤兒節點上，警語列就整條消失。
 * 所以 DOM 一動就重找（用 rAF 合併，一幀最多一次）。
 */
function useBottomBar(active: boolean) {
  const [bar, setBar] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) { setBar(null); return; }
    let raf = 0;
    const find = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-testid="mobile-tabbar"], [data-testid="bottom-action-bar"]',
      ));
      let best: HTMLElement | null = null;
      for (const el of els) {
        if (!el.isConnected || el.offsetHeight <= 0) continue;
        if (!best || el.offsetHeight > best.offsetHeight) best = el;
      }
      setBar(prev => (prev === best ? prev : best));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(find);
    };
    find();
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [active]);

  return bar;
}

/**
 * 把自己的實際高度掛到 --promo-notice-h，讓頁面既有的浮動按鈕
 * （首頁的上架、排行榜）跟著上移。用量測而不是寫死高度。
 *
 * ref 掛在「深色那條」本身：貼底部時它被掛進底部欄裡（見下方 render），
 * 量到外層就會把整條底部欄的高度也算進去，浮動按鈕會被推高一截。
 */
function usePublishHeight(active: boolean) {
  /*
   * 用 callback ref 存成 state 而不是 useRef：警語列會從「還沒找到底部欄」的
   * 暫時容器搬進底部欄裡（換父層＝DOM 節點重建），useRef 的話 effect 不會重跑，
   * ResizeObserver 還盯著被移除的舊節點 —— 它被移除時會回報尺寸 0，
   * `--promo-notice-h` 就歸零，首頁那兩顆浮動按鈕會掉回底部欄上。
   */
  const [el, setEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!active || !el) {
      root.style.setProperty('--promo-notice-h', '0px');
      return;
    }
    // isConnected：節點已被搬走時不要拿 0 去蓋掉新節點剛寫進去的值
    const sync = () => {
      if (el.isConnected) root.style.setProperty('--promo-notice-h', `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--promo-notice-h', '0px');
    };
  }, [active, el]);

  return setEl;
}

/**
 * 頂部導航的實際高度。導航列是 sticky（h-[57px] + 1px 下框線），
 * 用量測而不是寫死：導航列版型改動時這條會自己跟上。
 */
function useNavbarOffset(active: boolean) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!active) return;
    const sync = () => {
      const el = document.querySelector('nav') as HTMLElement | null;
      setOffset(el?.offsetHeight || 0);
    };
    sync();
    const raf = requestAnimationFrame(sync);   // Suspense 骨架換本體那一幀
    const ro = new ResizeObserver(sync);
    ro.observe(document.body);
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [active]);

  return offset;
}

interface Props {
  /**
   * bottom（預設）＝首頁，貼在底部導航上緣。
   * top ＝商品內頁，緊貼頂部導航下緣；那裡底部已被購買列佔滿，
   * 再往下塞一條會把「立即抽獎」擠掉。
   */
  position?: 'top' | 'bottom';
}

export default function NoticeBar({ position = 'bottom' }: Props) {
  const { isAuthenticated, isLoading } = useAuth();
  const [closed, setClosed] = useState(false);

  // 未登入用 always（關閉不落地，下次照樣出現），登入才記 7 天
  const mode = isAuthenticated ? 'days' : 'always';
  const visible = !isLoading && !closed && shouldShow(NOTICE_ID, mode, LOGGED_IN_DISMISS_DAYS);

  const isTop = position === 'top';
  const setStripEl = usePublishHeight(visible);
  const bar = useBottomBar(visible && !isTop);
  const navH = useNavbarOffset(visible && isTop);
  if (!visible) return null;

  /* 分隔線畫在朝向內容的那一側：貼底部時在上緣，貼頂部時在下緣 */
  const strip = (
    <div ref={setStripEl} className={`pointer-events-auto bg-neutral-800 dark:bg-neutral-900 ${isTop ? 'border-b' : 'border-t'} border-white/5 px-4 py-1.5 flex items-center gap-2.5`}>
        <Link href={CTA_HREF} className="flex items-center gap-2.5 flex-1 min-w-0">
          <Image
            src={asset("/images/ic.png")} alt="" width={24} height={24}
            className="flex-shrink-0 w-6 h-6"
            unoptimized
          />
          {/* -top-px：中文字形的墨水在行框內天生偏下（下方要留 descender 空間），
              flex 置中對齊的是行框而不是字形 */}
          <p className="text-[11px] text-neutral-300 leading-[1.35] flex-1 relative -top-px">
            {TEXT}
            {/* 用 primary-light 而非 primary：#EE4D2D 壓在深底上偏濁，淺一階才讀得出來 */}
            <span className="ml-1 text-primary-light underline underline-offset-2 font-bold whitespace-nowrap">
              {CTA_TEXT}
            </span>
          </p>
        </Link>
        <button
          type="button"
          onClick={() => { setClosed(true); dismiss(NOTICE_ID, mode); }}
          aria-label="關閉提示"
          className="flex-shrink-0 -mr-1 p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  /* 商品內頁的 top 版：貼在頂部導航下緣（那裡底部已被購買列佔滿） */
  if (isTop) {
    return (
      <div
        className="fixed left-0 right-0 md:hidden z-40 pointer-events-none"
        style={{ top: navH || 57 }}
        data-testid="promo-notice-bar"
      >
        {strip}
      </div>
    );
  }

  /*
   * 貼底部版：**直接掛進底部欄本體**，用 `bottom-full` 疊在它上緣。
   *
   * 前兩版都是自己開一個 fixed 元素去對齊底部欄，兩版都在 iPhone Safari 上飛掉：
   *   v1 `bottom: 61px` —— 錨在像素偏移的 fixed 元素是照版面視窗算的，
   *      Safari 網址列收合時整條會先跟著頁面跑，捲完才彈回去。
   *   v2 `bottom: 0` + 等同底部欄高度的透明 padding —— 錨對了，但那個高度是
   *      JS 量出來的**快照**。底部欄自己寫 `pb-[env(safe-area-inset-bottom)]`，
   *      Safari 工具列收合時 safe-area 由 0 變 ~34px、它當場重排，我們的數字
   *      要等 ResizeObserver 回呼才跟上 —— 捲動當下就差那一截。
   *      （PWA 沒有會收合的工具列，safe-area 是定值，所以老闆說 PWA 不會。）
   *
   * 掛進底部欄之後兩者是同一個圖層、同一次重排，沒有任何可以分家的空間，
   * 也不用再墊那塊會吃掉「立即開包」點擊的透明 padding。
   */
  if (bar) {
    return createPortal(
      <div className="absolute bottom-full left-0 right-0">{strip}</div>,
      bar,
    );
  }

  // 底部欄還沒掛上（Suspense 骨架交替的那一兩幀）：先照舊釘在畫面底
  return (
    <div
      className="fixed bottom-0 left-0 right-0 md:hidden z-40 pointer-events-none"
      style={{ paddingBottom: 'calc(61px + env(safe-area-inset-bottom))' }}
      data-testid="promo-notice-bar"
    >
      {strip}
    </div>
  );
}
