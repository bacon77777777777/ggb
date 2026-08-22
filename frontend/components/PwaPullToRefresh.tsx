'use client';

/**
 * 下拉更新（PWA + 原生殼）—— 照 FB／Threads（脆）那套（老闆 2026-08-20 指定）
 *
 * WKWebView 沒有內建下拉更新（那是 Safari 這個 App 的功能），Capacitor 也沒提供
 * UIRefreshControl。而 App 沒有網址列、沒有重新整理鈕 —— 頁面卡住時這是玩家
 * 唯一的自救方式，所以必須自己做。
 *
 * 四條規則，缺一個手感就不對：
 *
 *   1. **先有安全距離，才開始有反應**（`DEAD_ZONE`）。
 *      手指往下移不到 18px 之前，畫面完全不動、也不震 —— 不然滑一下清單、
 *      手指抖一下都在震，還可能誤刷新（老闆回報）。跨過安全距離之後，位移是從
 *      **跨過的那一點**重新算，所以不會「啪」地跳一段。
 *   2. **只有內容區被拖，所有「釘在頂端」的東西都不動**。
 *      位移下在 `<main>`，頂部導航（`<nav>`，`<main>` 的兄弟節點）與底部導航
 *      本來就不受影響；但 `<main>` **裡面**那些已經貼在頂端的 sticky 列
 *      （情報頁的分類 tab、首頁的分類列…）會被 `<main>` 的位移帶著走，
 *      所以要對它們下一個等量的反向位移抵銷掉 —— 視覺上就是釘住不動
 *      （老闆 2026-08-20：「tab 不要跟著被拉下去，這樣體感不好」）。
 *   3. **指示器出現在內容上方那道空隙裡**（老闆 2026-08-20 指定的樣式）：
 *      灰底上一顆**轉蛋球**（主題色上蓋＋白色下蓋的膠囊）；
 *      持續拉，球被**慢慢壓扁**（愈拉愈扁，貼著地）；拉過門檻（或放開）
 *      才**往上彈** —— 放開後播完整拋接：上拋、落地壓扁、回彈到停住，
 *      動畫收尾才換新內容。不配任何文字，階段全靠變形與震動表達。
 *   4b. 震動節奏（老闆 2026-08-20）：**拉動中是持續的細微滴答**
 *      （selection tick，每 4.5% 進度一下）、滿格一記中震；
 *      **放開後只有球碰地的兩下微震**，其餘安靜。
 *      安全距離內（DEAD_ZONE 18px）完全不震也不動。
 *      起始位置是「所有釘住的東西的最下緣」，動態量出來的 ——
 *      寫死 57px 的話，情報頁那種底下還有一排 tab 的版面就會被蓋住。
 *      空隙鋪一層底色（`stripRef`）：淺色頁鋪灰（body 是白的，轉圈浮在白上
 *      看起來像破了一塊 —— 老闆 2026-08-20 附圖），深色頁（排行榜）取頁面
 *      自己的底色，不會出現一條突兀的灰。
 *   2b. **觸發區只有「內容捲動區」，一條規則管全站**（老闆 2026-08-20：
 *      「正常用戶只會拉內容區，頂部區塊拉了不要有作用」）。
 *      從手勢起點往上找，**最近的一層**決定這一趟怎麼走：
 *        - 碰到 data-ptr-content（排行榜、情報頁宣告的內容塊）→ 拖那一批
 *        - 碰到夠大的 overflow-y-auto 容器（會員中心覆蓋層的清單）→ 只拖它
 *        - 碰到 fixed／sticky（頁頭、tab 列、導航）→ **整趟不觸發**
 *        - 一路到底都沒碰到 → 一般頁面，拖 <main>（sticky 頂欄反向定住）
 *   3b. 版面特殊的頁面（排行榜：tab 絕對定位在一塊 overflow-hidden 的縮放畫布裡）
 *      可以下 `data-ptr-content` 宣告「只拖這一塊」—— 那一頁改成位移這個元素，
 *      tab、背景、返回鈕全都原地不動。
 *      ⚠️ 不要試圖用反向位移去定住畫布裡的元素：位移會把它推出畫布的
 *      overflow-hidden 邊界，直接被裁掉（2026-08-20 試過，老闆截圖回報
 *      「狂人跟魔人被黑黑的遮住」）。
 *   4. **蓄力才刷新**。未滿格彈回去，滿格才刷新；過程分段輕震、間距愈往後愈密，
 *      滿格給一下明顯較重的，不用看畫面就知道可以放手了。
 *
 * 只在 standalone／原生殼啟用：一般瀏覽器有自己的下拉更新，兩套疊在一起會打架。
 */

import { useEffect, useRef } from 'react';
import { hapticLight, hapticMedium, hapticSelection } from '@/lib/haptics';

/**
 * 安全距離：手指要先往下移這麼多，這支才開始接管。
 *
 * 太小（<10px）擋不住誤觸，太大（>30px）會覺得「拉不動」。
 * 18px 大約是一根手指無意識抖動的幅度上限。
 */
const DEAD_ZONE = 18;
/** 跨過安全距離之後，再拉這個距離（未阻尼的原始位移）就算滿格 */
const THRESHOLD = 90;
/** 阻尼後的最大位移，超過就幾乎拉不動了 */
const MAX_PULL = 78;
/** 刷新時內容停在這個位置，讓轉圈看得見 */
const REST_PULL = 56;
/** 指示器（箭頭＋文字）整組的高度，位置計算用 */
const ICON = 40;

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia?.('(display-mode: standalone)');
  const legacy = (navigator as unknown as { standalone?: boolean }).standalone === true;
  // 原生殼（Capacitor）：display-mode 與 navigator.standalone 都不符合，要另外認
  const isNativeShell =
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;
  return Boolean(mql?.matches || legacy || isNativeShell);
}

function isAtTop(): boolean {
  return (document.documentElement.scrollTop ?? 0) <= 0 && (document.body.scrollTop ?? 0) <= 0;
}

