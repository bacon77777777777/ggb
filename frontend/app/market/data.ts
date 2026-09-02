/*
 * 交易所的資料層。
 *
 * 前台只透過這一支碰 DB，頁面元件不認識 supabase —— 跟商城 `app/sell/proto/data.ts`
 * 同一個分工，差別在交易所是 React 渲染（商城是原型引擎），所以這裡直接回型別化的物件。
 *
 * 讀的一律是 view / RPC，不是 marketplace_listings 本身：
 *   ・public_marketplace_listings（489/670）—— 逛街清單。直接 join draw_records
 *     會撞上「只看得到自己的」RLS，別人的上架會變成一張沒圖沒名字的空卡片
 *   ・public_marketplace_price_stats（670）—— 同款近 90 天成交行情
 *   ・my_marketplace_deals（671）—— 自己的成交紀錄。賣掉的獎品已經換手，
 *     直接查 draw_records 讀不到自己賣了什麼
 */

import { createClient } from '@/lib/supabase/client';

export type Listing = {
  id: number;
  price: number;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string | null;
  prizeName: string;
  prizeLevel: string;
  prizeImage: string | null;
  productName: string;
  productType: string;
  productPrizeId: number | null;
  prizeTotal: number | null;
  createdAt: string;
};

export type PriceStats = {
  dealCount: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  lastPrice: number;
  lastDealAt: string;
};

export type MyListing = {
  id: number;
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  createdAt: string;
  prizeName: string;
  prizeLevel: string;
  prizeImage: string | null;
  productName: string;
};

export type Deal = {
  id: number;
  side: 'buy' | 'sell';
  price: number;
  fee: number;
  sellerReceive: number;
  createdAt: string;
  prizeName: string;
  prizeLevel: string;
  prizeImage: string | null;
  productName: string;
  counterparty: string;
};

/** 倉庫裡可以掛上來的東西 */
export type Sellable = {
  drawRecordId: number;
  prizeName: string;
  prizeLevel: string;
  prizeImage: string | null;
  productName: string;
  ticketNumber: number | null;
};

export type MarketSettings = {
  feePercent: number;
  allowedLevels: string[];
  minPrice: number;
  maxPrice: number;
};

export const SORTS = [
  { key: 'new', label: '最新上架' },
  { key: 'cheap', label: '價格低到高' },
  { key: 'rich', label: '價格高到低' },
] as const;
export type SortKey = (typeof SORTS)[number]['key'];

export const PAGE_SIZE = 30;

/* eslint-disable @typescript-eslint/no-explicit-any */
const toListing = (r: any): Listing => ({
  id: Number(r.id),
  price: Number(r.price) || 0,
  sellerId: String(r.seller_id),
  sellerName: r.seller_name || '玩家',
  sellerAvatar: r.seller_avatar || null,
  prizeName: r.prize_name || '未知品項',
  prizeLevel: r.prize_level || '',
  prizeImage: r.prize_image || null,
  productName: r.product_name || '',
  productType: r.product_type || '',
  productPrizeId: r.product_prize_id ?? null,
  prizeTotal: r.prize_total ?? null,
  createdAt: r.created_at,
});

/**
 * 逛街清單。
 *
 * 搜尋同時吃品項名與來源商品名 —— 玩家想找「咒術迴戰的 A 賞」，
 * 打的是作品名而不是品項名。
 */
export async function fetchFeed(opts: {
  search?: string;
  level?: string;
  /** 商品類型（products.type）：一級頁籤「類別」 */
  type?: string;
  /** 來源商品名：二級頁籤「系列」 */
  series?: string;
  sort?: SortKey;
  offset?: number;
  limit?: number;
}): Promise<Listing[]> {
  const { search = '', level = '', type = '', series = '', sort = 'new', offset = 0, limit = PAGE_SIZE } = opts;
  const sb = createClient();
  let q = sb.from('public_marketplace_listings').select('*');

  if (search.trim()) {
    const esc = search.trim().replace(/[%,()]/g, ' ');
    q = q.or(`prize_name.ilike.%${esc}%,product_name.ilike.%${esc}%`);
  }
  // 賞等比對用前綴：DB 存的是「A賞」，但也有「A賞 限定版」這種寫法
  if (level) q = q.ilike('prize_level', `${level}%`);
  if (type) q = q.eq('product_type', type);
  if (series) q = q.eq('product_name', series);

  if (sort === 'cheap') q = q.order('price', { ascending: true });
  else if (sort === 'rich') q = q.order('price', { ascending: false });
  else q = q.order('created_at', { ascending: false });
  // 價格相同時再照時間排，不然翻頁會有東西重複出現／漏掉
  q = q.order('id', { ascending: false });

  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  return (data || []).map(toListing);
}


