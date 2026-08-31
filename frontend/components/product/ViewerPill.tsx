'use client';

/**
 * 「N 人正在看」膠囊 —— 貼在商品頁底部操作欄上緣、置中
 *
 * 取代原本掛在同一個位置的公平性警語列（老闆 2026-08-31 指定隱藏）。
 * 公平性沒有消失：頁面裡的「公平性驗證」區塊（FairnessPanel）還在。
 *
 * ## 數字怎麼來的（老闆 2026-08-31 選的是「真人即時＋假底數」）
 *
 * 顯示值 = **真人即時人數**（Supabase Realtime presence，同一件商品開一個頻道）
 *        + **底數**（依商品 id 與時段算出來的假人數）
 *
 * 為什麼要底數：試營運期間同時在線的真人幾乎都是 1，照實顯示「1 人正在看」
 * 反而是在告訴玩家這裡沒人。底數讓它看起來有人氣，真人多的時候數字仍然
 * 真的會跟著跳（多開一個分頁就 +1）。
 *
 * 底數的三個性質是刻意的：
 *   1. **所有人看到同一個數字** —— 底數只吃 `productId` 與時間分桶，不吃亂數，
 *      兩個人同時開同一件商品不會各看到各的（截圖對照時會穿幫）。
 *   2. **熱門商品比較高** —— 用已抽比例當熱度，剛開賣的冷門商品不會憑空 20 人。
 *   3. **半夜比較低** —— 凌晨三點顯示 20 人在看是假的最明顯的時候。
 *
 * 純顯示用，不寫進任何資料表 —— 跟排行榜／彈幕／情報留言那些機器人資料一樣，
 * 絕不碰 `draw_records`（那張表同時是庫存與銷量的依據）。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useBottomBar } from '@/lib/useBottomBar';

/** 底數換一次的間隔。太短會像跑馬燈，太長玩家停留期間看不到它動 */
const BUCKET_MS = 45_000;

