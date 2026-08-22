import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** 這段時間內剛抓過的資料視為新鮮，不重抓（預取 → 掛載 之間不打兩次） */
export const FRESH_MS = 5000;

/**
 * 先套快取、再背景更新（stale-while-revalidate，但只在記憶體、而且一定會重抓）。
 *
 * apply(data, stale)：stale=true 是快取的舊資料（先畫出來）、false 是剛抓到的。
 * 回傳 hadCache 讓呼叫端決定要不要顯示骨架屏：有快取就不要閃。
 * queryFn 丟錯不會污染快取（fetchQuery 失敗不寫入），呼叫端自己 catch。
 */
export async function swrLoad<T>(
  qc: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  apply: (data: T, stale: boolean) => void,
): Promise<{ hadCache: boolean; data: T }> {
  const cached = qc.getQueryData<T>(queryKey);
  if (cached !== undefined) apply(cached, true);
  const data = await qc.fetchQuery({ queryKey, queryFn, staleTime: FRESH_MS });
  apply(data, false);
  return { hadCache: cached !== undefined, data };
}

/** 按下就預取：同 key 在 FRESH_MS 內已抓過就不再打 */
export function prefetch<T>(qc: QueryClient, queryKey: QueryKey, queryFn: () => Promise<T>) {
  void qc.prefetchQuery({ queryKey, queryFn, staleTime: FRESH_MS });
}

/** 帶逾時的 fetch JSON（公開資料 API 用） */
export async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}
