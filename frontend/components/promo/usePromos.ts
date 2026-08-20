'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { scheduleState } from '@/lib/schedule';
import { isHiddenToday } from '@/lib/promoDismiss';
import { isJustRefreshed } from '@/lib/contentRefresh';
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

/** 幾天內上架算「新品」。太舊的東西掛著「最新上架」比不顯示還糟。
 *  30 → 7（老闆 2026-08-19）：同一批新品連跳一個月，玩家會當它是常駐廣告 */
const NEW_ARRIVAL_DAYS = 7;
/*
 * 最多帶回幾件。
 *
 * 一次把 30 天內的新品全撈回來（欄位很少，一百多筆的成本可以忽略），
 * 畫面再一次露出 10 筆、捲到底自動再露 10 筆（見 PromoPopup 的 visibleCount）。
 *
 * 為什麼不用資料庫分頁：排序要「照類別分組、組內新的在前」，而類別順序是
 * 自訂的（一番賞→盒玩→轉蛋→抽卡→自製賞→機台），PostgREST 排不出來。
 * 分頁撈的話每一頁都會各自從一番賞重新排一次，分組就散了。
 *
 * 200 是保險上限，不是預期值 —— 真的有那麼多新品時，彈窗也不該變成商品目錄。
 */
const NEW_ARRIVAL_LIMIT = 200;

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

    /*
     * 下拉更新造成的重掛不算「進首頁」。
     *
     * 刷新是玩家要看新內容，不是要再看一次公告；每刷一次跳一次會讓人不敢刷
     * （老闆 2026-08-20）。導航進來仍然照跳 —— 這裡擋的只有刷新那一次。
     */
    if (isJustRefreshed()) {
      setIsLoaded(true);
      return;
    }

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

        /*
         * 依類別排序、同類別擺在一起（老闆指定順序：
         * 一番賞 → 盒玩 → 轉蛋 → 抽卡 → 自製賞 → 機台）。
         * 同一類之內維持「新的在前」（查詢已經照 created_at 倒序）。
         *
         * 是「先取最新的 N 件、再照類別排」，不是每類各取幾件 ——
         * 這個彈窗要講的是最近上了什麼，不是各類別的目錄。
         */
        const CATEGORY_SORT = ['ichiban', 'blindbox', 'gacha', 'card', 'custom', 'slot'];
        const rank = (t?: string | null) => {
          const i = CATEGORY_SORT.indexOf(String(t ?? ''));
          return i < 0 ? CATEGORY_SORT.length : i;      // 沒對到的類別排最後
        };
        const products = ((newRows ?? []) as unknown as NewArrivalProduct[])
          .sort((a, b) => rank(a.type) - rank(b.type));
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
