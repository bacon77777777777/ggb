/**
 * 靜態資源網址加上內容版本：asset('/images/x.png') → '/images/x.png?v=<hash>'
 *
 * 為什麼：Next 對 public/ 的預設是 max-age=0, must-revalidate，瀏覽器每次顯示圖都要
 * 先回伺服器問一趟（即使是 304），網路差時圖就空在那邊一秒（登入頁 LINE／Google 圖標）。
 * 要讓快取直接命中，又不能出現舊圖（老闆 2026-08-22：資訊不對等），唯一做法是
 * 網址帶內容雜湊：檔案一改網址就變。next.config 只對帶 ?v= 的網址給一年 immutable，
 * 沒帶的維持 must-revalidate（慢但不會舊），所以漏包的引用頂多是慢，不會錯。
 *
 * 任何網址都可以丟進來：不是本站靜態檔（https://…、R2、DB 存的外部網址）原樣回傳，
 * 所以 DB 存的本站路徑（機器人頭像 /images/avatar/03.webp）也能在渲染處包一層拿到版本。
 *
 * 雜湊表由 scripts/gen-asset-manifest.mjs 在 predev／prebuild 產生。
 * 開發模式不加版本：dev 時老闆常同檔名覆蓋圖片，manifest 是啟動時算的，加了反而會
 * 在 dev 看到舊圖；dev 走 must-revalidate 一律最新。
 */
import manifest from './assetManifest.generated.json';

const MAP = manifest as Record<string, string>;
const VERSIONED = process.env.NODE_ENV === 'production';

export function asset(path: string): string {
  if (!VERSIONED || !path || path.charCodeAt(0) !== 47 /* '/' */ || path.includes('?')) return path;
  const v = MAP[path];
  return v ? `${path}?v=${v}` : path;
}
