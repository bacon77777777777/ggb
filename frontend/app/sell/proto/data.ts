/*
 * 商城引擎的資料轉接層（接線第二批）。
 *
 * ⚠️ 這裡**只做取數與形狀對映**，不碰任何渲染邏輯 ——
 * mall.ts 要能繼續跟 public/ggb-market-taobao_3.html diff 得起來（見 ROADMAP）。
 *
 * 引擎吃的商品形狀（原型 C2C/B2C 陣列的元素）：
 *   { id, t, specs?, p, ship, k, cond, s, v, pays, rate, rel, done, q, sold, feat }
 * DB 給的是 sell_feed 的一列（566 版欄位），兩邊的差異全部在這支收斂。
 */

import { createClient } from '@/lib/supabase/client';

/** 引擎用來挑插畫的種類；DB 只有中文類別，對映到原型的五種 */
const KIND_BY_CATEGORY: Record<string, string> = {
  一番賞: 'fig',
  公仔模型: 'fig',
  盒玩: 'box',
  轉蛋: 'cap',
  卡牌: 'card',
  周邊商品: 'plush',
};

const payLabel = (m: string | null) => (m === 'linepay' ? 'LINE Pay' : m === 'bank' ? '銀行轉帳' : '');

type FeedRow = Record<string, any>;

/**
 * 一列 sell_feed → 一個引擎商品。
 *
 * specs 直接沿用 DB 的兩層規格樹（570 之後形狀已經跟原型一致），
 * 所以引擎的 skus()／minP()／totQ() 不用改就吃得下。
 */
function toItem(r: FeedRow) {
  const specs = r.specs ?? null;
  const stock = specs
    ? (specs.o || []).reduce(
        (n: number, o: any) => n + (o.items || []).reduce((m: number, i: any) => m + (Number(i.q) || 0), 0),
        0
      )
    : 0;

  return {
    id: Number(r.id),
    t: String(r.title || ''),
    ...(specs ? { specs } : {}),
    p: Number(r.price) || 0,
    ship: Number(r.shipping_fee) || 0,
    k: KIND_BY_CATEGORY[String(r.category || '')] || 'box',
    cond: r.condition || '',
    s: String(r.seller_name || '玩家'),
    // 原型用 v 表示「已完成手機實名」
    v: r.phone_verified ? 1 : 0,
    pays: [payLabel(r.pay_method)].filter(Boolean),
    rate: Number(r.success_rate ?? 100),
    rel: Number(r.avg_ship_minutes ?? 0),
    done: Number(r.done_count ?? 0),
    q: stock,
    sold: Number(r.sold_count) || 0,
    // 有買版位的就是原型的「精選」
    ...(Array.isArray(r.ad_slots) && r.ad_slots.length ? { feat: 1 } : {}),
    note: r.note || '',
    sellerId: r.seller_id,
    adSlots: Array.isArray(r.ad_slots) ? r.ad_slots : [],
  };
}

export type MallData = { c2c: any[]; b2c: any[] };

/**
 * 取商城首頁需要的兩批商品。
 *
 * 失敗時回傳 null，讓宿主決定要不要退回引擎內建的假資料 ——
 * DB 掛掉就整頁空白，比看到示範資料更糟。
 */
export async function loadMallData(): Promise<MallData | null> {
  try {
    const supabase = createClient();
    const [c2c, b2c] = await Promise.all([
      supabase.rpc('sell_feed', { p_official: false, p_category: null, p_search: null, p_limit: 60, p_offset: 0 }),
      supabase.rpc('sell_feed', { p_official: true, p_category: null, p_search: null, p_limit: 60, p_offset: 0 }),
    ]);
    if (c2c.error || b2c.error) throw c2c.error || b2c.error;
    return {
      c2c: (c2c.data || []).map(toItem),
      b2c: (b2c.data || []).map(toItem),
    };
  } catch (e) {
    console.error('[mall] 取真實資料失敗，改用引擎內建示範資料:', e);
    return null;
  }
}
