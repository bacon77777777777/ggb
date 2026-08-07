/**
 * iOS 鍵盤接力
 *
 * iOS 的原生鍵盤只肯為「使用者手勢當下的 focus」彈出。
 * 「點導覽列搜尋圖標 → 換頁 → 搜尋頁再 focus 輸入框」這條路裡，
 * 第二次 focus 已經不在手勢裡，iOS 只給游標不給鍵盤 —— 實機回報的症狀。
 *
 * 解法：點圖標的**當下**（還在手勢裡）先 focus 一個隱形的假輸入框，
 * 鍵盤先彈出來；Next.js 的換頁是 client-side、document 不換，
 * 搜尋頁的真輸入框 mount 後把 focus 接走，鍵盤就順勢留給它。
 * 假輸入框在失焦（= 真輸入框接手）時自我清除。
 *
 * 桌機與 Android 跑這段無害 —— 就是多 focus 了一個看不見的框一瞬間。
 */
export function startKeyboardRelay() {
  if (typeof document === 'undefined') return
  // 已經有一個在接力就別再疊
  if (document.getElementById('kb-relay')) return

  const fake = document.createElement('input')
  fake.id = 'kb-relay'
  fake.type = 'text'
  // 16px 起跳：iOS 對更小的字級會自動縮放頁面
  fake.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;'
  fake.setAttribute('aria-hidden', 'true')
  fake.setAttribute('autocapitalize', 'off')
  fake.setAttribute('autocomplete', 'off')

  const remove = () => { fake.remove() }
  // 真輸入框接手 focus 的那一刻，假的會失焦 —— 那就是功成身退的時機
  fake.addEventListener('blur', remove, { once: true })
  // 保險絲：使用者中途取消（返回、切走）時別讓隱形的框一直霸著鍵盤
  setTimeout(() => { if (document.activeElement === fake) fake.blur(); remove() }, 10_000)

  document.body.appendChild(fake)
  fake.focus({ preventScroll: true })
}
