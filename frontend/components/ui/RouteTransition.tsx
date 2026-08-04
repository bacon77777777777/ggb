'use client';

/**
 * 換頁轉場遮罩
 *
 * 解決的問題：彈窗按下 CTA、機台確認檔次之後，畫面會先把彈窗收掉，
 * 然後停在舊頁面上等路由切換完成，看起來像沒反應、按了兩次。
 *
 * 做法是「動作當下立刻蓋上全屏 loading，再開始換頁」，
 * 遮罩掛在 layout 這一層，所以來源元件卸載了也不會跟著消失，
 * 直到新頁面的 pathname 進來才收起。
 *
 * 用 ProductLoadingScreen 而不是另外做一個 spinner ——
 * 見 CLAUDE.md：前台 loading 一律用它，不可自創。
 */

import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ProductLoadingScreen } from './ProductLoadingScreen';

interface Ctx {
  /** 立刻蓋上 loading 再換頁 */
  navigate: (href: string) => void;
  /** 只蓋 loading，換頁由呼叫端自己做（例如要先打 API） */
  begin: () => void;
  end: () => void;
}

const RouteTransitionContext = createContext<Ctx | null>(null);

/** 保險絲：路由若因故沒有變化，不要讓玩家卡在白畫面 */
const MAX_MS = 8000;

export function RouteTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  // 新頁面進來就收掉
  useEffect(() => { setActive(false); }, [pathname]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), MAX_MS);
    return () => clearTimeout(t);
  }, [active]);

  const begin = useCallback(() => setActive(true), []);
  const end = useCallback(() => setActive(false), []);

  const navigate = useCallback((href: string) => {
    setActive(true);
    router.push(href);
  }, [router]);

  return (
    <RouteTransitionContext.Provider value={{ navigate, begin, end }}>
      {children}
      {active && <ProductLoadingScreen />}
    </RouteTransitionContext.Provider>
  );
}

/** Provider 不存在時退化成一般換頁，不要因為忘了包 Provider 就整個壞掉 */
export function useRouteTransition(): Ctx {
  const ctx = useContext(RouteTransitionContext);
  const router = useRouter();
  if (ctx) return ctx;
  return {
    navigate: (href: string) => router.push(href),
    begin: () => {},
    end: () => {},
  };
}