/**
 * 讓球浮在「被拖的那個東西所在的層」之上，回傳該用的 z-index。
 *
 * 會員中心那批覆蓋層是 `fixed inset-0 z-[60]`（我的倉庫、抽獎紀錄、配送訂單、
 * 修改個人資訊…），另外還有 z-[90] 與 z-[100] 的。球寫死 30 的話會被整片蓋掉，
 * 那些頁面就只剩震動跟刷新、看不到動畫（老闆 2026-08-20 截圖）。
 *
 * 沿著祖先鏈取最大的 z-index 再加一，就不必為每個覆蓋層 hardcode 數字，
 * 之後有人加新的覆蓋層也不會再踩到。
 */
function stackAbove(el: HTMLElement, floor: number): number {
  let z = floor;
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const v = parseInt(window.getComputedStyle(cur).zIndex, 10);
    if (Number.isFinite(v) && v >= z) z = v + 1;
    cur = cur.parentElement;
  }
  return z;
}

/**
 * 動態島／瀏海的高度（`env(safe-area-inset-top)`）。
 *
 * 原生殼設了 `contentInset: 'never'`（全出血），畫面 y=0 是**螢幕實體頂邊**，
 * 不是可用區的頂邊。自繪頂部的頁（會員／排行／邀請／文章內頁／商品頁）沒有
 * sticky `<nav>` 也沒有 `[data-page-header]`，`navBottom()` 量出 0 →
 * 空隙與轉蛋球被畫在動態島底下，看起來就是「球跑到動態島」或「根本沒有球」
 * （老闆 2026-08-21 截圖）。所以量出來的頂端一律不得高於安全區。
 *
 * env() 在 JS 讀不到（custom property 裡的 env() getComputedStyle 拿到的是
 * 原字串），只能靠一顆探針元素量。值只有轉向時會變，量完就快取。
 */
let safeTopCache: number | null = null;
function safeTop(): number {
  if (safeTopCache !== null) return safeTopCache;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  safeTopCache = probe.getBoundingClientRect().height || 0;
  probe.remove();
  return safeTopCache;
}

/**
 * 全站導航列（`<main>` 外面那條）的下緣，**沒有就是 0**。
 *
 * 為什麼要量而不是寫死 57：導航列在部分頁面是隱藏的，安全區內縮也可能讓它下移。
 *
 * 這裡刻意保留「沒有就 0」：底色帶要從 0 開始鋪，才蓋得住動態島那一段
 * —— 自繪頂部的頁（簽到、邀請）背景色是畫在被拖的元素身上的，一拖走
 * 島底下那條就露出 body 的白（老闆 2026-08-21：「簽到頁下拉，背景底色不該跟著動」）。
 * 空隙與球的起點另外用 `contentTop()`（多壓一層安全區下限）。
 */
function navBottom(): number {
  let bottom = 0;
  const consider = (el: Element) => {
    const r = el.getBoundingClientRect();
    // 貼齊畫面頂端、而且真的畫得出來（隱藏的導航列 rect 全是 0）
    if (r.height > 0 && r.top <= 1 && r.bottom > bottom) bottom = r.bottom;
  };

  document.querySelectorAll('nav, header').forEach((el) => {
    const pos = window.getComputedStyle(el).position;
    if (pos !== 'sticky' && pos !== 'fixed') return;
    consider(el);
  });

  /*
   * 頁面自己的頂欄（components/ui/PageHeader）。
   *
   * 它是 flex 版面裡的一列、**不是 sticky**，所以上面那輪光看 position 抓不到。
   * 但它在畫面上的角色就是固定頂欄，空隙必須開在它下面 —— 少了這段，
   * 全站導航列隱藏的頁面（登入頁那類）會量出 0，轉蛋球被畫到畫面最頂端，
   * 讓這條白底蓋掉大半，只露出一點點（老闆 2026-08-20 截圖）。
   */
  document.querySelectorAll('[data-page-header]').forEach(consider);

  return bottom;
}

/**
 * 空隙／轉蛋球的起點：導航列下緣，但**不得高於安全區**。
 * 全出血下 y=0 是螢幕實體頂邊，球畫在那裡會被動態島吃掉（見 `safeTop()`）。
 */
function contentTop(): number {
  return Math.max(navBottom(), safeTop());
}

/**
 * `<main>` 裡面**此刻正貼在頂端**的 sticky／fixed 列（情報頁分類 tab、
 * 首頁分類列…）。這些要跟導航列一樣定住，不能被 `<main>` 的位移帶著走。
 *
 * 判斷標準是「上緣已經頂到導航列下方」——沒頂到的（例如首頁分類列在輪播圖
 * 底下、離頂端還很遠）就不算釘住，跟著內容一起被拖才是對的，FB／脆也是這樣。
 *
 * 用 class 選擇器先粗篩再看 computed position：整棵 `<main>` 逐一 querySelectorAll
 * 在長頁面上太貴，而這站的 sticky 一律是 Tailwind 的 `.sticky` / `.fixed`。
 * 最後濾掉巢狀的子孫 —— 父層已經被抵銷，子層再抵銷一次會多跑一段。
 */
function pinnedBars(top: number): HTMLElement[] {
  const main = document.querySelector('main');
  if (!main) return [];
  const found: HTMLElement[] = [];
  main.querySelectorAll<HTMLElement>('.sticky, .fixed').forEach((el) => {
    const pos = window.getComputedStyle(el).position;
    if (pos !== 'sticky' && pos !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.height > window.innerHeight * 0.4) return; // 太高的不是頂欄
    if (r.top <= top + 2) found.push(el);
  });
  return found.filter((el, i) => found.indexOf(el) === i && !found.some((o) => o !== el && o.contains(el)));
}

