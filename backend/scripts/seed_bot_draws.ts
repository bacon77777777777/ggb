/**
 * seed_bot_draws.ts
 * 為機器人帳號補回假抽獎記錄（清全站資料後執行）
 *
 * 前提：必須先有上架中的商品才能執行
 * 用法：cd backend && npx tsx scripts/seed_bot_draws.ts
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import crypto from 'crypto'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DRAWS_PER_BOT = 80   // ~8,080 total for 101 bots
const DAYS_BACK     = 60   // spread over past 60 days
const BATCH_SIZE    = 500

function makeTxid(seed: string, nonce: number) {
  const str  = `${seed}:${nonce}`
  const hash = crypto.createHash('sha256').update(str).digest('hex')
  const hmac = crypto.createHmac('sha256', seed)
  hmac.update(nonce.toString())
  const hexVal = hmac.digest('hex').substring(0, 16)
  const randomValue = parseInt(hexVal, 16) / parseInt('ffffffffffffffff', 16)
  return { txid_hash: hash, random_value: randomValue }
}

async function main() {
  console.log('🤖 Bot draw seeder starting...')

  // 1. Get all bot users
  const { data: bots, error: botsErr } = await supabase
    .from('users')
    .select('id')
    .eq('is_bot', true)

  if (botsErr || !bots?.length) {
    console.error('找不到機器人帳號：', botsErr?.message)
    process.exit(1)
  }
  console.log(`找到 ${bots.length} 個機器人帳號`)

  // 2. Get all active products + prizes
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, seed, price, total_count')
    .eq('status', 'active')

  if (prodErr || !products?.length) {
    console.error('沒有上架商品，請先新增商品再執行此腳本')
    process.exit(1)
  }
  console.log(`找到 ${products.length} 個上架商品`)

  const { data: prizes, error: prizeErr } = await supabase
    .from('product_prizes')
    .select('id, product_id, level, name, image_url')
    .in('product_id', products.map(p => p.id))

  if (prizeErr || !prizes?.length) {
    console.error('找不到品項資料：', prizeErr?.message)
    process.exit(1)
  }

  // Group prizes by product_id for fast lookup
  const prizesByProduct: Record<number, typeof prizes> = {}
  for (const prize of prizes) {
    if (!prizesByProduct[prize.product_id]) prizesByProduct[prize.product_id] = []
    prizesByProduct[prize.product_id].push(prize)
  }

  const now = Date.now()
  const records: object[] = []

  for (const bot of bots) {
    for (let i = 0; i < DRAWS_PER_BOT; i++) {
      // Pick a random product
      const product = products[Math.floor(Math.random() * products.length)]
      const productPrizes = prizesByProduct[product.id]
      if (!productPrizes?.length) continue

      // Pick a random prize
      const prize = productPrizes[Math.floor(Math.random() * productPrizes.length)]

      // Random timestamp
      const msBack  = Math.floor(Math.random() * DAYS_BACK * 86400_000)
      const drawnAt = new Date(now - msBack).toISOString()

      // Generate txid
      const nonce = Math.floor(Math.random() * (product.total_count || 80)) + 1
      const seed  = product.seed || crypto.randomBytes(16).toString('hex')
      const { txid_hash, random_value } = makeTxid(seed, nonce)

      records.push({
        user_id:         bot.id,
        product_id:      product.id,
        product_prize_id: prize.id,
        prize_level:     prize.level,
        prize_name:      prize.name,
        prize_image_url: prize.image_url || null,
        txid_seed:       seed,
        txid_nonce:      nonce,
        txid_hash,
        random_value,
        ticket_number:   nonce,
        profit_rate:     1.0,
        status:          'in_warehouse',
        is_tradable:     false,
        is_last_one:     false,
        created_at:      drawnAt,
      })
    }
  }

  console.log(`準備寫入 ${records.length} 筆抽獎記錄...`)

  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('draw_records').insert(batch)
    if (error) {
      console.error(`第 ${Math.floor(i / BATCH_SIZE) + 1} 批失敗：`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\r進度：${inserted}/${records.length}`)
    }
  }

  console.log(`\n✅ 完成！共寫入 ${inserted} 筆，機器人 ${bots.length} 個`)
}

main().catch(e => { console.error(e); process.exit(1) })
