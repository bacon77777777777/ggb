import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabaseAdmin'

/**
 * 會自動記錄 token 用量的 Claude client
 *
 * 用量本來就在 API 回應的 usage 欄位裡，只是先前被丟掉。改由這支包裝統一寫入
 * ai_usage_logs，後台才能回答「一天／一個月花多少」，不必再靠推算。
 *
 * 三個原則：
 *   1. 記錄失敗絕不影響主流程（fire-and-forget + 吞例外）
 *   2. 只存 token 原始值，金額於查詢時換算 —— 模型換價不必回頭改資料
 *   3. 記錄本身零成本，沒有額外的 API 呼叫
 *
 * 用法：把 `new Anthropic({ apiKey })` 換成 `createClaude('agent 名稱', apiKey)`
 */

/** 各模型費率（USD / 1M tokens）。新增模型請一併補上，否則金額會低估。 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-sonnet-4-5':         { input: 3, output: 15 },
}
/** 未知模型的保守估值（取目前最貴的一檔，寧可高估也不要讓帳看起來比實際低） */
export const FALLBACK_PRICING = { input: 3, output: 15 }

export function estimateCostUsd(model: string | null, input: number, output: number): number {
  const p = (model && MODEL_PRICING[model]) || FALLBACK_PRICING
  return (input * p.input + output * p.output) / 1_000_000
}

async function record(agent: string, model: string | null, input: number, output: number) {
  try {
    await getSupabaseAdmin().from('ai_usage_logs').insert({
      agent,
      model,
      input_tokens: input,
      output_tokens: output,
    })
  } catch {
    // 記錄失敗不可中斷業務流程
  }
}

export function createClaude(agent: string, apiKey?: string): Anthropic {
  const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY! })
  const original = client.messages.create.bind(client.messages)

  // 只攔非串流呼叫；串流回應沒有可直接取用的 usage，原樣放行
  client.messages.create = ((...args: Parameters<typeof original>) => {
    const result = original(...args)
    if (args[0] && (args[0] as { stream?: boolean }).stream) return result
    return (result as Promise<Anthropic.Message>).then(resp => {
      const u = resp?.usage
      if (u) void record(agent, resp.model ?? null, u.input_tokens ?? 0, u.output_tokens ?? 0)
      return resp
    })
  }) as typeof client.messages.create

  return client
}
