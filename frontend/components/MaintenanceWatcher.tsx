'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * 維護狀態監看
 *
 * middleware 只在「換頁」時攔得到。坐在同一頁不動的人，維護開了也不會有反應 ——
 * 老闆要的是「用戶會被踢出」，所以還需要這個。
 *
 * 用輪詢而不是 Supabase realtime：維護狀態放在 platform_settings，
 * 那張表沒有進 realtime publication，而且為了一個低頻事件去開 publication
 * 會讓所有設定變更都廣播出去（運費、健康檢查時間戳都在同一張表）。
 * 30 秒一次的輕量查詢便宜得多。
 *
 * 只在分頁可見時輪詢：背景分頁沒必要一直打，使用者切回來會立刻補一次。
 */
const POLL_MS = 30_000;

export default function MaintenanceWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/maintenance', { cache: 'no-store' });
        if (!res.ok) return;
        const { active } = await res.json();
        const onMaintPage = pathname === '/maintenance';
        // 開啟維護但還在一般頁面 → 踢走；解除維護但還在維護頁 → 帶回來。
        // 兩邊都用 refresh 讓 middleware 決定去向，不要在前端自己算路徑
        if (active !== onMaintPage) router.refresh();
      } catch {
        // 查不到就當作沒事。網路不穩不該把人踢到維護頁
      }
    };

    const id = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    check();

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [router, pathname]);

  return null;
}
