import { cn } from '@/lib/utils';
import { gradeStyle } from '@/lib/prizeGrade';

/**
 * 賞等膠囊 —— 全站唯一的賞等呈現方式
 *
 * 中獎彈窗、品項總覽、店家配率表、品項詳情都用這個。過去每個畫面各自
 * 用 tailwind 拼一顆，同一個 B賞 在不同地方大小顏色都不一樣；要調整
 * 賞等視覺時也得一個個找。
 *
 * 配色規則在 `lib/prizeGrade.ts`，這裡只負責尺寸與形狀。
 */
export function GradeBadge({
  grade,
  size = 'md',
  className,
}: {
  grade?: string | null;
  /** sm 用在密集的列表（配率表、總覽），md 用在彈窗 */
  size?: 'sm' | 'md';
  className?: string;
}) {
  const g = String(grade ?? '').trim();
  if (!g) return null;
  const s = gradeStyle(g);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-black leading-none whitespace-nowrap',
        size === 'sm' ? 'min-w-[34px] px-1.5 py-0.5 text-[11px]' : 'min-w-[40px] px-2 py-1 text-[12px]',
        s.bg,
        s.text,
        className,
      )}
    >
      {g}
    </span>
  );
}

export default GradeBadge;
