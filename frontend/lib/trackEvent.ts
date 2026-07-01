import { createClient } from '@/lib/supabase/client';

type EventType = 'product_view' | 'product_click' | 'search' | 'draw' | 'series_click';

export function trackEvent(
  eventType: EventType,
  opts: { productId?: number; series?: string; meta?: Record<string, unknown> } = {}
) {
  // Fire and forget — never block the UI
  void (async () => {
    try {
      const supabase = createClient();
      await supabase.rpc('track_user_event', {
        p_event_type: eventType,
        p_product_id: opts.productId ?? null,
        p_series: opts.series ?? null,
        p_meta: opts.meta ?? {},
      });
    } catch {
      // silent fail — tracking must never break the app
    }
  })();
}
