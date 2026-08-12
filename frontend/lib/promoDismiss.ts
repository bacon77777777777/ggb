/**
 * 推廣素材的關閉狀態（首頁彈窗 / 底部警語列）
 *
 * 記在 localStorage 而不是 DB：這幾個位置的主要說服對象是還沒註冊的訪客，
 * 綁 user_id 的話最需要看到的人反而記不住關閉狀態，每次進站都被彈一次。
 *
 * 存的是「關閉當下的時間」而不是 boolean，因為每則素材的再出現間隔
 * （dismiss_days）由後台各自設定，要能回推現在該不該再出現。
 */
const KEY = 'ggb:promo:dismissed'

type DismissMap = Record<string, number>   // promoId → 關閉時的 epoch ms

function read(): DismissMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DismissMap) : {}
  } catch {
    return {}
  }
}

function write(map: DismissMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
    window.dispatchEvent(new CustomEvent('ggb:promoDismissed'))
  } catch { /* 私密模式等寫不進去時忽略，最多是關不掉，不影響瀏覽 */ }
}

/**
 * always = 關閉只對這次有效，下次再進到該頁照樣出現
 * days   = 關閉後 dismissDays 天內不再出現
 * never  = 關掉就不再出現
 */
export type DismissMode = 'always' | 'days' | 'never'

export function dismiss(promoId: string, mode: DismissMode) {
  if (mode === 'always') return   // 不落地，才能下次再出現
  const map = read()
  map[promoId] = Date.now()
  write(map)
}

export function shouldShow(promoId: string, mode: DismissMode, dismissDays: number): boolean {
  if (mode === 'always') return true
  const at = read()[promoId]
  if (!at) return true
  if (mode === 'never') return false
  return Date.now() - at >= dismissDays * 24 * 60 * 60 * 1000
}

/* ────────────────────────────────────────────────────────────────────────────
 * 首頁彈窗的「今日不再顯示」
 *
 * 2026-08-12 起首頁彈窗改成：**預設每次進首頁都跳**，要不要少看一次由玩家決定 ——
 * 每則彈窗下方一個「今日不再顯示」勾選，按叉叉時一起存起來。
 * 後台不再有「對象」與「關閉後」兩個全站設定（老闆指定拿掉）。
 *
 * 與上面那組 mode 版分開放，因為底部警語列（NoticeBar）還在用 mode 那套 ——
 * 它的規則不一樣（登入與否給不同天數），共用一個 key 會互相蓋掉。
 *
 * 存「台灣時間的日期字串」而不是時間戳：「今日」對玩家的意思是日曆上的今天，
 * 存 epoch 再算 24 小時的話，晚上 11 點勾起來會壓到隔天晚上，跟字面對不起來。
 * ──────────────────────────────────────────────────────────────────────────── */

const TODAY_KEY = 'ggb:promo:hiddenToday'

/** 台灣時間的今天（YYYY-MM-DD） */
function twToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
}

function readToday(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TODAY_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** 勾了「今日不再顯示」再關閉時呼叫 */
export function hideForToday(promoId: string) {
  const map = readToday()
  map[promoId] = twToday()
  try {
    localStorage.setItem(TODAY_KEY, JSON.stringify(map))
    window.dispatchEvent(new CustomEvent('ggb:promoDismissed'))
  } catch { /* 私密模式寫不進去就當作沒勾，最多是下次再看到一次 */ }
}

/** 今天是不是已經被關掉了 */
export function isHiddenToday(promoId: string): boolean {
  return readToday()[promoId] === twToday()
}
