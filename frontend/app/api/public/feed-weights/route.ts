import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 推薦 feed 的學習權重：近 14 天每個商品的曝光／點擊（get_feed_weights，排除機器人）
 * + 系列／類型（階層式先驗用）+ 真人抽數（歷史暖身用）+ 全站平均點擊率 + A/B 比例。
 * 前台拿去做 Thompson sampling（lib/feed/assemble.ts）。CDN 快取 5 分鐘：統計值，不需要即時。
 */
const CACHE_SECONDS = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: rows, error }, { data: setting }] = await Promise.all([
    admin.rpc('get_feed_weights', { p_days: 14 }),
    admin.from('platform_settings').select('value').eq('key', 'feed_ab_ratio').maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  const list = (rows ?? []) as { product_id: number; impressions: number; clicks: number; series: string | null; type: string | null; draws: number }[];
  let imp = 0, clk = 0;
  const items: Record<string, { impressions: number; clicks: number; series: string | null; type: string | null; draws: number }> = {};
  for (const r of list) {
    const i = Number(r.impressions), c = Number(r.clicks), d = Number(r.draws);
    if (i === 0 && c === 0 && d === 0) continue; // 沒任何資料的不用送，省流量
    items[String(r.product_id)] = { impressions: i, clicks: c, series: r.series, type: r.type, draws: d };
    imp += i; clk += c;
  }
  const mean = imp > 0 ? clk / imp : 0.03;
  const abRatio = Number(setting?.value ?? 0) || 0;
  return NextResponse.json({ mean, items, abRatio }, { headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` } });
}
