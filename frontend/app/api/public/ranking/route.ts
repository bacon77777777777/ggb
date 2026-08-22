import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';

/**
 * 排行榜 —— CDN 邊緣快取 60 秒。榜單是「昨日／上週結算」（見 get_leaderboard_*），
 * 一天只變一次，60 秒的窗口沒有資訊差；機器人分數的 ensure/grow 在 RPC 裡照跑。
 */
const CACHE_SECONDS = 60;

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') === 'draws' ? 'draws' : 'reward';
  const range = req.nextUrl.searchParams.get('range') === 'week' ? 'week' : 'day';
  const supabase = createAnonClient();
  const rpc = type === 'draws' ? 'get_leaderboard_draws' : 'get_leaderboard_whales';
  const { data, error } = await supabase.rpc(rpc, { p_range: range });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } });
}
