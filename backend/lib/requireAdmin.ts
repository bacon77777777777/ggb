import { cookies } from 'next/headers'
import { verifyAdminSession, type AdminSessionPayload } from '@/lib/adminSession'

export async function requireAdminSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) return null
  return verifyAdminSession(token)
}

/**
 * 資料範圍
 *
 * 後台的商品／訂單 API 原本一律回全站資料。上線後要開廠商帳號，
 * 那些 API 就必須依登入者所屬的廠商限縮 —— 否則 A 廠商看得到也改得掉 B 廠商的商品。
 *
 * middleware 已經用白名單擋掉廠商不該碰的 API（漏加的後果是 403 而不是外洩），
 * 這裡處理的是白名單內的 API：同一支 API，平台管理員看全部、廠商只看自己。
 *
 * ── 設計原則：拿不到範圍就什麼都不給 ──
 * `supplierScope` 為 undefined 代表「不限縮」（平台管理員），
 * 為數字代表「只能看這一家」。廠商角色但拿不到 supplier_id 時**丟例外**，
 * 不是回 undefined —— 那會變成廠商看到全站資料，正好是要防的事。
 */

export type AdminScope = AdminSessionPayload & {
  /** undefined = 不限縮（平台管理員）；數字 = 只能看這家廠商 */
  supplierScope?: number
  isSupplier: boolean
}

export class ScopeError extends Error {
  status = 403
}

export async function requireAdminScope(): Promise<AdminScope | null> {
  const session = await requireAdminSession()
  if (!session) return null

  const isSupplier = session.role === 'supplier'

  if (isSupplier && !session.supplierId) {
    // 資料層有觸發器擋（migration 468）、登入時也擋過一次。走到這裡代表
    // 兩道防線都被繞過，或是舊 token 還沒過期。寧可讓它壞掉也不要放行。
    throw new ScopeError('此廠商帳號尚未綁定廠商，請重新登入')
  }

  return {
    ...session,
    isSupplier,
    supplierScope: isSupplier ? session.supplierId : undefined,
  }
}

/**
 * 把廠商範圍套到 Supabase query 上。
 *
 * 用法：
 *   let q = supabase.from('products').select('*')
 *   q = scopeToSupplier(q, scope)
 *
 * 平台管理員原樣回傳，廠商加上 `.eq('supplier_id', N)`。
 * `column` 只有在資料表的欄位名不叫 supplier_id 時才需要指定。
 */
export function scopeToSupplier<T extends { eq: (col: string, val: unknown) => T }>(
  query: T,
  scope: AdminScope,
  column = 'supplier_id',
): T {
  if (scope.supplierScope === undefined) return query
  return query.eq(column, scope.supplierScope)
}

/**
 * 廠商只能碰自己的資料 —— 寫入前的檢查。
 *
 * 讀取用 scopeToSupplier 過濾就夠了（看不到就是看不到），
 * 但寫入不一樣：廠商可以直接送一個別家的 product id 進來改。
 * 所以每個會寫入的路由都要先用這支確認「這筆資料真的屬於他」。
 */
export function assertOwnedBySupplier(
  scope: AdminScope,
  rowSupplierId: number | null | undefined,
): void {
  if (scope.supplierScope === undefined) return
  if (rowSupplierId !== scope.supplierScope) {
    throw new ScopeError('這筆資料不屬於你的廠商')
  }
}

/** 廠商送上來的欄位裡若夾帶 supplier_id，一律以 session 的為準，不能自己指定 */
export function forceSupplierField<T extends Record<string, unknown>>(
  payload: T,
  scope: AdminScope,
): T {
  if (scope.supplierScope === undefined) return payload
  return { ...payload, supplier_id: scope.supplierScope }
}

/**
 * 廠商拿不到的商品欄位。
 *
 * 介面上沒顯示不代表沒送出去 —— 後台 API 回的是整列 JSON，
 * 廠商打開 devtools 就看得到。實測廠商帳號拿到的商品 JSON 裡確實有這兩欄。
 *
 *   seed         抽獎種子。拿到它就能預先算出每一抽的結果，
 *                整套公平性設計對這個帳號失效（txid_hash 是公開的 commitment，可以留）
 *   profit_rate  殺率。平台調整獲利的槓桿，不該讓供貨方看見
 */
const SUPPLIER_HIDDEN_PRODUCT_FIELDS = ['seed', 'profit_rate'] as const

/** 依身份決定要不要把商品的秘密欄位拿掉。平台管理員原樣回傳。 */
export function stripSecretsForSupplier<T extends Record<string, unknown>>(
  row: T,
  scope: AdminScope,
): T {
  if (scope.supplierScope === undefined) return row
  const out = { ...row }
  for (const k of SUPPLIER_HIDDEN_PRODUCT_FIELDS) delete out[k]
  return out
}
