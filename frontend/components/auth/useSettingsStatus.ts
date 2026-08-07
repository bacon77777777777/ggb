'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 設定頁帳號狀態的共用來源（LINE 綁定 + 邀請碼）
 *
 * 體感規則：**寧可先給上次的答案，也不要給載入動畫。**
 * 這些狀態幾乎不會變（綁定是一次性的事件），所以：
 *   1. 先用 localStorage 的上次結果立即渲染（第二次進頁零等待）
 *   2. 背景打一趟 /api/user/settings-status 更新
 *   3. 多個列共用同一趟請求（模組層去重），不會各打各的
 */

export interface SettingsStatus {
  line: { bound: boolean; canUnbind: boolean; synthetic: boolean };
  invite: { claimed: boolean; eligible: boolean };
  /** 舊快取可能沒有這個欄位，讀的人要容忍 undefined */
  password?: { set: boolean };
}

const cacheKey = (uid: string) => `ggb:acct-status:${uid}`;

let inflight: Promise<SettingsStatus | null> | null = null;
let memory: { uid: string; data: SettingsStatus } | null = null;
const listeners = new Set<(d: SettingsStatus) => void>();

async function fetchStatus(uid: string): Promise<SettingsStatus | null> {
  if (!inflight) {
    inflight = fetch('/api/user/settings-status')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .finally(() => { inflight = null; });
  }
  const data = await inflight;
  if (data && !('error' in data)) {
    memory = { uid, data };
    try { localStorage.setItem(cacheKey(uid), JSON.stringify(data)); } catch { /* 滿了就算了 */ }
    listeners.forEach(fn => fn(data));
    return data;
  }
  return null;
}

export function useSettingsStatus() {
  const { user } = useAuth();
  const uid = user?.id;
  const [data, setData] = useState<SettingsStatus | null>(
    () => (memory && memory.uid === uid ? memory.data : null),
  );

  useEffect(() => {
    if (!uid) return;
    if (memory?.uid === uid) {
      setData(memory.data);
    } else {
      try {
        const cached = localStorage.getItem(cacheKey(uid));
        if (cached) {
          const parsed = JSON.parse(cached) as SettingsStatus;
          memory = { uid, data: parsed };
          setData(parsed);
        }
      } catch { /* 壞快取當沒有 */ }
    }
    const fn = (d: SettingsStatus) => setData(d);
    listeners.add(fn);
    void fetchStatus(uid);
    return () => { listeners.delete(fn); };
  }, [uid]);

  return {
    data,
    refresh: () => (uid ? fetchStatus(uid) : Promise.resolve(null)),
  };
}