/** FNV-1a：只要「同樣的輸入給同樣的輸出」，不需要密碼學強度 */
function hash32(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 時段係數（台灣時間就是瀏覽器本地時間，玩家幾乎都在台灣） */
function hourFactor(hour: number) {
  if (hour >= 2 && hour < 7) return 0.35;    // 凌晨
  if (hour >= 7 && hour < 11) return 0.6;    // 早上
  if (hour >= 11 && hour < 18) return 0.85;  // 白天
  return 1;                                   // 18:00–02:00 晚間高峰
}

/**
 * @param heat 0–1 的熱度（已抽比例）。算不出來時傳 undefined，當 0.35 中庸值處理，
 *             不要當 0 —— 剛上架、一張都還沒抽的新商品不該被判成冷門。
 */
function baseline(productId: string, heat: number | undefined, now: number) {
  const core = 4 + (hash32(`ggb-viewers:${productId}`) % 11);       // 4–14 每件商品自己的底
  const hot = Math.round(core * (heat === undefined ? 0.35 : heat)); // 熱門再加一截
  const bucket = Math.floor(now / BUCKET_MS);
  const wobble = (hash32(`${productId}:${bucket}`) % 7) - 3;         // −3 … +3
  const f = hourFactor(new Date(now).getHours());
  return Math.max(2, Math.round((core + hot + wobble) * f));
}

/**
 * 已抽比例，給 `heat` 用。算不出來回 undefined（膠囊自己會套中庸值）——
 * 回 0 會讓每件商品在籤數還沒載到的那一瞬間都被當成冷門。
 */
export function viewerHeat(total?: number | null, remaining?: number | null) {
  const t = Number(total), r = Number(remaining);
  if (!Number.isFinite(t) || !Number.isFinite(r) || t <= 0) return undefined;
  return Math.min(1, Math.max(0, (t - r) / t));
}

interface Props {
  productId: string | number;
  /** 已抽數 / 總籤數。傳不出來就別傳 */
  heat?: number;
}

export default function ViewerPill({ productId, heat }: Props) {
  const pid = String(productId);
  /*
   * real 初值 0 而不是 1：presence 還沒接上時不要先猜。
   * 顯示時才用 max(real, 1) 補上「你自己」—— 你人就在這一頁，一定至少 1。
   */
  const [real, setReal] = useState(0);
  /* null＝還沒在瀏覽器算過。SSR 不輸出任何東西，才不會 hydration 對不上 */
  const [base, setBase] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setBase(baseline(pid, heat, Date.now()));
    tick();
    const timer = setInterval(tick, BUCKET_MS);
    return () => clearInterval(timer);
  }, [pid, heat]);

  useEffect(() => {
    const supabase = createClient();
    /*
     * presence key 用「這個分頁」的隨機字串，不用 user id：
     * 未登入的訪客沒有 id，而且他們正是最需要看到人氣的人。
     * 不用 crypto.randomUUID() —— 手機連本機 dev（http://192.168.x.x）不是
     * secure context，那支函式在那裡是 undefined，會整個炸掉。
     */
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(`product-viewers:${pid}`, {
      config: { presence: { key } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setReal(Object.keys(channel.presenceState()).length);
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') channel.track({ at: Date.now() });
      });

    return () => { supabase.removeChannel(channel); };
  }, [pid]);

  const bar = useBottomBar(base !== null);
  if (base === null) return null;

  const count = base + Math.max(real, 1);

  /*
   * 膠囊本體。下面兩條 return 都用它，不要各寫一份（改了樣式只改到一邊）。
   *
   * 高度寫死 `h-[26px]` 而不是靠 padding 撐：文字與圓點兩個子元素的行框高度
   * 不一樣，用 padding 的話膠囊高度由「比較高的那個」決定，另一個就會偏。
   * 固定高度 + items-center，兩個都對同一條中線。
   */
  const body = (
    <div className="flex h-[26px] items-center gap-1.5 rounded-full bg-black/65 px-3 backdrop-blur-md ring-1 ring-white/10">
      <span className="relative flex h-[7px] w-[7px] items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-red-500" />
      </span>
      {/*
        leading-none 讓行框等於字級，flex 置中的就是字形本身；
        中文與數字混排時再往下墊 0.5px —— 數字坐在基線上、中文填滿字身框，
        行框置中會讓整串看起來偏高一點點。
      */}
      <span className="translate-y-[0.5px] text-[12px] font-medium leading-none text-white/90">
        {count} 人正在看
      </span>
    </div>
  );

  /*
   * 掛進底部操作欄本體、用 bottom-full 疊在它上緣 —— 理由與警語列同一套：
   * 自己開 fixed 去對齊，iPhone Safari 網址列收合時 safe-area 由 0 變 ~34px、
   * 底部欄當場重排，我們的數字要等 ResizeObserver 回呼才跟上，捲動當下就分家。
   * 詳見 components/promo/NoticeBar.tsx 的長註解。
   *
   * 全程 pointer-events-none：它是裝飾，不能吃掉「立即抽獎」上緣的觸控 ——
   * 手指偏一點按到膠囊卻沒反應，玩家只會覺得按鈕壞了。
   */
  if (bar) {
    return createPortal(
      <div className="pointer-events-none absolute bottom-full left-0 right-0 flex justify-center pb-2">
        {body}
      </div>,
      bar,
    );
  }

  /*
   * 這一頁沒有底部操作欄 —— 轉蛋與盒玩只有 mode5 那組機台把按鈕移到底部欄，
   * 其餘主題的按鈕畫在機台上，畫面底下是空的（商品頁不顯示 MobileTabbar）。
   * 這種情況就貼著畫面底放，不要照著「有底部欄」去墊 64px 的空。
   *
   * 底部欄稍晚才掛上的那一兩幀也走這條，膠囊會往上跳一次 —— 那時頁面本來就
   * 還在載入，比起「整頁都停在錯的位置」划算得多。
   */
  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      data-testid="viewer-pill-fallback"
    >
      {body}
    </div>
  );
}
