import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

type SeedBody = {
  offers?: number
  withOrder?: boolean
}

const pick = <T,>(arr: T[], idx: number) => arr[Math.max(0, Math.min(arr.length - 1, idx))]

type LimitlessListRow = { setId: string; number: string; image: string }

const titleCache = new Map<string, { ts: number; name: string }>()
const listCache = new Map<string, { ts: number; rows: LimitlessListRow[] }>()

const extractTitleName = (html: string) => {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || ''
  const cleaned = title.replace(/\s+–\s+Limitless\s*$/g, '').trim()
  const head = cleaned.split(' - ')[0]?.trim() || ''
  return head
}

const normalizeImageUrl = (raw: string) => {
  const url = String(raw || '').trim()
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `https://limitlesstcg.com${url}`
  return url
}

const makeValue = (id: string) => {
  const digits = '0123456789'
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const d1 = Number(digits[h % 10])
  const d2 = Number(digits[(h >>> 4) % 10])
  const d3 = Number(digits[(h >>> 8) % 10])
  const base = d1 * 1000 + d2 * 100 + d3 * 10
  return 200 + (base % 2800)
}

const fetchList = async (key: string, url: string, re: RegExp) => {
  const now = Date.now()
  const cached = listCache.get(key)
  if (cached && now - cached.ts < 10 * 60 * 1000) return cached.rows

  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'gachago-dev' },
  })
  if (!res.ok) return []
  const html = await res.text()
  const rows: LimitlessListRow[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const setId = String(m[1] || '').trim()
    const number = String(m[2] || '').trim()
    const image = String(m[3] || '').trim()
    if (!setId || !number || !image) continue
    rows.push({ setId, number, image })
    if (rows.length >= 5000) break
  }
  listCache.set(key, { ts: now, rows })
  return rows
}

