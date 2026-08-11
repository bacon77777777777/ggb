/**
 * 前台大圖批次轉 WebP
 *
 * 動機：轉蛋頁整個畫面被 `visibility:hidden` 藏著，直到機台主圖載完才顯示，
 * 而那張圖是 700KB~1.2MB 的未壓縮 PNG（還標了 unoptimized 繞過 Next 最佳化）。
 * 頁面另有一道「3 秒還沒載完就硬顯示」的保險，4G 上幾乎每次都撞到 ——
 * 老闆感受到的「進商品頁 3~5 秒」主因在這裡，不在 JS。
 *
 * 一律保留 alpha（機台、卡背、遮罩都是去背圖，轉成不透明會露白底）。
 * 有損 q88；實測機台圖省 89~92%，肉眼看不出差別。
 *
 * 用法：npx tsx scripts/convert_frontend_images.ts <清單檔> [--apply]
 * 不加 --apply 只列出前後大小，不寫檔。
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const ROOT = path.resolve(__dirname, '../../frontend/public')
const listFile = process.argv[2]
const apply = process.argv.includes('--apply')

async function main() {
  const rels = fs.readFileSync(listFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
  let before = 0, after = 0, done = 0, skipped = 0

  for (const rel of rels) {
    const src = path.join(ROOT, rel.replace(/^\//, ''))
    if (!fs.existsSync(src)) { console.warn(`  跳過（找不到）：${rel}`); skipped++; continue }
    const dst = src.replace(/\.(png|jpe?g)$/i, '.webp')
    const raw = fs.readFileSync(src)
    // alpha 一律保留：站上大量去背素材，壓成不透明會露出白底
    const webp = await sharp(raw).webp({ quality: 88, alphaQuality: 100 }).toBuffer()
    before += raw.length; after += webp.length; done++
    console.log(`${(raw.length / 1024).toFixed(0).padStart(6)} KB → ${(webp.length / 1024).toFixed(0).padStart(5)} KB  (省 ${String(Math.round((1 - webp.length / raw.length) * 100)).padStart(2)}%)  ${rel}`)
    if (apply) { fs.writeFileSync(dst, webp); fs.unlinkSync(src) }
  }
  console.log(`\n${done} 檔${skipped ? `（跳過 ${skipped}）` : ''}：${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(1)} MB，省 ${Math.round((1 - after / before) * 100)}%`)
  if (!apply) console.log('這是乾跑。確認後加 --apply 才會寫檔並刪除原 PNG。')
}
main().catch(e => { console.error(e); process.exit(1) })
