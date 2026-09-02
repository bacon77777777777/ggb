'use client';

/**
 * 動態島／狀態列文字黑白 —— 由頁面自己宣告
 *
 * ── Apple 不會幫你判斷 ──
 * iOS 的狀態列文字顏色只認 app 給的 `UIStatusBarStyle`，它**完全不看 webview
 * 裡畫了什麼**。網頁的 `<meta name="theme-color">` 只影響 Safari 的網址列底色，
 * 對 Capacitor 的 WKWebView 狀態列沒有作用。所以一定得由我們決定。
 * `mobile/capacitor.config.ts` 設的是 `DEFAULT` ＝「跟隨系統外觀」：淺色模式永遠
 * 黑字、深色模式永遠白字，兩邊都跟頁面實際底色無關。
 *
 * ── 為什麼不自動量測 ──
 * 前一版用 `document.elementFromPoint()` 取畫面最上緣的背景色來算亮度。想法對，
 * 但在這個站上必然失準：`elementFromPoint` 走的是**命中測試**，
 * 會直接跳過 `pointer-events:none` 的元素 —— 而本站的底色幾乎都是這種裝飾層畫的：
 *   · 會員中心的紅底是 `.profile-bubbles`（fixed + pointer-events-none）→ 量不到，
 *     取樣點穿過去打到 <main> 的白底 → 判成淺底 → 黑字（紅底黑字）
 *   · 排行榜的深藍底是 InkFlowField（fixed inset-0 + pointer-events-none），
 *     而且它是頂欄的**兄弟**不是祖先，往上走也走不到 → 要等捲動後頂欄自己
 *     變成 `bg-[#1b2148]/80` 才第一次量到深色 → 「滑動才變白」
 * 掃描整個頂部區域可以繞過命中測試，但 z-index／stacking context 的邊界情況照樣
 * 會猜錯，而且每次換頁都要付一次掃描成本。
 *
 * ── 改成宣告式 ──
 * 頁面自己說一句 `useStatusBarText('white')`，沒說的就是 `black`（站上多數頁面
 * 的頂部是白色導航列，預設值對得起大部分頁面）。
 * 宣告寫在頁面自己的檔案裡、不是集中式白名單 —— 改配色時同一個檔案就看得到，
 * 而且可以跟著頁面狀態走（會員中心開詳細分頁時頂部變白底，就宣告 black）。
 *
 * ⚠️ Capacitor 的 `Style` 命名是反直覺的，很容易寫反：
 *     Style.Dark  = 深色**底** → 白字
 *     Style.Light = 淺色**底** → 黑字
 * 名字講的是背景不是文字，所以這裡對外的 API 直接用文字顏色（black／white），
 * 只在最後一步翻譯過去。
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { native } from '@/lib/native/bridge';

export type StatusBarText = 'black' | 'white';

/** 沒有頁面宣告時的預設：白底黑字 */
const DEFAULT_TEXT: StatusBarText = 'black';

/**
 * 宣告堆疊 —— 最後掛上的贏
 *
 * 換頁時 React 會先跑舊頁的 effect cleanup（pop）再跑新頁的 effect（push），
 * 所以「堆疊最後一項」永遠是當前頁的宣告。用陣列而不是單一變數，是為了讓
 * 巢狀情況（頁面 + 全螢幕彈窗各自宣告）也能在彈窗關掉時自動退回頁面的值。
 */
const stack: { key: object; text: StatusBarText; color?: string }[] = [];
const listeners = new Set<() => void>();

/**
 * Safari 的 theme-color 也走同一個堆疊（老闆 2026-09-02）。
 * iOS Safari 只在「載入文件」時取樣頁面頂色來塗它自己的狀態列區，
 * 站內換頁（SPA）不會重新取樣 —— 從紅頂的會員中心進白頂的倉庫，
 * 紅色就殘留著，重新整理才會好。由 meta 明講就不用讓它猜。
 * 沒宣告顏色的頁面落回白（layout 靜態 themeColor 同值）。
 */
const DEFAULT_COLOR = '#ffffff';

const currentText = () => (stack.length ? stack[stack.length - 1].text : DEFAULT_TEXT);
const currentColor = () => (stack.length ? stack[stack.length - 1].color ?? DEFAULT_COLOR : DEFAULT_COLOR);
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/**
 * 宣告這一頁（或這個彈窗）底下的狀態列要用什麼顏色的文字。
 * 文字黑白只在原生 App 生效；`themeColor`（頁面頂部的底色）則餵給
 * Safari 的 `<meta name="theme-color">`，有色頂的頁面要一起宣告，
 * 沒宣告的落回白。
 */
export function useStatusBarText(text: StatusBarText, themeColor?: string) {
  // 身分用一個穩定的空物件，不用 index —— 陣列會被別人 splice，index 會錯位
  const keyRef = useRef<object | null>(null);
  if (keyRef.current === null) keyRef.current = {};
  const key = keyRef.current;

  useEffect(() => {
    stack.push({ key, text, color: themeColor });
    emit();
    return () => {
      const i = stack.findIndex(e => e.key === key);
      if (i >= 0) stack.splice(i, 1);
      emit();
    };
  }, [key, text, themeColor]);
}

export default function StatusBarStyle() {
  // SSR 沒有堆疊，server snapshot 固定回預設值（給常數，不能每次回新物件）
  const text = useSyncExternalStore(subscribe, currentText, () => DEFAULT_TEXT);
  const color = useSyncExternalStore(subscribe, currentColor, () => DEFAULT_COLOR);
  const applied = useRef<StatusBarText | null>(null);
  const appliedColor = useRef<string | null>(null);

  useEffect(() => {
    if (!native.isNativePlatform()) return;
    // 值沒變就不送 —— 每次 setStyle 都是一趟 JS↔原生橋接往返
    if (applied.current === text) return;
    applied.current = text;
    void native.call('StatusBar', 'setStyle', { style: text === 'white' ? 'DARK' : 'LIGHT' });
  }, [text]);

  // Safari／PWA 的 theme-color：layout 靜態 meta 是白，這裡照堆疊即時蓋值。
  // App 殼內直接跳過 —— WKWebView 的狀態列本來就不看這顆 meta，
  // 老闆 2026-09-02 指定 App 現況完美、一根手指都不要碰
  useEffect(() => {
    if (native.isNativePlatform()) return;
    if (appliedColor.current === color) return;
    appliedColor.current = color;
    // ⚠️ 只改屬性，**絕對不能拔節點**：layout 的 themeColor meta 是 React 管的，
    // 拔掉之後 React 動到它就 `deletedFiber.parentNode.removeChild` 崩整棵樹
    // （2026-09-02 PROD PWA 卡死事故）。找不到才補一顆自己的（掛 data-ggb 標記）
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 0) {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.setAttribute('data-ggb', '1');
      m.content = color;
      document.head.appendChild(m);
    } else {
      metas.forEach(m => m.setAttribute('content', color));
    }
  }, [color]);

  return null;
}
