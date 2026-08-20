'use client';

/**
 * App 開屏廣告（第二層）
 *
 * ── 兩層開屏 ──
 * 業界（淘寶、蝦皮、抖音）的開屏都是兩層疊起來的：
 *
 *   第一層　系統啟動畫面（純 logo）　由作業系統畫，點下圖示的瞬間就在
 *   第二層　開屏廣告（倒數可跳過）　由這支負責
 *
 * **關鍵規則只有一條：第二層沒準備好，第一層不能收。**
 * 所以玩家看到的是 `logo → 廣告 → 首頁`，首頁一次都不會提前露臉。
 *
 * 這也是 2026-08-20 這次重寫的原因。舊版是「等網頁 render 完，再蓋一張上去」，
 * 而那必然發生在首頁畫出來之後 —— 老闆看到的「先顯示首頁，過一兩秒才蓋圖」
 * 不是寫壞了，是順序上註定如此。現在改成由這支主動收掉第一層：
 *
 *   要放廣告 → 圖確定畫上去了才 hide()，兩層在同一幀交接
 *   不放廣告 → 立刻 hide()，直接看到首頁
 *
 * 對應的原生設定是 `launchAutoHide: false`（mobile/capacitor.config.ts）。
 * ⚠️ 因此**這支一定要把 hide() 呼叫出去**，任何一條分支漏掉，App 就永遠停在
 * logo。程式裡每個出口都收好了，原生端另有 8 秒保險（AppDelegate.swift）。
 *
 * ── 圖為什麼存在手機裡 ──
 * 開屏廣告的價值在「一開 App 就看到」。等 Supabase 回答再下載圖，那幾百毫秒
 * 只能拿首頁去填，就是舊版的破綻。所以改成**這次啟動時先把圖存成 data URL**，
 * 下次冷啟動同步讀 localStorage、零網路等待。
 * 換圖的代價是慢一輪：後台換圖 → 玩家這次還是看到舊的 → 下次啟動才是新的。
 * 後台下架 → 快取清掉 → 下次就不再出現（不打斷正在看的那一次）。
 *
 * 快取分兩層，因為這兩件事的成功率差很多：
 *
 *   ① 網址（src / link）　一定存得進去
 *   ② 圖本身（data URL）　盡力而為
 *
 * 只有 ② 需要把圖 `fetch()` 成 bytes，而圖在 R2 的公開網域、**那裡沒有回
 * CORS 標頭**（`<img src>` 不受影響，fetch 就被擋）。第一版把兩層混在一起，
 * 結果是快取永遠寫不進去、開屏永遠不跳（老闆 2026-08-20 回報「設了圖卻都
 * 沒看到」）。現在 ② 改走同源代理 /api/app-splash?image=1；就算它還是失敗，
 * 有 ① 就能退回「用網址直接顯示」—— 慢個幾百毫秒，但那段時間系統啟動畫面
 * 還蓋著，玩家看不到差別。
 *
 * ── 什麼時候跳（老闆 2026-08-20 定）──
 * 冷啟動，以及離開超過 5 分鐘再回來。換頁、下拉更新一律不跳。
 * 實作上統一成一條規則：**距離上次跳過開屏不到 5 分鐘就不跳**。
 * 這條同時擋掉了「webview 被 iOS 回收後重載」造成的重複跳，不必另外判斷。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { native } from '@/lib/native/bridge';
import { isInternalUrl, toInternalPath } from '@/lib/internalUrl';
import { openExternal } from '@/lib/native/browser';

/** 停留秒數。三秒是開屏廣告的通例：看得完一張圖，又不到讓人焦躁 */
const SECONDS = 3;

const CACHE_KEY = 'ggb_app_splash';
const LAST_SHOWN_KEY = 'ggb_app_splash_at';

/** 這麼久之內不再跳（冷啟動、回前景共用同一條規則） */
const COOLDOWN_MS = 5 * 60 * 1000;

/**
 * data URL 上限。localStorage 大約 5MB，開屏圖（1290x2796 的 WebP）通常
 * 300~800KB，轉 base64 後約 1MB 上下，很夠用。真的塞進一張巨圖時寧可放棄
 * 快取（下次還是不跳），也不要把整個 localStorage 擠爆連累別的功能。
 */
const MAX_CACHE_BYTES = 3_000_000;

/**
 * `src` 是來源網址（一定有，用來比對後台換圖了沒，也是退路的顯示來源），
 * `image` 是存進手機的 data URL（可能沒有，見檔頭說明）
 */
