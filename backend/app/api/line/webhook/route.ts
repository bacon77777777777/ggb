import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? ''
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''

function verifySignature(body: string, signature: string): boolean {
  if (!CHANNEL_SECRET) return false
  const hash = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(body)
    .digest('base64')
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

// LINE 驗證端點用 GET（Webhook URL 驗證）
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
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
    console.log('[LINE webhook] event:', event.type, event.source?.userId)

    if (event.type === 'follow') {
      await handleFollow(event)
    } else if (event.type === 'unfollow') {
      await handleUnfollow(event)
    } else if (event.type === 'message' && event.message?.type === 'text') {
      await handleTextMessage(event)
    }
  }

  return NextResponse.json({ status: 'ok' })
}

async function handleFollow(event: any) {
  await replyMessage(event.replyToken, [
    {
      type: 'text',
      text: '歡迎加入吉吉比！🎉\n\n在這裡你可以：\n• 查詢訂單狀態\n• 查看儲值紀錄\n• 接收最新活動通知\n\n輸入「訂單查詢」或「幫助」取得更多指令。',
    },
  ])
}

async function handleUnfollow(event: any) {
  // 封鎖/取消追蹤，記錄 userId 以便後續清理
  console.log('[LINE webhook] unfollow userId:', event.source?.userId)
}

async function handleTextMessage(event: any) {
  const text: string = (event.message?.text ?? '').trim()
  const lower = text.toLowerCase()

  if (lower === '幫助' || lower === 'help' || lower === '?') {
    await replyMessage(event.replyToken, [
      {
        type: 'text',
        text: '📋 可用指令：\n\n• 訂單查詢 — 查詢最近訂單\n• 儲值查詢 — 查詢儲值紀錄\n• 幫助 — 顯示此選單',
      },
    ])
  } else {
    // 預設回覆，後續擴充關鍵字路由
    await replyMessage(event.replyToken, [
      {
        type: 'text',
        text: `你說的「${text}」我還不太懂 😅\n輸入「幫助」查看可用指令。`,
      },
    ])
  }
}
