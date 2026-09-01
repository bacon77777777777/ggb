import { asset } from '@/lib/asset';
/**
 * 各抽獎模組的首屏素材清單
 *
 * 用途有二，都是為了解決「首次進商品頁時上半部還在一張張長出來」：
 *
 *   1. **預載把關**：等這些圖真的載完才顯示畫面（見 useMachineAssets），
 *      玩家看到的是「載入動畫 → 完整畫面」，而不是半成品。
 *      轉蛋本來就有這道把關（機台主圖 onLoadingComplete 回報），
 *      但 card 與 blindbox 沒有，所以要補。
 *
 *   2. **提早開始下載**：素材寫在 React 元件裡，瀏覽器得先下載並執行 JS
 *      才知道要哪張圖，白白多一個往返。有了清單就能在 HTML 階段先 preload。
 *
 * ⚠️ 只列**首屏會看到**的圖。列太多會讓把關等到天荒地老，
 * 反而比不做還慢；蛋、盒子那些演出中才出現的素材不該進來。
 */

export const MACHINE_ASSETS: Record<string, string[]> = {
  // ── 轉蛋 ──
  gacha_classic: [asset('/images/gacha/machine.webp')],
  gacha_mode2: [asset('/images/gacha/mode2/main.webp')],
  gacha_mode3: [asset('/images/gacha/mode3/main.webp')],
  gacha_mode4: [asset('/images/gacha/mode4/main.webp'), asset('/images/gacha/mode4/box.svg')],
  gacha_mode5: [asset('/images/gacha/mode5/main.webp')],

  // ── 盒玩 ──
  blindbox_mode2: [asset('/images/blindbox/mode2/main.webp'), asset('/images/blindbox/mode2/hole_bg.webp')],
  blindbox_mode3: [asset('/images/blindbox/mode3/main.webp'), asset('/images/blindbox/mode3/hole_bg.webp')],
  blindbox_mode4: [asset('/images/blindbox/mode4/main.webp'), asset('/images/blindbox/mode4/hole_bg.webp')],
  blindbox_mode5: [asset('/images/blindbox/mode5/bg.webp')],

  // ── 抽卡 ──
  // 卡包模式的棚景底圖：沒等它就是老闆回報的「進去先看到一張全白卡包」
  /* 抽卡的背景 2026-09-01 起是 WebGL 海景，不再是圖檔 —— 這裡只等卡背 */
  card: [asset('/images/card/back.webp')],
  card_peel: [asset('/images/card/back.webp')],
  card_pack: [asset('/images/card/back.webp')],

  // ── 一番賞沉浸式撕紙 ──
  ichiban_tear: [
    asset('/images/ichiban-tear/bg.webp'),
    asset('/images/ichiban-tear/hand.webp'),
    asset('/images/ichiban-tear/bg.svg'),
    asset('/images/ichiban-tear/up1.svg'),
  ],
};

/**
 * 取得某個主題的首屏素材。
 * 商品自己的圖（主圖、卡包正面）由呼叫端另外加 —— 那是每件商品都不同的。
 */
export function machineAssets(theme: string | null | undefined, extra: (string | null | undefined)[] = []): string[] {
  const base = (theme && MACHINE_ASSETS[theme]) || [];
  const more = extra.filter((u): u is string => typeof u === 'string' && u.length > 0);
  return [...new Set([...base, ...more])];
}
