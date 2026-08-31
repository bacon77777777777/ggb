import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 商品頁最下方「猜你喜歡」的推薦。
 *
 * ## 為什麼重寫（老闆 2026-08-31：「現在幾乎都是一樣商品」）
 *
 * 上一版已經會讀玩家的抽獎紀錄了，但**每一段查詢都是
 * `order('created_at', desc)`，然後照順序取前四件** —— 於是：
 *
 *   - 沒登入／沒抽過的人：走保底那條 → 永遠是「同類型最新的四件」。
 *     同一個類型底下每一頁的推薦一模一樣。
 *   - 有抽過的人：候選是「同廠商 OR 同分類 OR 同類型」聯集，常客的口味
 *     幾乎涵蓋全站，`.or()` 等於沒篩 → 又回到「全站最新的四件」。
 *
 * 兩條路殊途同歸，都跟「你正在看的是哪一件」無關。站上有 118 件上架商品
 * （2026-08-31 PROD），素材根本不缺，缺的是排序。
 *
 * ## 現在的做法
 *
 * 候選在本地評分，分數由三塊組成：
 *   1. **跟眼前這件像不像**（同系列 > 同廠商 > 同分類 > 同類型 > 價位相近）
 *      —— 這塊才是讓每一頁都不一樣的關鍵，也是玩家真正期待的「相關商品」。
 *   2. **玩家自己的口味**（抽過的廠商／分類／類型加分；已經抽過的那幾件扣分，
 *      但不是完全排除 —— 池子小的時候寧可推熟面孔，也不要開天窗）。
 *   3. **一點亂數**（最高約等於「同分類」的份量）。同分的候選每次進頁換人，
 *      刷新看到的不會永遠是同四件；但它拌不動真正相關的那幾件的排序。
 *
 * 亂數用 `Math.random()`：結果抓一次就存進 state，同一次瀏覽內是穩定的，
 * 不會在捲動時跳來跳去。
 *
 * 不需要新的 RPC：`draw_records` 的 RLS 正好是 `auth.uid() = user_id`，
 * 玩家讀自己的紀錄本來就讀得到。未登入就只是少了第 2 塊分數。
 */

type Client = SupabaseClient<any, 'public', any>;

/** 抽獎紀錄取樣上限。常客可能有上千筆，只要看得出口味就夠了 */
const HISTORY_LIMIT = 200;
/**
 * 候選池大小。要遠大於 limit，否則等於又在挑「最新的四件」。
 * 兩個都跟著 limit 放大 —— 搜尋頁的瀏覽模式一次要 24 件（它自己再洗一次牌），
 * 固定 40 會讓那頁幾乎沒得挑。
 */
const poolRelated = (limit: number) => Math.max(60, limit * 4);
const poolFallback = (limit: number) => Math.max(40, limit * 3);
/** 上架幾天內算新品 */
const NEW_WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface RecoSeed {
  id: number | string;
  type?: string | null;
  category?: string | null;
  series?: string | null;
  supplier_id?: number | string | null;
  price?: number | string | null;
}

/**
 * PostgREST 的 `or=(...)` 沒有字串跳脫可用：值裡只要有逗號或引號就會把條件切壞
 * （分類是後台自由輸入的，真的可能出現）。這種值直接不放進條件，
 * 少一個條件頂多推薦準一點點，總比整段查詢語法錯掉好。
 */
