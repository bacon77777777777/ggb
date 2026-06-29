import { cn } from '@/lib/utils';
import { Flame, Box, Dna, Gift, Star } from 'lucide-react';

export type ProductType = 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom';
export type BadgeType = ProductType | 'hot' | 'new';

interface ProductBadgeProps {
  type: BadgeType;
  className?: string;
  icon?: boolean;
}

export default function ProductBadge({ type, className, icon = false }: ProductBadgeProps) {
  const config = {
    ichiban: {
      text: '一番賞',
      color: 'bg-blue-500',
      shadow: 'shadow-blue-500/20',
      icon: Star,
    },
    blindbox: {
      text: '盒玩',
      color: 'bg-purple-500',
      shadow: 'shadow-purple-500/20',
      icon: Box,
    },
    gacha: {
      text: '轉蛋',
      color: 'bg-orange-500',
      shadow: 'shadow-orange-500/20',
      icon: Dna,
    },
    card: {
      text: '抽卡',
      color: 'bg-amber-500',
      shadow: 'shadow-amber-500/20',
      icon: Dna,
    },
    custom: {
      text: '自製',
      color: 'bg-emerald-500',
      shadow: 'shadow-emerald-500/20',
      icon: Gift,
    },
    hot: {
      text: '熱門',
      color: 'bg-accent-red',
      shadow: 'shadow-accent-red/20',
      icon: Flame,
    },
    new: {
      text: '新品',
      color: 'bg-green-500',
      shadow: 'shadow-green-500/20',
      icon: Star,
    },
  };

  const style = config[type] || config.custom;
  const Icon = style.icon;

  return (
    <span className={cn(
      "h-4 px-1 text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm bg-opacity-90",
      style.color,
      style.shadow,
      className
    )}>
      {icon && <Icon className="w-3.5 h-3.5 fill-current" />}
      {style.text}
    </span>
  );
}
