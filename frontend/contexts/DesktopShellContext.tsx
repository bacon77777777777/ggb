'use client';

/**
 * 電腦端外殼的狀態：側欄有沒有收合。
 *
 * 只有一個布林卻要做成 context，是因為要它的人分散在三處：
 * 導覽列的收合鈕（在 Navbar 裡）、側欄本身、還有把內容往右推的框（DesktopFrame）。
 * 選擇記在 localStorage，下次進站照舊。
 *
 * 初值一律「展開」再從 localStorage 補：SSR 讀不到 localStorage，
 * 先猜再改才不會 hydration 對不上。
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SIDEBAR_STORAGE_KEY } from '@/lib/desktopShell';

interface DesktopShellState {
  collapsed: boolean;
  toggle: () => void;
}

const Ctx = createContext<DesktopShellState>({ collapsed: false, toggle: () => {} });

export function DesktopShellProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1') setCollapsed(true);
    } catch { /* 無痕模式讀不到就維持展開 */ }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0'); } catch { /* 同上 */ }
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ collapsed, toggle }}>{children}</Ctx.Provider>;
}

export const useDesktopShell = () => useContext(Ctx);
