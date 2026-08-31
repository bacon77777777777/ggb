import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

/**
 * 商品頁的「N 人正在看」人數計數器（心跳制）
 *
 * ## 為什麼不是繼續用 Realtime presence
 *
 * presence 是為了「知道**誰**在線上」設計的，所以每有人進出，它會把
 * **整份名單**廣播給頻道上每一個人 —— 成本是立方成長。
 * 實測 40 人同時在一個商品頁：sync 事件 428 次、傳輸 0.41 MB。
 * 外推到 500 人：光是進場潮就約 840 MB，之後每有一個人進出都要把
 * 5 MB 的名單推給 500 個人。手機端會先卡死，數字停在半路。
 *
 * 我們只要一個數字，不需要名單。改成心跳＋Redis 計數：
 *
 *   每個分頁每 20 秒 ping 一次 → 伺服器記下 (商品, 分頁 id, 時間戳)
 *   → 回傳「最近 45 秒內有心跳的分頁數」
 *
 * 成本是線性：500 人就是每 20 秒 500 個小請求、回一個整數。
 *
 * ## 為什麼用 ZSET 而不是一堆 SETEX 鍵
 *
 * SETEX 要數數量只能 SCAN，那是 O(全庫)。ZSET 用時間戳當分數，
 * `ZCOUNT (now-窗口) +inf` 直接把活著的數出來，一個指令。
 *
 * ## 省指令
 *
 * 每次心跳只發 2 個指令（ZADD + ZCOUNT）。清掉過期成員與續期是
 * 抽樣才做 —— 過期成員不影響 ZCOUNT 的正確性（它只數窗口內的），
 * 只是佔一點記憶體，不必每次都清。（例外見下方 count <= 2 的說明）
 *
 * ## 沒有 Redis 時
 *
 * 本機開發常常沒設 UPSTASH_*，這時回 `null` 讓前端退回 presence（見 ViewerPill）。
 * 不要回 0 —— 那會讓畫面顯示「0 人正在看」，比沒有這個功能還糟。
 */

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

/** 多久沒心跳就算離開。要比前端的心跳間隔大一截，不然網路抖一下人就消失 */
const WINDOW_MS = 45_000
/** 幾次心跳做一次清理 */
const SWEEP_EVERY = 10

/**
 * 鍵的環境前綴。
 *
 * 正式站、STG（staging.ggb.com.tw 是同一個 Vercel 專案的 dev 分支）與本機開發
 * **共用同一顆 Upstash**（env 的 target 就是 preview+production 同一組值，
 * 本機 .env.local 也指向它）。不分前綴的話三邊數的是同一個桶子 ——
 * 玩家在正式站看到的人數會把「我們自己開著測試站或 localhost」的人算進去。
 * 活動當天我們一定會開著盯場，那幾個人就會混進玩家看到的數字裡。
 *
 * 分前綴不增加任何 Redis 指令，純粹是鍵名不同。
 */
const NS = process.env.VERCEL_ENV === 'production' ? 'p' : process.env.VERCEL_ENV || 'dev'

let redis: Redis | null = null
function client() {
  if (!hasRedis) return null
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redis
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const pid = String(productId).replace(/[^0-9]/g, '')
  if (!pid) return NextResponse.json({ error: 'bad product' }, { status: 400 })

  const r = client()
  // 沒設 Redis：明確回 null，讓前端知道要走 presence
  if (!r) return NextResponse.json({ viewers: null })

  const body = await req.json().catch(() => ({}))
  const sid = String(body?.sid ?? '').slice(0, 64)
  if (!sid) return NextResponse.json({ error: 'bad session' }, { status: 400 })

  const key = `viewers:${NS}:${pid}`
  const now = Date.now()

  try {
    /*
     * 一定要「先加再數」，不能用 Promise.all 併發 —— 那是競態：
     * 數的時候自己可能還沒進去，回來的數字會忽多忽少
     * （實測 5 個分頁依序 ping，回的是 2 3 3 5 5 而不是 1 2 3 4 5）。
     * 兩個 REST 呼叫的延遲遠比「數字是對的」不重要。
     */
    await r.zadd(key, { score: now, member: sid })
    const count = await r.zcount(key, now - WINDOW_MS, '+inf')

    /*
     * 清理時機。過期成員不影響 ZCOUNT（它只數窗口內的），所以熱門商品抽樣清就夠。
     *
     * 但 TTL 是跟著清理一起設的，只靠 1/10 抽樣，**只被看過一兩次的冷門商品
     * 有九成機率永遠拿不到 TTL**，那個鍵就會一直留著（線上實測 viewers:773
     * 的 TTL 就是 -1）。所以人數少的時候一律清一次 —— 冷門商品本來就沒幾個
     * 請求，多這兩個指令不痛不癢；熱門商品幾乎不會走到這條。
     */
    if (count <= 2 || Math.random() < 1 / SWEEP_EVERY) {
      void Promise.all([
        r.zremrangebyscore(key, 0, now - WINDOW_MS),
        // 整檔沒人之後自己消失，不留垃圾鍵
        r.expire(key, Math.ceil((WINDOW_MS * 4) / 1000)),
      ]).catch(() => {})
    }

    return NextResponse.json({ viewers: Number(count) || 1 })
  } catch {
    // Redis 掛掉不該讓商品頁少一塊東西 —— 回 null 讓前端退回 presence
    return NextResponse.json({ viewers: null })
  }
}
