import type { SupabaseClient } from '@supabase/supabase-js';
import { asset } from '@/lib/asset';

/**
 * 曬獎圖片（老闆 2026-08-24）
 *
 * 只有大獎能曬。判定與數據都由 DB 的 `get_prize_share_data(draw_id)` 一趟回來
 * （migration 610）—— 判定放前台就能亂曬，而且規則只該有一份。
 *
 * 圖是**前端 Canvas 合成**：底圖 + 品項圖 + 文字，不上傳、不進 R2 ——
 * 零成本、即時，也不會存一堆沒人看的圖。分享走 `navigator.share({ files })`，
 * 跟邀請頁同一套（那邊已經跑順了）。
 */
export interface PrizeShareData {
  drawId: number;
  isMajor: boolean;
  prizeName: string;
  prizeLevel: string;
  prizeImage: string | null;
  productName: string;
  productType: string;
  playerName: string;
  wonAt: string;
  drawCount: number;
  totalSpent: number;
}

export async function fetchPrizeShareData(
  supabase: SupabaseClient,
  drawId: string | number,
): Promise<PrizeShareData | null> {
  const { data, error } = await supabase.rpc('get_prize_share_data', { p_draw_id: Number(drawId) });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    drawId: Number(d.draw_id),
    isMajor: Boolean(d.is_major),
    prizeName: String(d.prize_name ?? ''),
    prizeLevel: String(d.prize_level ?? ''),
    prizeImage: (d.prize_image as string | null) ?? null,
    productName: String(d.product_name ?? ''),
    productType: String(d.product_type ?? ''),
    playerName: String(d.player_name ?? ''),
    wonAt: String(d.won_at ?? ''),
    drawCount: Number(d.draw_count ?? 0),
    totalSpent: Number(d.total_spent ?? 0),
  };
}

/**
 * 底圖（老闆提供）。
 *
 * 換圖流程：把新的底圖放進 `public/images/congrats/`，**先轉 WebP**
 * （`sharp(src).webp({quality:88}).toFile('bg.webp')` —— 原始 PNG 1.9MB，WebP 只要約 1/10，
 * 見 CLAUDE.md「大圖先轉 WebP 再放進來」），再回來對著新圖調 SHARE_LAYOUT 的座標。
 * 底圖尺寸不同時要同步改 `canvas` 的寬高，其餘座標都是這個座標系下的像素值。
 */
export const SHARE_BG = asset('/images/congrats/bg.webp');

/**
 * 版位設定 —— **換底圖時只要改這裡的數字**。
 *
 * 座標系就是底圖的原生像素（941×1672）。老闆之後會給「挖空版」底圖
 * （品項圖、品項名、三個數據、玩家名與時間都留白），到時對著新圖微調這些值即可，
 * 元件本身不用動。
 */
export const SHARE_LAYOUT = {
  canvas: { w: 941, h: 1672 },
  /** 品項圖：等比縮放塞進這個框，置中（contain，不裁切 —— 商品圖直式橫式都有） */
  prizeImage: { x: 196, y: 446, w: 548, h: 660 },
  /** 品項名稱：紫色斜帶上的白字，最多兩行 */
  prizeName: { cx: 470, y: 1178, maxWidth: 600, size: 40, lineHeight: 54, maxLines: 2 },
  /** 三個數據欄的中心 x；label 與 value 各自的 y */
  stats: {
    cx: [246, 470, 698],
    labelY: 1352,
    valueY: 1424,
    labelSize: 24,
    valueSize: 62,
    unitSize: 24,
    /** 每欄可用寬度：數字（含單位）超過就自動縮字級，避免五六位數的花費撞到隔欄 */
    cellWidth: 200,
  },
  /** 玩家名與時間（左下角小卡） */
  player: { x: 492, nameY: 1570, timeY: 1604, nameSize: 30, timeSize: 22 },
  colors: {
    white: '#ffffff',
    lime: '#c6f432',
    sub: 'rgba(255,255,255,0.72)',
  },
} as const;

/** 「2026.08.24 21:45」 */
export function formatWonAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 「2026 年 08 月」—— 曬圖數據欄的「中獎時間」只到年月（老闆指定） */
export function formatWonMonth(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
