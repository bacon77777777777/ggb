import { createClient } from '@supabase/supabase-js'

export type WebhookSource = 'ecpay_payment' | 'ecpay_logistics'
export type WebhookResult = 'processed' | 'duplicate' | 'failed' | 'ignored'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function isAlreadyProcessed(source: WebhookSource, idempotencyKey: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('source', source)
    .eq('idempotency_key', idempotencyKey)
    .eq('result', 'processed')
    .maybeSingle()
  return !!data
}

export async function logWebhookEvent(opts: {
  source: WebhookSource
  idempotencyKey: string
  orderNumber?: string | null
  rawPayload: Record<string, unknown>
  result: WebhookResult
  errorMessage?: string | null
}): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('webhook_events').insert({
      source: opts.source,
      idempotency_key: opts.idempotencyKey,
      order_number: opts.orderNumber ?? null,
      raw_payload: opts.rawPayload,
      result: opts.result,
      error_message: opts.errorMessage ?? null,
    })
  } catch (e) {
    // log 寫入失敗不影響主流程
    console.error('[webhookIdempotency] log failed:', e)
  }
}
