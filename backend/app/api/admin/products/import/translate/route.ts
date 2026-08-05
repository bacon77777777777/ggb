import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { createClaude, estimateCostUsd } from '@/lib/aiUsage'
import { hasJapanese } from '@/lib/productNaming'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * 日文商品／品項名稱翻譯成台灣繁中
 *
 * 這是補齊的最後一層，也是唯一要錢的一層 —— 前面三層（廠商格式記憶、規則比對、
 * 站內歷史）都處理不了日文，opencc 也不行（它只做簡繁轉換）。
 *
 * ── 成本控制 ──
 * 整批一次呼叫，不是一筆一次。實測樣本 474 個名稱裡 17 個含假名：
 *   一筆一次呼叫：17 x (約 400 in + 100 out) = 約 $0.015
 *   整批一次呼叫：1 x (約 600 in + 500 out)  = 約 $0.003
 * 差五倍，而且品質更好 —— 同一批商品的譯名風格會一致。
 *
 * ── 不翻英文 ──
 * 實測 474 個名稱裡 46% 含英文，而最高頻的是 MASTERLISE(77)、EXPIECE(14)、
 * MASTERELIVE(8)、Grandista(4)、Revible Moment(3) —— 全是萬代的官方產品線名稱。
 * 台灣玩家就是用這串英文搜尋，廠商也用它對帳。翻掉的話兩邊都對不上，
 * 所以 prompt 裡明確要求保留。
 */

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH_SIZE = 60

const SYSTEM = `你是台灣的日系玩具／一番賞／轉蛋商品採購，負責把日文商品名整理成台灣賣場會用的寫法。

規則：
1. 日文（假名、日文漢字）翻成台灣慣用的繁體中文。用台灣的講法，不是中國的
   （公仔不是手辦、盒玩不是盲盒、壓克力不是亞克力、鋼彈不是高達）。
2. 英文一律原樣保留，絕對不要翻譯。MASTERLISE、EXPIECE、Grandista、Revible Moment、
   FIGURIZM、Ver.、Vol.1、Part 2 這些是官方產品線與版本記號，台灣玩家就是用英文搜尋。
   iPhone、Apple、ROG 這類真實產品名同理。
3. 數字、尺寸（約22cm）、全／半形符號原樣保留。
4. 已經是繁體中文的部分不要動。
5. 不要加字、不要潤飾、不要解釋。只做翻譯。

輸出格式：每行一個結果，順序與輸入完全對應，不加編號、不加引號、不加任何說明。
輸入幾行就輸出幾行。`

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const raw: string[] = Array.isArray(body?.names) ? body.names : []

    // 只送真的含假名的。呼叫端可能把整批名稱都丟過來，
    // 沒過濾的話會把已經是繁中的名稱也拿去翻，白花錢又可能被改壞
    const names = [...new Set(raw.map(n => String(n ?? '').trim()).filter(n => n && hasJapanese(n)))]

    if (!names.length) return NextResponse.json({ translations: {}, usage: null })

    const client = createClaude('products-import-translate', process.env.ANTHROPIC_API_KEY!)
    const translations: Record<string, string> = {}
    let inputTokens = 0
    let outputTokens = 0

    for (let i = 0; i < names.length; i += BATCH_SIZE) {
      const chunk = names.slice(i, i + BATCH_SIZE)

      const msg = await client.messages.create({
        model: MODEL,
        // 輸出大約與輸入等長，抓兩倍再加固定量當緩衝
        max_tokens: Math.min(4000, chunk.join('').length * 2 + 400),
        system: SYSTEM,
        messages: [{ role: 'user', content: chunk.join('\n') }],
      })

      inputTokens  += msg.usage?.input_tokens ?? 0
      outputTokens += msg.usage?.output_tokens ?? 0

      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
      const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)

      // 行數對不上就整批放棄。硬對會把 A 商品的譯名安到 B 商品頭上，
      // 那比不翻還糟 —— 不翻至少看得出來是原文
      if (lines.length !== chunk.length) continue

      chunk.forEach((original, idx) => {
        const translated = lines[idx]
        if (translated && translated !== original) translations[original] = translated
      })
    }

    return NextResponse.json({
      translations,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: Number(estimateCostUsd(MODEL, inputTokens, outputTokens).toFixed(5)),
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '翻譯失敗'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