/**
 * 頁籤要用的分面（類別 × 系列）。
 *
 * 清單是後端分頁的，所以不能從已載入的那幾筆推 —— 那樣頁籤會隨著捲動長出來。
 * 這支只抓兩個欄位、抓全部在架上的，在前端 group 一次。
 * 交易所的量級（上架同時存在幾百筆）撐得住；真的長到幾千筆再改成 RPC 聚合。
 */
export type Facets = {
  types: { key: string; label: string; count: number }[];
  seriesByType: Record<string, { name: string; count: number }[]>;
};

/** products.type → 首頁那排頁籤的字（label 與首頁 primaryTabs 一致） */
export const TYPE_LABEL: Record<string, string> = {
  ichiban: '一番賞',
  blindbox: '盒玩',
  gacha: '轉蛋',
  card: '抽卡',
  custom: '自製賞',
};
const TYPE_ORDER = ['ichiban', 'blindbox', 'gacha', 'card', 'custom'];

export async function fetchFacets(): Promise<Facets> {
  const { data } = await createClient()
    .from('public_marketplace_listings')
    .select('product_type, product_name')
    .limit(2000);

  const typeCount = new Map<string, number>();
  const seriesMap = new Map<string, Map<string, number>>();
  for (const r of (data || []) as any[]) {
    const t = String(r.product_type || '');
    const n = String(r.product_name || '');
    if (!t) continue;
    typeCount.set(t, (typeCount.get(t) || 0) + 1);
    // 每個類別自己一份系列表，另外再存一份「全部」的
    for (const key of [t, '']) {
      if (!seriesMap.has(key)) seriesMap.set(key, new Map());
      if (n) seriesMap.get(key)!.set(n, (seriesMap.get(key)!.get(n) || 0) + 1);
    }
  }

  const types = TYPE_ORDER
    .filter(t => typeCount.has(t))
    .map(t => ({ key: t, label: TYPE_LABEL[t] || t, count: typeCount.get(t) || 0 }));

  const seriesByType: Facets['seriesByType'] = {};
  for (const [key, m] of seriesMap) {
    seriesByType[key] = [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return { types, seriesByType };
}

export async function fetchListing(id: number): Promise<Listing | null> {
  const { data, error } = await createClient()
    .from('public_marketplace_listings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toListing(data) : null;
}

/** 同款近 90 天成交行情。沒成交過就回 null（前台整段不顯示） */
export async function fetchPriceStats(productPrizeId: number | null): Promise<PriceStats | null> {
  if (!productPrizeId) return null;
  const { data } = await createClient()
    .from('public_marketplace_price_stats')
    .select('*')
    .eq('product_prize_id', productPrizeId)
    .maybeSingle();
  if (!data) return null;
  const r = data as any;
  return {
    dealCount: Number(r.deal_count) || 0,
    minPrice: Number(r.min_price) || 0,
    maxPrice: Number(r.max_price) || 0,
    avgPrice: Number(r.avg_price) || 0,
    lastPrice: Number(r.last_price) || 0,
    lastDealAt: r.last_deal_at,
  };
}

export type DealPoint = { price: number; createdAt: string };

/**
 * 同款近 90 天的逐筆成交（詳情頁「近期走勢」）。
 * public_marketplace_recent_deals（673）只露價格與時間，買賣雙方是誰不關路人的事。
 */
export async function fetchRecentDeals(productPrizeId: number | null): Promise<DealPoint[]> {
  if (!productPrizeId) return [];
  const { data } = await createClient()
    .from('public_marketplace_recent_deals')
    .select('price, created_at')
    .eq('product_prize_id', productPrizeId)
    .order('created_at', { ascending: true })
    .limit(200);
  return (data || []).map((r: any) => ({ price: Number(r.price) || 0, createdAt: String(r.created_at) }));
}

/** 同一個賣家還掛著的其他東西（詳情頁「賣家的其他上架」） */
export async function fetchSellerOthers(sellerId: string, exceptId: number): Promise<Listing[]> {
  const { data } = await createClient()
    .from('public_marketplace_listings')
    .select('*')
    .eq('seller_id', sellerId)
    .neq('id', exceptId)
    .order('created_at', { ascending: false })
    .limit(10);
  return (data || []).map(toListing);
}

/**
 * 相關品項（詳情頁底部，老闆 2026-09-02：「賣家上架改成相關品項，相同商品優先」）。
 * 三層遞補、去重、湊滿 limit 就停：
 *   ① 同一個品項（product_prize_id）的其他上架 —— 直接替代品，便宜的排前面
 *   ② 同一檔商品（product_name）的其他品項 —— 玩家在收同一套，新上的排前面
 *   ③ 同類型（product_type）遞補 —— 湊不滿才用，讓區塊不要空
 */
export async function fetchRelated(cur: Listing, limit = 12): Promise<Listing[]> {
  const sb = createClient();
  const out: Listing[] = [];
  const seen = new Set<number>([cur.id]);
  const take = (rows: unknown[] | null) => {
    for (const r of rows || []) {
      const l = toListing(r);
      if (seen.has(l.id) || out.length >= limit) continue;
      seen.add(l.id);
      out.push(l);
    }
  };

  if (cur.productPrizeId) {
    const { data } = await sb.from('public_marketplace_listings').select('*')
      .eq('product_prize_id', cur.productPrizeId).neq('id', cur.id)
      .order('price', { ascending: true }).limit(limit);
    take(data);
  }
  if (out.length < limit && cur.productName) {
    const { data } = await sb.from('public_marketplace_listings').select('*')
      .eq('product_name', cur.productName).neq('id', cur.id)
      .order('created_at', { ascending: false }).limit(limit);
    take(data);
  }
  if (out.length < limit && cur.productType) {
    const { data } = await sb.from('public_marketplace_listings').select('*')
      .eq('product_type', cur.productType).neq('id', cur.id)
      .order('created_at', { ascending: false }).limit(limit);
    take(data);
  }
  return out;
}

/**
 * 交易所規則（migration 669 起存在 platform_settings，前台讀得到）。
 * 取不到就回預設，不要讓整頁掛掉 —— DB 端一樣會擋，前台只是先講清楚。
 */
export async function fetchSettings(): Promise<MarketSettings> {
  const fallback: MarketSettings = {
    feePercent: 5,
    allowedLevels: ['SP賞', 'S賞', 'A賞', 'B賞', 'C賞', '最後賞'],
    minPrice: 1,
    maxPrice: 100000,
  };
  try {
    const { data } = await createClient()
      .from('platform_settings')
      .select('key, value')
      .like('key', 'marketplace_%');
    const map: Record<string, string> = {};
    for (const row of (data || []) as any[]) map[row.key] = String(row.value ?? '');
    let levels = fallback.allowedLevels;
    try {
      const parsed = JSON.parse(map.marketplace_allowed_levels || '[]');
      if (Array.isArray(parsed) && parsed.length) levels = parsed.map(String);
    } catch { /* 設定壞掉就用預設，DB 端照樣把關 */ }
    return {
      feePercent: Number(map.marketplace_fee_percent) || fallback.feePercent,
      allowedLevels: levels,
      minPrice: Number(map.marketplace_min_price) || fallback.minPrice,
      maxPrice: Number(map.marketplace_max_price) || fallback.maxPrice,
    };
  } catch {
    return fallback;
  }
}

export async function fetchMyListings(userId: string): Promise<MyListing[]> {
  const { data, error } = await createClient()
    .from('marketplace_listings')
    .select('id, price, status, created_at, draw_records ( product_prizes ( name, level, image_url ), products ( name ) )')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    id: Number(r.id),
    price: Number(r.price) || 0,
    status: r.status,
    createdAt: r.created_at,
    prizeName: r.draw_records?.product_prizes?.name || '未知品項',
    prizeLevel: r.draw_records?.product_prizes?.level || '',
    prizeImage: r.draw_records?.product_prizes?.image_url || null,
    productName: r.draw_records?.products?.name || '',
  }));
}

