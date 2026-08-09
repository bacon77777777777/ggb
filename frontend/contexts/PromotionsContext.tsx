'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * 促銷方案
 *
 * 商品卡角落的「買5送1」標籤、商品頁的「再加 N 抽就送 1 抽」提示都讀這裡。
 *
 * 一次把全站生效中的方案查回來（讀的是 public_product_promotions view，
 * 檔期與優先權都在資料庫算好了），而不是每張卡各查一次 ——
 * 首頁一次渲染幾十張卡，逐張查等於幾十個請求。
 *
 * 加贈的計算前後端各有一份（這裡與 DB 的 promo_bonus_for），
 * 但兩份的用途不同：這裡只是「先告訴玩家會送幾抽」，
 * 真正送幾抽是 DB 說了算。前端算錯頂多顯示不準，不會多送或少送。
 */

export interface ProductPromotion {
  promotionId: number;
  badgeText: string;
  type: 'bundle';
  buy: number;
  free: number;
}

type State = {
  byProduct: Map<number, ProductPromotion>;
  isLoading: boolean;
};

const PromotionsContext = createContext<State>({ byProduct: new Map(), isLoading: true });

export function PromotionsProvider({ children }: { children: React.ReactNode }) {
  const [byProduct, setByProduct] = useState<Map<number, ProductPromotion>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('public_product_promotions')
          .select('product_id, promotion_id, badge_text, config, type');
        if (error) throw error;

        const m = new Map<number, ProductPromotion>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (data ?? []) as any[]) {
          const buy = Number(r.config?.buy) || 0;
          const free = Number(r.config?.free) || 0;
          if (!buy || !free) continue;
          m.set(Number(r.product_id), {
            promotionId: Number(r.promotion_id),
            badgeText: String(r.badge_text || `買${buy}送${free}`),
            type: 'bundle',
            buy,
            free,
          });
        }
        if (!cancelled) setByProduct(m);
      } catch {
        // 查不到就當作沒有促銷。標籤不出現比整頁壞掉好
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({ byProduct, isLoading }), [byProduct, isLoading]);
  return <PromotionsContext.Provider value={value}>{children}</PromotionsContext.Provider>;
}

export function usePromotions() {
  return useContext(PromotionsContext);
}

/** 這個商品現在有沒有促銷 */
export function useProductPromotion(productId: number | string | null | undefined) {
  const { byProduct } = usePromotions();
  const id = Number(productId);
  return Number.isFinite(id) ? byProduct.get(id) ?? null : null;
}

/**
 * 買 n 抽會送幾抽。跟 DB 的 promo_bonus_for 同一條算法（migration 517）：
 * 每滿 buy 抽送 free 抽（買5送1：付 5 抽的錢、拿 6 顆）。
 */
export function freeDrawsFor(promo: ProductPromotion | null, count: number): number {
  if (!promo || count < 1) return 0;
  return Math.floor(count / promo.buy) * promo.free;
}

/** 還差幾抽才湊得滿下一組贈抽。回 0 代表已經湊滿或沒有促銷 */
export function drawsUntilNextFree(promo: ProductPromotion | null, count: number): number {
  if (!promo) return 0;
  const remainder = count % promo.buy;
  return remainder === 0 ? 0 : promo.buy - remainder;
}