type Cached = { src: string; link: string; image?: string };

/** 走網路載圖時等多久就放棄（放棄＝這次不跳廣告，直接進首頁） */
const NETWORK_TIMEOUT_MS = 2500;

/**
 * 原生啟動畫面只能收一次。
 *
 * 放模組層而不是 state：這支在 SPA 裡不會重新掛載，但 React 仍可能重跑 effect，
 * 重複呼叫 hide 沒有實害、只是多一次 bridge 往返。冷啟動時 webview 整個重載，
 * 模組跟著重來，所以下次開 App 一切照舊。
 */
let splashHidden = false;

function hideNativeSplash(fadeOutDuration: number) {
  if (splashHidden) return;
  splashHidden = true;
  void native.call('SplashScreen', 'hide', { fadeOutDuration });
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Cached;
    if (!v?.src) return null;
    // 存壞的 data URL 就當作沒有，退回用網址顯示
    if (v.image && !v.image.startsWith('data:')) return { src: v.src, link: v.link };
    return v;
  } catch {
    return null;
  }
}

function withinCooldown(): boolean {
  try {
    const at = Number(localStorage.getItem(LAST_SHOWN_KEY) || 0);
    return Number.isFinite(at) && Date.now() - at < COOLDOWN_MS;
  } catch {
    return false;                      // 讀不到就當沒跳過，寧可多跳一次也不要不跳
  }
}

function writeCache(v: Cached): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(v));
  } catch {
    /* 空間不足或無痕模式：放棄快取，不影響這次啟動 */
  }
}

/**
 * 把圖抓下來轉成 data URL，存起來給**下一次**啟動用。
 * 走同源代理而不是 R2 原網址 —— R2 沒有 CORS，直接 fetch 會被擋。
 */
async function cacheImage(v: Cached): Promise<void> {
  const res = await fetch('/api/app-splash?image=1', { cache: 'no-store' });
  if (!res.ok) return;
  const blob = await res.blob();
  if (blob.size > MAX_CACHE_BYTES * 0.75) return;      // base64 會再脹三分之一

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  if (!dataUrl.startsWith('data:') || dataUrl.length > MAX_CACHE_BYTES) return;

  writeCache({ ...v, image: dataUrl });
}