export async function fetchMyDeals(): Promise<Deal[]> {
  const { data, error } = await createClient().rpc('my_marketplace_deals', { p_limit: 200 });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    id: Number(r.id),
    side: r.side === 'buy' ? 'buy' : 'sell',
    price: Number(r.price) || 0,
    fee: Number(r.fee) || 0,
    sellerReceive: Number(r.seller_receive) || 0,
    createdAt: r.created_at,
    prizeName: r.prize_name || '未知品項',
    prizeLevel: r.prize_level || '',
    prizeImage: r.prize_image || null,
    productName: r.product_name || '',
    counterparty: r.counterparty || '玩家',
  }));
}

/**
 * 倉庫裡可以上架的東西。
 *
 * 賞等白名單交給呼叫端過濾（它已經有 settings），這裡只負責把「還沒配送、
 * 不是抽籤中籤品、預購已到貨」這幾條硬條件先擋掉 —— 跟 create_listing 的規則一致，
 * 免得列出來按下去才被打回票。
 */
export async function fetchSellable(userId: string): Promise<Sellable[]> {
  const { data, error } = await createClient()
    .from('draw_records')
    .select('id, ticket_number, prize_level, prize_name, product_prizes ( name, level, image_url ), products ( name, sale_mode, is_preorder, preorder_available_at )')
    .eq('user_id', userId)
    .eq('status', 'in_warehouse')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  const now = Date.now();
  return ((data || []) as any[])
    .filter((r) => {
      const p = r.products;
      if (!p) return false;
      if (p.sale_mode === 'lottery') return false;
      if (p.is_preorder && (!p.preorder_available_at || new Date(p.preorder_available_at).getTime() > now)) return false;
      return true;
    })
    .map((r) => ({
      drawRecordId: Number(r.id),
      prizeName: r.product_prizes?.name || r.prize_name || '未知品項',
      prizeLevel: r.product_prizes?.level || r.prize_level || '',
      prizeImage: r.product_prizes?.image_url || null,
      productName: r.products?.name || '',
      ticketNumber: r.ticket_number ?? null,
    }));
}

