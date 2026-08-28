/**
 * 同網段多帳號偵測（老闆 2026-08-28）
 *
 * 老闆要的判準是「**IP 前三段相同**就算同一個人」，不是完整 IP 相同 ——
 * 行動網路與多數家用寬頻的最後一段會跳，盯完整 IP 會把同一個人切成好幾個。
 * 所以分組鍵是 C 段（`57.181.201.x`），但列出來時仍照確切 IP 分行，
 * 讓老闆看得到是「同一台換 IP」還是「同一個網段裡好幾台」。
 *
 * ⚠️ 資料來源刻意**不用** `user_ip_log`：
 * 全站只有綠界的 server-to-server callback 在寫它，記到的是**綠界伺服器的 IP**
 * 不是玩家的（PROD 22 筆全部是同一個 175.99.72.1）。原本的同 IP 規則讀它，
 * 等於永遠在報「綠界有 3 個帳號」，真正多開的玩家一個都抓不到。
 * 真的有玩家 IP 的是 `visit_logs.ip_address` 與 `user_event_logs.ip`（登入等事件）。
 */

/** 一個確切 IP 底下的帳號 */
export interface MultiIpEntry {
  ip: string
  accounts: string[]
}

/** 一個網段（IP 前三段）的匯總 */
export interface MultiIpBlock {
  /** 顯示用的網段，如 `57.181.201.x` */
  block: string
  /** 這個網段裡的不重複帳號數 */
  accountCount: number
  entries: MultiIpEntry[]
}

export interface ScanOptions {
  /** 「同時在線」的認定視窗（分鐘）。預設 30 —— 這段時間內有動作就算在線 */
  windowMinutes?: number
  /** 幾個帳號以上才報。預設 10（老闆指定「超過 10 人」） */
  minAccounts?: number
  /** 最多列幾個網段，避免 LINE 訊息爆掉 */
  maxBlocks?: number
}

/**
 * `supabase` 傳 service role client（要能呼叫 execute_readonly_sql）。
 * 回傳已依帳號數由多到少排序的網段。
 */
export async function scanMultiAccountIpBlocks(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  opts: ScanOptions = {},
): Promise<MultiIpBlock[]> {
  const windowMinutes = Math.max(1, Math.floor(opts.windowMinutes ?? 30))
  const minAccounts = Math.max(2, Math.floor(opts.minAccounts ?? 10))
  const maxBlocks = Math.max(1, Math.floor(opts.maxBlocks ?? 5))

  /*
   * 兩個來源 UNION：瀏覽紀錄（最能代表「還在線上」）與使用者事件（登入等）。
   * IPv6 沒有「前三段」的概念，這裡只處理 IPv4（`ip LIKE '%.%.%.%'`）——
   * 站上目前的紀錄全是 IPv4，真的出現 IPv6 再補 /64 的分組。
   */
  const query = `
    WITH act AS (
      SELECT user_id, ip_address AS ip
      FROM visit_logs
      WHERE created_at >= NOW() - INTERVAL '${windowMinutes} minutes'
        AND user_id IS NOT NULL AND ip_address IS NOT NULL AND ip_address <> 'unknown'
      UNION ALL
      SELECT user_id, ip
      FROM user_event_logs
      WHERE created_at >= NOW() - INTERVAL '${windowMinutes} minutes'
        AND user_id IS NOT NULL AND ip IS NOT NULL AND ip <> 'unknown'
    ),
    real AS (
      SELECT a.ip,
             split_part(a.ip,'.',1)||'.'||split_part(a.ip,'.',2)||'.'||split_part(a.ip,'.',3) AS block,
             COALESCE('#'||u.member_no::text, u.name, left(u.id::text, 8)) AS account
      FROM act a
      JOIN users u ON u.id = a.user_id
      WHERE (u.is_bot IS NULL OR u.is_bot = false)
        AND a.ip LIKE '%.%.%.%'
      GROUP BY 1, 2, 3
    ),
    blocks AS (
      SELECT block, COUNT(DISTINCT account) AS account_count
      FROM real GROUP BY block
      HAVING COUNT(DISTINCT account) >= ${minAccounts}
      ORDER BY account_count DESC
      LIMIT ${maxBlocks}
    )
    SELECT r.block, b.account_count, r.ip, array_agg(DISTINCT r.account) AS accounts
    FROM real r
    JOIN blocks b ON b.block = r.block
    GROUP BY r.block, b.account_count, r.ip
    ORDER BY b.account_count DESC, r.ip
  `

  const { data } = await supabase.rpc('execute_readonly_sql', { query })
  const rows = (data as any[] | null) ?? []

  const byBlock = new Map<string, MultiIpBlock>()
  for (const r of rows) {
    const block = String(r.block)
    if (!byBlock.has(block)) {
      byBlock.set(block, { block: `${block}.x`, accountCount: Number(r.account_count) || 0, entries: [] })
    }
    byBlock.get(block)!.entries.push({
      ip: String(r.ip),
      accounts: ((r.accounts as string[]) ?? []).filter(Boolean),
    })
  }
  return [...byBlock.values()].sort((a, b) => b.accountCount - a.accountCount)
}

/** 台灣時間 `YYYY-MM-DD HH:mm:ss` */
function twNow(): string {
  const d = new Date(Date.now() + 8 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/**
 * 排成老闆指定的格式（繁中）：先講風險類型與時間，再一個 IP 一段列帳號。
 * 回傳空字串代表沒有要報的。
 */
export function formatMultiIpAlert(
  blocks: MultiIpBlock[],
  opts: { minAccounts?: number; windowMinutes?: number } = {},
): string {
  if (blocks.length === 0) return ''
  const minAccounts = opts.minAccounts ?? 10
  const windowMinutes = opts.windowMinutes ?? 30

  const lines = [
    '—— 風險通知 ——',
    `風險類型：同一網段（IP 前三段相同）同時在線超過 ${minAccounts} 人`,
    `時間：${twNow()}`,
    `認定範圍：最近 ${windowMinutes} 分鐘內有動作的帳號`,
  ]

  for (const b of blocks) {
    lines.push('', `網段 ${b.block}｜${b.accountCount} 個帳號、${b.entries.length} 個 IP`)
    for (const e of b.entries) {
      lines.push('', `IP：${e.ip}`, `帳號：[${e.accounts.join(', ')}]`)
    }
  }
  return lines.join('\n')
}
