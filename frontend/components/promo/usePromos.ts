'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { scheduleState } from '@/lib/schedule';
import { shouldShow, type DismissMode } from '@/lib/promoDismiss';
import { useAuth } from '@/contexts/AuthContext';

export interface SitePromo {
  id: string;
  layout: 'card' | 'image';
  title: string | null;
  body: string;
  image_url: string | null;
  cta_text: string | null;
  cta_href: string | null;
  placements: string[];
  start_at: string | null;
  end_at: string | null;
  sort_order: number;
}

type Audience = 'all' | 'logged_in' | 'logged_out';

/** 全站統一的投放規則，逐則不再各自設定（migration 423） */
export interface PromoRules {
  audience: Audience;
  dismissMode: DismissMode;
  dismissDays: number;
}

const DEFAULT_RULES: PromoRules = { audience: 'all', dismissMode: 'always', dismissDays: 7 };

/**
 * 取出「此時此地該顯示」的首頁彈窗，依排序由小到大排隊。
 *
 * 警語列不走這裡 —— 它的內容與規則寫死在 NoticeBar，不做後台設定。
 */
export function usePromos(placement: string) {
  const [promos, setPromos] = useState<SitePromo[]>([]);
  const [rules, setRules] = useState<PromoRules>(DEFAULT_RULES);
  const [isLoaded, setIsLoaded] = useState(false);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  useEffect(() => {
    // 等登入狀態確定再查，否則會先用「未登入」判一次、登入後又閃一次
    if (isAuthLoading) return;
    let cancelled = false;
    let current = DEFAULT_RULES;

    const load = async () => {
      const supabase = createClient();

      const [{ data: rows }, { data: settingRows }] = await Promise.all([
        supabase
          .from('site_promos')
          .select('*')
          .eq('kind', 'popup')
          .eq('is_active', true)
          .contains('placements', [placement])
          .order('sort_order', { ascending: true }),
        supabase
          .from('platform_settings')
          .select('key,value')
          .in('key', ['promo_audience', 'promo_dismiss_mode', 'promo_dismiss_days']),
      ]);

      if (cancelled) return;

      const map = Object.fromEntries((settingRows ?? []).map(r => [r.key, r.value]));
      current = {
        audience:    (map.promo_audience as Audience) || DEFAULT_RULES.audience,
        dismissMode: (map.promo_dismiss_mode as DismissMode) || DEFAULT_RULES.dismissMode,
        dismissDays: Number(map.promo_dismiss_days) || DEFAULT_RULES.dismissDays,
      };
      setRules(current);

      const audienceMatches =
        current.audience === 'all' ||
        (current.audience === 'logged_in') === isAuthenticated;

      setPromos(
        !audienceMatches ? [] : ((rows ?? []) as SitePromo[]).filter(
          p =>
            scheduleState(p.start_at, p.end_at) === 'running' &&
            shouldShow(p.id, current.dismissMode, current.dismissDays),
        ),
      );
      setIsLoaded(true);
    };

    void load();

    // 同一頁把某則關掉後，其他位置要立刻跟著收起來。
    // 讀 current 而不是 state：這個 handler 只建立一次，抓 state 會抓到舊值。
    const onDismiss = () =>
      setPromos(prev => prev.filter(p => shouldShow(p.id, current.dismissMode, current.dismissDays)));
    window.addEventListener('ggb:promoDismissed', onDismiss);
    return () => {
      cancelled = true;
      window.removeEventListener('ggb:promoDismissed', onDismiss);
    };
  }, [placement, isAuthenticated, isAuthLoading]);

  return { promos, rules, isLoaded };
}