type RpcResult = { success: boolean; message: string };

const callRpc = async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
  const { data, error } = await createClient().rpc(fn, args);
  if (error) return { success: false, message: error.message };
  const r = data as RpcResult;
  return { success: !!r?.success, message: r?.message || '' };
};

export const buyListing = (listingId: number) => callRpc('buy_listing', { p_listing_id: listingId });
export const createListing = (drawRecordId: number, price: number) =>
  callRpc('create_listing', { p_record_id: drawRecordId, p_price: price });
export const cancelListing = (listingId: number) => callRpc('cancel_listing', { p_listing_id: listingId });

/**
 * 賞等正規化 —— 跟 DB 的 marketplace_norm_level 同一套規則。
 * 「A賞 限定版」算 A 賞、「LAST ONE」算最後賞。兩邊要一起改。
 */
export function normLevel(raw: string | null | undefined): string {
  if (!raw) return '';
  let v = raw.trim();
  if (!v) return '';
  if (v.toUpperCase() === 'LAST ONE' || v === '最後賞') return '最後賞';
  const i = v.indexOf('賞');
  if (i > 0) v = v.slice(0, i);
  if (v.includes(' ')) v = v.split(' ')[0];
  return v.toUpperCase();
}

/** 這個賞等能不能上架（照後台設定；DB 端才是真正的把關） */
export function levelAllowed(raw: string | null | undefined, allowed: string[]): boolean {
  const n = normLevel(raw);
  if (!n) return false;
  return allowed.some((lv) => normLevel(lv) === n);
}

/* ────────────────────────────────────────────────
 * 聊聊（migration 672）
 *
 * `marketplace_messages` 從 175 就存在、RLS 也對，但全站沒有任何程式碼碰它 ——
 * 買家想問賣家「這件有盒損嗎」一直沒有地方問。三支 RPC 都是 SECURITY DEFINER：
 * 訊息本身 RLS 讀得到，但**對方的暱稱與頭像讀不到**（users 只看得到自己的）。
 * ──────────────────────────────────────────────── */

export type Chat = {
  listingId: number;
  listingStatus: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  prizeName: string;
  prizeImage: string | null;
  price: number;
  lastBody: string;
  lastAt: string;
  lastFromMe: boolean;
};

export type ChatMessage = {
  id: number;
  body: string;
  kind: string;
  fromMe: boolean;
  createdAt: string;
};

export async function fetchChats(): Promise<Chat[]> {
  const { data, error } = await createClient().rpc('my_marketplace_chats');
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    listingId: Number(r.listing_id),
    listingStatus: r.listing_status || '',
    otherId: String(r.other_id),
    otherName: r.other_name || '玩家',
    otherAvatar: r.other_avatar || null,
    prizeName: r.prize_name || '未知品項',
    prizeImage: r.prize_image || null,
    price: Number(r.price) || 0,
    lastBody: r.last_body || '',
    lastAt: r.last_at,
    lastFromMe: !!r.last_from_me,
  }));
}

export async function fetchChatThread(listingId: number, otherId: string): Promise<ChatMessage[]> {
  const { data, error } = await createClient().rpc('marketplace_chat_thread', {
    p_listing_id: listingId,
    p_other: otherId,
  });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    id: Number(r.id),
    body: r.body || '',
    kind: r.kind || 'text',
    fromMe: !!r.from_me,
    createdAt: r.created_at,
  }));
}

export const sendChatMessage = (listingId: number, toId: string, body: string) =>
  callRpc('marketplace_send_message', { p_listing_id: listingId, p_to: toId, p_body: body });
