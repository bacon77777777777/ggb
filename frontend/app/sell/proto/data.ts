/*
 * 商城引擎的資料轉接層（接線第二批）。
 *
 * ⚠️ 這裡**只做取數與形狀對映**，不碰任何渲染邏輯 ——
 * mall.ts 要能繼續跟 docs/prototypes/ggb-market-taobao_3.html diff 得起來（見 ROADMAP）。
 *
 * 引擎吃的商品形狀（原型 C2C/B2C 陣列的元素）：
 *   { id, t, specs?, p, ship, k, cond, s, v, pays, rate, rel, done, q, sold, feat }
 * DB 給的是 sell_feed 的一列（566 版欄位），兩邊的差異全部在這支收斂。
 */

import { createClient } from '@/lib/supabase/client';

/**
 * 引擎用來挑佔位插畫的種類；DB 存的是中文類別，對映到原型的五種畫風。
 * 十類是 2026-08-15 定案的商城類別（migration 579）；舊六類保留對映，
 * 免得白名單改回去或殘留舊值時直接沒圖。
 */
const KIND_BY_CATEGORY: Record<string, string> = {
  公仔模型: 'fig',
  盲盒盲袋: 'box',
  卡牌收藏: 'card',
  積木拼裝: 'box',
  娃娃玩偶: 'plush',
  遙控玩具: 'box',
  益智桌遊: 'box',
  兒童玩具: 'plush',
  限定收藏: 'fig',
  玩具配件: 'card',
  // 舊值
  一番賞: 'fig',
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
    // 主圖；沒有的話讓引擎畫原型的 SVG 佔位
    img: (Array.isArray(r.images) && r.images[0]) || '',
    avatar: r.seller_avatar || '',
    p: Number(r.price) || 0,
    ship: Number(r.shipping_fee) || 0,
    k: KIND_BY_CATEGORY[String(r.category || '')] || 'box',
    // 首頁分類列用類別本身過濾（白名單那十類），k 只管佔位圖
    category: String(r.category || ''),
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

/**
 * 商品詳情獨立頁（/sell/<id>）用：單獨載入一件商品。
 *
 * 首頁 feed 只拿前 60 筆，分享出去的連結／較舊的商品不一定在裡面，
 * 所以詳情頁一律自己打 sell_feed_one（578 版起形狀與 sell_feed 一致，多 is_official）。
 * 回 { item, official } —— 引擎要靠 official 決定放進 C2C 還是 B2C 那一池。
 * 找不到（已下架／不存在）回 null，頁面顯示「商品不存在或已下架」。
 */
export async function loadItem(id: number): Promise<{ item: any; official: boolean } | null> {
  try {
    const { data, error } = await createClient().rpc('sell_feed_one', { p_id: id });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { item: toItem(row), official: !!row.is_official };
  } catch (e) {
    console.error('[mall] 取商品詳情失敗:', e);
    return null;
  }
}

/* ────────────────────────────────────────────────────────────
 * DB 動作橋接（接線第二批）
 *
 * 引擎的 handler 只呼叫這裡的方法，不認識 supabase。
 * 每個方法回傳的形狀統一成 { success } 或 { error }，
 * 引擎那邊就能用同一套「失敗顯示訊息、成功重拉狀態」處理完。
 * ──────────────────────────────────────────────────────────── */

export function makeMallDb() {
  const sb = createClient();

  const call = async (fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) return { error: error.message };
    return (data ?? { success: true }) as any;
  };

  return {
    myState: () => call('sell_my_state'),

    cartAdd: (id: number, g: number, i: number, q: number) =>
      call('sell_cart_add', { p_listing_id: id, p_group: g, p_item: i, p_qty: q }),
    cartSetQty: (id: number, g: number, i: number, q: number) =>
      call('sell_cart_set_qty', { p_listing_id: id, p_group: g, p_item: i, p_qty: q }),

    // p_items: [{listing_id,g,i,qty}]；pay 是 bank/linepay
    createOrder: (items: any[], pay: string, note: string) =>
      call('sell_create_order', { p_items: items, p_pay_method: pay, p_note: note || null }),

    markPaid: (oid: number) => call('sell_order_mark_paid', { p_order_id: oid, p_proof_urls: [] }),
    confirmPayment: (oid: number) => call('sell_order_confirm_payment', { p_order_id: oid }),
    markShipped: (oid: number, tracking: string) =>
      call('sell_order_mark_shipped', { p_order_id: oid, p_tracking_number: tracking }),
    confirmReceived: (oid: number) => call('sell_order_confirm_received', { p_order_id: oid }),
    cancelOrder: (oid: number) => call('cancel_sell_order', { p_order_id: oid }),
    claimCompensation: (oid: number) => call('sell_order_claim_compensation', { p_order_id: oid }),
    review: (oid: number, good: boolean, comment: string) =>
      call('sell_order_review', { p_order_id: oid, p_is_good: good, p_comment: comment || null }),

    // 上下架／刪除走表：狀態由 sell_guard_listing trigger 把關（交易中不給動）
    setListingStatus: async (id: number, status: string) => {
      const { error } = await sb.from('sell_listings').update({ status }).eq('id', id);
      return error ? { error: error.message } : { success: true };
    },
    deleteListing: async (id: number) => {
      const { error } = await sb.from('sell_listings').delete().eq('id', id);
      return error ? { error: error.message } : { success: true };
    },

    /**
     * 新增／編輯商品。
     * 一律寫 status='pending' —— 玩家商城的上架要審核（規則 7），
     * 前台自己寫 active 會被 trigger 擋掉，不如一開始就照規矩來。
     */
    saveListing: async (payload: any, id?: number) => {
      const { data: auth } = await sb.auth.getUser();
      if (!auth?.user) return { error: '請先登入' };
      const row = {
        title: payload.t,
        price: payload.p,
        shipping_fee: payload.ship ?? 0,
        // 類別由表單白名單必選帶進來（DB trigger 也會擋不在白名單的值）
        category: payload.category,
        specs: payload.specs ?? null,
        condition: payload.cond || '未拆',
        images: payload.images || [],
      };
      if (id) {
        const { error } = await sb.from('sell_listings').update(row).eq('id', id);
        return error ? { error: error.message } : { success: true };
      }
      const { error } = await sb
        .from('sell_listings')
        .insert({ ...row, seller_id: auth.user.id, status: 'pending', is_official: false });
      return error ? { error: error.message } : { success: true };
    },
  };
}

/** 目前登入者（引擎用來認出「我的賣場」，避免自己的商品在列表出現兩次） */
/** 上架類別白名單（後台「商城設定」維護；RLS 已開放 sell_% 公開讀） */
export async function loadCategories(): Promise<string[]> {
  try {
    const { data } = await createClient()
      .from('platform_settings')
      .select('value')
      .eq('key', 'sell_category_whitelist')
      .maybeSingle();
    const parsed = JSON.parse(String((data as any)?.value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function loadMe() {
  try {
    const sb = createClient();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return null;
    const { data } = await sb.from('users').select('name, avatar_url').eq('id', auth.user.id).single();
    return { id: auth.user.id, name: data?.name || '我的賣場', avatar: data?.avatar_url || '' };
  } catch {
    return null;
  }
}
