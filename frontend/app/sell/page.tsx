'use client';

import './market.css';

/**
 * 商城 —— 原型 UI 先行版
 *
 * 老闆定案的順序：先把 `docs/prototypes/ggb-market-taobao_3.html` 的 UI／交互 1:1 搬進站內
 * （跑在假資料上，整套可以點完），驗收手感之後再把資料層逐段換成真接口。
 *
 * 這頁只是宿主：React 渲染一個**空 div**，殼與所有互動都在 effect 裡由引擎接手
 * （root.innerHTML = 殼 → initMall）。
 *
 * ⚠️ 殼刻意不用 dangerouslySetInnerHTML：那樣殼屬於 React 管轄，
 * 之後任何一次重渲染的調和都可能把引擎畫進去的 DOM 洗回空殼
 * （實測就發生了——引擎渲染完，畫面隨後被清空）。
 * React 只擁有外層空 div、永遠不更新它，引擎的 DOM 才動不了。
 *
 * 網址：引擎自己讀寫 ?tab= / ?c= / ?v=（見 mall.ts「網址同步」），這裡不需要傳；
 * 引擎推／換網址時 useSearchParams 會跟著變、這個元件重渲染，但 JSX 沒有子節點，
 * React 不會碰引擎畫進去的 DOM。
 * 商品詳情是獨立頁 /sell/<id>，舊的 /sell?open=<id>（後台預覽、舊分享連結）在這裡轉過去。
 */

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { useListScrollMemory } from '@/lib/useListScrollMemory';
import { MALL_SHELL } from './proto/shell';
import { initMall } from './proto/mall';
import { loadMallData, makeMallDb, loadMe, loadCategories } from './proto/data';

export const dynamic = 'force-dynamic';

export default function MallPage() {
  useFeatureGate('sell');
  const router = useRouter();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 從商品頁返回時捲回原本看到的位置（老闆 2026-08-30）。
  // 這頁的 DOM 是引擎自己畫的，所以只記位置、不記清單 —— 引擎重畫完
  // restoreScrollTo 還在重試，位置接得回去
  const rememberScroll = useListScrollMemory('ggb:sell:view');

  // 舊網址相容：/sell?open=<id> → /sell/<id>
  const legacyOpen = searchParams?.get('open') || '';

  useEffect(() => {
    if (legacyOpen) {
      router.replace(`/sell/${encodeURIComponent(legacyOpen)}`);
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    let engine: { destroy?: () => void } | null = null;
    let dead = false;

    // 先把殼掛上，取到資料再啟動引擎。取數失敗回 null，
    // 這時引擎跑內建示範資料 —— DB 掛掉就整頁空白更糟。
    root.innerHTML = MALL_SHELL;
    Promise.all([loadMallData(), loadMe(), loadCategories()]).then(([data, me, categories]) => {
      // 資料回來前就換頁了：不要再往已經清空的 root 裡塞引擎
      if (dead) return;
      // 沒登入就不給 db：引擎會退回示範資料，而不是每個動作都跳「請先登入」
      engine = initMall(root, {
        data,
        me,
        // 上架類別白名單（後台商城設定），空陣列時引擎用內建預設
        categories,
        db: me ? makeMallDb() : null,
        // 點商品卡 → 獨立商品頁
        nav: (url: string) => { rememberScroll(); router.push(url); },
      });
    });

    return () => {
      dead = true;
      engine?.destroy?.();
      root.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyOpen]);

  return <div ref={rootRef} className="mk mallroot" />;
}
