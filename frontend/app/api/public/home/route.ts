import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns';

/**
 * 首頁公開資料（商品／輪播／分類）—— 老闆 2026-08-22 頁面加載優化 ④
 *
 * 以前三個查詢從瀏覽器直打 Supabase；改由這裡用訪客 client 查，
 * 回應給 CDN 邊緣快取 CACHE_SECONDS 秒：同一秒鐘一千個人開首頁，Supabase 只被打一次，
 * 而且從台灣打 Vercel 邊緣比打首爾的 Supabase 快。
 *
 * ⚠️ 舊資料窗口：最多 CACHE_SECONDS 秒（上架／售完要等這麼久才會在首頁出現）。
 * 商品頁本身直連 Supabase、永遠即時，所以影響只在列表的第一眼。
 * 不用 stale-while-revalidate：老闆不要看到舊的，過期就重算。
 */
const CACHE_SECONDS = 15;

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createAnonClient();
  const [productsRes, bannersRes, menusRes] = await Promise.all([
    supabase.from('products').select(PRODUCT_PUBLIC_COLUMNS)
      .neq('status', 'pending').neq('type', 'slot')
      .order('created_at', { ascending: false }),
    supabase.from('banners').select('*, events(start_at, end_at)')
      .eq('is_active', true).eq('page', 'home')
      .order('sort_order', { ascending: true }),
    supabase.from('categories').select('id, name')
      .eq('is_active', true).order('sort_order', { ascending: true }),
  ]);
  if (productsRes.error) {
    return NextResponse.json({ error: productsRes.error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const products = (productsRes.data || []).map((p: Record<string, unknown>) => ({
    ...p,
    price: Number(p.price),
    original_price: p.original_price != null ? Number(p.original_price) : undefined,
    total_count: Number(p.total_count),
    remaining: Number(p.remaining),
  }));
  return NextResponse.json(
    { products, banners: bannersRes.data || [], menus: (menusRes.data || []).map(m => ({ id: m.id, name: m.name })) },
    { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } },
  );
}
