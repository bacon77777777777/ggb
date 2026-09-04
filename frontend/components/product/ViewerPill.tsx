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

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useBottomBar } from '@/lib/useBottomBar';

/** 數字重算一次的間隔（老闆 2026-08-31 指定 5 秒） */
const TICK_MS = 5_000;

/**
 * 最冷門的商品，平均多久有一位虛擬訪客進來（老闆 2026-08-31 指定 30 秒）。
 * 熱門商品會照熱度縮短這個間隔。
 */
const ARRIVAL_MS = 30_000;

/** 一位訪客停留多久（毫秒，隨機落在這個區間）。平均 30 秒 */
const DWELL_MIN = 15_000;
const DWELL_MAX = 45_000;

/**
 * 熱度對到訪率的放大倍數。
 * 佔比 100% 的商品到訪率是冷門商品的 (1 + HOT_MULT) 倍。
 *
 * 它**不再乘上在線人數的倍率** —— 那是舊版的算法，會讓冷門商品的到訪率
 * 完全不受站上人數影響（佔比 0 → 加成項 0 → 只剩常數）。站上一百個人在逛，
 * 一個沒人抽過的商品卻還是每 30 秒才一位訪客，不合理。
 */
const HOT_MULT = 4;

/** 站上真的一個人都沒有時，至少當作這麼多人在逛 */
const MIN_ASSUMED_ONLINE = 3;

/** 一格最多生幾位訪客。純粹防呆，避免在線人數異常時跑一個超大迴圈 */
const MAX_PER_SLOT = 40;

/** 心跳間隔。伺服器端的窗口是 45 秒，留兩倍餘裕給網路抖動 */
const HEARTBEAT_MS = 20_000;

/**
 * presence 的人數上限。超過就退訂，改用心跳回來的數字。
 *
 * presence 每有人進出就把**整份名單**廣播給頻道上每個人，成本立方成長 ——
 * 實測 40 人：sync 428 次、0.41 MB；外推 500 人光進場潮就約 840 MB。
 * 60 人時每次進出的廣播量約 72 KB，還可以；再上去就會開始拖慢手機端。
 *
 * 小房間留著 presence 是因為它**即時**（有人開分頁當下就 +1），
 * 大房間本來就看不出 20 秒的差別。
 */
const PRESENCE_MAX = 60;

/**
 * 站台活躍度：在線人數換算成「到訪率的基礎倍率」。
 *
 * 用平方根而不是線性：線性的話一萬人在線會讓數字變成幾千，畫面直接爆掉；
 * 用對數又長得太慢（100 人跟 10000 人差不到一倍）。平方根介於兩者之間，
 * 每一個量級都看得出差別，數字也還在人看得懂的範圍。
 *
 * 下限 1：試營運期間站上就是沒人，這時維持「冷門 30 秒一位」的手感，
 * 不要比現在更冷。
 */
function siteActivity(online: number) {
  return Math.max(1, 0.5 + 0.5 * Math.sqrt(Math.max(MIN_ASSUMED_ONLINE, online) / 10));
}

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

export interface ViewerContext {
  /** 這件商品近 24 小時的真人抽數 */
  product_draws_24h: number;
  /** 全站近 24 小時的真人抽數（分母） */
  total_draws_24h: number;
  /** 站上近 15 分鐘在線的真人數（跟後台 header 同一個定義） */
  online_now: number;
}

/**
 * 虛擬訪客數：模擬「有人進來、看一會、走掉」，不是模擬一個數字。
 *
 * ## 為什麼改成這樣
 *
 * 上一版是對一個數字做平滑抖動（3→4→4→3）。那讀起來像計數器在晃，
 * 不像有人來有人走 —— 而且冷門商品的底數是 0，數字**完全靜止**在 1，
 * 一個永遠不動的數字比沒有這個標籤還糟，它明擺著說「這裡沒人」。
 *
 * 現在改成模擬訪客本身：每位訪客有進場時間與停留時長，當下時間落在誰的
 * 區間內就 +1。數字的變化因此是離散的 +1／−1 並且會停留一段時間 ——
 * 那才是「有人進來看了一下又走了」（老闆 2026-08-31：要像直播那樣）。
 *
 * ## 到訪率
 *
 * 冷門商品平均 30 秒一位；熱門商品照「近 24h 抽數佔比 × 站上在線人數」
 * 縮短間隔，最熱可以到每 5 秒一位。凌晨整體再放慢（hourFactor）。
 *
 * ## 仍然是純函數
 *
 * 進場與停留都由 `hash(商品 id, 時間格)` 決定 —— 所有人同一時間看到同一個
 * 數字，兩支手機擺一起比對不會穿幫。
 *
 * 只往回看 DWELL_MAX 那麼長的時間（9 格），更早進場的訪客一定已經走了。
 */
