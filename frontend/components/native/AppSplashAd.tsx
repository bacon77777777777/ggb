'use client';

/**
 * App 開屏廣告（滿版 banner + 右上角倒數）
 *
 * 只在原生殼裡跑，而且**一次啟動只出現一次** —— 網頁版與 PWA 完全不受影響。
 * 圖從後台「輪播圖管理 → App 開屏」來（`banners.page = 'app_splash'`），
 * 排期、上下架、點擊連結都在那裡設，換檔不用改程式。
 *
 * 為什麼要先讀 localStorage 快取：開屏廣告的價值在「一開 App 就看到」，
 * 等 Supabase 回來才顯示的話，玩家已經在看首頁了，這時候才蓋一張全螢幕
 * 反而像當機。所以上次拿到的那張先秀，同一輪再去問一次最新的：
 *   後台換圖  → 這次先看到舊的，下次啟動就是新的
 *   後台下架  → 查完發現沒有，當場收掉（最多閃一下）
 * 兩種情況都不會卡住玩家。
 *
 * 倒數歸零自動收，右上角那顆隨時可以按掉 —— 不給出路的開屏廣告是最惹人厭的
 * 那一種。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { native } from '@/lib/native/bridge';
import { filterBannersBySchedule } from '@/lib/schedule';
import { isInternalUrl, toInternalPath } from '@/lib/internalUrl';
import { openExternal } from '@/lib/native/browser';

/** 停留秒數。三秒是開屏廣告的通例：看得完一張圖，又不到讓人焦躁 */
const SECONDS = 3;
const CACHE_KEY = 'ggb_app_splash';

type Splash = { image: string; link: string };

/**
 * 一次啟動只跑一次。
 *
 * 放在模組層而不是 state：root layout 在 SPA 裡不會重新掛載，但換頁時
 * 這支仍可能被 React 重新執行 effect，用模組旗標最省事。
 * 冷啟動時 webview 整個重載，模組會跟著重來，所以「下次開 App 還會出現」。
 */
let launched = false;

function readCache(): Splash | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Splash;
    return v?.image ? v : null;
  } catch {
    return null;
  }
}

export default function AppSplashAd() {
  const router = useRouter();
  const [splash, setSplash] = useState<Splash | null>(null);
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setVisible(false);
    // 淡出跑完再卸掉，直接拔會看到硬切
    window.setTimeout(() => setSplash(null), 260);
  }, []);

  useEffect(() => {
    if (!native.isNativePlatform()) return;
    if (launched) return;
    launched = true;

    let alive = true;

    /** 圖載完才顯示，不然會先蓋一塊白的再跳出圖 */
    const show = (s: Splash) => {
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        setSplash(s);
        setVisible(true);
      };
      img.src = s.image;
    };

    const cached = readCache();
    if (cached) show(cached);

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('banners')
          .select('id, image_url, link_url, start_at, end_at, events(start_at, end_at)')
          .eq('is_active', true)
          .eq('page', 'app_splash')
          .order('sort_order', { ascending: true });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const live = filterBannersBySchedule((data ?? []) as any[]);
        const first = live[0] as { image_url?: string; link_url?: string | null } | undefined;

        if (!alive) return;

        if (!first?.image_url) {
          // 後台沒有（或已下架／過檔期）：收掉快取，也把正在顯示的那張收起來
          try { localStorage.removeItem(CACHE_KEY); } catch { /* 無痕模式寫不了，略過 */ }
          if (cached) dismiss();
          return;
        }

        const next: Splash = { image: first.image_url, link: first.link_url || '' };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* 同上 */ }
        // 沒有快取可秀時，這裡才是第一次顯示
        if (!cached) show(next);
      } catch {
        // 查不到就是不顯示，開屏廣告不該擋住任何人進站
      }
    })();

    return () => { alive = false; };
  }, [dismiss]);

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
          用原生 <img> 不用 next/image：圖在 R2，尺寸與網域都由後台決定，
          走最佳化只是多繞一層還要維護 remotePatterns。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={splash.image}
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
