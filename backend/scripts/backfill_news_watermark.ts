/**
 * 既有文章封面圖的浮水印回填／修正
 *
 * 兩個歷史問題：
 *   1. 早期只用網域白名單（dengeki.com）決定要不要蓋 logo，但大量文章經由
 *      Google News 轉來，source_url 是 news.google.com，比對不到 → 完全沒蓋。
 *   2. 更嚴重的是蓋錯角落：舊的 detectWatermarkCorner() 在分數未達門檻時
 *      回傳 'top-right' 當保底，而電ホビ 有不少版面的浮水印在左上 ——
 *      結果 logo 蓋在右上、浮水印照樣露在左上。
 *
 * 因此本腳本**從原始文章重新抓圖**再處理，而不是在已蓋錯的圖上補蓋，
 * 否則會出現兩個 GGB logo 而原浮水印仍在。
 *
 * 判定：四角模板比對取分數最高的角落。已知帶浮水印的來源（電ホビ）
 * 不看門檻一律蓋（--force），其他來源才依門檻決定，避免在乾淨圖上亂蓋。
 *
 * 成本：只有本地 sharp 運算與 R2 儲存，不呼叫任何付費服務。
 *
 * 用法：
 *   psql "$DB" -t -A -F$'\t' -c \
 *     "SELECT id, source_url FROM news WHERE is_active" > /tmp/wm.tsv
 *   npx tsx scripts/backfill_news_watermark.ts /tmp/wm.tsv --force > /tmp/wm.sql
 *   psql "$DB" -f /tmp/wm.sql
 */
import fs from 'fs'
import { detectWatermark } from '../lib/dengekiWm'
import { brandCoverImage } from '../lib/newsBranding'
import { r2Upload } from '../lib/r2'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
/** 已知會在圖上壓浮水印的來源：不看門檻，一律以分數最高的角落蓋 */
const FORCE_DOMAINS = ['dengeki.com']

const args = process.argv.slice(2)
const tsvPath = args.find(a => !a.startsWith('--'))
const dryRun = !args.includes('--apply')
const useForce = args.includes('--force')
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(args[limitArg + 1]) : 1000

const log = (m: string) => process.stderr.write(m + '\n')   // stdout 只留 SQL

function meta(html: string, prop: string): string {
  const a = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)`, 'i'))
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'))
  return a?.[1] ?? b?.[1] ?? ''
}

async function main() {
  if (!tsvPath || !fs.existsSync(tsvPath)) {
    log('用法：npx tsx scripts/backfill_news_watermark.ts <清單.tsv> [--apply] [--force] [--limit N]')
    process.exit(1)
  }

  const rows = fs.readFileSync(tsvPath, 'utf8')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => { const [id, src] = l.split('\t'); return { id, src } })
    .filter(r => r.id && r.src?.startsWith('http'))
    .slice(0, LIMIT)

  log(`${dryRun ? '試跑（不上傳、不輸出 SQL）' : '實際處理'}：${rows.length} 篇`)

  let hit = 0, updated = 0, skipped = 0, failed = 0
  for (const r of rows) {
    try {
      const page = await fetch(r.src, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!page.ok) { failed++; continue }
      const html = await page.text()
      const imgUrl = meta(html, 'og:image') || meta(html, 'twitter:image')
      if (!imgUrl) { failed++; continue }

      const res = await fetch(imgUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) { failed++; continue }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 3_000) { failed++; continue }

      const wm = await detectWatermark(buf)
      const forced = useForce && FORCE_DOMAINS.some(d => r.src.includes(d))
      if (!wm.found && !forced) { skipped++; continue }

      hit++
      log(`  ${wm.corner} ${wm.score.toFixed(3)}${forced && !wm.found ? ' (強制)' : ''}  id=${r.id}`)
      if (dryRun) continue

      const branded = await brandCoverImage(buf, wm.corner)
      if (!branded) { failed++; continue }
      const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-gg.jpg`
      const url = await r2Upload(key, branded, 'image/jpeg')
      process.stdout.write(`UPDATE public.news SET image_url='${url}' WHERE id='${r.id}';\n`)
      updated++
    } catch { failed++ }
  }

  log(`\n處理 ${rows.length}｜需蓋 logo ${hit}｜已輸出更新 ${updated}｜無浮水印略過 ${skipped}｜失敗 ${failed}`)
  if (dryRun && hit > 0) log('加上 --apply 才會上傳並輸出 SQL')
}

main()
