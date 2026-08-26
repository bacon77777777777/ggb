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

import { useEffect, useRef, useState } from 'react';
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
 * 貼齊底部導航的上緣。
 *
 * 不寫死高度：導航列實際是 61px（h-[60px] + 1px 上框線）而非直覺的 56px，
 * 釘在 56px 時底部 5px 會被導航（z-50）的白底蓋住，看得到的深色區比元素盒矮，
 * 內容就算數學上置中也會顯得偏下。offsetHeight 已含 safe-area 的 padding。
 *
 * 量到的高度是拿去當「透明底墊」，不是 bottom 偏移值 —— 見下方 render 的說明。
 */
function useTabbarOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    // 每次都重新查詢，不抓著同一個節點：導航列先渲染 Suspense 骨架再換成本體，
    // 抓著舊節點時它被卸載會回報高度 0，警語列就會被釘到畫面最底、疊進導航列裡。
    //
    // 兩種底部欄都要認：首頁是 MobileTabbar，商品內頁是底部操作欄
    // （立即抽獎／立即開包…）。兩者不會同時出現，取量到的最大值即可。
    const sync = () => {
      const els = document.querySelectorAll<HTMLElement>(
        '[data-testid="mobile-tabbar"], [data-testid="bottom-action-bar"]',
      );
      let h = 0;
      els.forEach(el => { h = Math.max(h, el.offsetHeight || 0); });
      setOffset(h);
    };
    sync();
    const raf = requestAnimationFrame(sync);   // 骨架換本體那一幀
    const ro = new ResizeObserver(sync);
    ro.observe(document.body);
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  return offset;
}

/**
 * 把自己的實際高度掛到 --promo-notice-h，讓頁面既有的浮動按鈕
 * （首頁的上架、排行榜）跟著上移。用量測而不是寫死高度。
 *
 * ref 掛在「深色那條」本身而不是外層固定容器：外層還墊著一塊等同底部欄
 * 高度的透明 padding，量外層會把導航列的高度也算進去，浮動按鈕就會被推高一截。
 */
function usePublishHeight(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!active || !ref.current) {
      root.style.setProperty('--promo-notice-h', '0px');
      return;
    }
    const el = ref.current;
    const sync = () => root.style.setProperty('--promo-notice-h', `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--promo-notice-h', '0px');
    };
  }, [active]);

  return ref;
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
  const ref = usePublishHeight(visible);
  const tabbarH = useTabbarOffset();
  const navH = useNavbarOffset(visible && isTop);
  if (!visible) return null;

  return (
    /*
     * 貼底部時錨在 bottom: 0，再用等同底部欄高度的透明 padding 把自己頂上去，
     * 而不是直接寫 bottom: <導航列高度>。
     *
     * 為什麼：iOS Safari 捲動時網址列會收合，fixed 元素只有錨在畫面最底
     * （bottom: 0，底部欄與購買列都是這樣）才會被瀏覽器黏住；錨在某個像素偏移
     * 的元素是照版面視窗算的，捲動當下會先跟著頁面跑掉，捲完才彈回導航列上緣
     * —— 就是老闆看到的位移。改成跟底部欄同一種錨法，兩者就一起動、不會分家。
     *
     * 外層要 pointer-events-none：那塊透明 padding 蓋在底部欄／購買列上，
     * 商品頁的購買列同為 z-40 且排在前面，不放行點擊會吃掉「立即開包」。
     */
    <div
      className="fixed left-0 right-0 md:hidden z-40 pointer-events-none"
      style={isTop
        ? { top: navH || 57 }
        : { bottom: 0, paddingBottom: tabbarH || 'calc(61px + env(safe-area-inset-bottom))' }}
      data-testid="promo-notice-bar"
    >
      {/* 分隔線畫在朝向內容的那一側：貼底部時在上緣，貼頂部時在下緣 */}
      <div ref={ref} className={`pointer-events-auto bg-neutral-800 dark:bg-neutral-900 ${isTop ? 'border-b' : 'border-t'} border-white/5 px-4 py-1.5 flex items-center gap-2.5`}>
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
    </div>
  );
}
