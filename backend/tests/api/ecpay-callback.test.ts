/**
 * TC-F-B02  付款成功 callback → 補 G 幣
 * TC-F-B03  callback 冪等性（重複回調只處理一次）
 * TC-F-B04  付款失敗 / 驗簽失敗
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeEcpayCallback, makeInvalidEcpayCallback } from '../helpers/ecpay'

// ── mock 外部相依 ──────────────────────────────────────────────────────────
const mockIsAlreadyProcessed = vi.fn().mockResolvedValue(false)
const mockLogWebhookEvent    = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/webhookIdempotency', () => ({
  isAlreadyProcessed: mockIsAlreadyProcessed,
  logWebhookEvent:    mockLogWebhookEvent,
}))

vi.mock('@/lib/ratelimit', () => ({
  rechargeRiskCounter: { increment: vi.fn().mockResolvedValue(1) },
  paymentLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

// Supabase mock: rpc 成功、select 回傳假 recharge
const mockSingle = vi.fn().mockResolvedValue({ data: { user_id: 'user-001', amount: 100 } })
const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), single: mockSingle })
const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockRpc    = vi.fn().mockResolvedValue({ error: null })

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc:  mockRpc,
    from: vi.fn(() => ({ select: mockSelect, insert: mockInsert })),
  })),
}))

// 攔截 LINE push alert fetch（不真的發出去）
global.fetch = vi.fn().mockResolvedValue(new Response('ok'))

// ── 延遲 import（確保 mock 在前）──────────────────────────────────────────
const getRoute = () => import('@/app/api/payment/ecpay/callback/route').then(m => m.POST)

// helper：把 FormData 包成 Request
function formRequest(fd: FormData): Request {
  return new Request('http://localhost/api/payment/ecpay/callback', {
    method: 'POST',
    body: fd,
  })
}

// ── tests ─────────────────────────────────────────────────────────────────
describe('ECPay callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
    mockSingle.mockResolvedValue({ data: { user_id: 'user-001', amount: 100 } })
    mockIsAlreadyProcessed.mockResolvedValue(false)
  })

  // TC-F-B04a：驗簽失敗 → 回 0|CheckMacValue Error
  it('rejects invalid CheckMacValue', async () => {
    const POST = await getRoute()
    const res  = await POST(formRequest(makeInvalidEcpayCallback()))
    const text = await res.text()
    expect(text).toBe('0|CheckMacValue Error')
  })

  // TC-F-B04b：RtnCode ≠ 1（付款失敗）→ 回 1|OK，不補幣
  it('ignores non-success RtnCode', async () => {
    const POST = await getRoute()
    const fd   = makeEcpayCallback({ MerchantTradeNo: 'TP001', RtnCode: '10100084' })
    const res  = await POST(formRequest(fd))
    expect(await res.text()).toBe('1|OK')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  // TC-F-B04c：非即時付款（ATM 取號）→ 回 1|OK，等繳費再處理
  it('ignores non-immediate payment type', async () => {
    const POST = await getRoute()
    const fd   = makeEcpayCallback({ MerchantTradeNo: 'TP002', PaymentType: 'ATM_TAISHIN' })
    const res  = await POST(formRequest(fd))
    expect(await res.text()).toBe('1|OK')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  // TC-F-B02：正常付款成功 → 呼叫 confirm_topup_order RPC
  it('calls confirm_topup_order on success (TP prefix)', async () => {
    const POST = await getRoute()
    const fd   = makeEcpayCallback({ MerchantTradeNo: 'TP20260101001' })
    const res  = await POST(formRequest(fd))
    expect(await res.text()).toBe('1|OK')
    expect(mockRpc).toHaveBeenCalledWith('confirm_topup_order', expect.objectContaining({
      p_order_number: 'TP20260101001',
    }))
  })

  // TC-F-B03：重複回調 → 冪等性攔截，RPC 不重複呼叫
  it('deduplicates repeated callbacks (TC-F-B03)', async () => {
    mockIsAlreadyProcessed.mockResolvedValue(true)

    const POST = await getRoute()
    const fd   = makeEcpayCallback({ MerchantTradeNo: 'TP20260101002' })
    const res  = await POST(formRequest(fd))
    expect(await res.text()).toBe('1|OK')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  // RPC 失敗 → 回 0|Internal Error，並寫 failed log
  it('returns error response when RPC fails', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'db error' } })
    const POST = await getRoute()
    const fd   = makeEcpayCallback({ MerchantTradeNo: 'TP20260101003' })
    const res  = await POST(formRequest(fd))
    expect(await res.text()).toBe('0|Internal Error')
    expect(mockLogWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed' }))
  })

  // SO prefix → 呼叫 confirm_sell_escrow_order
  it('calls confirm_sell_escrow_order for SO prefix orders', async () => {
    const POST = await getRoute()
    const fd   = makeEcpayCallback({ MerchantTradeNo: 'SO20260101001' })
    const res  = await POST(formRequest(fd))
    expect(await res.text()).toBe('1|OK')
    expect(mockRpc).toHaveBeenCalledWith('confirm_sell_escrow_order', expect.objectContaining({
      p_order_number: 'SO20260101001',
    }))
  })
})
