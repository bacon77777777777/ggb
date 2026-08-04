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
