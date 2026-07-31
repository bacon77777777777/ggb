import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_themes')
    .select('*, suppliers(name), slot_machines(id, machine_number, is_active)')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ themes: data ?? [] })
}

// 建立主題 + 自動 generate N 台機器
export async function POST(request: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, machine_count = 1, bet_tiers = [], spin_returns, trigger_rate = 0.003,
    continue_rate = 0.80, min_rush_hits = 1, floor_spin_count = 302,
    supplier_id, event_slug, image_url, sort_order = 0 } = body

  if (!name) return NextResponse.json({ error: '請填入主題名稱' }, { status: 400 })
  if (!Array.isArray(bet_tiers) || bet_tiers.length === 0)
    return NextResponse.json({ error: '請設定至少一個投注檔次' }, { status: 400 })
  if (bet_tiers.length > 5)
    return NextResponse.json({ error: '投注檔次最多 5 個' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  const DEFAULT_SPIN_RETURNS = [
    { name: '強レア',    multiplier: 5,    weight: 50   },
    { name: 'チャンス目', multiplier: 3,    weight: 100  },
    { name: 'チェリー',  multiplier: 2,    weight: 200  },
    { name: 'ベル',      multiplier: 1.3,  weight: 500  },
    { name: 'ハズレ',    multiplier: 0.05, weight: 1150 },
  ]

  // 1. 建立主題
  const { data: theme, error: themeErr } = await supabase
    .from('slot_themes')
    .insert({
      name, machine_count, bet_tiers, trigger_rate, continue_rate,
      min_rush_hits, floor_spin_count,
      spin_returns: spin_returns ?? DEFAULT_SPIN_RETURNS,
      supplier_id: supplier_id ?? null,
      event_slug: event_slug ?? null,
      image_url: image_url ?? null,
      sort_order, is_active: false,
    })
    .select()
    .single()

  if (themeErr) return NextResponse.json({ error: themeErr.message }, { status: 500 })

  // 1.5 每個檔次建對應商品（商品名稱 = 主題名稱(檔次)，品項在商品管理維護）
  const tierList: { coins: number }[] = Array.isArray(bet_tiers) ? bet_tiers : []
  if (tierList.length > 0) {
    const { data: tierProducts } = await supabase
      .from('products')
      .insert(tierList.map(t => ({
        name: `${name}(${t.coins})`,
        type: 'slot',
        status: 'pending',
        is_active: false,
        price: 0,
        supplier_id: supplier_id ?? null,
        image_url: image_url ?? null,
        description: `挑戰機台 ${t.coins}G 檔獎池品項（由機台系統使用，請勿上架）`,
      })))
      .select('id')
    for (const p of tierProducts ?? []) {
      await supabase.from('products').update({ product_code: String(10000000 + p.id) }).eq('id', p.id)
    }
  }

  const sr: { name: string; multiplier: number; weight: number }[] =
    spin_returns ?? DEFAULT_SPIN_RETURNS

  // 2. 建立 N 台機器
  const machines = []
  for (let i = 1; i <= machine_count; i++) {
    const { data: machine, error: mErr } = await supabase
      .from('slot_machines')
      .insert({
        name,
        theme_id: theme.id,
        machine_number: i,
        bet_tiers,
        price_per_spin: bet_tiers[0]?.coins ?? 100,
        trigger_rate, continue_rate, min_rush_hits, floor_spin_count,
        spin_returns: sr,
        supplier_id: supplier_id ?? null,
        is_active: false,
        sort_order: i - 1,
        guaranteed_prize: false,
      })
      .select()
      .single()

    if (mErr) continue
    machines.push(machine)

    // 3. 每台機器建立 coin_return 普通旋轉品項
    const poolItems = sr.map(r => ({
      machine_id: machine.id,
      display_name: r.name,
      coin_return: true,
      return_multiplier: r.multiplier,
      weight: r.weight,
      normal_only: true,
      rush_only: false,
      is_floor: false,
    }))
    if (poolItems.length > 0) {
      await supabase.from('slot_pool_items').insert(poolItems)
    }
  }

  return NextResponse.json({ theme, machines })
}
