/**
 * 機台 sprite 切圖工具
 *
 * 從 2048×1400 的機台組圖切出活動頁需要的素材並上傳 R2。
 * 座標與 SlotMachineClassic.tsx 的 CSS background-position 反推一致：
 *   普通機台 750×932 @ (0,0)
 *   RUSH機台 750×932 @ (760,0)
 *   結果符號 256×256 × 6 @ y=950，x 間距 266（第一格 x=0）
 *
 * 活動頁用法慣例（複製主題時務必比照，勿直接塞整張 sprite）：
 *   hero.bg_image_url → RUSH 機台（視覺最強）
 *   hero.scatter      → 六個結果符號（景深散景）
 *   gallery.items     → 普通機台 + RUSH 機台（兩種面貌對照）
 *
 * 用法：npx tsx scripts/slice_slot_sprite.ts <sprite檔路徑> <輸出前綴>
 *   例：npx tsx scripts/slice_slot_sprite.ts ../frontend/public/images/slot/machine/sprite2.png slam-dunk
 */
import sharp from 'sharp'
import { r2Upload } from '../lib/r2'

const REGIONS = [
  { key: 'machine-normal', left: 0,    top: 0,   width: 750, height: 932 },
  { key: 'machine-rush',   left: 760,  top: 0,   width: 750, height: 932 },
  ...Array.from({ length: 6 }, (_, i) => ({
    key: `sym${i}`, left: i * 266, top: 950, width: 256, height: 256,
  })),
]

async function main() {
  const [src, prefix] = process.argv.slice(2)
  if (!src || !prefix) {
    console.error('用法：npx tsx scripts/slice_slot_sprite.ts <sprite路徑> <輸出前綴>')
    process.exit(1)
  }

  const meta = await sharp(src).metadata()
  console.log(`來源 ${src}（${meta.width}×${meta.height}）`)
  if (meta.width !== 2048 || meta.height !== 1400) {
    console.error(`⚠️ 尺寸非 2048×1400，座標可能不符`)
  }

  const out: Record<string, string> = {}
  for (const r of REGIONS) {
    // 分兩段：sharp 在同一條 pipeline 會把 trim 排在 extract 之前，需先取出再修邊
    const cut = await sharp(src)
      .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
      .png()
      .toBuffer()
    const buf = await sharp(cut)
      .trim({ threshold: 8 })          // 去掉透明留白，散景擺放才不會有空邊
      .webp({ quality: 92 })
      .toBuffer()
    const url = await r2Upload(`slot/${prefix}/${r.key}.webp`, buf, 'image/webp')
    out[r.key] = url
    console.log(`✓ ${r.key.padEnd(15)} ${(buf.length / 1024).toFixed(0)}KB  ${url}`)
  }

  const fs = await import('fs')
  fs.writeFileSync(`/tmp/sprite_${prefix}.json`, JSON.stringify(out, null, 2))
  console.log(`\n清單：/tmp/sprite_${prefix}.json`)
}

main()
