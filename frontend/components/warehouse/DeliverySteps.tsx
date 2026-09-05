'use client';

import { cn } from '@/lib/utils';
import { ORDER_STEPS, orderStepIndex, isOrderFinal } from '@/lib/orderStatus';

/**
 * 配送進度步驟條（老闆 2026-08-24：配送訂單頁的 UI 照商城那套）
 *
 * 視覺完全比照商城訂單彈層的 `.steps / .stp`（`app/sell/market.css` 行 757-766）：
 * 圓點 10px、連線 2px、已完成橘色、當前紅色帶 4px 光暈。
 * 這裡用 Tailwind 重寫而不是 import market.css —— 那份樣式全部掛在 `.mk` 底下，
 * 要沿用就得把整個彈窗包一層 `.mk`，會連帶吃進幾百行不相關的規則。
 *
 * 步驟與文案來自 `lib/orderStatus` —— 徽章吃的是同一份，不然同一張訂單會
 * 徽章一個說法、步驟條另一個說法（老闆 2026-08-26 問的就是這個）。
 * cancelled 不走步驟條（呼叫端自己顯示已取消）。
 */
export { ORDER_STEPS as DELIVERY_STEPS };

/** size="lg"：桌機會員中心配送明細用的放大版（字 13、圓點 14、線 3）；預設 md 是手機原本的尺寸 */
export function DeliverySteps({ status, className, size = 'md' }: { status: string | undefined | null; className?: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  const cur = orderStepIndex(status);
  // 走到終點時最後一格是「完成」不是「進行中」—— 否則已送達的訂單
  // 會一直閃著代表還在進行的紅色光暈
  const atEnd = isOrderFinal(status);

  return (
    <div className={cn('flex pb-0.5 pt-1', className)}>
      {ORDER_STEPS.map((label, i) => {
        const done = i < cur || (i === cur && atEnd);
        const now = i === cur && !atEnd;
        return (
          <div
            key={label}
            className={cn(
              'relative flex-1 text-center', lg ? 'pt-7 text-[13px]' : 'pt-5 text-[10px]',
              now ? 'font-bold text-accent-red' : done ? 'text-neutral-500' : 'text-neutral-400',
            )}
          >
            {/* 連線（第一格不畫） */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[-50%] w-full', lg ? 'top-[9px] h-[3px]' : 'top-2 h-0.5',
                  i <= cur ? 'bg-accent-red/80' : 'bg-neutral-200 dark:bg-neutral-700',
                )}
              />
            )}
            {/* 圓點 */}
            <span
              aria-hidden
              className={cn(
                'absolute left-1/2 z-[2] -translate-x-1/2 rounded-full', lg ? 'top-[3px] h-3.5 w-3.5' : 'top-1 h-2.5 w-2.5',
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