function virtualViewers(productId: string, ctx: ViewerContext | null, now: number) {
  const share = ctx && ctx.total_draws_24h > 0
    ? ctx.product_draws_24h / ctx.total_draws_24h
    : 0;

  /*
   * 到訪率 ＝ 站台活躍度（跟在線人數走）×（1＋熱度加成）× 時段。
   *
   * 關鍵是**站台活躍度是乘在最外面的**，所以連佔比 0 的冷門商品也會跟著
   * 站上的人數變熱。舊版把在線人數只乘在熱度加成裡，冷門商品那一項是 0，
   * 於是在線 0 人跟 100 人時逐格一模一樣。
   */
  const rate = siteActivity(ctx?.online_now ?? 0)
    * (1 + share * HOT_MULT)
    * hourFactor(new Date(now).getHours());

  /*
   * 每一格「期望來幾位」。可以大於 1 —— 站真的爆量時一格來好幾位是正常的，
   * 夾在 1 以內的話人數會頂在 DWELL_MAX/TICK_MS = 9 動不了
   * （舊版就是這樣，在線 30 人跟 10000 人的數字一模一樣）。
   *
   * 整數部分一定來，小數部分擲一次骰。
   */
  const expected = Math.min(MAX_PER_SLOT, (TICK_MS / ARRIVAL_MS) * rate);
  const whole = Math.floor(expected);
  const frac = expected - whole;

  const slots = Math.ceil(DWELL_MAX / TICK_MS);
  const cur = Math.floor(now / TICK_MS);
  let alive = 0;
  for (let i = 0; i < slots; i++) {
    const slot = cur - i;
    let n = whole;
    if ((hash32(`${productId}:a:${slot}`) % 10000) < frac * 10000) n++;
    for (let k = 0; k < n; k++) {
      // 同一格的每一位各自有停留時長，不然他們會整批同進同出
      const dwell = DWELL_MIN + (hash32(`${productId}:d:${slot}:${k}`) % (DWELL_MAX - DWELL_MIN));
      if (now < slot * TICK_MS + dwell) alive++;
    }
  }
  return alive;
}

interface Props {
  productId: string | number;
}

/**
 * `inline`：不做 portal、不 fixed，直接回傳膠囊本體，由呼叫端擺位置。
 * 電腦版商品頁把它放在舞台右下角（老闆 2026-09-04：照 packs）。
 */
/**
 * `render`：inline 時改用呼叫端給的外觀（電腦版舞台的膠囊要跟價格、剩餘長一樣），
 * 數字還是這裡算。
 */
export default function ViewerPill({ productId, inline = false, render }: Props & { inline?: boolean; render?: (count: number) => ReactNode }) {
  const pid = String(productId);
  /*
   * real 初值 0 而不是 1：presence 還沒接上時不要先猜。
   * 顯示時才用 max(real, 1) 補上「你自己」—— 你人就在這一頁，一定至少 1。
   */
  const [real, setReal] = useState(0);
  /* null＝還沒在瀏覽器算過。SSR 不輸出任何東西，才不會 hydration 對不上 */
  const [base, setBase] = useState<number | null>(null);
  const [ctx, setCtx] = useState<ViewerContext | null>(null);
  /** 心跳回來的真人數。null＝沒有 Redis 或它掛了，這時退回 presence */
  const [counted, setCounted] = useState<number | null>(null);
  const tooBig = (counted ?? 0) > PRESENCE_MAX;

  /*
   * 熱度與在線人數：進頁面抓一次，之後每 3 分鐘更新。
   * 不跟著 5 秒的重算一起打 —— 那是一分鐘 12 次查詢，而這兩個數字
   * 本來就是 24 小時／15 分鐘的窗口，抓那麼勤沒有意義。
   */
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc('get_viewer_context', { p_product_id: Number(pid) });
      const row = (data as ViewerContext[] | null)?.[0];
      if (alive && row) setCtx(row);
    };
    load();
    const t = setInterval(load, 180_000);
    return () => { alive = false; clearInterval(t); };
  }, [pid]);

  useEffect(() => {
    const tick = () => setBase(virtualViewers(pid, ctx, Date.now()));
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [pid, ctx]);

  /*
   * 心跳計數（權威來源）。
   *
   * 每 20 秒 ping 一次，伺服器回「最近 45 秒內有心跳的分頁數」。
   * 成本是線性的 —— 500 人就是 500 個小請求回一個整數，
   * 而 presence 在那個規模是每次進出 5 MB 的廣播。
   *
   * 沒設 Redis（本機開發）或 Redis 掛掉時回 null，這時完全靠 presence，
   * 跟原本的行為一樣。
   */
  useEffect(() => {
    let alive = true;
    /* 這個分頁的識別。不用 crypto.randomUUID()：手機連本機 dev 不是 secure context */
    const sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const beat = async () => {
      try {
        const res = await fetch(`/api/viewers/${pid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid }),
        });
        const j = await res.json();
        if (alive) setCounted(typeof j?.viewers === 'number' ? j.viewers : null);
      } catch {
        if (alive) setCounted(null);
      }
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => { alive = false; clearInterval(t); };
  }, [pid]);

  useEffect(() => {
    /*
     * 人數超過上限就不要再開 presence —— 那是爆紅檔期會出事的地方。
     * 已經開著的會在 counted 超標時被這個 effect 收掉（依賴帶了 tooBig）。
     */
    if (tooBig) return;
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
  }, [pid, tooBig]);

  const bar = useBottomBar(base !== null && !inline);
  if (base === null) return null;

  /*
   * 真人（至少 1，你人就在這一頁）＋ 虛擬訪客。
   *
   * 不再有「冷門就固定顯示 1」那條規則 —— 那讓 99% 的商品掛著一個永遠不動的
   * 數字。改成連冷門商品也有訪客進出（只是稀疏），數字才會活（老闆 2026-08-31）。
   */
  /*
   * 真人數：優先用心跳（權威、可擴展），沒有才退回 presence。
   * 兩者都至少 1 —— 你人就在這一頁。
   */
  const realCount = Math.max(counted ?? real, 1);
  const count = realCount + base;

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
  if (inline) return render ? <>{render(count)}</> : body;

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
