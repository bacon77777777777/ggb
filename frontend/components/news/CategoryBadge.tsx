import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  ichiban: '一番賞', gacha: '轉蛋', toy: '盒玩周邊', tcg: '卡牌', figure: '公仔景品',
  // 舊值保留對照，避免既有資料顯示空白
  blindbox: '盒玩周邊', general: '盒玩周邊',
};

const CATEGORY_COLORS: Record<string, string> = {
  ichiban: 'bg-blue-500',
  gacha:   'bg-orange-500',
  toy:     'bg-purple-500',
  blindbox: 'bg-purple-500',
  tcg:     'bg-amber-500',
  figure:  'bg-rose-500',
  general: 'bg-neutral-400',
};

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

export default function CategoryBadge({ category, className }: CategoryBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center h-[18px] px-1.5 text-[10px] font-bold text-white rounded-[4px] flex-shrink-0',
      CATEGORY_COLORS[category] ?? 'bg-neutral-400',
      className,
    )}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}