/**
 * 內層捲動容器（活動頁的 `.lpv`）**自己帶的** fixed 頂列 —— 返回／分享那種
 * 浮動鈕。有這種東西的容器**不能整個被拖**：容器一被下 transform 就成了它們的
 * containing block，它們會跟著容器一起被拖下去（老闆 2026-08-22：公平性頁
 * 「參照邀請頁面，同樣的返回圖標跟分享圖標的做法」—— 鈕要留在原地）。
 *
 * ⚠️ 也不能用反向位移把它們定回去：容器是 overflow-y:auto，反向位移會把鈕推到
 * 容器（已經下移）的框外，直接被裁掉 —— 拉到 62px 時鈕整顆消失（2026-08-22
 * Playwright 實測，跟排行榜畫布那個坑同一回事）。正確做法是容器不動、
 * **拖它裡面的流內子節點**（見 `flowChildren()`），fixed 的鈕自然留在原地，
 * 空隙露出來的就是容器自己的底色。
 *
 * 只看**直接子節點、而且是 fixed** 的：
 *   - 不抓 sticky —— 會員中心覆蓋層的清單裡每一列的 sticky 標頭是內容的一部分，
 *     該跟著捲動區走，定住它們反而錯（這正是 resolveStart 那段註解講的坑）
 *   - 不往深處找 —— 長頁面逐一 getComputedStyle 太貴，而頁面級的浮動頂列
 *     在版面上一定是容器的直接子節點
 */
function pinnedChrome(root: HTMLElement, top: number): HTMLElement[] {
  const found: HTMLElement[] = [];
  Array.from(root.children).forEach((child) => {
    const el = child as HTMLElement;
    if (window.getComputedStyle(el).position !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.height > window.innerHeight * 0.4) return;
    if (r.top <= top + 2) found.push(el);
  });
  return found;
}

/**
 * 內層捲動容器的**流內**直接子節點 —— 容器帶著 fixed 頂列時改拖這些
 * （見 `pinnedChrome()`）。fixed／absolute 的子節點不算（頂列、底部 CTA、
 * 裝飾層），`<style>` 這種不佔位的也跳過。
 */
function flowChildren(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter((child) => {
    const el = child as HTMLElement;
    const pos = window.getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'absolute') return false;
    return el.getBoundingClientRect().height > 0;
  }) as HTMLElement[];
}

/**
 * 空隙的底色：看「被拖的區塊坐在什麼底上」——往它的祖先找第一個不透明背景。
 *
 * 底夠白（一般頁面）→ 鋪淡灰 `#e8e8e8`（#f5f5f5 在白 tab 旁看起來就是另一塊白）；
 * 底本來就深（排行榜的 #232429）→ 沿用那個深色，鋪灰會變成一條突兀的亮帶。
 *
 * ⚠️ 不可用 elementFromPoint 對「空隙位置的內容」採樣 —— 那會採到剛好排在
 * 頁面頂端的內容（情報頁採到輪播圖的黑，整條空隙跟著變黑）。
 * 底色屬於「框」，跟頁面的底走，不跟內容走。
 */
function stripColor(from: HTMLElement | null): string {
  const fallback = document.documentElement.classList.contains('dark') ? '#171717' : '#e8e8e8';
  let el = from?.parentElement ?? null;
  while (el && el !== document.documentElement) {
    const bg = window.getComputedStyle(el).backgroundColor;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
    if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
      const luma = (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
      return luma > 0.8 ? fallback : bg;
    }
    el = el.parentElement;
  }
  return fallback;
}

/** 元素身上的縮放倍率（排行榜畫布是 scale() 過的） */
function scaleOf(el: HTMLElement): number {
  const h = el.offsetHeight;
  if (!h) return 1;
  return el.getBoundingClientRect().height / h || 1;
}


/**
 * 觸控起點是否落在會自己捲動的容器裡（橫向輪播、彈層內的清單…）。
 * 不擋掉的話，在那些地方往下滑會同時觸發下拉更新。
 */
/**
 * 觸控起點所在的內層捲動容器（在 <main> 裡、直向、內容超出可捲的那個）。
 * 會員中心那批整頁覆蓋層的內容都放在這種容器裡 —— 拖它而不是拖整個 <main>，
 * 覆蓋層的頁頭與 tab 就自然定住。找不到回 null，走一般路徑。
 */
/**
 * 手勢起點的裁決：從起點往上走，**最近的一層**說了算。
 *
 * - `{ kind: 'marked' }`：碰到 data-ptr-content —— 用頁面宣告的那批
 * - `{ kind: 'inner', el }`：碰到夠大的 overflow-y-auto 容器 —— 只拖它。
 *   不檢查內容有沒有超出高度（空清單也算捲動區，看版型不看內容），
 *   用「佔滿四成螢幕」的門檻擋掉下拉選單這類小元件
 * - `{ kind: 'blocked' }`：碰到 fixed／sticky（頁頭、tab、導航）——
 *   整趟不觸發。正常用戶只會拉內容區，固定區塊拉了不該有作用
 * - `{ kind: 'main' }`：一路到底 —— 一般頁面，拖 <main>
 */
type StartVerdict =
  | { kind: 'marked' }
  | { kind: 'inner'; el: HTMLElement }
  | { kind: 'blocked' }
  | { kind: 'main' };

