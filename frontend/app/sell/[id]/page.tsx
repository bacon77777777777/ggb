'use client';

import '../market.css';

/**
 * 商城商品詳情 —— 獨立頁（/sell/<id>）
 *
 * 老闆 2026-08-15：商品頁要是獨立頁面不是彈層，網址帶商品編號，
 * 返回鍵左、分享鍵右（分享同抽獎商品：手機系統分享面板／桌機複製連結）。
 *
 * 跟 /sell 一樣是「宿主」：React 只渲染一個空 div，殼與互動全由同一個引擎接手，
 * 差別只在 opts.item —— 引擎進商品頁模式：沒有分頁列與頂欄，#screen 就是那件商品，
 * 購買整條龍（選規格／購物車／結帳／付款回報／聊聊／店舖）照舊是引擎的彈層，
 * 網址接在後面（/sell/<id>?v=cart），所以不用在這裡重做一份結帳。
 *
 * 商品資料單獨載（sell_feed_one）：首頁 feed 只拿前 60 筆，分享出去的連結／較舊的商品
 * 不一定在裡面。找不到（已下架）引擎會顯示「商品不存在或已下架」。
 *
 * 2026-08-14 曾把這頁收成轉址殼（→ /sell?open=<id> 彈層），今天依老闆指示改回獨立頁。
 */

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { MALL_SHELL } from '../proto/shell';
import { initMall } from '../proto/mall';
import { loadMallData, makeMallDb, loadMe, loadCategories, loadItem } from '../proto/data';

export const dynamic = 'force-dynamic';

export default function SellItemPage() {
  useFeatureGate('sell');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const id = Number(params?.id);

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      router.replace('/sell');
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    let engine: { destroy?: () => void } | null = null;
    let dead = false;

    root.innerHTML = MALL_SHELL;
    Promise.all([loadMallData(), loadMe(), loadCategories(), loadItem(id)]).then(
      ([data, me, categories, itemData]) => {
        if (dead) return;
        engine = initMall(root, {
          item: id,
          itemData,
          data,
          me,
          categories,
          db: me ? makeMallDb() : null,
          nav: (url: string) => router.push(url),
          // 有來路就回上一頁（商城首頁會照網址還原分頁／彈層）；分享連結直接開的就回商城
          onBack: () => {
            if (typeof window !== 'undefined' && window.history.length > 1) router.back();
            else router.push('/sell');
          },
        });
      }
    );

    return () => {
      dead = true;
      engine?.destroy?.();
      root.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return <div ref={rootRef} className="mk mallroot mk--item" />;
}
