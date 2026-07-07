'use client';

import dynamic from 'next/dynamic';
import type { Prize } from '@/components/GachaMachine';

export type MachineTheme =
  | 'classic_capsule'
  | 'ichiban_pull'
  | 'claw_machine'
  | 'card_pack';

export interface GachaThemeProps {
  isOpen: boolean;
  prizes: Prize[];
  onGoToWarehouse: () => void;
  onContinue: () => void;
  isLoading?: boolean;
}

// 各主題 lazy load
const ClassicCapsule = dynamic(() => import('@/components/GachaMachine'), { ssr: false });
// 其他主題尚未實作，暫時都 fallback 到 ClassicCapsule
const IchibanPull = dynamic(() => import('@/components/GachaMachine'), { ssr: false });
const ClawMachine = dynamic(() => import('@/components/GachaMachine'), { ssr: false });
const CardPack    = dynamic(() => import('@/components/GachaMachine'), { ssr: false });

const THEME_MAP: Record<MachineTheme, React.ComponentType<GachaThemeProps>> = {
  classic_capsule: ClassicCapsule,
  ichiban_pull:    IchibanPull,
  claw_machine:    ClawMachine,
  card_pack:       CardPack,
};

interface GachaThemeRendererProps extends GachaThemeProps {
  theme?: MachineTheme | string | null;
}

export function GachaThemeRenderer({ theme, ...props }: GachaThemeRendererProps) {
  const Component = THEME_MAP[(theme as MachineTheme) || 'classic_capsule'] ?? ClassicCapsule;
  return <Component {...props} />;
}
