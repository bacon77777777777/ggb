import crypto from 'crypto'

const TEST_SECRET = process.env.LINE_CHANNEL_SECRET ?? 'test-line-channel-secret-32chars!!'

/**
 * 產生合法 LINE webhook 簽章（x-line-signature header）
 */
export function signLineBody(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac('SHA256', secret).update(body).digest('base64')
}

export interface LineTextEventOptions {
  text: string
  userId?: string
  sourceType?: 'user' | 'group' | 'room'
  groupId?: string
  quotedMessageId?: string
}

/**
 * 建立標準 LINE text message event payload
 */
export function makeLineTextEvent(opts: LineTextEventOptions) {
  const userId = opts.userId ?? 'Uadmin000000000000000000000000001'
  const sourceType = opts.sourceType ?? 'user'

  const source: Record<string, string> = { type: sourceType, userId }
  if (sourceType === 'group') source.groupId = opts.groupId ?? 'C0000000000000000000000000000001'

  const message: Record<string, string> = {
    type: 'text',
    id: 'msg' + Date.now(),
    text: opts.text,
  }
  if (opts.quotedMessageId) message.quotedMessageId = opts.quotedMessageId

  return {
    destination: 'U000000000000000000000000000test',
    events: [
      {
        type: 'message',
        message,
        source,
        replyToken: 'test-reply-token-' + Date.now(),
        timestamp: Date.now(),
        mode: 'active',
      },
    ],
  }
}

/**
 * 回傳帶正確簽章的 Request，模擬 LINE 打過來的 webhook
 */
export function makeLineRequest(opts: LineTextEventOptions): Request {
  const body = JSON.stringify(makeLineTextEvent(opts))
  const sig  = signLineBody(body)
  return new Request('http://localhost/api/line/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-line-signature': sig,
    },
    body,
  })
}
