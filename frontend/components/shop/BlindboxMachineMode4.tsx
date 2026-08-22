'use client';

/**
 * 盒玩販賣機 — 賽璐璐風格
 *
 * 與「叢林探險」（mode3）是同一台機器，版位、物理、動畫完全相同，
 * 只有機台主圖與取物口遮罩換皮，故直接沿用 Mode3 並指定素材資料夾，
 * 不複製一份邏輯（避免日後改物理時只改到其中一邊）。
 */

import { BlindboxMachineMode3, type BlindboxMachineMode3Props } from './BlindboxMachineMode3';
import { asset } from '@/lib/asset';

export type BlindboxMachineMode4Props = Omit<BlindboxMachineMode3Props, 'assetBase'>;

export function BlindboxMachineMode4(props: BlindboxMachineMode4Props) {
  return <BlindboxMachineMode3 {...props} assetBase={asset("/images/blindbox/mode4")} />;
}

export default BlindboxMachineMode4;
