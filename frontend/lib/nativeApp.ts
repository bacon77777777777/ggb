/**
 * 原生 App 判斷（iOS Capacitor / Android TWA）
 *
 * 為什麼需要：App 版不能出現玩家對玩家的現金交易（/sell 的 C2C）。
 * 抽獎本身是「付費 + 隨機 + 實體獎品」，接上一個能把獎品換回新台幣的市集，
 * 就湊齊了賭博的三要件；Apple 5.3 與 Google 的同類條款都會卡。
 * 同業（潮玩家、抽抽一番賞、DOPA!、入魂一番賞）沒有一個在 App 裡放 C2C，
 * 潮玩家更直接在條款寫「代幣不可轉贈他人」。
 *
 * 判斷方式：原生殼在 User-Agent 後面接一段標記
 *   Capacitor  → appendUserAgent: 'GGBApp/1.0 (ios)'
 *   TWA        → customUserAgent 同樣接 'GGBApp/1.0 (android)'
 *
 * ⚠️ 只在前端隱藏按鈕是不夠的 —— 審查員可以直接打網址、或從搜尋結果進去。
 * 擋門一定要在 middleware（回 404）與資料層（查詢就不撈 C2C）兩邊同時做。
 */

export const NATIVE_APP_UA_TAG = 'GGBApp'

export function isNativeAppUA(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes(NATIVE_APP_UA_TAG)
}

/**
 * App 內一律不開放的路徑：商城整包。
 *
 * 官方商城（`/official/*`）本身完全合規（平台自己賣實體商品），
 * 但它的訂單跟 C2C 訂單共用同一頁（`/sell/orders`）。既然商城不進 App，
 * 留著官方商城會變成「買得到、但看不到訂單」—— 那比拿掉更糟。
 * 要在 App 賣官方商城商品，得先給它獨立的訂單頁，屆時再從這張表移除。
 */
const BLOCKED_PREFIXES = [
  '/sell',           // 玩家商城本體（含 /sell/[id]、/sell/new、/sell/manage、/sell/ads、
                     // /sell/deposit、/sell/settings、/sell/pro、/sell/reels、/sell/shop/[id]）
  '/sell-orders',    // 舊網址轉址
  '/sell-messages',  // 買賣雙方私訊
  '/exchange',       // 玩家換卡
  '/exchange-orders',
  '/trades',         // 桌機版的換卡（cardx），跟 /exchange 是同一件事、同一批資料
  '/market',         // 交易所
  '/official',       // 官方商城商品頁（訂單與 /sell/orders 共用，見上）
] as const

export function isAppBlockedPath(pathname: string): boolean {
  return BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`))
}
