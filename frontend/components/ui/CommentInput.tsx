'use client';

import { forwardRef } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 留言／聊天輸入框 —— 全站統一元件（老闆 2026-09-02）
 *
 * 長相就是情報頁留言抽屜那組：圓角膠囊輸入框＋右側 primary 送出膠囊
 * （送出鈕造型是老闆 2026-08-30 指定的，比 26px 圓鈕好按）。
 * 情報頁留言與交易所聊聊都用這顆，之後別的地方要留言框也拿這個，不要再手刻。
 *
 * 未登入是「唯讀＋提示 placeholder」而不是 disabled —— disabled 會吃掉點擊，
 * 呼叫端就攔不到「點了 → 跳登入」。
 */
export const CommentInput = forwardRef<HTMLInputElement, {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** 未登入傳 false：唯讀、placeholder 換提示字 */
  canType: boolean;
  sending?: boolean;
  placeholder?: string;
  placeholderLoggedOut?: string;
  maxLength?: number;
  className?: string;
}>(function CommentInput(
  {
    value, onChange, onSend, canType, sending,
    placeholder = '說點什麼...', placeholderLoggedOut = '請先登入才能留言唷',
    maxLength = 300, className,
  },
  ref,
) {
  return (
    <div className={cn('flex-1 relative', className)}>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => canType && onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        maxLength={maxLength}
        readOnly={!canType}
        placeholder={canType ? placeholder : placeholderLoggedOut}
        className={cn(
          'w-full rounded-full pl-4 pr-14 py-2.5 text-[14px] placeholder-neutral-400 outline-none',
          canType
            ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed',
        )}
      />
      <button
        onClick={onSend}
        disabled={!canType || !value.trim() || sending}
        className="absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-150 disabled:opacity-25"
      >
        <span className="h-8 px-3.5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <Send className="w-3.5 h-3.5 text-white" />
        </span>
      </button>
    </div>
  );
});

export default CommentInput;
