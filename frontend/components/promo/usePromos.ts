'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { scheduleState } from '@/lib/schedule';
import { isHiddenToday } from '@/lib/promoDismiss';
import { useAuth } from '@/contexts/AuthContext';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns';

/** 「最新上架」彈窗要顯示的商品 */
export interface NewArrivalProduct {
  id: string;
  name: string;
  price: number | null;
  image_url: string | null;
  type: string | null;
}

/** 這個 id 不存在於 site_promos，是前端組出來的最新上架彈窗 */
export const NEW_ARRIVAL_ID = '__new_arrival__';

/** 幾天內上架算「新品」。太舊的東西掛著「最新上架」比不顯示還糟 */
const NEW_ARRIVAL_DAYS = 30;
/*
 * 一次最多秀幾件。
 *
 * 白板高度是外框的 66%（top 30.5% / bottom 3.5%），在 max-w-330 的卡片上約 324px，
 * 一列 48px + 間距 6px，**五列剛好塞得下**。第六列會被切在白板下緣 ——
 * 那看起來像壞掉，不像「可以往下捲」（同一個坑在 2×2 版型也踩過一次）。
 */
const NEW_ARRIVAL_LIMIT = 5;

export interface SitePromo {
  id: string;
  layout: 'card' | 'image' | 'new_arrival';
  title: string | null;
  body: string;
  image_url: string | null;
  cta_text: string | null;
  cta_href: string | null;
  placements: string[];
  start_at: string | null;
  end_at: string | null;
  sort_order: number;
  /** 只有 new_arrival 版型會帶 */
  products?: NewArrivalProduct[];
}


/**
 * 取出「此時此地該顯示」的首頁彈窗，依排序由小到大排隊。
 *
 * ── 顯示規則（2026-08-12 起）──
 * **預設每次進首頁都跳**，不再有後台的「對象」與「關閉後」兩個全站設定
 * （老闆指定拿掉：那兩個一改就是全站一起改，粒度太粗）。
 * 要不要少看一次改由玩家決定 —— 每則彈窗下方的「今日不再顯示」，
 * 勾了再按叉叉就記到當天結束，隔天照跳。最新上架彈窗也吃同一套。
 *
 * 警語列不走這裡 —— 它的內容與規則寫死在 NoticeBar，不做後台設定。
 */
export function usePromos(placement: string) {
  const [promos, setPromos] = useState<SitePromo[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  useEffect(() => {
    // 等登入狀態確定再查，否則會先用「未登入」判一次、登入後又閃一次
    if (isAuthLoading) return;
    let cancelled = false;

    const load = async () => {
      const supabase = createClient();

      const [{ data: rows }, { data: settingRows }] = await Promise.all([
        supabase
          .from('site_promos')
          .select('*')
          .eq('kind', 'popup')
          .eq('is_active', true)
          .contains('placements', [placement])
          .order('sort_order', { ascending: true }),
        supabase
          .from('platform_settings')
          .select('key,value')
          .in('key', ['promo_new_arrival_enabled']),
      ]);

      if (cancelled) return;

      const map = Object.fromEntries((settingRows ?? []).map(r => [r.key, r.value]));

      const queue = ((rows ?? []) as SitePromo[]).filter(
        p => scheduleState(p.start_at, p.end_at) === 'running' && !isHiddenToday(p.id),
      );

      /*
       * 最新上架彈窗排在**最後面**（老闆指定層級比「關閉後」小）：
       * 後台自己編的公告先講完，才輪到它。
       *
       * 它不吃「關閉後」那組規則 —— 開關打開就是每次進首頁都跳，
       * 所以不進 shouldShow 的過濾，關閉時也不寫 localStorage。
       *
       * 只在首頁出現：其他位置（例如挑戰頁）不該跳商品廣告。
       */
      if (placement === 'home' && map.promo_new_arrival_enabled === '1' && !isHiddenToday(NEW_ARRIVAL_ID)) {
        const since = new Date(Date.now() - NEW_ARRIVAL_DAYS * 86400_000).toISOString();
        // 可見條件與首頁商品列表一致，免得彈出一件首頁上找不到的商品
        const { data: newRows } = await supabase
          .from('products')
          .select(PRODUCT_PUBLIC_COLUMNS)
          .neq('status', 'pending')
          .neq('type', 'slot')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(NEW_ARRIVAL_LIMIT);

        const products = (newRows ?? []) as unknown as NewArrivalProduct[];
        if (!cancelled && products.length > 0) {
          queue.push({
            id: NEW_ARRIVAL_ID,
            layout: 'new_arrival',
            title: null,
            body: '',
            image_url: null,
            cta_text: null,
            cta_href: null,
            placements: [placement],
            start_at: null,
            end_at: null,
            sort_order: Number.MAX_SAFE_INTEGER,
            products,
          });
        }
      }

      if (cancelled) return;
      setPromos(queue);
      setIsLoaded(true);
    };

    void load();

    // 同一頁把某則勾「今日不再顯示」之後，其他位置要立刻跟著收起來
    const onDismiss = () => setPromos(prev => prev.filter(p => !isHiddenToday(p.id)));
    window.addEventListener('ggb:promoDismissed', onDismiss);
    return () => {
      cancelled = true;
      window.removeEventListener('ggb:promoDismissed', onDismiss);
    };
  }, [placement, isAuthenticated, isAuthLoading]);

  return { promos, isLoaded };
}
