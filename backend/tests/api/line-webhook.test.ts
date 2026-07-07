/**
 * TC-B-M03  GB哥查詢題（管理員私訊 / 群組含 wake word）
 * TC-B-M05  非授權帳號 / 群組無 wake word → 不回應
 * TC-B-M06  GB哥 reply threading（回覆 GB哥訊息免 wake word）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeLineRequest, signLineBody, makeLineTextEvent } from '../helpers/line'

const ADMIN_ID = 'Uadmin000000000000000000000000001'
const OTHER_ID = 'Uother000000000000000000000000001'

// ── mock 外部相依 ──────────────────────────────────────────────────────────
vi.mock('@/lib/gbBro', () => ({
  askGbBro: vi.fn().mockResolvedValue('測試回答：昨日營收 $1,234'),
}))

vi.mock('@/lib/csAgent', () => ({
  askCsAgent: vi.fn().mockResolvedValue({ text: '客服回覆', quickReplies: [] }),
}))

// Supabase mock for gb_sent_messages
const mockGbMsgFrom = vi.fn()
vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockGbMsgFrom,
  })),
}))

// 攔截 LINE reply API
const mockLineFetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ sentMessages: [{ id: 'msg-001' }] }), {
    headers: { 'Content-Type': 'application/json' },
  })
)
global.fetch = mockLineFetch

const getRoute = () => import('@/app/api/line/webhook/route').then(m => m.POST)

// helper: gb_sent_messages mock — no existing record (so admin can query freely)
function mockGbMsgNotFound() {
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }), insert: vi.fn().mockResolvedValue({}) }
  mockGbMsgFrom.mockReturnValue(chain)
  return chain
}

function mockGbMsgFound(messageId: string) {
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { line_user_id: ADMIN_ID, message_id: messageId } }), insert: vi.fn().mockResolvedValue({}) }
  mockGbMsgFrom.mockReturnValue(chain)
  return chain
}

// ── tests ─────────────────────────────────────────────────────────────────
describe('LINE webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGbMsgNotFound()
    mockLineFetch.mockResolvedValue(
      new Response(JSON.stringify({ sentMessages: [{ id: 'msg-' + Date.now() }] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  // TC-B-M05a：無效簽章 → 403
  it('rejects invalid LINE signature', async () => {
    const POST = await getRoute()
    const body = JSON.stringify(makeLineTextEvent({ text: 'gb哥 昨日營收', userId: ADMIN_ID }))
    const req  = new Request('http://localhost/api/line/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-line-signature': 'invalidsig' },
      body,
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  // TC-B-M03a：管理員私訊含 wake word → GB哥 回答
  it('routes admin DM with wake word to GB哥 (TC-B-M03)', async () => {
    const { askGbBro } = await import('@/lib/gbBro')
    const POST = await getRoute()
    const res  = await POST(makeLineRequest({ text: 'gb哥 昨日營收', userId: ADMIN_ID }))

    expect(res.status).toBe(200)
    expect(askGbBro).toHaveBeenCalledWith('昨日營收', ADMIN_ID)
    // LINE reply API 被呼叫
    expect(mockLineFetch).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/reply',
      expect.objectContaining({ method: 'POST' })
    )
  })

  // TC-B-M03b：@吉吉比線上轉蛋 wake word 也有效
  it('accepts @吉吉比線上轉蛋 as wake word', async () => {
    const { askGbBro } = await import('@/lib/gbBro')
    const POST = await getRoute()
    await POST(makeLineRequest({ text: '@吉吉比線上轉蛋 庫存狀況', userId: ADMIN_ID }))
    expect(askGbBro).toHaveBeenCalledWith('庫存狀況', ADMIN_ID)
  })

  // TC-B-M05b：非管理員帳號 → 走客服，不呼叫 GB哥
  it('routes non-admin user to CS agent, not GB哥 (TC-B-M05)', async () => {
    const { askGbBro } = await import('@/lib/gbBro')
    const { askCsAgent } = await import('@/lib/csAgent')
    const POST = await getRoute()
    await POST(makeLineRequest({ text: 'gb哥 你好', userId: OTHER_ID }))
    expect(askGbBro).not.toHaveBeenCalled()
    expect(askCsAgent).toHaveBeenCalled()
  })

  // TC-B-M05c：群組訊息無 wake word → 不回應
  it('ignores group message without wake word (TC-B-M05)', async () => {
    const { askGbBro } = await import('@/lib/gbBro')
    const { askCsAgent } = await import('@/lib/csAgent')
    const POST = await getRoute()
    await POST(makeLineRequest({
      text: '大家好',
      userId: ADMIN_ID,
      sourceType: 'group',
      groupId: 'C0000000000000000000000000000001',
    }))
    expect(askGbBro).not.toHaveBeenCalled()
    expect(askCsAgent).not.toHaveBeenCalled()
  })

  // TC-B-M06：管理員在群組回覆 GB哥 的訊息 → 不需 wake word，直接路由 GB哥
  it('routes admin reply to GB哥 message without wake word (TC-B-M06)', async () => {
    const { askGbBro } = await import('@/lib/gbBro')
    mockGbMsgFound('prev-msg-001')

    const POST = await getRoute()
    await POST(makeLineRequest({
      text: '那本週呢？',
      userId: ADMIN_ID,
      sourceType: 'group',
      groupId: 'C0000000000000000000000000000001',
      quotedMessageId: 'prev-msg-001',
    }))
    expect(askGbBro).toHaveBeenCalledWith('那本週呢？', ADMIN_ID)
  })

  // GB哥 回覆後，sent message ID 存入 gb_sent_messages
  it('stores GB哥 sent message IDs after reply', async () => {
    const POST  = await getRoute()
    const chain = mockGbMsgNotFound()
    await POST(makeLineRequest({ text: 'gb哥 今日營收', userId: ADMIN_ID }))
    expect(chain.insert).toHaveBeenCalled()
  })

  // 空訊息（只有 wake word）→ 回覆提示
  it('replies with prompt when only wake word is sent', async () => {
    const { askGbBro } = await import('@/lib/gbBro')
    const POST = await getRoute()
    await POST(makeLineRequest({ text: 'gb哥', userId: ADMIN_ID }))
    expect(askGbBro).not.toHaveBeenCalled()
    expect(mockLineFetch).toHaveBeenCalled()
  })
})
