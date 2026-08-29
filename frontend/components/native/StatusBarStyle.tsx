'use client';

/**
 * 依「動態島底下實際是什麼顏色」自動切換狀態列文字黑／白
 *
 * ── 為什麼要自己做 ──
 * iOS **不會**看你的網頁內容決定狀態列文字顏色。它只認 app 給的
 * `UIStatusBarStyle`：`.lightContent`（白字）、`.darkContent`（黑字）、
 * 或 `.default`（跟隨**系統外觀**，淺色模式下永遠是黑字）。
 * `mobile/capacitor.config.ts` 設的就是 `DEFAULT`，所以不管頁面是紅底還是白底
 * 一律黑字 —— 首頁／排行榜／會員中心／簽到那種紅底、深底就幾乎看不見。
 *
 * ── 為什麼不用路由白名單 ──
 * 第一版寫死四個路徑，但站上頁面很多（公平性驗證、邀請好友、活動頁…），
 * 白名單一定會漏，而且之後新增頁面沒人會記得回來加。
 * 改成**量測**：抓動態島底下那塊實際算出來的背景色，算亮度決定黑白。
 * 新頁面不必登記，換配色也會自動跟上。
 *
 * ── 量測方式 ──
 * `overlaysWebView: true`，網頁內容本來就延伸到狀態列底下，
 * 所以直接在畫面最上緣取三個點（左中右），往上找第一個不透明的背景色。
 * 漸層（`background-image: linear-gradient(...)`）取第一個色停。
 * 遇到圖片背景就放棄該點 —— 圖片的平均色算不出來，寧可交給其他取樣點。
 *
 * ⚠️ Capacitor 的命名是反直覺的，很容易寫反：
 *     Style.Dark  = 深色**底** → 白字
 *     Style.Light = 淺色**底** → 黑字
 * 名字講的是背景，不是文字。
 */

import { useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { native } from '@/lib/native/bridge';

/** 0~255 的感知亮度；低於這個值就算深色底 */
const DARK_THRESHOLD = 155;

type Rgb = { r: number; g: number; b: number; a: number };

function parseColor(v: string): Rgb | null {
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

/** 感知亮度（ITU-R BT.601）—— 綠色對人眼最亮，不能三色等權平均 */
const brightness = (c: Rgb) => (c.r * 299 + c.g * 587 + c.b * 114) / 1000;

/** 從某個座標往上找第一個看得見的背景色 */
function bgAt(x: number, y: number): Rgb | null {
  let el = document.elementFromPoint(x, y) as HTMLElement | null;
  while (el) {
    const cs = getComputedStyle(el);
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a > 0.5) return bg;
    const img = cs.backgroundImage;
    if (img && img !== 'none') {
      if (/url\(/.test(img)) return null;          // 圖片背景：算不出代表色，放棄這一點
      const stop = img.match(/rgba?\([^)]+\)/);     // 漸層：取第一個色停
      if (stop) {
        const c = parseColor(stop[0]);
        if (c && c.a > 0.5) return c;
      }
    }
    el = el.parentElement;
  }
  return null;
}

export default function StatusBarStyle() {
  const pathname = usePathname();

  const apply = useCallback(() => {
    if (!native.isNativePlatform()) return;
    const w = window.innerWidth;
    // 最上緣三點取樣：頂欄常常左右有按鈕、中間有標題，單點容易踩到按鈕自己的底色
    const samples = [w * 0.2, w * 0.5, w * 0.8]
      .map(x => bgAt(x, 4))
      .filter((c): c is Rgb => !!c);
    if (samples.length === 0) return;               // 全部取不到就別亂改
    const avg = samples.reduce((s, c) => s + brightness(c), 0) / samples.length;
    void native.call('StatusBar', 'setStyle', { style: avg < DARK_THRESHOLD ? 'DARK' : 'LIGHT' });
  }, []);

  useEffect(() => {
    if (!native.isNativePlatform()) return;
    // 換頁後版面要一兩幀才定案；捲動時頂欄常常變色（毛玻璃、透明轉實色）也要跟著換
    const raf = requestAnimationFrame(apply);
    const t = setTimeout(apply, 350);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; apply(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname, apply]);

  return null;
}
