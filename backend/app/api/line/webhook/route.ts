import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { askGbBro } from '@/lib/gbBro'
import { askCsAgent, type CsResponse } from '@/lib/csAgent'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { pushLineMessage } from '@/lib/lineXlsxImport'

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

// Returns sent message IDs from LINE's response
async function replyMessage(replyToken: string, messages: object[]): Promise<string[]> {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  })
  try {
    const json = await res.json()
    return (json.sentMessages ?? []).map((m: any) => String(m.id))
  } catch {
    return []
  }
}

// Store GB哥's sent message IDs so users can reply without wake word
async function storeGbSentMessages(messageIds: string[], lineUserId: string) {
  if (!messageIds.length) return
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('gb_sent_messages').insert(
      messageIds.map(message_id => ({ message_id, line_user_id: lineUserId }))
    )
  } catch { /* non-critical */ }
}

// Check if quotedMessageId is from a GB哥 message (within 30 min)
async function getGbQuoteSource(quotedMessageId: string | undefined): Promise<string | null> {
  if (!quotedMessageId) return null
  try {
    const supabase = getSupabaseAdmin()
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
    const { data } = await supabase
      .from('gb_sent_messages')
      .select('line_user_id')
      .eq('message_id', quotedMessageId)
      .gte('created_at', cutoff)
      .single()
    return data?.line_user_id ?? null
  } catch {
    return null
  }
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
    } else if (event.type === 'message' && event.message?.type === 'file') {
      await handleFileMessage(event)
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

// Store last xlsx file message per source (group/user), so user can just say "gb哥上架" after sending the file
async function handleFileMessage(event: any) {
  if (!isAdminSource(event)) return
  const messageId = event.message?.id
  const fileName  = (event.message?.fileName ?? '') as string
  if (!messageId || !fileName.toLowerCase().endsWith('.xlsx')) return
  try {
    const supabase = getSupabaseAdmin()
    const sourceId = event.source?.groupId ?? event.source?.userId ?? ''
    await supabase.from('line_pending_files').upsert(
      { source_id: sourceId, message_id: messageId, file_name: fileName },
      { onConflict: 'source_id' }
    )
  } catch { /* non-critical */ }
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
  const lineUserId = event.source?.userId ?? ''

  const fromGroup = isGroupSource(event)
  const hasWakeWord = WAKE_WORDS.some(w => lower.startsWith(w) || lower.includes(w))

  // Check if this message is a reply to a GB哥 message (admin only)
  const quotedMessageId: string | undefined = event.message?.quotedMessageId
  const isGbReply = isAdminSource(event) && !!(await getGbQuoteSource(quotedMessageId))

  // Group messages: must have wake word OR be a direct reply to GB哥
  if (fromGroup && !hasWakeWord && !isGbReply) return

  // ── GB哥 mode (admin channel or admin user) ──────────────────────
  if (isAdminSource(event)) {
    const query = hasWakeWord ? stripWakeWord(text) : text

    // ── 智能上架：有 wake word + 上架意圖 → 找 xlsx 文件 ──
    const isUploadIntent = hasWakeWord && /上架|匯入|import/i.test(lower)
    if (isUploadIntent) {
      const sourceId = event.source?.groupId ?? event.source?.userId ?? ''

      // Priority 1: quoted message
      let fileMessageId: string | null = quotedMessageId ?? null

      // Priority 2: latest pending file from same source (within 30 min)
      if (!fileMessageId) {
        try {
          const supabase = getSupabaseAdmin()
          const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
          const { data } = await supabase
            .from('line_pending_files')
            .select('message_id')
            .eq('source_id', sourceId)
            .gte('updated_at', cutoff)
            .single()
          fileMessageId = data?.message_id ?? null
        } catch { /* no pending file */ }
      }

      if (fileMessageId) {
        await replyMessage(event.replyToken, [{ type: 'text', text: '📦 收到！開始智能上架，補全圖片與品項名稱中，完成後會回報結果…' }])
        // Pass only fileMessageId (tiny payload) — import-job downloads the file itself
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
          ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001')
        fetch(`${backendUrl}/api/admin/line-import-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET ?? '' },
          body: JSON.stringify({ fileMessageId, targetId: sourceId }),
        }).catch(err => {
          console.error('[line-import-job trigger]', err)
          pushLineMessage(sourceId, '😵 智能上架發生錯誤，請稍後再試。').catch(() => {})
        })
        return
      }

      // No xlsx found — fall through to normal GB哥
    }

    if (!query) {
      await replyMessage(event.replyToken, [
        { type: 'text', text: '嗨！有什麼想問的嗎？😊' },
      ])
      return
    }

    try {
      const answer = await askGbBro(query, lineUserId)
      const sentIds = await replyMessage(event.replyToken, [{ type: 'text', text: answer }])
      await storeGbSentMessages(sentIds, lineUserId)
    } catch (err) {
      console.error('[GB哥] error:', err)
      await replyMessage(event.replyToken, [
        { type: 'text', text: '😵 GB哥遇到了問題，請稍後再試。' },
      ])
    }
    return
  }

  // ── Customer mode — AI 客服主管 ──────────────────────────────────
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
