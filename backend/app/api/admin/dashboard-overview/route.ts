import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { effectiveFeeRate, marginPct, platformMargin } from '@/lib/settlementRates'

/**
 * 營運儀表板資料層
 *
 * 五層畫面（KPI → 趨勢與健康度 → 玩家與玩法 → 賞池與商品 → 警報）只打這一支，
 * 不要讓前端各區塊各打各的 —— 那些區塊算的都是同一批抽獎與儲值紀錄，
 * 拆開打會把同一份資料撈五遍，而且各區塊的期間邊界很容易慢慢走鐘。
 *
 * ── 三個原則 ──
 * 1. **一律 `fetchAllRows`**：PostgREST 預設只回 1000 列而且靜默截斷，
 *    這裡每個數字都是撈回來自己 reduce 的（同樣的洞在分析頁、廠商結算都修過）。
 * 2. **一律排除機器人**：`is_bot = true` 的帳號有真的 draw_records，
 *    不濾掉營收與活躍數會整片灌水。
 * 3. **樣本不足就說「資料不足」，不給分級也不發警報**。
 *    2026-08-12 實測 PROD 只有 5 個真實玩家、482 筆抽獎 —— 在這個量體上算
 *    「近 7 日下降 38%」「D7 留存」都是雜訊，天天亂叫比沒有還糟。
 *    門檻見 `MIN_SAMPLE_DRAWS`。**不塞 mock data**，寧可畫面上寫資料不足。
 */

const TW = 8 * 3600_000

/** 低於這個抽獎數就不做分級、不發趨勢類警報（庫存類警報是事實，不受此限） */
const MIN_SAMPLE_DRAWS = 30

const CAT: Record<string, string> = {
  gacha: '轉蛋', ichiban: '一番賞', blindbox: '盒玩', card: '抽卡', custom: '自製賞',
  slot: '機台',
  // 商品被刪掉之後 draw_records 還留著，join 不到就落到這裡。
  // 給它一個看得懂的名字，不要在畫面上出現「other」這種內部代號。
  other: '已刪除商品',
}

/**
 * 「類別分析」固定列出的六類，順序也照這個排（老闆指定）。
 *
 * 沒有消費的類別一樣要出現、顯示 0 —— 跟走勢圖「空的區間也要畫」同一個道理：
 * 整列消失的話看起來像那一類不存在，而不是那一類沒人買。
 *
 * 「已刪除商品」不在名單裡：那是抽獎紀錄指到已刪商品的殘留，不是一種類別。
 */
const CATEGORY_ORDER = ['ichiban', 'blindbox', 'gacha', 'card', 'custom', 'slot'] as const

function twDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d) - TW)
}

function pct(cur: number, prev: number) {
  if (!prev) return cur > 0 ? 100 : 0
  return Math.round((cur - prev) / prev * 1000) / 10
}

function ratio(a: number, b: number) {
  return b > 0 ? Math.round(a / b * 1000) / 10 : 0
}

export type HealthStatus = 'grow' | 'ok' | 'warn' | 'bad' | 'unknown' | 'nobase'
export type AlertLevel = 'red' | 'yellow' | 'blue' | 'green'