function resolveStart(target: EventTarget | null): StartVerdict {
  const main = document.querySelector('main');
  let el = target as HTMLElement | null;
  /*
   * 沿路碰到 sticky／fixed 先記著，**不要當場否決**。
   *
   * 這個判斷本來是要擋「拉頁面的固定欄（頁頭、tab、導航）」，但它會誤傷
   * **列表項目自己的 sticky 標頭** —— 抽獎紀錄每一列的 header 就是
   * `sticky top-0`，從列上起手一路被判 blocked，整頁因此完全沒有下拉刷新
   *（老闆 2026-08-20 回報）。那種 sticky 是內容的一部分，會跟著捲動容器走，
   * 跟固定欄是兩回事。
   *
   * 分辨方式：繼續往上找，找得到內層捲動容器就用那個容器（代表這個 sticky
   * 活在可捲動的內容裡）；一路到底都沒有，才是真的頁面固定欄。
   */
  let sawFixedOrSticky = false;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el.hasAttribute('data-ptr-content')) return { kind: 'marked' };
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    /*
     * ⚠️ 高度上限不能省。`overflow-y: auto` 不代表它是捲動區 ——
     * Tailwind 的 `overflow-x-hidden` 只寫了 x 軸，但 CSS 規範規定一軸是
     * hidden 時另一軸的 `visible` 要算成 `auto`，所以商品頁那個
     * `block lg:hidden overflow-x-hidden pb-32 pt-[...]` 容器 computed 出來
     * 就是 `overflow-y: auto`、clientHeight 1900+。誤判成捲動區的後果是
     * 空隙改開在它的上緣（y=0），整個空隙與轉蛋球被畫到 z-50 的固定頂欄
     * 後面 —— 玩家只看到一塊白，看不到球
     * （老闆 2026-08-21：一番賞／盒玩／抽卡／自製賞全中）。
     *
     * 真正的捲動區高度不會超過視窗（超過就輪到頁面捲了），用這條擋掉。
     * 仍然不看 scrollHeight —— 空清單也算捲動區，那條原則沒變。
     */
    if (
      (oy === 'auto' || oy === 'scroll') &&
      el.clientHeight >= window.innerHeight * 0.4 &&
      el.clientHeight <= window.innerHeight + 1 &&
      main?.contains(el)
    ) {
      return { kind: 'inner', el };
    }
    if (style.position === 'fixed' || style.position === 'sticky') sawFixedOrSticky = true;
    el = el.parentElement;
  }
  return sawFixedOrSticky ? { kind: 'blocked' } : { kind: 'main' };
}

function startedInScrollable(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight && el.scrollTop > 0) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

