import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') ?? ''
  if (secret !== (process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
  const notifyId = process.env.NOTIFY_TARGET_ID ?? ''
  
  // 實際打一次 LINE push
  let lineResult: any = null
  if (token && notifyId) {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: notifyId, messages: [{ type: 'text', text: '🔧 Debug: LINE push 測試' }] }),
    })
    lineResult = { status: res.status, body: await res.text() }
  }
  
  return NextResponse.json({
    tokenLen: token.length,
    notifyIdLen: notifyId.length,
    notifyIdPrefix: notifyId.slice(0, 5),
    lineResult,
  })
}
