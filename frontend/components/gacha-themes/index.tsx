'use client';

import dynamic from 'next/dynamic';
import type { Prize } from '@/components/GachaMachine';

export type MachineTheme =
  | 'gacha_classic'
  | 'gacha_modern'
  | 'gacha_retro'
  | 'ichiban_grid'
  | 'ichiban_tear'
  | 'custom_grid'
  | 'custom_tear'
  | 'card_pack'
  | 'blindbox_classic'
  | 'blindbox_claw';

export interface GachaThemeProps {
  isOpen: boolean;
  prizes: Prize[];
  onGoToWarehouse: () => void;
  onContinue: () => void;
  isLoading?: boolean;
}

// 各主題 lazy load（尚未實作的暫時 fallback 到 ClassicCapsule）
const ClassicCapsule = dynamic(() => import('@/components/GachaMachine'), { ssr: false });
const CardPackAnimation = dynamic(() => import('@/components/card/CardDrawAnimation'), { ssr: false });

const THEME_MAP: Record<MachineTheme, React.ComponentType<GachaThemeProps>> = {
  gacha_classic:    ClassicCapsule,
  gacha_modern:     ClassicCapsule,
  gacha_retro:      ClassicCapsule,
  ichiban_grid:     ClassicCapsule,
  ichiban_tear:     ClassicCapsule,
  custom_grid:      ClassicCapsule,
  custom_tear:      ClassicCapsule,
  card_pack:        CardPackAnimation,
  blindbox_classic: ClassicCapsule,
  blindbox_claw:    ClassicCapsule,
};

interface GachaThemeRendererProps extends GachaThemeProps {
  theme?: MachineTheme | string | null;
}

export function GachaThemeRenderer({ theme, ...props }: GachaThemeRendererProps) {
  const Component = THEME_MAP[(theme as MachineTheme) || 'gacha_classic'] ?? ClassicCapsule;
  return <Component {...props} />;
}
