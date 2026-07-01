'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type FeatureKey = 'sell' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom' | 'exchange' | 'market' | 'sell_escrow';

export type FeatureFlags = Record<FeatureKey, boolean>;

const DEFAULT_FLAGS: FeatureFlags = {
  sell: false,
  ichiban: false,
  blindbox: false,
  gacha: false,
  card: false,
  custom: false,
  exchange: false,
  market: false,
  sell_escrow: false,
};

const SAFE_FALLBACK_FLAGS: FeatureFlags = {
  ...DEFAULT_FLAGS,
};

type FeatureFlagsState = {
  flags: FeatureFlags;
  isLoading: boolean;
};

const FeatureFlagsContext = createContext<FeatureFlagsState>({
  flags: SAFE_FALLBACK_FLAGS,
  isLoading: true,
});

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let hasLoadedOnce = false;

    const run = async () => {
      if (!hasLoadedOnce) setIsLoading(true);
      try {
        if (typeof window !== 'undefined') {
          try {
            const raw = window.localStorage.getItem('gachago:feature_flags');
            if (raw) {
              const parsed = JSON.parse(raw) as Partial<Record<FeatureKey, unknown>>;
              const cached: FeatureFlags = { ...DEFAULT_FLAGS };
              for (const k of Object.keys(cached) as FeatureKey[]) {
                if (k in parsed) cached[k] = Boolean((parsed as any)[k]);
              }
              if (cached.exchange && cached.market) cached.market = false;
              if (!cancelled) setFlags(cached);
            }
          } catch {}
        }

        const { data, error } = await supabase.from('feature_flags').select('key, enabled');
        if (error) throw error;
        const next: FeatureFlags = { ...DEFAULT_FLAGS };
        for (const row of Array.isArray(data) ? data : []) {
          const key = String((row as any)?.key || '') as FeatureKey;
          if (!(key in next)) continue;
          next[key] = Boolean((row as any)?.enabled);
        }
        if (next.exchange && next.market) next.market = false;
        if (!cancelled) {
          setFlags(next);
          try {
            window.localStorage.setItem('gachago:feature_flags', JSON.stringify(next));
          } catch {}
        }
      } catch {
        if (!cancelled) setFlags((prev) => prev);
      } finally {
        hasLoadedOnce = true;
        if (!cancelled) setIsLoading(false);
      }
    };

    run();

    const channel = supabase
      .channel('feature_flags_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, () => {
        void run();
      })
      .subscribe();

    const onFocus = () => void run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void run();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void run();
    }, 2_000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, []);

  const value = useMemo(() => ({ flags, isLoading }), [flags, isLoading]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
