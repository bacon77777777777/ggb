import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 「猜你喜歡」的推薦。
 *
 * 先前的做法是 `products.eq(status,'active').limit(4)` —— 沒有任何 order by，
 * 所以每個玩家、每個商品頁看到的幾乎都是同樣那四件（PostgreSQL 不保證
 * 回傳順序，實務上是資料表的實體順序）。名字叫猜你喜歡，其實誰都一樣。
 *
 * 現在照玩家自己的抽獎紀錄推薦：
 *   1. 讀自己抽過的商品 → 取出它們的廠商／分類／類型
 *   2. 找同廠商或同分類或同類型的其他上架商品
 *   3. 不足四件時，用「同類型的新品」補滿
 *
 * 不需要新的 RPC：`draw_records` 的 RLS 正好是 `auth.uid() = user_id`，
 * 玩家讀自己的紀錄本來就讀得到。未登入就直接走保底那條。
 */

type Client = SupabaseClient<any, 'public', any>;

/** 抽獎紀錄取樣上限。常客可能有上千筆，只要看得出口味就夠了 */
const HISTORY_LIMIT = 200;

export async function fetchRecommendations(
  supabase: Client,
  currentId: number | string,
  currentType?: string | null,
  limit = 4
) {
  const picked = new Map<number, any>();

  /** 依序收集，重複與當前商品一律跳過 */
  const collect = (rows: any[] | null) => {
    for (const r of rows ?? []) {
      if (picked.size >= limit) return;
      if (String(r.id) === String(currentId)) continue;
      if (!picked.has(r.id)) picked.set(r.id, r);
    }
  };

  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;

    if (uid) {
      const { data: history } = await supabase
        .from('draw_records')
        .select('product_id')
        .eq('user_id', uid)
        .order('id', { ascending: false })
        .limit(HISTORY_LIMIT);

      const drawnIds = [...new Set((history ?? []).map(h => h.product_id).filter(Boolean))];

      if (drawnIds.length) {
        // 抽過的那些商品「長什麼樣」——廠商、分類、類型
        const { data: drawn } = await supabase
          .from('products')
          .select('id, type, category, supplier_id')
          .in('id', drawnIds);

        const suppliers = [...new Set((drawn ?? []).map(d => d.supplier_id).filter(Boolean))];
        const categories = [...new Set((drawn ?? []).map(d => d.category).filter(Boolean))];
        const types = [...new Set((drawn ?? []).map(d => d.type).filter(Boolean))];

        const ors: string[] = [];
        if (suppliers.length) ors.push(`supplier_id.in.(${suppliers.join(',')})`);
        if (categories.length) ors.push(`category.in.(${categories.map(c => `"${c}"`).join(',')})`);
        if (types.length) ors.push(`type.in.(${types.map(t => `"${t}"`).join(',')})`);

        if (ors.length) {
          let q = supabase
            .from('products')
            .select(PRODUCT_PUBLIC_COLUMNS)
            .eq('status', 'active')
            .neq('type', 'slot')
            .or(ors.join(','))
            .order('created_at', { ascending: false })
            .limit(limit * 4);

          // 已經抽過的就別再推了 —— 玩家要的是「還沒玩過的同類」
          if (drawnIds.length) q = q.not('id', 'in', `(${drawnIds.join(',')})`);

          const { data } = await q;
          collect(data);
        }
      }
    }

    // 保底：同類型的新品；再不夠就任意上架商品。
    // 兩段都有 order by，至少不會每頁都是同樣那四件。
    if (picked.size < limit && currentType) {
      const { data } = await supabase
        .from('products')
        .select(PRODUCT_PUBLIC_COLUMNS)
        .eq('status', 'active')
        .eq('type', currentType)
        .order('created_at', { ascending: false })
        .limit(limit * 3);
      collect(data);
    }

    if (picked.size < limit) {
      const { data } = await supabase
        .from('products')
        .select(PRODUCT_PUBLIC_COLUMNS)
        .eq('status', 'active')
        .neq('type', 'slot')
        .order('created_at', { ascending: false })
        .limit(limit * 3);
      collect(data);
    }
  } catch {
    // 推薦區塊掛掉不該影響商品頁本身，靜默收掉
  }

  return [...picked.values()].slice(0, limit);
}
