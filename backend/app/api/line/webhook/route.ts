import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { askGbBro } from '@/lib/gbBro'
import { askCsAgent, type CsResponse } from '@/lib/csAgent'

export const runtime = 'nodejs'

const CHANNEL_SECRET       = process.env.LINE_CHANNEL_SECRET ?? ''
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_TARGET_ID     = process.env.NOTIFY_TARGET_ID ?? ''
const NOTIFY_TARGET_TYPE   = process.env.NOTIFY_TARGET_TYPE ?? 'user' // 'user' | 'group'

// LINE user IDs of admins (optional, comma-separated). When set, GB哥 also
// responds to direct 1:1 messages from these users.
const ADMIN_LINE_IDS = new Set(
  (process.env.ADMIN_LINE_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
)

function verifySignature(body: string, signature: string): boolean {
  if (!CHANNEL_SECRET) return false
  const hash = crypto.createHmac('SHA256', CHANNEL_SECRET).update(body).digest('base64')
  return hash === signature
}

async function replyMessage(replyToken: string, messages: object[]) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  })
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}

export async function POST(request: NextRequest) {
  const rawBody  = await request.text()
  const signature = request.headers.get('x-line-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    console.warn('[LINE webhook] invalid signature')
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const events: any[] = payload.events ?? []
  for (const event of events) {
    if (event.type === 'follow') {
      await handleFollow(event)
    } else if (event.type === 'message' && event.message?.type === 'text') {
      await handleTextMessage(event)
    }
  }

  return NextResponse.json({ status: 'ok' })
}

function isGroupSource(event: any) {
  return event.source?.type === 'group' || event.source?.type === 'room'
}

function isAdminSource(event: any): boolean {
  const sourceId = isGroupSource(event) ? event.source?.groupId : event.source?.userId

  // Check against the designated admin notification channel
  if (NOTIFY_TARGET_ID && sourceId === NOTIFY_TARGET_ID) return true

  // Check against explicit admin user ID list (for 1:1 DMs)
  if (ADMIN_LINE_IDS.size > 0 && ADMIN_LINE_IDS.has(event.source?.userId)) return true

  return false
}

const WAKE_WORDS = ['gb哥', 'gb 哥', '@吉吉比 線上轉蛋', '@吉吉比線上轉蛋']

function stripWakeWord(text: string): string {
  for (const w of WAKE_WORDS) {
    const re = new RegExp(`^${w}[，,、\\s]*`, 'i')
    const stripped = text.replace(re, '').trim()
    if (stripped !== text) return stripped
  }
  return text
}

async function handleFollow(event: any) {
  await replyMessage(event.replyToken, [
    {
      type: 'text',
      text: '歡迎加入吉吉比！🎉\n\n輸入「訂單查詢」或「幫助」取得更多指令。',
    },
  ])
}

async function handleTextMessage(event: any) {
  const text: string = (event.message?.text ?? '').trim()
  const lower = text.toLowerCase()

  const fromGroup = isGroupSource(event)
  const hasWakeWord = WAKE_WORDS.some(w => lower.startsWith(w) || lower.includes(w))

  // Group messages: only respond when wake word is present
  if (fromGroup && !hasWakeWord) return

  // ── GB哥 mode (admin channel or admin user) ──────────────────────
  if (isAdminSource(event)) {
    const query = hasWakeWord ? stripWakeWord(text) : text

    if (!query) {
      await replyMessage(event.replyToken, [
        { type: 'text', text: '嗨！有什麼想問的嗎？😊' },
      ])
      return
    }

    try {
      const answer = await askGbBro(query, event.source?.userId)
      await replyMessage(event.replyToken, [{ type: 'text', text: answer }])
    } catch (err) {
      console.error('[GB哥] error:', err)
      await replyMessage(event.replyToken, [
        { type: 'text', text: '😵 GB哥遇到了問題，請稍後再試。' },
      ])
    }
    return
  }

  // ── Customer mode — AI 客服主管 ──────────────────────────────────
  const lineUserId = event.source?.userId ?? ''
  try {
    const { text: answer, quickReplies } = await askCsAgent(text, lineUserId)
    const msg: Record<string, any> = { type: 'text', text: answer }
    if (quickReplies?.length) {
      msg.quickReply = {
        items: quickReplies.slice(0, 4).map(label => ({
          type: 'action',
          action: { type: 'message', label, text: label },
        })),
      }
    }
    await replyMessage(event.replyToken, [msg])
  } catch (err) {
    console.error('[CS Agent] error:', err)
    await replyMessage(event.replyToken, [
      { type: 'text', text: '客服系統暫時繁忙，請稍後再試，或輸入「人工客服」轉接真人。😊' },
    ])
  }
}
