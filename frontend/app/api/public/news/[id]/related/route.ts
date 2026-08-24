import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns';

/**
 * 文章內頁的「相關商品」（老闆 2026-08-22：吉伊卡哇文章底下要有相關商品，最多 4 件 + 更多）。
 *
 * 關鍵字怎麼挑：文章標籤（扣掉泛用詞）＋ detect_series_from_name(標題) ＋ 標題《》「」內的名字，
 * 逐個去商品名稱／系列比對，取**命中最多**的那個（同數取較長、較具體的）。
 * 回 keyword、前 4 件、總數；「更多」連到 /search?q=<keyword>。沒命中就回空，前台不顯示區塊。
 *
 * ⚠️ 比對在記憶體做，不要每個候選字打一次 count（老闆 2026-08-24：文章要下拉刷新才跑出來 ——
 * 舊版 N 個關鍵字＝N 趟資料庫來回，冷啟動 1.4 秒，玩家滑到底時還沒回來）。
 * 上架商品只有百來筆，一次撈 id/name/series 全部比完，總共兩趟查詢。
 */
const CACHE_SECONDS = 600;
const STOP = new Set(['萬代','公仔','轉蛋','扭蛋','食玩','景品','景品公仔','可動公仔','盒玩','一番賞','卡牌','周邊',
  '模型','手辦','新品','預購','上市','開賣','限定','聯名','盲盒','玩具','動漫','角色','系列','發售']);

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAnonClient();

  /*
   * 三份資料一次併行撈完，之後全部在記憶體比對 —— 整支 API 只有**一趟往返**。
   * 不呼叫 detect_series_from_name RPC：那要等文章標題回來才能發，會多一趟；
   * 它做的事就是拿 series_keywords（百來筆）比對標題，自己比一樣。
   * 商品也直接撈公開欄位，最後不用再回頭 .in() 查一次。
   */
  const [{ data: article }, { data: catalog }, { data: seriesKeywords }] = await Promise.all([
    supabase.from('news').select('id, title, tags').eq('id', id).maybeSingle(),
    supabase.from('products').select(PRODUCT_PUBLIC_COLUMNS)
      .neq('status', 'pending').neq('type', 'slot')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('series_keywords').select('keyword, series_name'),
  ]);
  if (!article) return NextResponse.json({ keyword: null, products: [], total: 0 }, { status: 404 });

  const candidates = new Set<string>();
  for (const t of (article.tags as string[] | null) ?? []) {
    const k = String(t).trim();
    if (k.length >= 2 && k.length <= 20 && !STOP.has(k)) candidates.add(k);
  }
  // 系列偵測：標題含某個關鍵字就把它的系列名列為候選（同 detect_series_from_name 的規則）
  const title = String(article.title ?? '').toLowerCase();
  for (const r of (seriesKeywords ?? []) as { keyword: string; series_name: string }[]) {
    if (r.keyword && title.includes(String(r.keyword).toLowerCase())) candidates.add(String(r.series_name).trim());
  }
  for (const m of String(article.title ?? '').matchAll(/[《「【]([^》」】]{2,20})[》」】]/g)) candidates.add(m[1].trim());

  const rows = (catalog ?? []) as unknown as { id: number; name: string | null; series: string | null }[];
  let best: { keyword: string; ids: number[] } | null = null;
  for (const kw of candidates) {
    const needle = kw.toLowerCase();
    const ids = rows
      .filter(r => `${r.name ?? ''}`.toLowerCase().includes(needle) || `${r.series ?? ''}`.toLowerCase().includes(needle))
      .map(r => r.id);
    if (!ids.length) continue;
    // 命中數多的優先；一樣多時取字串較長（較具體）的關鍵字
    if (!best || ids.length > best.ids.length || (ids.length === best.ids.length && kw.length > best.keyword.length)) {
      best = { keyword: kw, ids };
    }
  }
  if (!best) {
    return NextResponse.json({ keyword: null, products: [], total: 0 }, { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } });
  }

  // catalog 本來就是新到舊，命中順序即顯示順序，取前 4 件
  const top = new Set(best.ids.slice(0, 4));
  const products = (catalog ?? []).filter(r => top.has(Number((r as { id: number }).id)));

  return NextResponse.json(
    { keyword: best.keyword, products, total: best.ids.length },
    { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } },
  );
}
