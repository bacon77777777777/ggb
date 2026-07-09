/**
 * 更新 [GBO海外限定色] MOBILE SUIT ENSEMBLE SP 第2彈（product id=33）
 * 從 us.gashapon.jp 下載主圖 + 5 張品項圖 → 上傳 R2 → 更新 DB
 */
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })
import sharp from 'sharp'
import { r2Upload } from '../lib/r2'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const PRODUCT_ID = 33

const BASE_URL = 'https://us.gashapon.jp/images/item/gundam/%E3%80%90overseas_gbo_exclusive%E3%80%91_mobile_suit_ensemble_sp_2nd'

// SP 號碼對應 img_item_xx 的對照（從包裝圖 lineup 讀出）
const PRIZES = [
  { sp: 'SP1', file: 'img_item_02.jpg', name: 'Unicorn Gundam [Destroy mode]（GBO色）' },
  { sp: 'SP2', file: 'img_item_01.jpg', name: 'Strike Gundam（GBO色）' },
  { sp: 'SP3', file: 'img_item_03.jpg', name: 'Gundam Barbatos [4th form]（GBO色）' },
  { sp: 'SP4', file: 'img_item_04.jpg', name: 'ν Gundam（GBO色）' },
  { sp: 'SP5', file: 'img_item_05.jpg', name: 'Wing Gundam（GBO色）' },
]

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://us.gashapon.jp/',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function uploadWebp(key: string, buf: Buffer): Promise<string> {
  const webp = await sharp(buf).resize(500, 500, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).webp({ quality: 90 }).toBuffer()
  return r2Upload(key, webp, 'image/webp')
}

async function main() {
  const supabase = getSupabaseAdmin()

  // 1. 主圖（display sheet）
  console.log('⬇  下載主圖...')
  const dpBuf = await fetchBuf(`${BASE_URL}/img_item_dp.png`)
  const dpWebp = await sharp(dpBuf).resize(800, 800, { fit: 'inside' }).webp({ quality: 90 }).toBuffer()
  const mainImageUrl = await r2Upload(`products/gundam_mse_sp2_main.webp`, dpWebp, 'image/webp')
  console.log('✅ 主圖:', mainImageUrl)

  // 2. 品項圖上傳
  const prizeUrls: string[] = []
  for (const p of PRIZES) {
    console.log(`⬇  下載 ${p.sp} ${p.name}...`)
    const buf = await fetchBuf(`${BASE_URL}/${p.file}`)
    const url = await uploadWebp(`products/gundam_mse_sp2_${p.sp.toLowerCase()}.webp`, buf)
    prizeUrls.push(url)
    console.log(`✅ ${p.sp}: ${url}`)
  }

  // 3. 更新 products.image_url
  const { error: prodErr } = await supabase
    .from('products')
    .update({ image_url: mainImageUrl })
    .eq('id', PRODUCT_ID)
  if (prodErr) throw new Error(`products update: ${prodErr.message}`)
  console.log('✅ 商品主圖已更新')

  // 4. 刪除舊空品項，插入新品項
  await supabase.from('product_prizes').delete().eq('product_id', PRODUCT_ID)

  const prizesToInsert = PRIZES.map((p, i) => ({
    product_id: PRODUCT_ID,
    name: p.name,
    level: p.sp,
    image_url: prizeUrls[i],
    total: 140,      // 700 庫存 / 5 款均分
    remaining: 140,
    probability: 0.2,
  }))

  const { error: prizeErr } = await supabase.from('product_prizes').insert(prizesToInsert)
  if (prizeErr) throw new Error(`prizes insert: ${prizeErr.message}`)
  console.log(`✅ ${prizesToInsert.length} 個品項已寫入`)

  console.log('\n🎉 完成！product_id=33 主圖 + 5 個品項全部更新')
}

main().catch(e => { console.error(e); process.exit(1) })
