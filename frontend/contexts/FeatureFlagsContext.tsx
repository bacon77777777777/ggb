'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type FeatureKey = 'sell' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom' | 'slot' | 'exchange' | 'market' | 'recharge';

export type FeatureFlags = Record<FeatureKey, boolean>;

/**
 * 類別的三態（migration 483）。
 *
 * flags 那個布林分不出「暫時停一下」跟「不做了」，但對玩家差很多：
 * 維護中東西還在、晚點回來就有，該讓他看得到；
 * 關閉是平台不提供了，該完全消失，不要留一個點不動的入口吊人胃口。
 *
 * DB 端 enabled 永遠等於 (state = 'on')，所以維護中與關閉一樣抽不了 ——
 * states 只影響前台怎麼呈現。
 */
export type FlagState = 'on' | 'maintenance' | 'off';
export type FeatureStates = Record<FeatureKey, FlagState>;

const DEFAULT_FLAGS: FeatureFlags = {
  // recharge 預設 true，其餘預設 false。
  // 其他旗標是「開了才顯示」，關著最多少一個玩法；
  // 儲值是「關了才擋」，預設 false 的話旗標還沒載入完玩家就會閃一下「維護中」，
  // 而且真的斷線時整站都不能儲值。後端另有把關（/api/payment/ecpay），
  // 這裡放寬不會造成漏洞。
  recharge: true,
  sell: false,
  ichiban: false,
  blindbox: false,
  gacha: false,
  card: false,
  custom: false,
  slot: false,
  exchange: false,
  market: false,
};

const SAFE_FALLBACK_FLAGS: FeatureFlags = {
  ...DEFAULT_FLAGS,
  recharge: true,
};

const CACHE_KEY = 'gachago:feature_flags';

const statesFromFlags = (f: FeatureFlags): FeatureStates =>
  Object.fromEntries(
    (Object.keys(f) as FeatureKey[]).map(k => [k, f[k] ? 'on' : 'off']),
  ) as FeatureStates;

type FeatureFlagsState = {
  flags: FeatureFlags;
  states: FeatureStates;
  isLoading: boolean;
};

const FeatureFlagsContext = createContext<FeatureFlagsState>({
  flags: SAFE_FALLBACK_FLAGS,
  states: statesFromFlags(SAFE_FALLBACK_FLAGS),
  isLoading: true,
});

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [states, setStates] = useState<FeatureStates>(() => statesFromFlags(DEFAULT_FLAGS));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let hasLoadedOnce = false;

    const run = async () => {
      if (!hasLoadedOnce) setIsLoading(true);
      try {
        /*
         * 快取只在第一次執行時讀。
         *
         * 這個 effect 每 2 秒、每次視窗聚焦、每次資料庫變動都會再跑一次；
         * 每次都先套快取的話，畫面就會固定「快取值 → 查詢結果」閃一下，
         * 一分鐘閃三十次。快取的用途只有首次繪製，不是每次輪詢。
         */
        if (!hasLoadedOnce && typeof window !== 'undefined') {
          try {
            const raw = window.localStorage.getItem(CACHE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed) {
              const cachedFlags: FeatureFlags = { ...DEFAULT_FLAGS };
              const cachedStates: FeatureStates = statesFromFlags(DEFAULT_FLAGS);
              // 舊格式是一層布林；新格式是 { flags, states }
              const flagSrc = parsed.flags ?? parsed;
              const stateSrc = parsed.states ?? null;
              for (const k of Object.keys(cachedFlags) as FeatureKey[]) {
                if (k in flagSrc) cachedFlags[k] = Boolean(flagSrc[k]);
                cachedStates[k] = stateSrc?.[k] ?? (cachedFlags[k] ? 'on' : 'off');
              }
              if (!cancelled) {
                setFlags(cachedFlags);
                setStates(cachedStates);
              }
            }
          } catch {}
        }

        const { data, error } = await supabase.from('feature_flags').select('key, enabled, state');
        if (error) throw error;
        const next: FeatureFlags = { ...DEFAULT_FLAGS };
        const nextStates: FeatureStates = statesFromFlags(DEFAULT_FLAGS);
        for (const row of Array.isArray(data) ? data : []) {
          const key = String((row as any)?.key || '') as FeatureKey;
          if (!(key in next)) continue;
          next[key] = Boolean((row as any)?.enabled);
          const st = String((row as any)?.state || '');
          nextStates[key] = st === 'maintenance' || st === 'off' || st === 'on'
            ? (st as FlagState)
            : (next[key] ? 'on' : 'off');
        }
        if (!cancelled) {
          setFlags(next);
          setStates(nextStates);
          try {
            // states 也要存，不然下次開站快取只還原得了布林，
            // 維護中的類別會先當成關閉、頁籤閃一下才回來
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ flags: next, states: nextStates }));
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

  const value = useMemo(() => ({ flags, states, isLoading }), [flags, states, isLoading]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