function safeIn(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => !!v && !/[",()]/.test(v)))];
}

export async function fetchRecommendations(
  supabase: Client,
  current: RecoSeed,
  limit = 4,
) {
  const currentId = String(current.id);
  const now = Date.now();

  try {
    /* ---------- 1. 玩家口味（未登入就是三個空集合） ---------- */
    const taste = { suppliers: new Set<string>(), categories: new Set<string>(), types: new Set<string>() };
    const drawnIds = new Set<string>();

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (uid) {
      const { data: history } = await supabase
        .from('draw_records')
        .select('product_id')
        .eq('user_id', uid)
        .order('id', { ascending: false })
        .limit(HISTORY_LIMIT);

      const ids = [...new Set((history ?? []).map(h => h.product_id).filter(Boolean))];
      ids.forEach(id => drawnIds.add(String(id)));

      if (ids.length) {
        const { data: drawn } = await supabase
          .from('products')
          .select('id, type, category, supplier_id')
          .in('id', ids);
        for (const d of drawn ?? []) {
          if (d.supplier_id != null) taste.suppliers.add(String(d.supplier_id));
          if (d.category) taste.categories.add(String(d.category));
          if (d.type) taste.types.add(String(d.type));
        }
      }
    }

    /* ---------- 2. 候選池 ---------- */
    const pool = new Map<string, any>();
    const addAll = (rows: any[] | null) => {
      for (const r of rows ?? []) {
        if (String(r.id) === currentId) continue;
        if (!pool.has(String(r.id))) pool.set(String(r.id), r);
      }
    };

    /*
     * 同系列先單獨撈一次。
     *
     * 不能只靠下面那條 `.or()`：站上只有兩個廠商（PROD 2026-08-31：85 件 / 33 件），
     * `supplier_id` 那個條件一放進去，聯集就等於「幾乎全站」，而查詢有 60 件的
     * 上限、又是照新到舊排 —— 同系列但上架得早的那幾件會被擠出候選池，
     * 分數再高也輪不到它。同系列是這裡最強的訊號，要保證它進得來。
     */
    const seriesVals = safeIn([current.series]);
    if (seriesVals.length) {
      const { data } = await supabase
        .from('products')
        .select(PRODUCT_PUBLIC_COLUMNS)
        .eq('status', 'active')
        .neq('type', 'slot')
        .eq('series', current.series as string)
        .order('created_at', { ascending: false })
        .limit(limit * 4);
      addAll(data);
    }

    /*
     * 相關的那一批：跟眼前這件同系列／同廠商／同分類／同類型。
     * 這裡才是主力 —— 保底那批只是怕新站或冷門分類撈不滿。
     */
    const ors: string[] = [];
    const series = seriesVals;
    const categories = safeIn([current.category]);
    const types = safeIn([current.type]);
    if (series.length) ors.push(`series.in.(${series.map(v => `"${v}"`).join(',')})`);
    if (categories.length) ors.push(`category.in.(${categories.map(v => `"${v}"`).join(',')})`);
    if (types.length) ors.push(`type.in.(${types.map(v => `"${v}"`).join(',')})`);
    if (current.supplier_id != null) ors.push(`supplier_id.in.(${current.supplier_id})`);

    if (ors.length) {
      const { data } = await supabase
        .from('products')
        .select(PRODUCT_PUBLIC_COLUMNS)
        .eq('status', 'active')
        .neq('type', 'slot')
        .or(ors.join(','))
        .order('created_at', { ascending: false })
        .limit(poolRelated(limit));
      addAll(data);
    }

    // 保底：任意上架商品。相關的那批已經夠多就不用再打一次
    if (pool.size < limit * 3) {
      const { data } = await supabase
        .from('products')
        .select(PRODUCT_PUBLIC_COLUMNS)
        .eq('status', 'active')
        .neq('type', 'slot')
        .order('created_at', { ascending: false })
        .limit(poolFallback(limit));
      addAll(data);
    }

    /* ---------- 3. 評分 ---------- */
    const curPrice = Number(current.price) || 0;
    const score = (p: any) => {
      let s = 0;

      // (1) 跟眼前這件像不像
      if (current.series && p.series && p.series === current.series) s += 60;
      if (current.supplier_id != null && String(p.supplier_id) === String(current.supplier_id)) s += 30;
      if (current.category && p.category === current.category) s += 20;
      if (current.type && p.type === current.type) s += 12;
      if (curPrice > 0 && Number(p.price) > 0 && Math.abs(Number(p.price) - curPrice) / curPrice <= 0.3) s += 8;

      // (2) 玩家口味
      if (p.supplier_id != null && taste.suppliers.has(String(p.supplier_id))) s += 6;
      if (p.category && taste.categories.has(String(p.category))) s += 4;
      if (p.type && taste.types.has(String(p.type))) s += 2;
      // 抽過的扣分而不是排除：冷門分類的池子很小，排除會直接開天窗
      if (drawnIds.has(String(p.id))) s -= 40;

      // (3) 站方訊號：後台加權 / 熱門 / 新品；賣完的沉底
      const boost = Number(p.feed_boost ?? 0);
      if (boost > 0) s += Math.min(boost, 3) * 3;
      else if (p.is_hot) s += 4;
      if (p.created_at && now - new Date(p.created_at).getTime() <= NEW_WINDOW_MS) s += 5;
      if (Number(p.remaining ?? 1) <= 0) s -= 30;

      // (4) 拌勻。上限刻意壓在「同分類」的份量以下 —— 換得動同分的，換不動真的相關的
      return s + Math.random() * 18;
    };

    /*
     * 先把分數算完再排序，不要在 comparator 裡呼叫 score()。
     * 裡面有 Math.random()，每比一次就換一個分數 —— 比較函式自相矛盾，
     * 排出來的順序是壞的（V8 甚至可能因此丟例外）。
     */
    return [...pool.values()]
      .map(p => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(x => x.p);
  } catch {
    // 推薦區塊掛掉不該影響商品頁本身，靜默收掉
    return [];
  }
}
