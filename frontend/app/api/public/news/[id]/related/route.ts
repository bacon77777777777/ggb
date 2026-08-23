import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns';

/**
 * 文章內頁的「相關商品」（老闆 2026-08-22：吉伊卡哇文章底下要有相關商品，最多 4 件 + 更多）。
 *
 * 關鍵字怎麼挑：文章標籤（扣掉泛用詞）＋ detect_series_from_name(標題)，逐個去商品名稱／系列
 * 比對，取**命中最多**的那個（同數取較長、較具體的）。回 keyword、前 4 件、總數；
 * 「更多」連到 /search?q=<keyword>。沒有任何關鍵字命中商品就回空，前台不顯示區塊。
 * CDN 快取 10 分鐘。
 */
const CACHE_SECONDS = 600;
const STOP = new Set(['萬代','公仔','轉蛋','扭蛋','食玩','景品','景品公仔','可動公仔','盒玩','一番賞','卡牌','周邊',
  '模型','手辦','新品','預購','上市','開賣','限定','聯名','盲盒','玩具','動漫','角色','系列','發售']);

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAnonClient();
  const { data: article } = await supabase.from('news').select('id, title, tags').eq('id', id).maybeSingle();
  if (!article) return NextResponse.json({ keyword: null, products: [], total: 0 }, { status: 404 });

  const candidates = new Set<string>();
  for (const t of (article.tags as string[] | null) ?? []) {
    const k = String(t).trim();
    if (k.length >= 2 && k.length <= 20 && !STOP.has(k)) candidates.add(k);
  }
  const { data: detected } = await supabase.rpc('detect_series_from_name', { p_name: article.title });
  if (typeof detected === 'string' && detected.trim()) candidates.add(detected.trim());
  // 標題裡的《》或「」內的名字也算（情報標題常這樣寫）
  for (const m of String(article.title ?? '').matchAll(/[《「【]([^》」】]{2,20})[》」】]/g)) candidates.add(m[1].trim());

  type Hit = { keyword: string; count: number };
  const hits: Hit[] = [];
  for (const kw of candidates) {
    const safe = kw.replace(/[%_,()]/g, ' ').trim();
    if (!safe) continue;
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'pending').neq('type', 'slot')
      .or(`name.ilike.%${safe}%,series.ilike.%${safe}%`);
    if (count && count > 0) hits.push({ keyword: kw, count });
  }
  if (!hits.length) {
    return NextResponse.json({ keyword: null, products: [], total: 0 }, { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } });
  }
  hits.sort((a, b) => b.count - a.count || b.keyword.length - a.keyword.length);
  const best = hits[0];
  const safe = best.keyword.replace(/[%_,()]/g, ' ').trim();
  const { data: products } = await supabase
    .from('products')
    .select(PRODUCT_PUBLIC_COLUMNS)
    .neq('status', 'pending').neq('type', 'slot')
    .or(`name.ilike.%${safe}%,series.ilike.%${safe}%`)
    .order('created_at', { ascending: false })
    .limit(4);
  return NextResponse.json(
    { keyword: best.keyword, products: products ?? [], total: best.count },
    { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } },
  );
}
