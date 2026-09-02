'use client';

import { cn } from '@/lib/utils';
import { splitTwAddress, zip3Of } from '@/lib/twDistricts';

/**
 * 收件資料的統一長相（老闆 2026-09-02：「同個數據三種 UI，統一」）。
 *
 * 我的地址列表、結帳的收件資訊區塊、結帳的地址選卡都渲染這一份：
 *   第一行：姓名｜遮碼電話｜（預設標籤）
 *   第二行：地址
 * 選中／未選中之類的狀態由外層卡片（邊框、勾勾）表達，這裡面永遠長一樣。
 * 字級照老闆指定：稍大、不加粗。
 */

export function maskPhone(raw: string): string {
  const v = (raw || '').trim();
  if (v.length <= 6) return v;
  return `${v.slice(0, 4)}****${v.slice(-3)}`;
}

export function AddressInfo({ name, phone, address, isDefault, className }: {
  name: string;
  phone: string;
  address: string;
  isDefault?: boolean;
  className?: string;
}) {
  // 地址前綴 3 碼郵遞區號（推得出來才顯示；門市取貨等非台灣格式字串會自然略過）
  const parts = splitTwAddress(address);
  const zip = zip3Of(parts.city, parts.district);
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[16px] text-neutral-900 dark:text-white">{name}</span>
        <span className="truncate border-l border-neutral-300 dark:border-neutral-600 pl-2 text-[14px] text-neutral-500">
          {maskPhone(phone)}
        </span>
        {isDefault && (
          <span className="shrink-0 inline-block rounded-[2px] border border-primary px-1 py-[1px] text-[10px] text-primary">
            預設
          </span>
        )}
      </div>
      <p className="mt-1 text-[14px] leading-relaxed text-neutral-600 dark:text-neutral-400">{zip ? `${zip} ${address}` : address}</p>
    </div>
  );
}

export default AddressInfo;
