/**
 * Dengeki 浮水印處理：右上角壓 GGB logo（白色圓角墊底）蓋住站方浮水印，保留原圖。
 *
 * 用法：
 *   單張測試：npx tsx scripts/brand_dengeki_images.ts sample <輸入圖> <輸出圖>
 *   批次回填：npx tsx scripts/brand_dengeki_images.ts backfill <articles.tsv> <update.sql>
 *     articles.tsv 格式：id<TAB>source_url（由 psql 匯出）
 *     產出 update.sql 由 psql 套用（本機無 PROD service key，DB 更新走 psql）
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import { r2Upload } from '../lib/r2'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
const LOGO_PATH = new URL('../../frontend/public/images/logo.png', import.meta.url).pathname
const DEFAULT_IMG = 'https://www.ggb.com.tw/images/banner_defaulet.png'

async function brandCover(buf: Buffer): Promise<Buffer> {
  const logo = readFileSync(LOGO_PATH)
  const meta = await sharp(buf).metadata()
  const W = meta.width!, H = meta.height!
  if (!W || !H) throw new Error('bad image')
  const logoW = Math.round(W * 0.21)
  const logoH = Math.round((logoW * 107) / 300)
  const pad = Math.round(logoW * 0.05)
  const plateW = logoW + pad * 2
  const plateH = logoH + pad * 2
  const m = Math.max(4, Math.round(W * 0.008))
  const plate = Buffer.from(
    `<svg width="${plateW}" height="${plateH}"><path d="M0 0 H${plateW} V${plateH} H${Math.round(plateH / 4)} A${Math.round(plateH / 4)} ${Math.round(plateH / 4)} 0 0 1 0 ${plateH - Math.round(plateH / 4)} V0 Z" fill="white" fill-opacity="0.97"/></svg>`
  )
  const logoResized = await sharp(logo).resize(logoW, logoH).png().toBuffer()
  return sharp(buf)
    .composite([
      { input: plate, top: 0, left: W - plateW },
      { input: logoResized, top: pad, left: W - plateW + pad },
    ])
    .jpeg({ quality: 88 })
    .toBuffer()
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000), redirect: 'follow' })
  if (!res.ok) throw new Error(`http ${res.status}`)
  return res.text()
}

function extractOgImage(html: string): string {
  return (
    html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']{1,500})["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']{1,500})["'][^>]*property=["']og:image["']/i)?.[1] ??
    ''
  ).trim()
}

async function main() {
  const [mode, a, b] = process.argv.slice(2)

  if (mode === 'sample') {
    const out = await brandCover(readFileSync(a))
    writeFileSync(b, out)
    console.log('sample written:', b)
    return
  }

  if (mode === 'backfill') {
    const rows = readFileSync(a, 'utf8').trim().split('\n').map(l => l.split('\t'))
    writeFileSync(b, '-- Dengeki 圖片壓 logo 回填\n')
    let ok = 0, fail = 0
    for (const [id, sourceUrl] of rows) {
      try {
        const html = await fetchText(sourceUrl)
        const og = extractOgImage(html)
        if (!og) throw new Error('no og:image')
        const res = await fetch(og, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000), redirect: 'follow' })
        if (!res.ok) throw new Error(`img http ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 3_000) throw new Error('too small')
        const branded = await brandCover(buf)
        const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-gg.jpg`
        const url = await r2Upload(key, branded, 'image/jpeg')
        appendFileSync(b, `UPDATE news SET image_url='${url}' WHERE id='${id}';\n`)
        ok++
        if (ok % 25 === 0) console.log(ok, 'done')
      } catch (e: any) {
        fail++
        appendFileSync(b, `-- FAIL ${id}: ${String(e?.message ?? e).replace(/\n/g, ' ')}\n`)
      }
      await new Promise(r => setTimeout(r, 150))
    }
    console.log('backfill done. ok:', ok, 'fail:', fail, '(失敗者維持預設圖)')
    return
  }

  console.log('usage: sample <in> <out> | backfill <tsv> <sql>')
}

main().catch(e => { console.error(e); process.exit(1) })
