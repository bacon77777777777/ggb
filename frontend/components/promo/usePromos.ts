'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { scheduleState } from '@/lib/schedule';
import { shouldShow } from '@/lib/promoDismiss';
import { useAuth } from '@/contexts/AuthContext';

export interface SitePromo {
  id: string;
  kind: 'popup' | 'notice';
  title: string | null;
  body: string;
  image_url: string | null;
  cta_text: string | null;
  cta_href: string | null;
  placements: string[];
  audience: 'all' | 'logged_in' | 'logged_out';
  layout: 'card' | 'image';
  start_at: string | null;
  end_at: string | null;
  dismiss_days: number;
  sort_order: number;
}

/**
 * 取出「此時此地該顯示」的推廣素材。
 *
 * 檔期沿用 lib/schedule 那套（與後台、DB 的 schedule_state 同規則），
 * 只是這裡 upcoming 與 ended 都直接不顯示——推廣素材沒有「顯示為已結束」
 * 這種狀態，過期就該消失。
 */
export function usePromos(kind: 'popup' | 'notice', placement: string) {
  const [promos, setPromos] = useState<SitePromo[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  useEffect(() => {
    // 等登入狀態確定再查，否則會先用「未登入」判一次、登入後又閃一次
    if (isAuthLoading) return;
    let cancelled = false;

    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('site_promos')
        .select('*')
        .eq('kind', kind)
        .eq('is_active', true)
        .contains('placements', [placement])
        .order('sort_order', { ascending: true });

      if (cancelled) return;
      const rows = (data ?? []) as SitePromo[];
      const matchesAudience = (a: SitePromo['audience']) =>
        a === 'all' || (a === 'logged_in') === isAuthenticated;

      setPromos(
        rows.filter(
          p => matchesAudience(p.audience) &&
               scheduleState(p.start_at, p.end_at) === 'running' &&
               shouldShow(p.id, p.dismiss_days),
        ),
      );
      setIsLoaded(true);
    };

    void load();

    // 同一頁把某則關掉後，其他位置要立刻跟著收起來
    const onDismiss = () => setPromos(prev => prev.filter(p => shouldShow(p.id, p.dismiss_days)));
    window.addEventListener('ggb:promoDismissed', onDismiss);
    return () => {
      cancelled = true;
      window.removeEventListener('ggb:promoDismissed', onDismiss);
    };
  }, [kind, placement, isAuthenticated, isAuthLoading]);

  return { promos, isLoaded };
}
