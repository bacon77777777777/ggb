import { getSupabaseAdmin } from './supabaseAdmin'
import crypto from 'crypto'

const DRAWS_PER_BOT = 80
const DAYS_BACK     = 60
const BATCH_SIZE    = 500

function makeTxid(seed: string, nonce: number) {
  const hash = crypto.createHash('sha256').update(`${seed}:${nonce}`).digest('hex')
  const hmac = crypto.createHmac('sha256', seed)
  hmac.update(nonce.toString())
  const randomValue = parseInt(hmac.digest('hex').substring(0, 16), 16) / parseInt('ffffffffffffffff', 16)
  return { txid_hash: hash, random_value: randomValue }
}

export async function seedBotDraws(): Promise<{ ok: boolean; skipped?: boolean; inserted?: number; reason?: string }> {
  const supabase = getSupabaseAdmin()

  // 已有 bot 記錄 → 跳過
  const { data: botIds } = await supabase.from('users').select('id').eq('is_bot', true)
  if (!botIds?.length) return { ok: false, reason: '找不到機器人帳號' }

  const { count: existing } = await supabase
    .from('draw_records')
    .select('id', { count: 'exact', head: true })
    .in('user_id', botIds.map(b => b.id))

  if ((existing ?? 0) > 0) return { ok: true, skipped: true }

  // 需要有上架商品
  const { data: products } = await supabase
    .from('products')
    .select('id, seed, price, total_count')
    .eq('status', 'active')

  if (!products?.length) return { ok: false, reason: '沒有上架商品' }

  const { data: prizes } = await supabase
    .from('product_prizes')
    .select('id, product_id, level, name, image_url')
    .in('product_id', products.map(p => p.id))

  if (!prizes?.length) return { ok: false, reason: '找不到品項資料' }

  const prizesByProduct: Record<number, typeof prizes> = {}
  for (const prize of prizes) {
    if (!prizesByProduct[prize.product_id]) prizesByProduct[prize.product_id] = []
    prizesByProduct[prize.product_id].push(prize)
  }

  const now = Date.now()
  const records: object[] = []

  for (const bot of botIds) {
    for (let i = 0; i < DRAWS_PER_BOT; i++) {
      const product = products[Math.floor(Math.random() * products.length)]
      const productPrizes = prizesByProduct[product.id]
      if (!productPrizes?.length) continue

      const prize  = productPrizes[Math.floor(Math.random() * productPrizes.length)]
      const nonce  = Math.floor(Math.random() * (product.total_count || 80)) + 1
      const seed   = product.seed || crypto.randomBytes(16).toString('hex')
      const { txid_hash, random_value } = makeTxid(seed, nonce)

      records.push({
        user_id:          bot.id,
        product_id:       product.id,
        product_prize_id: prize.id,
        prize_level:      prize.level,
        prize_name:       prize.name,
        prize_image_url:  prize.image_url || null,
        txid_seed:        seed,
        txid_nonce:       nonce,
        txid_hash,
        random_value,
        ticket_number:    nonce,
        profit_rate:      1.0,
        status:           'in_warehouse',
        is_tradable:      false,
        is_last_one:      false,
        created_at:       new Date(now - Math.floor(Math.random() * DAYS_BACK * 86400_000)).toISOString(),
      })
    }
  }

  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const { error } = await supabase.from('draw_records').insert(records.slice(i, i + BATCH_SIZE))
    if (!error) inserted += Math.min(BATCH_SIZE, records.length - i)
  }

  return { ok: true, inserted }
}
