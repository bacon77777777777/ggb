import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createAnonClient } from '@/lib/supabase/anon';

const createAdminClient = () =>
  createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/**
 * 情報列表（含讚／留言數）—— CDN 邊緣快取 60 秒。
 * 文章每 6 小時才進新的，60 秒的窗口只影響讚數／留言數的第一眼；內頁永遠即時。
 */
const CACHE_SECONDS = 60;
const CATEGORIES = new Set(['all', 'figure', 'gacha', 'toy', 'ichiban', 'tcg']);

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') || 'all';
  if (!CATEGORIES.has(category)) return NextResponse.json([], { status: 400 });

  const supabase = createAnonClient();
  let q = supabase
    .from('news')
    .select('id,title,summary,image_url,source_url,category,tags,is_active,created_at,view_count')
    .eq('is_active', true);
  if (category !== 'all') q = q.eq('category', category);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });

  const articles = data ?? [];
  // 讚／留言數沿用既有的 RPC（含機器人讚數、GROUP BY 聚合不受 1000 筆上限影響），
  // 跟 /api/news/counts 同一套，列表跟內頁的數字才會一致
  let likes: Record<string, number> = {};
  let comments: Record<string, number> = {};
  if (articles.length) {
    const admin = createAdminClient();
    const { data: counts } = await admin.rpc('get_news_engagement_counts', { news_ids: articles.map(a => String(a.id)) });
    const c = (counts ?? {}) as { likes?: Record<string, number>; comments?: Record<string, number> };
    likes = c.likes ?? {};
    comments = c.comments ?? {};
  }
  return NextResponse.json(
    articles.map(a => ({ ...a, likes_count: likes[String(a.id)] ?? 0, comments_count: comments[String(a.id)] ?? 0 })),
    { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } },
  );
}