const fetchCardName = async (setId: string, number: string) => {
  const key = `${setId}/${number}`
  const now = Date.now()
  const cached = titleCache.get(key)
  if (cached && now - cached.ts < 60 * 60 * 1000) return cached.name

  const fallback = `${setId} #${number}`
  try {
    const res = await fetch(`https://limitlesstcg.com/cards/jp/${setId}/${number}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1200),
      headers: { 'User-Agent': 'gachago-dev', Referer: `https://limitlesstcg.com/cards/jp/${setId}` },
    })
    if (!res.ok) {
      titleCache.set(key, { ts: now, name: fallback })
      return fallback
    }
    const html = await res.text()
    const name = extractTitleName(html) || fallback
    titleCache.set(key, { ts: now, name })
    return name
  } catch {
    titleCache.set(key, { ts: now, name: fallback })
    return fallback
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as SeedBody | null
    const offersCountRaw = typeof body?.offers === 'number' ? body?.offers : 6
    const offersCount = Math.max(1, Math.min(20, Math.floor(offersCountRaw)))
    const withOrder = body?.withOrder !== false

    const supabaseAdmin = getSupabaseAdmin()

    const { data: users, error: usersError } = await supabaseAdmin.from('users').select('id').limit(10)
    if (usersError) throw usersError
    const userIds = (users || []).map((u: any) => String(u.id || '')).filter(Boolean)
    if (userIds.length === 0) return NextResponse.json({ error: 'No users found to seed data' }, { status: 400 })

    const now = new Date()
    const demoOffers = Array.from({ length: offersCount }).map((_, i) => {
      const owner_id = pick(userIds, i % userIds.length)
      return {
        owner_id,
        status: 'active',
        note: `demo offer ${i + 1}`,
        created_at: new Date(now.getTime() - i * 60_000).toISOString(),
        updated_at: new Date(now.getTime() - i * 60_000).toISOString(),
      }
    })

    const { data: insertedOffers, error: insertOffersError } = await supabaseAdmin
      .from('exchange_offers')
      .insert(demoOffers)
      .select('id,owner_id')

    if (insertOffersError) throw insertOffersError

    const offersRows = Array.isArray(insertedOffers) ? insertedOffers : []

    const demoSets = ['M5', 'M4', 'M3', 'MC', 'MP1']
    const cardsPayload = (
      await Promise.all(
        offersRows.map(async (o: any, idx: number) => {
          const offer_id = String(o.id || '')
          if (!offer_id) return []

          let list: LimitlessListRow[] = []
          for (let i = 0; i < demoSets.length; i += 1) {
            const setId = pick(demoSets, (idx + i) % demoSets.length)
            const url = `https://limitlesstcg.com/cards/jp/${encodeURIComponent(setId)}`
            const key = `set:${setId}`
            const re = new RegExp(`<a href="\\/cards\\/jp\\/(${setId})\\/([^"]+)"><img[^>]*src="([^"]+)"`, 'g')
            const rows = await fetchList(key, url, re)
            if (rows.length > 0) {
              list = rows
              break
            }
          }

          if (list.length === 0) {
            const fallbackImages = ['/images/item/10017.jpg', '/images/item/10018.jpg', '/images/item/10019.jpg', '/images/item/10020.jpg']
            return [
              {
                offer_id,
                side: 'want',
                external_id: `demo_w_${idx * 10 + 1}`,
                name: `想要卡 ${idx * 10 + 1}`,
                series: 'JP',
                image_url: fallbackImages[0],
                value: 200,
                position: 0,
              },
              {
                offer_id,
                side: 'want',
                external_id: `demo_w_${idx * 10 + 2}`,
                name: `想要卡 ${idx * 10 + 2}`,
                series: 'JP',
                image_url: fallbackImages[1],
                value: 260,
                position: 1,
              },
              {
                offer_id,
                side: 'give',
                external_id: `demo_g_${idx * 10 + 3}`,
                name: `拿出卡 ${idx * 10 + 3}`,
                series: 'JP',
                image_url: fallbackImages[2],
                value: 320,
                position: 0,
              },
              {
                offer_id,
                side: 'give',
                external_id: `demo_g_${idx * 10 + 4}`,
                name: `拿出卡 ${idx * 10 + 4}`,
                series: 'JP',
                image_url: fallbackImages[3],
                value: 380,
                position: 1,
              },
            ]
          }

          const chosen = Array.from({ length: Math.min(4, list.length) }).map((_, k) => list[(idx * 37 + k * 11) % list.length]!)
          const enriched = await Promise.all(
            chosen.map(async (r) => {
              const setId = String(r.setId || '').trim()
              const number = String(r.number || '').trim()
              const image = normalizeImageUrl(r.image)
              const id = `jp:${setId}:${number}`
              const name = await fetchCardName(setId, number)
              return { id, name, series: setId, image, value: makeValue(id) }
            })
          )

          const [c1, c2, c3, c4] = enriched
          return [
            {
              offer_id,
              side: 'want',
              external_id: c1?.id || '',
              name: c1?.name || '',
              series: c1?.series || null,
              image_url: c1?.image || null,
              value: typeof c1?.value === 'number' ? c1.value : 0,
              position: 0,
            },
            {
              offer_id,
              side: 'want',
              external_id: c2?.id || '',
              name: c2?.name || '',
              series: c2?.series || null,
              image_url: c2?.image || null,
              value: typeof c2?.value === 'number' ? c2.value : 0,
              position: 1,
            },
            {
              offer_id,
              side: 'give',
              external_id: c3?.id || '',
              name: c3?.name || '',
              series: c3?.series || null,
              image_url: c3?.image || null,
              value: typeof c3?.value === 'number' ? c3.value : 0,
              position: 0,
            },
            {
              offer_id,
              side: 'give',
              external_id: c4?.id || '',
              name: c4?.name || '',
              series: c4?.series || null,
              image_url: c4?.image || null,
              value: typeof c4?.value === 'number' ? c4.value : 0,
              position: 1,
            },
          ]
        })
      )
    ).flat()

    if (cardsPayload.length > 0) {
      const { error: insertCardsError } = await supabaseAdmin.from('exchange_offer_cards').insert(cardsPayload)
      if (insertCardsError) throw insertCardsError
    }

    let seededOrderId: string | null = null
    if (withOrder && offersRows.length > 0 && userIds.length >= 2) {
      const firstOffer = offersRows[0] as any
      const offer_id = String(firstOffer.id || '')
      const owner_id = String(firstOffer.owner_id || '')
      const initiator_id = userIds.find((id) => id !== owner_id) || ''
      if (offer_id && owner_id && initiator_id) {
        const { data: order, error: insertOrderError } = await supabaseAdmin
          .from('exchange_orders')
          .insert({
            offer_id,
            owner_id,
            initiator_id,
            step: 2,
            done: false,
            confirmations: { owner: true, initiator: false },
          })
          .select('id')
          .maybeSingle()
        if (insertOrderError) throw insertOrderError
        seededOrderId = order?.id ? String(order.id) : null
      }
    }

    return NextResponse.json({
      success: true,
      offers: offersRows.map((o: any) => String(o.id || '')).filter(Boolean),
      order: seededOrderId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Seed failed' }, { status: 500 })
  }
}
