import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  ichiban: '一番賞', gacha: '轉蛋', blindbox: '盒玩', tcg: '卡牌', general: '綜合',
};

const CATEGORY_COLORS: Record<string, string> = {
  ichiban: 'bg-blue-500',
  gacha:   'bg-orange-500',
  blindbox: 'bg-purple-500',
  tcg:     'bg-amber-500',
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
