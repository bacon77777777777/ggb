/**
 * 哪些路由在 768 以上要換成 cardx 的頁面（老闆 2026-09-04：768 以上整套原封不動搬 cardx 的 UI，
 * 768 以下一律維持我們自己的手機版）。
 *
 * 命中的路由：我們的導覽列／側欄／頁尾在 768 以上藏起來，改由 cardx 的 AppShell 接手；
 * 頁面本身用 <CardxPage page="…"> 掛 cardx 那棵樹。
 * 沒命中的（會員頁、儲值、搜尋、情報內頁…）維持原樣。
 */
const CARDX_ROUTES: RegExp[] = [
  /^\/$/,                         // 首頁 → cardx Home
  /^\/packs(?:\/[^/]+)?$/,         // 卡包列表／卡包詳情（cardx 原路由）
  /^\/item\/[^/]+$/,              // 我們的商品頁 → cardx 卡包詳情
  /^\/(?:leaderboard|ranking)$/,   // 排行榜
  /^\/(?:missions|mission)$/,      // 任務
  /^\/news$/,                      // 情報列表（內頁 /news/[id] 維持我們的）
  /^\/market(?:\/[^/]+)?$/,        // 市集（768 以下是我們的交易所）
  /^\/trades(?:\/[^/]+)?$/,
  /^\/(?:favorites|recent|events|rewards|topics|trends|info|checkout|openings|orders)(?:\/[^/]+)?$/,
  /^\/account(?:\/[^/]+)?$/,
  /^\/profile$/,                  // 會員中心：1024 以上整頁掛進 cardx 的 AppShell（app/profile/page.tsx 自己包）
];

export function isCardxRoute(pathname: string): boolean {
  return CARDX_ROUTES.some((re) => re.test(pathname));
}