/** 載到能畫為止；逾時或載不起來回 false（這次就不跳廣告） */
async function preload(src: string, timeoutMs: number): Promise<boolean> {
  const img = new Image();
  img.src = src;
  try {
    await Promise.race([
      img.decode(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export default function AppSplashAd() {
  const router = useRouter();
  const [splash, setSplash] = useState<Cached | null>(null);
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const timers = useRef<number[]>([]);
  const started = useRef(false);

  const dismiss = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setVisible(false);
    // 淡出跑完再卸掉，直接拔會看到硬切
    window.setTimeout(() => setSplash(null), 260);
  }, []);

  useEffect(() => {
    if (!native.isNativePlatform()) return;      // 網頁版與 PWA 完全不受影響
    if (started.current) return;
    started.current = true;

    let alive = true;

    /**
     * 決定這一次要不要跳，並負責把第一層收掉。
     *
     * `trigger` 是 'launch'（冷啟動）或 'resume'（回前景）。差別只在後者的
     * 系統啟動畫面早就收了，沒有交接問題。
     */
    const maybeShow = async (trigger: 'launch' | 'resume'): Promise<boolean> => {
      const cached = readCache();
      // 沒快取（第一次安裝）或還在冷卻時間內 → 不跳，交給呼叫端收掉第一層
      if (!cached || withinCooldown()) return false;

      /*
       * 先把圖解碼好再顯示。「解碼完成」是唯一能保證下一幀畫得出來的信號 ——
       * 少了它，收掉第一層的瞬間可能是一塊白的。
       *
       * 存進手機的 data URL 解碼是幾毫秒的事；退回走網路時就得等下載，
       * 所以給 2.5 秒上限 —— 網路太慢就放棄這次廣告直接進首頁，
       * 不能為了一張廣告把玩家鎖在啟動畫面上。
       */
      const source = cached.image || cached.src;
      const ok = await preload(source, cached.image ? 4000 : NETWORK_TIMEOUT_MS);
      if (!ok || !alive) return false;

      try { localStorage.setItem(LAST_SHOWN_KEY, String(Date.now())); } catch { /* 同上 */ }
      setSplash(cached);
      setVisible(true);

      if (trigger === 'launch') {
        /*
         * 兩幀之後才收第一層：第一幀 React 把 <img> 掛上去，第二幀確定它已經
         * 上畫面。順序反過來（先收再顯示）就會退回舊版那種閃爍。
         */
        requestAnimationFrame(() => requestAnimationFrame(() => hideNativeSplash(0)));
      }
      return true;
    };

    /** 背景更新：問後台現在該放哪張，把網址與圖存好給下次啟動用 */
    const refreshCache = async () => {
      try {
        const res = await fetch('/api/app-splash', { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as { src?: string; link?: string } | null;

        if (!next?.src) {
          // 後台沒有、已下架或過檔期：清快取，下次就不跳（不打斷正在看的這次）
          try { localStorage.removeItem(CACHE_KEY); } catch { /* 無痕模式寫不了 */ }
          return;
        }

        const cached = readCache();
        const sameImage = cached?.src === next.src;
        const entry: Cached = {
          src: next.src,
          link: next.link || '',
          // 換圖了就把舊的 data URL 丟掉，不然下次會秀到上一張
          image: sameImage ? cached?.image : undefined,
        };

        /*
         * 先把網址寫下去 —— 這一步不需要 CORS，一定成功。
         * 就算下面存圖失敗，下次啟動也還能用網址把廣告顯示出來。
         */
        writeCache(entry);

        if (!entry.image) await cacheImage(entry);
      } catch {
        /* 問不到就沿用上次快取的那張，開屏廣告不該擋住任何人進站 */
      }
    };

    void (async () => {
      let shown = false;
      try {
        shown = await maybeShow('launch');
      } catch {
        /* 不管出什麼事都不能讓第一層留在畫面上，交給下面收 */
      } finally {
        /*
         * ⚠️ 只有「沒跳廣告」才在這裡收。
         * 有跳的話收掉的時機是上面那兩個 rAF —— 在這裡搶著收會**先於**廣告
         * 上畫面（setState 是非同步的），等於自己把無縫交接破壞掉。
         */
        if (!shown) hideNativeSplash(200);
      }
      void refreshCache();
    })();

    /*
     * 回前景也算一次啟動（離開超過 5 分鐘的話）。這是抖音、淘寶的做法 ——
     * 廣告曝光夠，又不會讓「切出去回個訊息」變成每次都被廣告攔一次。
     */
    let removeListener: (() => void) | null = null;
    void (async () => {
      const appPlugin = native.plugin('App');
      const handle = (await appPlugin?.addListener?.('appStateChange', ((state: { isActive?: boolean }) => {
        if (state?.isActive) void maybeShow('resume');
      }) as unknown as never)) as { remove?: () => void } | null;
      if (!alive) { void handle?.remove?.(); return; }
      removeListener = () => { void handle?.remove?.(); };
    })();

    return () => {
      alive = false;
      removeListener?.();
    };
  }, []);

  // 倒數：圖出現才開始算，不然圖還沒載完秒數就先跑掉了
  useEffect(() => {
    if (!visible) return;
    setLeft(SECONDS);
    for (let i = 1; i <= SECONDS; i++) {
      timers.current.push(
        window.setTimeout(() => (i === SECONDS ? dismiss() : setLeft(SECONDS - i)), i * 1000),
      );
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [visible, dismiss]);

  if (!splash) return null;

  const go = () => {
    const link = splash.link;
    dismiss();
    if (!link || link === '#') return;
    if (isInternalUrl(link)) router.push(toInternalPath(link));
    else void openExternal(link);
  };

  return (
    <div
      className="fixed inset-0 z-[10000] bg-white dark:bg-neutral-950 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      {/* 滿版：直式手機的比例各不相同，一律裁切填滿，不留黑邊。
          用原生 <img> 不用 next/image：來源是 localStorage 的 data URL，
          走最佳化沒有意義。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={splash.image || splash.src}
        alt=""
        onClick={go}
        className="h-full w-full object-cover"
        draggable={false}
      />

      <button
        type="button"
        onClick={dismiss}
        aria-label="跳過廣告"
        className="absolute right-4 flex h-8 items-center gap-1 rounded-full bg-black/45 px-3.5 text-[13px] font-black text-white backdrop-blur-sm active:scale-95 transition-transform"
        // 狀態列在 App 裡不覆蓋 webview，但瀏海機的圓角還是要閃開
        style={{ top: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        <span className="tabular-nums">{left}</span>
        <span>跳過</span>
      </button>
    </div>
  );
}
