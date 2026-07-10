import { createClient } from '@/lib/supabase/client';

export type EventType =
  // Page
  | 'page_view'
  | 'page_exit'
  | 'scroll_depth'
  // Product
  | 'product_view'
  | 'product_click'
  | 'series_click'
  | 'winning_records_view'
  // Draw
  | 'draw'
  | 'draw_single'
  | 'draw_multi'
  | 'draw_preview'
  | 'draw_trial'
  | 'draw_result_view'
  | 'prize_reveal'
  // Balance
  | 'insufficient_balance'
  // Topup
  | 'topup_page_view'
  | 'topup_plan_select'
  | 'topup_success'
  // Warehouse / Delivery
  | 'warehouse_view'
  | 'tab_switch'
  | 'delivery_modal_open'
  | 'delivery_logistics_select'
  | 'delivery_success'
  | 'delivery_abandon'
  | 'dismantle'
  // Marketplace
  | 'list_to_market'
  | 'marketplace_view'
  | 'marketplace_item_view'
  // Search & Navigation
  | 'search'
  | 'search_query'
  | 'banner_click'
  | 'leaderboard_view'
  // News
  | 'news_list_view'
  | 'news_article_click'
  | 'news_category_filter'
  | 'news_like'
  | 'news_comment'
  | 'news_share'
  | 'news_source_click'
  // Errors
  | 'error_draw_fail'
  | 'error_delivery_fail';

export interface TrackOptions {
  productId?: number;
  series?: string;
  path?: string;
  meta?: Record<string, unknown>;
}

let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = sessionStorage.getItem('_ggb_sid') ?? crypto.randomUUID();
    sessionStorage.setItem('_ggb_sid', _sessionId);
  }
  return _sessionId;
}

export function trackEvent(eventType: EventType, opts: TrackOptions = {}) {
  void (async () => {
    try {
      const supabase = createClient();
      const path = opts.path ?? (typeof window !== 'undefined' ? window.location.pathname : null);
      await supabase.rpc('track_user_event', {
        p_event_type: eventType,
        p_product_id: opts.productId ?? null,
        p_series: opts.series ?? null,
        p_session_id: getSessionId(),
        p_meta: opts.meta ?? {},
        p_path: path,
      });
    } catch {
      // silent fail — tracking must never break the app
    }
  })();
}

// Page dwell time tracker — call on mount, returns cleanup that fires page_exit
export function trackPageView(path?: string): () => void {
  const resolvedPath = path ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const enterAt = Date.now();
  trackEvent('page_view', { path: resolvedPath });

  const fireExit = () => {
    const dwell = Math.round((Date.now() - enterAt) / 1000);
    trackEvent('page_exit', { path: resolvedPath, meta: { dwell_seconds: dwell } });
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') fireExit();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    fireExit();
  };
}

// Scroll depth tracker — attach to a scrollable element or window
export function trackScrollDepth(path?: string): () => void {
  const resolvedPath = path ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const fired = new Set<number>();
  const thresholds = [25, 50, 75, 100];

  const check = () => {
    const el = document.documentElement;
    const scrolled = el.scrollTop + el.clientHeight;
    const total = el.scrollHeight;
    if (total === 0) return;
    const pct = Math.round((scrolled / total) * 100);
    for (const t of thresholds) {
      if (pct >= t && !fired.has(t)) {
        fired.add(t);
        trackEvent('scroll_depth', { path: resolvedPath, meta: { depth: t } });
      }
    }
  };

  window.addEventListener('scroll', check, { passive: true });
  return () => window.removeEventListener('scroll', check);
}