export async function GET(req: NextRequest) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // 這頁是全平台量體（總營收、全站玩家、所有廠商的賞池），廠商角色一律不給。
  // 廠商要看自己的數字有「廠商儀表板」。
  if (scope.isSupplier) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const now = new Date(Date.now() + TW)
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate()
  const startStr = sp.get('start') || `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const endStr = sp.get('end') || startStr

  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const curStart = twDate(sy, sm - 1, sd)
  const curEnd = twDate(ey, em - 1, ed + 1)          // 含當日 → 轉成不含右界
  const dur = curEnd.getTime() - curStart.getTime()
  const prevStart = new Date(curStart.getTime() - dur)

  // 分桶模式與分析頁／廠商儀表板一字不差，同一個區間才會畫出同樣的刻度
  const days = dur / 86400000
  const isHourly = days <= 1
  const isShortRange = !isHourly && days <= 7
  const isMonthly = days > 90
  const isWeekly = !isHourly && !isShortRange && !isMonthly

  const ts = twDate(y, mo, d), te = twDate(y, mo, d + 1)      // 今日
  const ys = twDate(y, mo, d - 1), ye = ts                     // 昨日
  const d30 = twDate(y, mo, d - 30)                            // 滯銷判斷用
  const d7 = twDate(y, mo, d - 7), d14 = twDate(y, mo, d - 14) // 玩法熱度警報用

  const db = getSupabaseAdmin()
  const { data: bots } = await db.from('users').select('id').eq('is_bot', true)
  const botIds = (bots ?? []).map((r: any) => r.id as string)
  const noBot = (q: any) => botIds.length ? q.not('user_id', 'in', `(${botIds.join(',')})`) : q
  const inR = (q: any, a: Date, b: Date) => q.gte('created_at', a.toISOString()).lt('created_at', b.toISOString())

  try {
    const drawSel = 'created_at, user_id, product_id, tokens_spent, product:products(name, type, price)'
    const drawQ = () => noBot(db.from('draw_records').select(drawSel))
    const rechSel = 'created_at, user_id, amount, payment_fee'
    const rechQ = () => noBot(db.from('recharge_records').select(rechSel).eq('status', 'success'))
    const evSel = 'created_at, event_type, user_id, session_id, product_id'
    const evQ = () => db.from('user_events').select(evSel)

    const [
      draws, prevDraws, todayDraws, yestDraws, draws30,
      rech, prevRech, todayRech, yestRech,
      events, prevEvents,
      users, products, prizes, refunds, prevRefunds,
    ] = await Promise.all([
      fetchAllRows<any>(() => inR(drawQ(), curStart, curEnd)),
      fetchAllRows<any>(() => inR(drawQ(), prevStart, curStart)),
      fetchAllRows<any>(() => inR(drawQ(), ts, te)),
      fetchAllRows<any>(() => inR(drawQ(), ys, ye)),
      fetchAllRows<any>(() => inR(drawQ(), d30, te)),
      fetchAllRows<any>(() => inR(rechQ(), curStart, curEnd)),
      fetchAllRows<any>(() => inR(rechQ(), prevStart, curStart)),
      fetchAllRows<any>(() => inR(rechQ(), ts, te)),
      fetchAllRows<any>(() => inR(rechQ(), ys, ye)),
      fetchAllRows<any>(() => inR(evQ(), curStart, curEnd)),
      fetchAllRows<any>(() => inR(evQ(), prevStart, curStart)),
      fetchAllRows<any>(() => db.from('users').select('id, created_at').or('is_bot.eq.false,is_bot.is.null')),
      fetchAllRows<any>(() => db.from('products').select('id, name, type, status, created_at')),
      fetchAllRows<any>(() => db.from('product_prizes').select('product_id, total, remaining')),
      fetchAllRows<any>(() => inR(db.from('refund_requests').select('created_at, amount_twd, status, processed_at'), curStart, curEnd)),
      fetchAllRows<any>(() => inR(db.from('refund_requests').select('created_at, amount_twd, status, processed_at'), prevStart, curStart)),
    ])

    /*
     * 一筆抽獎值多少：優先用 `tokens_spent`（實際扣掉的 G），
     * 沒有才退回商品定價。實測 PROD 482 筆裡 457 筆有 tokens_spent，
     * 早期資料沒寫這個欄位，退回定價比算成 0 接近事實。
     */
    const amt = (r: any) => (r.tokens_spent ?? r.product?.price ?? 0) as number
    const sum = (rows: any[]) => rows.reduce((s, r) => s + amt(r), 0)
    const sumAmount = (rows: any[]) => rows.reduce((s, r) => s + (r.amount ?? 0), 0)

    // ── 錢 ────────────────────────────────────────────────────────────────
    const rechargeTotal = sumAmount(rech)
    const prevRechargeTotal = sumAmount(prevRech)
    const feeRows = rech.filter(r => r.payment_fee != null)
    const feeTotal = feeRows.reduce((s, r) => s + (r.payment_fee ?? 0), 0)
    const hasActualFee = feeRows.length > 0
    const feeRate = effectiveFeeRate(rechargeTotal, feeTotal, hasActualFee)

    /*
     * 總營收＝儲值金額 − 綠界手續費。
     *
     * 平台的現金是在「玩家儲值」那一刻進來的，抽獎只是把已經收到的 G 換成商品。
     * 所以營收看儲值、消費看抽獎，兩者不是同一筆錢也不該相加。
     */
    const revenue = Math.round(rechargeTotal - (hasActualFee ? feeTotal : rechargeTotal * feeRate))
    const prevFeeRows = prevRech.filter(r => r.payment_fee != null)
    const prevFeeTotal = prevFeeRows.reduce((s, r) => s + (r.payment_fee ?? 0), 0)
    const prevRevenue = Math.round(prevRechargeTotal - (prevFeeRows.length ? prevFeeTotal : prevRechargeTotal * feeRate))

    const spend = sum(draws), prevSpend = sum(prevDraws)
    const drawCount = draws.length, prevDrawCount = prevDraws.length

    // ── 人 ────────────────────────────────────────────────────────────────
    /** 訪客識別：登入前沒有 user_id，只能靠 session_id（實測 7,475 筆事件有 3,093 筆是未登入） */
    const visitorKey = (r: any) => String(r.user_id ?? r.session_id ?? '')
    const distinct = (rows: any[], key: (r: any) => string) =>
      new Set(rows.map(key).filter(Boolean))

    const drawUsers = distinct(draws, r => String(r.user_id ?? ''))
    const prevDrawUsers = distinct(prevDraws, r => String(r.user_id ?? ''))
    const rechUsers = distinct(rech, r => String(r.user_id ?? ''))
    const eventUsers = distinct(events.filter(e => e.user_id), r => String(r.user_id))

    /** 活躍＝期間內有任何行為（瀏覽／抽獎／儲值）的登入會員 */
    const activeSet = new Set<string>([...eventUsers, ...drawUsers, ...rechUsers])
    const prevActiveSet = new Set<string>([
      ...distinct(prevEvents.filter(e => e.user_id), r => String(r.user_id)),
      ...prevDrawUsers,
      ...distinct(prevRech, r => String(r.user_id ?? '')),
    ])

    const activeUsers = activeSet.size
    const payingUsers = drawUsers.size                    // 「付費用戶」＝期間內真的花 G 抽過
    const payRate = ratio(payingUsers, activeUsers)
    const arppu = payingUsers > 0 ? Math.round(spend / payingUsers) : 0

    const prevPayingUsers = prevDrawUsers.size
    const prevPayRate = ratio(prevPayingUsers, prevActiveSet.size)
    const prevArppu = prevPayingUsers > 0 ? Math.round(prevSpend / prevPayingUsers) : 0

    const inPeriod = (iso: string) => {
      const t = new Date(iso).getTime()
      return t >= curStart.getTime() && t < curEnd.getTime()
    }
    const newUsers = users.filter(u => u.created_at && inPeriod(u.created_at)).length
    /*
     * 回流＝這期間有動作、註冊日在期間之前、而且**上一個等長期間完全沒動作**。
     * 沒有「沉睡幾天才算回流」的設定檔，用「上一期沒來、這期來了」是這裡算得出來
     * 又講得清楚的定義；期間越長越嚴格，符合直覺。
     */
    const oldUserIds = new Set(users.filter(u => u.created_at && !inPeriod(u.created_at)).map(u => String(u.id)))
    const returning = [...activeSet].filter(id => oldUserIds.has(id) && !prevActiveSet.has(id)).length

    const todayActive = new Set<string>([
      ...distinct(events.filter(e => e.user_id && new Date(e.created_at) >= ts), r => String(r.user_id)),
      ...distinct(todayDraws, r => String(r.user_id ?? '')),
      ...distinct(todayRech, r => String(r.user_id ?? '')),
    ]).size

    // ── 漏斗 ──────────────────────────────────────────────────────────────
    const visitors = distinct(events, visitorKey).size
    /*
     * 轉換率算不出來時回 `null`，畫面顯示「—」，不要硬給一個數字。
     *
     * 這四段的來源不一樣（訪問來自前台埋點、註冊來自 users、抽獎與付費來自交易），
     * 埋點漏收的時候後面那段會比前面那段大 —— 實測 STG 就出現「訪問 1 人、註冊 2 人」
     * 算出 200% 的轉換率。與其給一個大於 100% 的假數字，不如標成算不出來。
     * （STG 的 user_events 是 2026-08-12 才修好，之前整批事件被 CHECK 擋掉，見 migration 534。）
     */
    const stepRate = (users: number, base: number) =>
      base > 0 && users <= base ? ratio(users, base) : null
    const funnel = [
      { key: 'visit', label: '訪問', users: visitors, rate: 100 as number | null },
      { key: 'signup', label: '註冊', users: newUsers, rate: stepRate(newUsers, visitors) },
      { key: 'draw', label: '開始抽獎', users: drawUsers.size, rate: stepRate(drawUsers.size, newUsers) },
      { key: 'pay', label: '付費', users: rechUsers.size, rate: stepRate(rechUsers.size, drawUsers.size) },
    ]

    // ── 趨勢分桶（零值也要排出來）──────────────────────────────────────────
    const dtKey = (createdAt: string) => {
      const dt = new Date(new Date(createdAt).getTime() + TW)
      if (isHourly) return `${dt.toISOString().split('T')[0]} ${String(dt.getUTCHours()).padStart(2, '0')}`
      if (isMonthly) return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
      if (isWeekly) {
        const day = dt.getUTCDay()
        return new Date(dt.getTime() - (day === 0 ? 6 : day - 1) * 86400_000).toISOString().split('T')[0]
      }
      return dt.toISOString().split('T')[0]
    }

    type Bucket = { recharge: number; spend: number; refund: number }
    const bmap: Record<string, Bucket> = {}
    const touch = (k: string) => (bmap[k] ||= { recharge: 0, spend: 0, refund: 0 })
    rech.forEach(r => { touch(dtKey(r.created_at)).recharge += r.amount ?? 0 })
    draws.forEach(r => { touch(dtKey(r.created_at)).spend += amt(r) })
    refunds.filter(r => r.processed_at).forEach(r => { touch(dtKey(r.created_at)).refund += r.amount_twd ?? 0 })

    const keys: { key: string; label: string }[] = []
    if (isHourly) {
      for (let h = 0; h <= 23; h++) keys.push({ key: `${startStr} ${String(h).padStart(2, '0')}`, label: String(h) })
    } else if (isMonthly) {
      const cur = new Date(curStart)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
        const label = `${dt.getUTCMonth() + 1}月`
        if (!keys.find(k => k.label === label)) keys.push({ key, label })
        cur.setDate(cur.getDate() + 28)
      }
    } else if (isWeekly) {
      const sDay = new Date(curStart.getTime() + TW).getUTCDay()
      const cur = new Date(curStart.getTime() - (sDay === 0 ? 6 : sDay - 1) * 86400_000)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        keys.push({ key: dt.toISOString().split('T')[0], label: `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}` })
        cur.setUTCDate(cur.getUTCDate() + 7)
      }
    } else {
      const cur = new Date(curStart)
      while (cur < curEnd) {
        const dt = new Date(cur.getTime() + TW)
        keys.push({ key: dt.toISOString().split('T')[0], label: `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}` })
        cur.setDate(cur.getDate() + 1)
      }
    }

    const trend = keys.map(({ key, label }) => {
      const b = bmap[key] ?? { recharge: 0, spend: 0, refund: 0 }
      return {
        label,
        recharge: b.recharge,
        spend: b.spend,
        refund: b.refund,
        // 每一格的營收同樣扣掉手續費，才跟上面 KPI 的總營收對得起來
        revenue: Math.round(b.recharge * (1 - feeRate)),
      }
    })
    const spark = (isHourly ? trend : trend.slice(-14)).map((t, i) => ({
      x: i, date: t.label, revenue: t.revenue, recharge: t.recharge, spend: t.spend, draws: 0,
    }))
    // sparkline 的抽獎次數要另外數（trend 只帶金額）
    {
      const cmap: Record<string, number> = {}
      draws.forEach(r => { cmap[dtKey(r.created_at)] = (cmap[dtKey(r.created_at)] ?? 0) + 1 })
      const counts = keys.map(k => cmap[k.key] ?? 0)
      const tail = isHourly ? counts : counts.slice(-14)
      tail.forEach((v, i) => { if (spark[i]) spark[i].draws = v })
    }

    // ── 玩法分析 ──────────────────────────────────────────────────────────
    const byType: Record<string, { draws: number; spend: number; players: Set<string> }> = {}
    draws.forEach(r => {
      const t = r.product?.type ?? 'other'
      const g = (byType[t] ||= { draws: 0, spend: 0, players: new Set() })
      g.draws++
      g.spend += amt(r)
      if (r.user_id) g.players.add(String(r.user_id))
    })
    const playTypes = CATEGORY_ORDER.map(type => {
      const v = byType[type]
      return {
        type,
        label: CAT[type] ?? type,
        draws: v?.draws ?? 0,
        spend: v?.spend ?? 0,
        players: v?.players.size ?? 0,
        sharePct: ratio(v?.spend ?? 0, spend),
        marginPct: marginPct(v?.spend ?? 0, feeRate),
      }
    })

    // ── 熱門賞池 ──────────────────────────────────────────────────────────
    /** 每件商品的備貨與剩餘（`product_prizes` 加總，最後賞也算在庫存裡） */
    const stock: Record<string, { total: number; remaining: number }> = {}
    prizes.forEach(p => {
      const k = String(p.product_id)
      const s = (stock[k] ||= { total: 0, remaining: 0 })
      s.total += p.total ?? 0
      s.remaining += p.remaining ?? 0
    })

    const byProduct: Record<string, { draws: number; spend: number; players: Set<string> }> = {}
    draws.forEach(r => {
      const k = String(r.product_id)
      const g = (byProduct[k] ||= { draws: 0, spend: 0, players: new Set() })
      g.draws++
      g.spend += amt(r)
      if (r.user_id) g.players.add(String(r.user_id))
    })
    const prevByProduct: Record<string, number> = {}
    prevDraws.forEach(r => { prevByProduct[String(r.product_id)] = (prevByProduct[String(r.product_id)] ?? 0) + amt(r) })

    const productById = new Map(products.map(p => [String(p.id), p]))
    const remainPctOf = (id: string) => {
      const s = stock[id]
      return s && s.total > 0 ? Math.round(s.remaining / s.total * 1000) / 10 : null
    }

    const pools = Object.entries(byProduct)
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 10)
      .map(([id, v]) => {
        const p = productById.get(id)
        const remainPct = remainPctOf(id)
        /*
         * 上一期這件商品完全沒有消費時，同比給 `null`（畫面顯示「—」）而不是 100%。
         * `pct()` 的慣例是「前期 0、本期有」就回 100 —— 對 KPI 卡沒差，
         * 但在這裡會讓每一件新上架的商品都變成「成長 100% ＝ 熱門」，
         * 警報區直接被七則假的綠色機會洗版（實測本年區間就是這樣）。
         */
        const prevSpend = prevByProduct[id] ?? 0
        const growth = prevSpend > 0 ? pct(v.spend, prevSpend) : null
        /*
         * 狀態只認事實：庫存看得出來就給庫存狀態，人氣類（熱門／低人氣）
         * 要有足夠樣本才敢說 —— 5 個玩家的「低人氣」沒有意義。
         */
        let status: 'hot' | 'normal' | 'nearly' | 'cold' | 'unknown' = 'normal'
        if (remainPct != null && remainPct <= 10) status = 'nearly'
        else if (v.draws < MIN_SAMPLE_DRAWS || growth == null) status = 'unknown'
        else if (growth >= 40) status = 'hot'
        else if (growth <= -30) status = 'cold'
        return {
          id,
          name: p?.name ?? `#${id}`,
          type: p?.type ?? '',
          label: CAT[p?.type ?? ''] ?? (p?.type ?? ''),
          draws: v.draws,
          spend: v.spend,
          players: v.players.size,
          remainPct,
          marginPct: marginPct(v.spend, feeRate),
          growth,
          status,
        }
      })

    // ── 商品健康度 ────────────────────────────────────────────────────────
    const drawnIn30 = new Set(draws30.map(r => String(r.product_id)))
    let soldOut = 0, nearlySoldOut = 0, normal = 0, stale = 0
    const attention: { id: string; name: string; reason: string }[] = []
    for (const p of products) {
      const id = String(p.id)
      const rp = remainPctOf(id)
      const listedDays = p.created_at ? (Date.now() - new Date(p.created_at).getTime()) / 86400000 : 0
      if (rp != null && rp <= 0) {
        soldOut++
      } else if (rp != null && rp <= 10) {
        nearlySoldOut++
        attention.push({ id, name: p.name, reason: `剩餘 ${rp}%` })
      } else {
        normal++
      }
      // 滯銷：上架滿 30 天、近 30 天一抽都沒有，而且不是已經賣完的
      if (listedDays >= 30 && !drawnIn30.has(id) && (rp == null || rp > 0)) {
        stale++
        if (attention.length < 20) attention.push({ id, name: p.name, reason: '近 30 天無人抽' })
      }
    }

    // ── 平台健康度（六燈，不給總分）────────────────────────────────────────
    const refundTotal = refunds.filter(r => r.processed_at).reduce((s, r) => s + (r.amount_twd ?? 0), 0)
    const prevRefundTotal = prevRefunds.filter(r => r.processed_at).reduce((s, r) => s + (r.amount_twd ?? 0), 0)
    const refundRate = ratio(refundTotal, rechargeTotal)
    const prevRefundRate = ratio(prevRefundTotal, prevRechargeTotal)
    const margin = marginPct(spend, feeRate)
    const prevMargin = marginPct(prevSpend, feeRate)

    const enough = drawCount >= MIN_SAMPLE_DRAWS
    /**
     * 一般成長型指標：漲得多是成長、跌得多是注意／異常。
     *
     * `prev <= 0` 也算資料不足 —— 上一期根本沒有東西可比，
     * 卻亮一盞「成長 100%」的燈是誤導（平台剛開張時每一盞都會這樣亮）。
     */
    const byDelta = (delta: number, prev: number): HealthStatus =>
      !enough ? 'unknown'
        // 分成兩種說法：抽數太少是「資料不足」，上一期是空的是「無前期可比」。
        // 混成同一句話會讓人以為現在的資料有問題，其實是沒有比較基準。
        : prev <= 0 ? 'nobase'
          : delta >= 10 ? 'grow' : delta <= -30 ? 'bad' : delta <= -10 ? 'warn' : 'ok'

    const health: { key: string; label: string; value: string; delta: number; status: HealthStatus; showDelta?: boolean }[] = [
      { key: 'revenue', label: '營收', value: `${revenue.toLocaleString()} G幣`, delta: pct(revenue, prevRevenue), status: byDelta(pct(revenue, prevRevenue), prevRevenue) },
      { key: 'active', label: '活躍玩家', value: `${activeUsers.toLocaleString()} 人`, delta: pct(activeUsers, prevActiveSet.size), status: byDelta(pct(activeUsers, prevActiveSet.size), prevActiveSet.size) },
      { key: 'paying', label: '付費用戶', value: `${payingUsers.toLocaleString()} 人`, delta: pct(payingUsers, prevPayingUsers), status: byDelta(pct(payingUsers, prevPayingUsers), prevPayingUsers) },
      { key: 'payRate', label: '付費率', value: `${payRate}%`, delta: pct(payRate, prevPayRate), status: byDelta(pct(payRate, prevPayRate), prevPayRate) },
      {
        key: 'refund', label: '退款率', value: `${refundRate}%`, delta: pct(refundRate, prevRefundRate),
        // 退款率是「越低越好」，不能套成長型判斷
        status: (rechargeTotal <= 0 ? 'unknown' : refundRate > 5 ? 'bad' : refundRate > 2 ? 'warn' : 'ok') as HealthStatus,
      },
      {
        /*
         * 毛利率沒有逐品成本可算，是由「廠商分潤比」與金流費率決定的固定比例
         * （見 lib/settlementRates）—— 它不會自己漲跌，所以**不顯示同比**，
         * 門檻也不能用「跌 10% 算注意」那套，改成看這個比例本身合不合理：
         * 分潤比設到 80% 以上時平台只剩兩成，那才是該亮燈的時候。
         */
        key: 'margin', label: '毛利率', value: `${margin}%`, delta: 0, showDelta: false,
        status: (spend <= 0 ? 'unknown' : margin < 10 ? 'bad' : margin < 20 ? 'warn' : 'ok') as HealthStatus,
      },
    ]

    // ── 營運警報 ──────────────────────────────────────────────────────────
    const alerts: { level: AlertLevel; title: string; detail: string; action: string; href?: string }[] = []

    // 庫存類是事實，不受樣本門檻限制
    for (const p of pools) {
      if (p.remainPct != null && p.remainPct <= 10) {
        alerts.push({
          level: p.remainPct <= 5 ? 'red' : 'yellow',
          title: `${p.name} 只剩 ${p.remainPct}%`,
          detail: `這段期間被抽了 ${p.draws.toLocaleString()} 次，照這個速度很快就會賣完。`,
          action: '準備下一批庫存，或先安排接檔商品。',
          href: `/products/${p.id}`,
        })
      }
    }
    if (stale > 0) {
      alerts.push({
        level: 'yellow',
        title: `有 ${stale} 件商品近 30 天沒人抽`,
        detail: '上架滿一個月、期間一次都沒被抽過，會一直佔著版位。',
        action: '考慮換版位、調整售價，或下架讓給新品。',
        href: '/products',
      })
    }

    if (enough) {
      // 玩法熱度：近 7 日 vs 前 7 日（跟上方選的期間無關，看的是「最近正在發生什麼」）
      const cnt7: Record<string, number> = {}, cnt14: Record<string, number> = {}
      for (const r of draws30) {
        const t = new Date(r.created_at).getTime()
        const k = r.product?.type ?? 'other'
        if (t >= d7.getTime()) cnt7[k] = (cnt7[k] ?? 0) + 1
        else if (t >= d14.getTime()) cnt14[k] = (cnt14[k] ?? 0) + 1
      }
      for (const [k, prev] of Object.entries(cnt14)) {
        if (prev < MIN_SAMPLE_DRAWS) continue
        const drop = pct(cnt7[k] ?? 0, prev)
        if (drop <= -30) {
          alerts.push({
            level: 'yellow',
            title: `${CAT[k] ?? k} 近 7 日抽獎下降 ${Math.abs(drop)}%`,
            detail: `前 7 日 ${prev.toLocaleString()} 抽，近 7 日 ${(cnt7[k] ?? 0).toLocaleString()} 抽。`,
            action: '檢查這類商品的獎品內容與首頁曝光。',
            href: '/products',
          })
        }
      }
      for (const p of pools) {
        if (p.draws >= MIN_SAMPLE_DRAWS && p.growth != null && p.growth >= 40) {
          alerts.push({
            level: 'green',
            title: `${p.name} 這期營收成長 ${p.growth}%`,
            detail: `這段期間 ${p.draws.toLocaleString()} 抽、${p.players.toLocaleString()} 位玩家參與。`,
            action: '值得加大首頁曝光或排進活動。',
            href: `/products/${p.id}`,
          })
        }
      }
      if (refundRate > 5) {
        alerts.push({
          level: 'red',
          title: `退款率 ${refundRate}%`,
          detail: `這段期間退了 ${refundTotal.toLocaleString()} 元。`,
          action: '查退款申請的原因，確認是不是同一個問題重複發生。',
          href: '/refund-requests',
        })
      }
      if (margin < 20) {
        alerts.push({
          level: 'red',
          title: `毛利率只有 ${margin}%`,
          detail: '扣掉金流手續費與廠商分潤之後，平台留下的比例偏低。',
          action: '檢查廠商分潤比與低毛利商品的佔比。',
          href: '/reports/settlement',
        })
      }
    } else {
      alerts.push({
        level: 'blue',
        title: '資料量還不夠，趨勢類警報暫時停用',
        detail: `這段期間只有 ${drawCount.toLocaleString()} 筆抽獎（門檻 ${MIN_SAMPLE_DRAWS} 筆）。樣本太小算出來的漲跌都是雜訊。`,
        action: '庫存類警報不受影響，仍會照常提醒。',
      })
    }

    const order: Record<AlertLevel, number> = { red: 0, yellow: 1, green: 2, blue: 3 }
    alerts.sort((a, b) => order[a.level] - order[b.level])
    // 一次最多八則。再多就不是「今天該做什麼」而是另一份報表了，
    // 紅黃在前所以砍掉的一定是優先度最低的那幾則。
    const shownAlerts = alerts.slice(0, 8)

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      sampleEnough: enough,
      minSample: MIN_SAMPLE_DRAWS,
      hasActualFee,
      feeRatePct: Math.round(feeRate * 10000) / 100,
      kpi: {
        revenue, recharge: rechargeTotal, spend, draws: drawCount,
        activeUsers, payingUsers, payRate, arppu,
        todayRevenue: Math.round(sumAmount(todayRech) * (1 - feeRate)),
        todayRecharge: sumAmount(todayRech),
        todaySpend: sum(todayDraws),
        todayDraws: todayDraws.length,
        todayActive,
      },
      growth: {
        revenue: pct(revenue, prevRevenue),
        recharge: pct(rechargeTotal, prevRechargeTotal),
        spend: pct(spend, prevSpend),
        draws: pct(drawCount, prevDrawCount),
        activeUsers: pct(activeUsers, prevActiveSet.size),
        payingUsers: pct(payingUsers, prevPayingUsers),
        payRate: pct(payRate, prevPayRate),
        arppu: pct(arppu, prevArppu),
        revenueToday: pct(sumAmount(todayRech), sumAmount(yestRech)),
        drawsToday: pct(todayDraws.length, yestDraws.length),
      },
      spark, trend, health,
      players: { dau: todayActive, newUsers, returning, paying: payingUsers, payRate, arppu },
      funnel, playTypes, pools,
      productHealth: {
        total: products.length,
        normal, nearlySoldOut, soldOut, stale,
        items: attention.slice(0, 12),
      },
      alerts: shownAlerts,
      alertsTotal: alerts.length,
    })
  } catch (err: any) {
    console.error('[dashboard-overview]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
