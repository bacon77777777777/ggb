'use client';

import { cn } from '@/lib/utils';

/**
 * 配送進度步驟條（老闆 2026-08-24：配送訂單頁的 UI 照商城那套）
 *
 * 視覺完全比照商城訂單彈層的 `.steps / .stp`（`app/sell/market.css` 行 757-766）：
 * 圓點 10px、連線 2px、已完成橘色、當前紅色帶 4px 光暈。
 * 這裡用 Tailwind 重寫而不是 import market.css —— 那份樣式全部掛在 `.mk` 底下，
 * 要沿用就得把整個彈窗包一層 `.mk`，會連帶吃進幾百行不相關的規則。
 *
 * 步驟對應 `orders.status`（抽獎這邊的配送）：
 *   submitted 已申請 → processing 揀貨中 → picked_up 已出貨 → shipping 配送中 → delivered 已送達
 * cancelled 不走步驟條（呼叫端自己顯示「訂單已結束」）。
 */
export const DELIVERY_STEPS = ['已申請', '揀貨中', '已出貨', '配送中', '已送達'] as const;

const STATUS_INDEX: Record<string, number> = {
  submitted: 0,
  processing: 1,
  picked_up: 2,
  shipping: 3,
  delivered: 4,
};

export function deliveryStepIndex(status: string | undefined | null): number {
  return STATUS_INDEX[String(status ?? '')] ?? 0;
}

export function DeliverySteps({ status, className }: { status: string | undefined | null; className?: string }) {
  const cur = deliveryStepIndex(status);
  return (
    <div className={cn('flex pb-0.5 pt-1', className)}>
      {DELIVERY_STEPS.map((label, i) => {
        const done = i < cur;
        const now = i === cur;
        return (
          <div
            key={label}
            className={cn(
              'relative flex-1 pt-5 text-center text-[10px]',
              now ? 'font-bold text-accent-red' : done ? 'text-neutral-500' : 'text-neutral-400',
            )}
          >
            {/* 連線（第一格不畫） */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[-50%] top-2 h-0.5 w-full',
                  done || now ? 'bg-accent-red/80' : 'bg-neutral-200 dark:bg-neutral-700',
                )}
              />
            )}
            {/* 圓點 */}
            <span
              aria-hidden
              className={cn(
                'absolute left-1/2 top-1 z-[2] h-2.5 w-2.5 -translate-x-1/2 rounded-full',
                now
                  ? 'bg-accent-red ring-4 ring-accent-red/15'
                  : done
                    ? 'bg-accent-red/80'
                    : 'bg-neutral-300 dark:bg-neutral-600',
              )}
            />
            {label}
          </div>
        );
      })}
    </div>
  );
}

export default DeliverySteps;
