import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/** 話題訊號：商品標籤近 7 天熱度 + 站內搜尋熱詞（get_feed_topics）。CDN 快取 10 分鐘。 */
const CACHE_SECONDS = 600;
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('get_feed_topics', { p_days: 7 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  const topics = ((data ?? []) as { keyword: string; weight: number; source: string }[]).map(t => ({
    keyword: t.keyword, weight: Number(t.weight), source: t.source,
  }));
  return NextResponse.json(topics, { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } });
}
