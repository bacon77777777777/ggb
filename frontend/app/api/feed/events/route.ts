import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

/**
 * 推薦 feed 的曝光／點擊事件寫入 feed_events（service role；表有 RLS、沒 policy，只有這裡寫得進去）。
 * 登入狀態從 cookie 取 user_id（沒有就 null）；欄位全部白名單檢查、一次最多 60 筆。
 */
const KINDS = new Set(['impression', 'click']);
const BUCKETS = new Set(['forYou', 'topic', 'hot', 'fresh', 'explore']);

export async function POST(req: NextRequest) {
  let body: { session_id?: string; variant?: string; events?: unknown[] };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const sessionId = String(body.session_id ?? '').slice(0, 64);
  const variant = body.variant === 'v1' ? 'v1' : 'v2';
  const raw = Array.isArray(body.events) ? body.events.slice(0, 60) : [];
  if (!sessionId || !raw.length) return NextResponse.json({ ok: false }, { status: 400 });

  const cookieStore = await cookies();
  const supa = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
  const { data: { user } } = await supa.auth.getUser();

  const rows = raw.flatMap((e) => {
    const ev = e as { kind?: string; product_id?: unknown; bucket?: string; position?: unknown };
    const productId = Number(ev.product_id);
    if (!ev.kind || !KINDS.has(ev.kind) || !Number.isInteger(productId) || productId <= 0) return [];
    return [{
      user_id: user?.id ?? null,
      session_id: sessionId,
      variant,
      kind: ev.kind,
      product_id: productId,
      bucket: ev.bucket && BUCKETS.has(ev.bucket) ? ev.bucket : null,
      position: Number.isInteger(Number(ev.position)) ? Number(ev.position) : null,
    }];
  });
  if (!rows.length) return NextResponse.json({ ok: true, inserted: 0 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from('feed_events').insert(rows);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}
