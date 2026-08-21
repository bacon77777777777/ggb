import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * 綠界電子發票（B2C 雲端發票）—— 儲值時開票（老闆 2026-08-21）
 *
 * ⚠️ 這是**開關式整合**：沒設綠界發票金鑰時 `issueInvoiceForRecharge()` 直接
 * no-op（回 null），不影響任何流程。等統編＋綠界發票商店代號到手、把三個 env
 * 填上，就自動開始開票 —— 跟推播 / LINE 的做法一致，不用臨上線才趕。
 *
 * 需要的 env（跟正式金流一起申請）：
 *   ECPAY_INVOICE_MERCHANT_ID   發票專用商店代號（跟金流的 MerchantID 不同）
 *   ECPAY_INVOICE_HASH_KEY
 *   ECPAY_INVOICE_HASH_IV
 *   ECPAY_INVOICE_API_URL       選填；未設時依金流環境自動選測試/正式
 *
 * 金額規則：發票金額＝**實付台幣**（recharge_records.amount），5% 營業稅內含；
 * 贈點（bonus）是行銷贈與、不是玩家付的錢，**不開票**。
 */

const MERCHANT_ID = process.env.ECPAY_INVOICE_MERCHANT_ID
const HASH_KEY = process.env.ECPAY_INVOICE_HASH_KEY
const HASH_IV = process.env.ECPAY_INVOICE_HASH_IV

/** 金鑰齊了才算啟用。缺任何一個都當「未啟用」。 */
export function invoiceEnabled(): boolean {
  return !!(MERCHANT_ID && HASH_KEY && HASH_IV)
}

function apiUrl(): string {
  if (process.env.ECPAY_INVOICE_API_URL) return process.env.ECPAY_INVOICE_API_URL
  // 沒指定就跟著金流環境走：金流在測試 → 發票也用測試
  const stage = (process.env.ECPAY_API_URL ?? '').includes('stage')
  return stage
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/Issue'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/Issue'
}

/**
 * 綠界 B2C 發票走 AES-128-CBC 加密整包 JSON（跟 AIO 金流的 CheckMacValue 不同）。
 * 這裡先把加解密備好；實際欄位對映等拿到測試帳號再依當時的 API 版本微調。
 */
function aesEncrypt(plain: string): string {
  const cipher = crypto.createCipheriv('aes-128-cbc', HASH_KEY!, HASH_IV!)
  const encoded = encodeURIComponent(plain)
  return Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]).toString('base64')
}

export interface RechargeForInvoice {
  order_number: string
  amount: number
  buyer_tax_id?: string | null
  invoice_carrier?: string | null
}

/**
 * 為一筆儲值開發票。啟用才動作；結果寫回 recharge_records 的發票欄位。
 * 一律 fire-and-forget 呼叫（呼叫端 .catch），開票失敗不影響入帳 —— 錢已經進了，
 * 發票補開得回來，卡住 callback 才是事故。
 */
export async function issueInvoiceForRecharge(rec: RechargeForInvoice): Promise<string | null> {
  if (!invoiceEnabled()) return null // 未啟用：什麼都不做，欄位維持 invoice_status='none'

  const admin = getSupabaseAdmin()
  await admin.from('recharge_records').update({ invoice_status: 'pending' }).eq('order_number', rec.order_number)

  try {
    const payload = {
      MerchantID: MERCHANT_ID,
      RelateNumber: rec.order_number, // 用訂單號當關聯號，可追可防重
      TaxType: '1',                   // 應稅
      SalesAmount: Math.round(rec.amount), // 含稅總額
      Print: rec.buyer_tax_id ? '1' : '0',
      Donation: '0',
      CustomerIdentifier: rec.buyer_tax_id || '',
      CarrierType: rec.invoice_carrier ? '3' : '', // 3=手機條碼；B2B 帶統編時不用載具
      CarrierNum: rec.invoice_carrier || '',
      Items: [{ ItemName: '吉吉比代幣儲值', ItemCount: 1, ItemWord: '式', ItemPrice: Math.round(rec.amount), ItemAmount: Math.round(rec.amount) }],
    }

    const body = {
      MerchantID: MERCHANT_ID,
      RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
      Data: aesEncrypt(JSON.stringify(payload)),
    }

    const res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`發票 API HTTP ${res.status}`)
    const json = await res.json() as { InvoiceNo?: string; RandomNumber?: string; RtnMsg?: string }

    if (json.InvoiceNo) {
      await admin.from('recharge_records').update({
        invoice_status: 'issued',
        invoice_number: json.InvoiceNo,
        invoice_random: json.RandomNumber ?? null,
        invoice_issued_at: new Date().toISOString(),
        invoice_error: null,
      }).eq('order_number', rec.order_number)
      return json.InvoiceNo
    }
    throw new Error(json.RtnMsg || '發票回應缺 InvoiceNo')
  } catch (e: any) {
    await admin.from('recharge_records').update({
      invoice_status: 'failed',
      invoice_error: (e?.message ?? '未知錯誤').slice(0, 200),
    }).eq('order_number', rec.order_number)
    return null
  }
}
