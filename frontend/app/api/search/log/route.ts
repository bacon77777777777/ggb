import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 站內搜尋紀錄 → search_logs（推薦 feed 的「話題」訊號之一，get_feed_topics 讀它）。
 * 以前這張表沒有任何東西在寫（老闆 2026-08-22 冷啟動優化才接上）。
 * 只記關鍵字與結果數，不記使用者；service role 寫（表的 RLS 只開讀）。
 */
export async function POST(req: NextRequest) {
  let body: { keyword?: unknown; result_count?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const keyword = String(body.keyword ?? '').trim().slice(0, 40);
  if (keyword.length < 2) return NextResponse.json({ ok: false }, { status: 400 });
  const resultCount = Number.isInteger(Number(body.result_count)) ? Number(body.result_count) : null;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from('search_logs').insert({ keyword, result_count: resultCount });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
