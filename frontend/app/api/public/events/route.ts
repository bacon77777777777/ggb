import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { scheduleState } from '@/lib/schedule';

/**
 * 活動列表（公開）—— CDN 邊緣快取 60 秒。
 *
 * 內頁走 /api/events/[slug]（service role，要展開 sections），列表只需要公開欄位，
 * 所以照 /api/public/news 用 anon client：同一套 RLS（events 的公開 policy 是
 * `is_active = true`），回的東西跟訪客自己查一模一樣，也才敢讓 CDN 快取。
 *
 * 檔期：已結束的不回（活動頁自己會蓋「活動已結束」，但列表沒必要留著），
 * 還沒開始的照回並標 upcoming —— 預熱本來就是檔期設計的一部分（見 lib/schedule.ts）。
 * 封面圖沒有獨立欄位，取 hero 段落的背景圖（影片版取 poster），沒有就回 null，
 * 前台畫底色卡片，不要塞假圖。
 */
const CACHE_SECONDS = 60;

export const dynamic = 'force-dynamic';

type HeroContent = { bg_image_url?: string; bg_poster_url?: string; subtitle?: string };

export async function GET() {
  const supabase = createAnonClient();

  const { data: rows, error } = await supabase
    .from('events')
    .select('id, slug, title, kind, accent_color, start_at, end_at, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  const live = (rows ?? [])
    .map(e => ({ ...e, state: scheduleState(e.start_at, e.end_at) }))
    .filter(e => e.state !== 'ended');

  // hero 段落＝封面圖與副標的來源。一次撈完再對應，不要一個活動打一次。
  const heroByEvent = new Map<string, HeroContent>();
  if (live.length) {
    const { data: sections } = await supabase
      .from('event_sections')
      .select('event_id, content, sort_order')
      .in('event_id', live.map(e => e.id))
      .eq('type', 'hero')
      .order('sort_order', { ascending: true });
    for (const s of (sections ?? []) as { event_id: string; content: HeroContent | null }[]) {
      if (!heroByEvent.has(s.event_id)) heroByEvent.set(s.event_id, s.content ?? {});
    }
  }

  const events = live
    .map(e => {
      const hero = heroByEvent.get(e.id) ?? {};
      return {
        slug: e.slug,
        title: e.title,
        kind: e.kind ?? 'other',
        state: e.state,
        start_at: e.start_at,
        end_at: e.end_at,
        accent_color: e.accent_color ?? null,
        cover: hero.bg_image_url || hero.bg_poster_url || null,
        subtitle: hero.subtitle ? String(hero.subtitle).replace(/\n/g, ' ').trim() : null,
      };
    })
    // 進行中的排前面；同組內快結束／快開始的優先（沒設時間的排最後）
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === 'running' ? -1 : 1;
      const key = (x: typeof a) => new Date((x.state === 'running' ? x.end_at : x.start_at) ?? 0).getTime() || Infinity;
      return key(a) - key(b);
    });

  return NextResponse.json(events, {
    headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, max-age=0` },
  });
}