export default function PwaPullToRefresh() {
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);   // 手指按著、起點合格，但還沒跨過安全距離
  const engaged = useRef(false);    // 已跨過安全距離，開始接管
  const armed = useRef(false);      // 已滿格
  const lastTick = useRef(0);       // 上一次細微滴答時的進度（持續微震用）
  const refreshing = useRef(false);
  /** 手勢起點的裁決（touchstart 就量好）：engage 時直接用，不必再走一次祖先鏈 */
  const startVerdict = useRef<StartVerdict | null>(null);
  /**
   * 內層捲動容器被暫時關掉的原生橡皮筋，結束要還原。
   *
   * html／body 的 overscroll 在 effect 開頭就關了，但內層捲動區（活動頁 `.lpv`
   * 是 fixed inset-0 + overflow-y auto）有**自己的**橡皮筋：在它頂端往下拉，
   * iOS 會把它的內容往下彈、我們又對同一個元素下 transform，兩段位移疊在一起，
   * 放手時一個彈回去、一個回彈，hero 就停不回原本的頂邊
   * （老闆 2026-08-22：「公平性驗證頁下拉刷新，hero 區回彈不會到原本頂部」）。
   * 在 touchstart 就關，捲動手勢還沒開始，來得及生效。
   */
  const innerOverscroll = useRef<{ el: HTMLElement; prev: string } | null>(null);
  /** 這一趟要「定住」的 sticky 列，連同原本的 inline 樣式（結束要還原）。
      opaque：不透明的欄（tab 列）在被抵銷後，文件流裡空出來的位置會露出頁面
      底色 —— 用一條「往下的實心 box-shadow」把那個洞蓋成空隙的底色。
      transform 在 <main> 上時整個子樹自成堆疊層，蓋在 fixed 底色帶上面，
      所以這個洞只能從子樹**裡面**蓋，shadow 掛在被定住的欄身上剛剛好。 */
  const pinned = useRef<{ el: HTMLElement; transform: string; shadow: string; opaque: boolean }[]>([]);
  const stripBg = useRef('');
  /** 這一趟實際被拖的元素們：預設 [<main>]；頁面下了 data-ptr-content 就只拖那幾塊。
      scale：縮放畫布（排行榜）裡的元素，位移會被父層 scale() 放大，要先除回去 */
  const dragEls = useRef<{ el: HTMLElement; scale: number }[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 球本體。wrapRef 只當「空隙形狀的裁切框」，位移由這一層負責 */
  const ballRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** 空隙底色帶的頂端（= 導航列下緣；自繪頂部的全出血頁是 0） */
  const stripTop = useRef(0);
  /** 轉蛋球的位置 = 內容原本的上緣，但不得高於安全區 */
  const gapTop = useRef(0);
  /** 內容原本的上緣（沒有安全區修正）—— 底色帶的終點靠它算 */
  const baseTop = useRef(0);
  /** 抬升量 = gapTop − baseTop。內容多走這麼多，空隙才會整段落到動態島底下 */
  const liftRef = useRef(0);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isStandaloneMode()) return;

    /*
     * 關掉 iOS 的原生橡皮筋（老闆 2026-08-20 偽 app 截圖的病根）：
     * 系統的過捲會把**整頁**（含頂部導航）一起拉下去、露出 body 的白底，
     * 跟我們的下拉疊在一起變成雙重位移。偽 app 與原生殼都由這支全權接管
     * 下拉，所以在這兩個環境把系統那套關掉（iOS 16+ 支援；一般瀏覽器
     * 不進這個 effect，原生下拉不受影響）。
     */
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const setShift = (px: number, animate: boolean) => {
      const wrap = wrapRef.current;
      const t = animate ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none';
      /*
       * 內容實際位移 = 手勢位移 + 抬升量。
       *
       * 抬升量（`lift`）只有「被拖的東西本來就貼在螢幕頂邊」的頁面才不是 0
       * —— 簽到、邀請、活動頁（`.lpv` 是 fixed inset:0 的捲動容器）。那些頁
       * 空隙一拉開就在動態島背後，球放進去等於看不到；所以內容要多走一個
       * 安全區的距離，把空隙整段推到島底下，球才有地方站。
       *
       * 抬升量按比例加進去而不是一開始就補滿，不然手指一碰畫面就「啪」跳一段。
       */
      const lift = liftRef.current;
      const shift = px ? px + lift * Math.min(1, px / MAX_PULL) : 0;
      dragEls.current.forEach(({ el, scale }) => {
        el.style.transition = t;
        el.style.transform = shift ? `translate3d(0, ${shift / scale}px, 0)` : '';
        el.style.willChange = shift ? 'transform' : '';
      });
      /*
       * 釘在頂端的 sticky 列：下一個等量的反向位移，抵銷掉 `<main>` 的位移。
       * 它們是 `<main>` 的子孫，會繼承那個 transform；不抵銷的話 tab 會跟著
       * 被拉下去，空隙開在 tab 上面 —— 老闆說那個體感不對，正確的是
       * 「框（含 tab）不動，只有底下的內容被拖」。
       */
      pinned.current.forEach(({ el, transform, shadow, opaque }) => {
        el.style.transition = t;
        el.style.transform = shift ? `${transform} translate3d(0, ${-shift}px, 0)`.trim() : transform;
        if (opaque) {
          // 蓋住欄被定住後空出來的洞（見 pinned ref 的說明）
          el.style.boxShadow = shift ? `0 ${shift}px 0 0 ${stripBg.current}` : shadow;
        }
      });
      if (stripRef.current) {
        /*
         * 底色帶從導航列下緣鋪到位移的最底 —— 蓋住透明 tab 背後露出來的 body，
         * 也讓空隙裡的指示器有底色可以坐。
         * 高度要跟內容用**同一條回彈動畫**收：內容滑回去、底色帶卻瞬間歸零的話，
         * 回彈那零點幾秒空隙會露出頁面的白底，放開就閃一下白
         * （老闆 2026-08-20 情報頁截圖）。
         */
        stripRef.current.style.transition = animate ? 'height .28s cubic-bezier(.22,1,.36,1)' : 'none';
        /*
         * 底色帶蓋的是「本來被內容佔著、現在空出來的那一段」：
         * 從 stripTop 一路到「內容原本的上緣 + 實際位移」。
         *
         * ⚠️ 不可以拿球的位置（gapTop）當終點。全出血的頁面 gapTop 被安全區
         * 壓到 59，內容卻只走了 px，多算的 59px 會直接壓在 hero 上
         * （老闆 2026-08-21：「回彈 hero 圖沒貼頂，而且有塊黑色塊遮擋」）。
         */
        stripRef.current.style.height = shift
          ? `${baseTop.current - stripTop.current + shift}px`
          : '0px';
      }
      if (wrap) {
        /*
         * wrap 是「空隙形狀的裁切框」：高度跟著空隙走、overflow hidden。
         *
         * 球本身高 ICON(26px)，但空隙剛拉開時只有十幾 px —— 置中之後上半截
         * 會溢出到頂欄上面。以前球沉在內容底下看不見所以沒人發現，改成浮起來
         * 之後就露餡了（老闆 2026-08-20：「蓋到頂部導航或頂部 tab」）。
         * 有了裁切框，溢出的部分自然被切掉，球看起來就是從頂欄底下長出來的。
         */
        wrap.style.transition = animate ? 'height .28s cubic-bezier(.22,1,.36,1)' : 'none';
        // 裁切框從球的位置（gapTop）量到空隙底：抬升的那一段在球上面，要扣掉
        wrap.style.height = `${Math.max(0, shift - lift)}px`;
      }
      const ball = ballRef.current;
      if (ball) {
        // 轉圈停在空隙的正中間：空隙高度是 px，轉圈高 ICON
        ball.style.transition = animate ? `${t}, opacity .2s` : 'opacity .2s';
        const gap = Math.max(0, shift - lift);
        ball.style.transform = `translate3d(-50%, ${(gap - ICON) / 2}px, 0)`;
        // 空隙還塞不下指示器之前先不要露臉，不然會看到半截卡在導航列邊上
        ball.style.opacity = gap > ICON * 0.55 ? '1' : '0';
      }
    };

    const reset = (animate = true) => {
      tracking.current = false;
      engaged.current = false;
      armed.current = false;
      lastTick.current = 0;
      if (innerOverscroll.current) {
        innerOverscroll.current.el.style.overscrollBehaviorY = innerOverscroll.current.prev;
        innerOverscroll.current = null;
      }
      setShift(0, animate);
      if (dotRef.current) {
        dotRef.current.classList.remove('ptr-toss');
        dotRef.current.style.transition = '';
        dotRef.current.style.transform = '';
      }
      // 位移歸零之後才能清空清單，不然那幾條會停在被抵銷的位置
      const restore = pinned.current;
      pinned.current = [];
      window.setTimeout(() => {
        restore.forEach(({ el, transform, shadow }) => {
          // 已經被下一趟接手的就別動，不然會把進行中的抵銷清掉
          if (pinned.current.some((p) => p.el === el)) return;
          el.style.transform = transform;
          el.style.boxShadow = shadow;
          el.style.transition = '';
        });
      }, animate ? 300 : 0);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing.current || e.touches.length !== 1) return;
      if (!isAtTop() || startedInScrollable(e.target)) return;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      const verdict = resolveStart(e.target);
      startVerdict.current = verdict;
      if (verdict.kind === 'inner') {
        // 關掉內層捲動區自己的橡皮筋（見 innerOverscroll 的說明）；reset 時還原
        innerOverscroll.current = { el: verdict.el, prev: verdict.el.style.overscrollBehaviorY };
        verdict.el.style.overscrollBehaviorY = 'none';
      }
      tracking.current = true;
      engaged.current = false;
      armed.current = false;
      lastTick.current = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current || refreshing.current) return;
      const raw = e.touches[0].clientY - startY.current;
      const dx = Math.abs(e.touches[0].clientX - startX.current);

      // 往上滑或已經捲離頂端 → 交還給正常捲動
      if (raw <= 0 || !isAtTop()) {
        if (raw <= 0) reset(false);
        return;
      }

      if (!engaged.current) {
        // 還在安全距離內：畫面不動、也不震，這一下讓瀏覽器自己處理
        if (raw < DEAD_ZONE) return;
        // 橫向分量比較大就是在滑輪播／切頁籤，整趟放掉
        if (dx > raw) {
          reset(false); // 順便還原內層容器的 overscroll
          return;
        }
        engaged.current = true;
        // 從跨過安全距離的那一點重新起算，畫面才不會「啪」地跳一段
        startY.current += DEAD_ZONE;

        /*
         * 這一趟要拖誰、定住哪幾條、空隙從哪裡開始 —— 都在這一刻量。
         *
         * 頁面下了 data-ptr-content（排行榜）就只拖那一塊：tab、背景、返回鈕
         * 全在它外面，自然不動，也不需要任何反向位移。沒下的走預設：拖整個
         * <main>，把已貼頂的 sticky 列反向抵銷。
         */
        const main = document.querySelector('main') as HTMLElement | null;
        const verdict = startVerdict.current ?? { kind: 'main' as const };
        if (verdict.kind === 'blocked') {
          // 起點在固定區塊（頁頭、tab、導航）：整趟不觸發
          reset(false);
          return;
        }
        let marked: HTMLElement[] = [];
        /** 內層捲動容器自己帶 fixed 頂列（活動頁）：容器不動、拖子節點、底色帶不浮 */
        let innerChrome = false;
        if (verdict.kind === 'marked') {
          marked = main ? Array.from(main.querySelectorAll<HTMLElement>('[data-ptr-content]')) : [];
        } else if (verdict.kind === 'inner') {
          innerChrome = pinnedChrome(verdict.el, contentTop()).length > 0;
          const children = innerChrome ? flowChildren(verdict.el) : [];
          marked = children.length ? children : [verdict.el];
          if (!children.length) innerChrome = false;
        }

        /*
         * 球要沉在內容底下、還是浮在內容上面，取決於**這一趟拖的是誰**。
         *
         *   拖 <main>        → 沉下去（zIndex 0）
         *     內容整片下移，頂部讓出來的空隙沒有東西擋著，球照樣看得見；
         *     回彈時被內容蓋住，看起來像從版面底下鑽出來再縮回去。
         *     情報頁的分類 tab 也就自然擋在球前面（老闆 2026-08-20 要的）。
         *
         *   拖內層容器／標記區塊 → 浮到那一層之上（stackAbove）
         *     這兩種情況 <main> 完全沒動，球沉下去等於被整片內容蓋死。
         *     而且不能只給個 30 —— 會員中心那批覆蓋層是 z-[60]／z-[90]／z-[100]，
         *     30 照樣被蓋掉。要沿祖先鏈量出實際層級再往上疊一層。
         *
         * ⚠️ 不要改成「把球調低、把 tab 調高」那種比大小的做法：拖 <main> 時
         * 它帶著 transform，會開一個新的 stacking context 把 tab 的 z-20 關在
         * 裡面，外面怎麼調都比不到。層級只能靠「沉下去或浮上來」二選一。
         */
        if (marked.length) {
          // 只拖被標記的區塊：其餘（tab、背景、返回鈕）原地不動，不需要任何抵銷。
          // 空隙開在被拖區塊的最上緣；版面特殊（排行榜的榜單 grid 起點其實在
          // 畫布最上緣，tab 都是絕對定位不佔流）可另下 data-ptr-gap 指定
          // 「空隙從這個元素的上緣開」。
          dragEls.current = marked.map((el) => ({ el, scale: scaleOf(el) }));
          // 標記區塊／內層容器外面的東西本來就不會動，不用定住。
          // 內層容器自己的 fixed 頂列：容器沒被拖（拖的是子節點），鈕自然留在原地。
          pinned.current = [];
          const gapEl = main?.querySelector<HTMLElement>('[data-ptr-gap]') ?? null;
          baseTop.current = Math.max(
            0,
            gapEl
              ? gapEl.getBoundingClientRect().top
              : Math.min(...marked.map((el) => el.getBoundingClientRect().top)),
          );
          // 球的位置下限是安全區，不是 0 —— 全出血下 0 是動態島背後（見 safeTop()）
          gapTop.current = Math.max(safeTop(), baseTop.current);
        } else {
          dragEls.current = main ? [{ el: main, scale: 1 }] : [];
          const top = contentTop();
          pinned.current = pinnedBars(top).map((el) => {
            const bg = window.getComputedStyle(el).backgroundColor;
            const transparent = bg === 'transparent' || /rgba\(.+,\s*0\)$/.test(bg);
            return {
              el,
              transform: el.style.transform || '',
              shadow: el.style.boxShadow || '',
              opaque: !transparent,
            };
          });
          /*
           * 空隙從「不透明的頂欄」下緣開始。透明的浮動鈕（文章內頁、排行榜的
           * 返回鈕：pointer-events-none 的整寬 wrapper，背景全透明）雖然也要
           * 定住，但它是「浮在內容上」不是「壓著內容的欄」—— 拿它的下緣當
           * 空隙起點，轉圈會被推到空隙外面，看起來就是沒有轉圈
           * （老闆 2026-08-20：「文章內頁下拉缺失圖標」）。
           */
          /*
           * 內容原本的上緣：有不透明頂欄就取它的下緣，沒有就是導航列下緣
           * （導航列也沒有的話是 0 —— 簽到、邀請那種自繪頂部的全出血頁）。
           * 起算值用 `navBottom()` 的原值而不是 `top`（已被安全區墊高過），
           * 否則全出血頁會誤以為內容本來就從安全區底下開始。
           */
          baseTop.current = pinned.current.reduce(
            (acc, { el, opaque }) => (opaque ? Math.max(acc, el.getBoundingClientRect().bottom) : acc),
            navBottom(),
          );
          gapTop.current = Math.max(safeTop(), baseTop.current);
        }
        /*
         * 底色帶從「內容原本的上緣之上那道固定的東西」開始鋪：
         *   拖 <main>          → 導航列下緣（沒有導航列就是 0，鋪到螢幕頂邊）
         *   拖標記／內層容器   → 就是它自己的上緣
         * 活動頁的 `.lpv` 是 `position:fixed; inset:0` 的捲動容器，上緣在 0，
         * 所以底色帶從螢幕頂邊開始 —— 少了這段，它被拖走後動態島那條會露出
         * body 的底色（老闆 2026-08-21：「回彈後沒有到頂邊」）。
         */
        stripTop.current = marked.length ? baseTop.current : navBottom();
        liftRef.current = Math.max(0, gapTop.current - baseTop.current);
        /*
         * 球一律**浮在被拖的那一層之上**。
         *
         * 以前拖 <main> 時是讓球沉下去（z 0），賭「空隙是空的、沒東西擋」。
         * 那個賭注在商品頁不成立：商品頁的根是
         * `min-h-screen bg-neutral-50` **加 paddingTop**（導航列高度做成內距），
         * 所以它的**背景從 y=0 就開始畫**、藏在導航列後面。往下拖 78px 之後，
         * 元素上緣才到 y=78，還在導航列（下緣 116）上面 —— 「空隙」整段仍被
         * 這片背景蓋著，z-0 的球自然看不到
         * （老闆 2026-08-21：「一番賞商品頁面下拉沒看到轉蛋圖，可能在後面被遮蓋到了」；
         *  盒玩那句「高度距離短」也是同一件事 —— 位移的前 116px 藏在導航列後面）。
         *
         * 浮起來不會蓋到頂欄或 tab：外層 wrap 是「空隙形狀的裁切框」，
         * 上緣就在頂欄底下，球再高也只能在框內露臉。
         */
        const opaqueBar = marked.length ? null : pinned.current.find((p) => p.opaque);
        const floatZ = stackAbove(
          (marked.length ? marked[0] : opaqueBar?.el) ?? dragEls.current[0]?.el ?? document.body,
          30,
        );
        if (wrapRef.current) {
          wrapRef.current.style.zIndex = String(floatZ);
          wrapRef.current.style.top = `${gapTop.current}px`;
        }
        /*
         * 空隙底色。頁面可以在 `<main>` 裡的任一元素上用 `data-ptr-strip` 指定：
         *   `none`     不鋪（會員中心：橘色泡泡背景是 fixed 的，本來就會從空隙
         *              露出來，再鋪一層灰等於把它蓋掉）
         *   `<色碼>`   鋪指定色（簽到頁的 #ff2d14、邀請頁的白）—— 那兩頁的底色
         *              畫在**被拖的元素**身上，一拖走頂端就露出 body 的白
         *              （老闆 2026-08-21：「簽到頁下拉，背景底色不該跟著動」）。
         * 這裡要往**下**找不是往上找：宣告寫在頁面元件上，而頁面元件是
         * `<main>`（= dragEls[0]）的子孫。
         */
        const declaredStrip = main
          ?.querySelector('[data-ptr-strip]')
          ?.getAttribute('data-ptr-strip');
        /*
         * `verdict.kind === 'inner'`（活動頁 `.lpv`、會員中心覆蓋層）的底色要取
         * **它自己的背景** —— 它是滿版捲動容器，那就是玩家看到的頁面底；
         * 照預設往祖先找會跳過它、拿到 body 的白，活動頁就會鋪出一條突兀的灰。
         */
        const bgFrom = dragEls.current[0]?.el ?? null;
        stripBg.current = declaredStrip
          ? (declaredStrip === 'none' ? 'transparent' : declaredStrip)
          : stripColor(
              verdict.kind === 'inner'
                ? (verdict.el.firstElementChild as HTMLElement | null) ?? verdict.el
                : bgFrom,
            );
        if (stripRef.current) {
          /*
           * 底色帶跟著球一起浮 —— 沉在 z-0 的話會被商品頁那片「從 y=0 開始畫」
           * 的背景蓋掉，只剩球孤零零浮在頁面底色上。
           * ⚠️ 有不透明頂欄（tab 列）時**不能浮**：底色帶的範圍是
           * [navBottom, gapTop+位移]，涵蓋了那條被定住的 tab，浮起來會把它蓋掉。
           * 那種情況維持沉在下面，tab 自然畫在它前面（原本就是這樣設計的）。
           */
          /*
           * 與球同層：wrap 排在這條之後，同層時後者畫在上面，球自然壓在底色帶上。
           *
           * 例外：內層捲動容器自己帶 fixed 頂列（活動頁 `.lpv`，見 pinnedChrome）。
           * 那時拖的是容器裡的子節點、容器本身沒動，空隙露出來的就是容器自己的
           * 底色（深色活動頁就是它的 bg_color），根本不需要底色帶；而且浮上去
           * 一定壓在留在原地的返回／分享鈕上（`.lpv` 是 z-50 的堆疊層，鈕在
           * 它裡面，外面再高的 z 都比不到它底下）—— 老闆 2026-08-22 公平性頁。
           * 所以沉到 0，藏在 <main> 後面。
           */
          stripRef.current.style.zIndex = opaqueBar || innerChrome ? '0' : String(floatZ);
          stripRef.current.style.top = `${stripTop.current}px`;
          stripRef.current.style.background = stripBg.current;
        }
      }

      const dy = raw - DEAD_ZONE;
      // 阻尼：愈拉愈沉，逼近 MAX_PULL 但到不了
      const shift = MAX_PULL * (1 - Math.exp(-dy / MAX_PULL));
      const progress = Math.min(dy / THRESHOLD, 1);

      setShift(shift, false);
      if (dotRef.current) {
        if (progress < 1) {
          /*
           * 拉的過程：球像被捏著中下緣往下扯 —— 直向拉長、橫向略縮
           *（水滴被拉的變形感，老闆指定）。用 transform 不動寬高：
           * 球身是上下蓋的漸層，改高度會把蓋子比例改掉。
           * 跟著手指走的階段不能有 transition，不然會慢半拍。
           */
          dotRef.current.style.transition = 'none';
          dotRef.current.style.transformOrigin = 'center bottom';
          // 慢慢被壓扁：直向縮、橫向脹，貼著地（老闆 2026-08-20）
          dotRef.current.style.transform =
            `scaleY(${(1 - progress * 0.45).toFixed(3)}) scaleX(${(1 + progress * 0.35).toFixed(3)})`;
        } else if (!armed.current) {
          // 過門檻的瞬間：壓扁的球「往上彈」回圓（帶過衝），提示可以放手了
          dotRef.current.style.transition = 'transform .25s cubic-bezier(.34,1.56,.64,1)';
          dotRef.current.style.transform = 'translateY(-6px)';
        }
      }

      if (reduceMotion) return;

      // 拉動中：持續的細微滴答（每 4.5% 進度一下）—— 安全距離內根本進不到
      // 這裡（DEAD_ZONE 擋掉），不會拉 1px 就震
      if (progress < 1 && Math.abs(progress - lastTick.current) >= 0.045) {
        lastTick.current = progress;
        hapticSelection();
      }
      // 滿格：給一下明顯較重的，玩家不用看畫面就知道可以放手
      if (!armed.current && progress >= 1) {
        armed.current = true;
        hapticMedium();
      }
    };

    const onEnd = () => {
      if (!tracking.current || refreshing.current) return;
      tracking.current = false;

      if (!armed.current) {
        reset();
        return;
      }

      // 滿格：球開始拋接，同時停在看得見的位置
      refreshing.current = true;
      setShift(REST_PULL, true);
      if (dotRef.current) {
        // 放開：球往上拋 → 落地壓扁 → 回彈幾下到停住（keyframes 在 globals.css）
        dotRef.current.style.transition = 'none';
        dotRef.current.style.transform = '';
        dotRef.current.classList.add('ptr-toss');
      }
      // 放開後只有「碰地」的兩下微震（對齊 ptr-toss 的 46%、80% 落地格），
      // 其餘安靜（老闆 2026-08-20）
      if (!reduceMotion) {
        window.setTimeout(() => { if (refreshing.current) hapticLight(); }, 460);
        window.setTimeout(() => { if (refreshing.current) hapticLight(); }, 800);
      }
      /*
       * 球落定後**只重掛內容區**，不整頁 reload（老闆 2026-08-20：市面 App
       * 都是內容區刷新，固定的頂部／底部導航不需要跟著刷）。
       * PathnameKeyed 收到事件會換 key 重掛 <main> 底下整棵頁面 → 各頁的
       * 抓資料 effect 重跑 → 內容換新；框與登入態原地不動，也沒有白屏。
       * 舊的被拖曳元素隨重掛消失，位移自然歸零，這裡只要收掉底色帶與球。
       */
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ggb:content-refresh'));
        refreshing.current = false;
        reset(true);
      }, 1050);
    };

    // 轉向後安全區換邊（橫向時上緣的 inset 是 0），快取要作廢重量
    const dropSafeTop = () => { safeTopCache = null; };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', () => reset(), { passive: true });
    window.addEventListener('resize', dropSafeTop);
    window.addEventListener('orientationchange', dropSafeTop);

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      window.removeEventListener('resize', dropSafeTop);
      window.removeEventListener('orientationchange', dropSafeTop);
      dragEls.current.forEach(({ el }) => {
        el.style.transform = '';
        el.style.transition = '';
        el.style.willChange = '';
      });
      pinned.current.forEach(({ el, transform, shadow }) => {
        el.style.transform = transform;
        el.style.boxShadow = shadow;
        el.style.transition = '';
      });
      pinned.current = [];
      document.documentElement.style.overscrollBehaviorY = prevHtmlOverscroll;
      document.body.style.overscrollBehaviorY = prevBodyOverscroll;
    };
  }, []);

  return (
    <>
    {/*
      空隙的底色帶：fixed、排在 <main> 之前，所以畫在內容底下、body 背景上面。
      淺色頁是灰的（老闆指定：轉圈要坐在灰底上，不是一塊白的），
      深色頁取頁面自己的底色。高度跟著位移走，沒在拉的時候是 0。
    */}
    <div
      ref={stripRef}
      aria-hidden
      style={{ position: 'fixed', left: 0, right: 0, top: 0, height: 0, zIndex: 0, pointerEvents: 'none' }}
    />
    <div
      ref={wrapRef}
      aria-hidden
      style={{
        position: 'fixed',
        // 起始值只是預設，實際位置在手指跨過安全距離時才量（見 headerBottom）
        top: 0,
        left: 0,
        right: 0,
        height: 0,
        // 只讓球在空隙範圍內露臉，溢出的部分切掉（見上面 update 的說明）
        overflow: 'hidden',
        // 起始值；實際層級在每趟手勢開始時依「拖的是誰」決定（見 onMove 的 engage）
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <div
        ref={ballRef}
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: `translate3d(-50%, ${-ICON}px, 0)`,
          opacity: 0,
        }}
      >
      {/*
        轉蛋球＋文字（老闆指定的樣式）。灰底由 stripRef 那條底色帶負責。
        球是純 CSS：主題色上蓋＋細縫線＋白色下蓋（.ptr-ball，globals.css），
        變形用 transform（origin 在頂端 = 上緣被捏住、下緣被扯的感覺）；
        放開後的拋接動畫在 .ptr-toss。格子高度留出上拋與落地的空間。
      */}
        <div className="flex h-[26px] items-start justify-center">
          <div
            ref={dotRef}
            className="ptr-ball"
            style={{ width: 20, height: 20 }}
          />
        </div>
      </div>
    </div>
    </>
  );
}
