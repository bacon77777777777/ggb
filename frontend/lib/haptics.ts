/**
 * 觸覺回饋
 *
 * ⚠️ iOS **完全不支援** `navigator.vibrate`（Safari 與 WKWebView 都沒有），
 * 所以原本這支在 iPhone 上是靜默失效的 —— 寫了等於沒寫。
 * 有原生殼時改走 Capacitor Haptics（走 Taptic Engine，質感也好得多），
 * 網頁版才退回 Vibration API（Android Chrome 支援）。
 *
 * 全部設計成「失敗就算了」：震動是加分項，不該讓任何流程因為它中斷。
 */

type ImpactStyle = 'LIGHT' | 'MEDIUM' | 'HEAVY';

function capacitorHaptics(): Record<string, (...a: unknown[]) => Promise<unknown>> | undefined {
  if (typeof window === 'undefined') return undefined;
  const cap = (window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>> | undefined>;
    };
  }).Capacitor;
  if (cap?.isNativePlatform?.() !== true) return undefined;
  return cap.Plugins?.Haptics;
}

function impact(style: ImpactStyle, webFallback: number | number[]): boolean {
  const h = capacitorHaptics();
  if (h?.impact) {
    void h.impact({ style }).catch(() => {});
    return true;
  }
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false;
  try {
    return navigator.vibrate(webFallback);
  } catch {
    return false;
  }
}

export function vibrate(pattern: number | number[] = 10) {
  return impact('LIGHT', pattern);
}

/** 輕觸：按鈕、選單展開 */
export function hapticLight() {
  return impact('LIGHT', 12);
}

/** 中等：轉把手、蛋掉落 */
export function hapticMedium() {
  return impact('MEDIUM', [8, 12, 8]);
}

/** 強烈：開出稀有品項 */
export function hapticHeavy() {
  return impact('HEAVY', [20, 30, 20]);
}

/** 成功／失敗的通知型回饋（原生有專屬的通知震動樣式） */
export function hapticNotify(type: 'SUCCESS' | 'WARNING' | 'ERROR' = 'SUCCESS') {
  const h = capacitorHaptics();
  if (h?.notification) {
    void h.notification({ type }).catch(() => {});
    return true;
  }
  return impact('HEAVY', type === 'SUCCESS' ? [12, 40, 18] : [40, 60, 40]);
}

/**
 * 一格一格的連續回饋（撕紙的虛線孔、滾輪選擇）。
 *
 * 跟 `hapticSelection` 的差別只有一個：**網頁端會退回**。
 * 那支刻意不退回是怕變成一直嗡嗡叫；撕紙要的正是「撕過一格就頓一下」的顆粒感，
 * 沒有它 Android 網頁版整段撕紙是完全沒感覺的。
 * 節流由呼叫端負責（撕紙是每 8px 一次，見 FigmaTearScene 的 crackle 門檻）。
 */
export function hapticTick() {
  const h = capacitorHaptics();
  if (h?.selectionChanged) {
    void h.selectionChanged().catch(() => {});
    return true;
  }
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false;
  try {
    return navigator.vibrate(6);
  } catch {
    return false;
  }
}

/** 連續選擇時的細微回饋（轉盤、滑動選籤）。網頁端不退回，避免變成一直嗡嗡叫 */
export function hapticSelection() {
  const h = capacitorHaptics();
  if (h?.selectionStart) {
    void h.selectionChanged().catch(() => {});
    return true;
  }
  return false;
}
