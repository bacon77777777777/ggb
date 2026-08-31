'use client';

/**
 * 「太久沒回來就從頭開始」的共用狀態（老闆 2026-08-31）
 *
 *   App  —— 離開超過門檻再回來 → 蓋回啟動畫面、整個重載到首頁
 *   PWA  —— 同樣門檻 → 直接重載到首頁
 *   一般瀏覽器分頁 —— **不動**。人家把分頁開著一整天是常態，
 *                     自己跳回首頁會把正在看的東西弄丟。
 *
 * 為什麼要做：這兩種殼沒有網址列也沒有重新整理鍵，玩家隔天打開看到的是
 * 昨天那一頁 —— 餘額、庫存、檔期全是舊的，而他沒有辦法自己刷新。
 *
 * 門檻放這裡是為了讓兩邊（元件與交接旗標）共用同一個數字。
 */

/** 離開多久算「太久」。30 分鐘：切去 LINE 分享、回個訊息都不會被打斷 */
export const AWAY_MS = 30 * 60 * 1000;

const AWAY_KEY = 'ggb:cold-start:away-at';
const BUSY_KEY = 'ggb:cold-start:handoff-at';

/**
 * 「開出去再回來」的交接期間不准重啟。
 *
 * 付款要跳綠界、3D 驗證還會再跳到各家銀行 App；LINE 登入也是開出去再回來。
 * 這種時候 App 本來就會進背景，而且**可能停留很久**（輸入卡號、等簡訊 OTP）。
 * 這時重啟等於把人丟回首頁，付款結果的頁面就再也回不去了。
 */
export function markHandoffBusy() {
  try { localStorage.setItem(BUSY_KEY, String(Date.now())); } catch { /* 無痕模式 */ }
}

export function clearHandoffBusy() {
  try { localStorage.removeItem(BUSY_KEY); } catch { /* 無痕模式 */ }
}

/** 交接旗標也給 TTL：忘了清（App 被系統殺掉）不該讓重啟永遠失效 */
export function isHandoffBusy() {
  try {
    const raw = localStorage.getItem(BUSY_KEY);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    if (Date.now() - t > AWAY_MS) { clearHandoffBusy(); return false; }
    return true;
  } catch {
    return false;
  }
}

export function markAway() {
  try { localStorage.setItem(AWAY_KEY, String(Date.now())); } catch { /* 無痕模式 */ }
}

/**
 * 回來時該不該重啟。讀完就清 —— 同一次離開只判斷一次，
 * 不然 App 的 appStateChange 與 visibilitychange 可能各觸發一次、重載兩遍。
 */
export function shouldColdStart(): boolean {
  try {
    const raw = localStorage.getItem(AWAY_KEY);
    if (!raw) return false;
    localStorage.removeItem(AWAY_KEY);
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    if (isHandoffBusy()) return false;
    return Date.now() - t >= AWAY_MS;
  } catch {
    return false;
  }
}
