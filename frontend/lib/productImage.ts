import { asset } from '@/lib/asset';
const ITEM_IMAGES = [
  asset('/images/item/10001.jpg'),
  asset('/images/item/10002.jpg'),
  asset('/images/item/10003.jpg'),
  asset('/images/item/10004.jpg'),
  asset('/images/item/10005.jpg'),
  asset('/images/item/10006.jpg'),
  asset('/images/item/10007.jpg'),
  asset('/images/item/10008.jpg'),
  asset('/images/item/10009.jpg'),
  asset('/images/item/10010.jpg'),
  asset('/images/item/10011.jpg'),
  asset('/images/item/10012.jpg'),
  asset('/images/item/10013.jpg'),
  asset('/images/item/10014.jpg'),
  asset('/images/item/10015.jpg'),
  asset('/images/item/10016.jpg'),
  asset('/images/item/10017.jpg'),
  asset('/images/item/10018.jpg'),
  asset('/images/item/10019.jpg'),
  asset('/images/item/10020.jpg'),
];

export const DEFAULT_ITEM_IMAGE = asset('/images/item_defaulet.webp');

export function getItemImageForId(id: string | number): string {
  if (ITEM_IMAGES.length === 0) return DEFAULT_ITEM_IMAGE;
  const key = typeof id === 'number' ? id.toString() : id;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return ITEM_IMAGES[hash % ITEM_IMAGES.length] ?? DEFAULT_ITEM_IMAGE;
}

/**
 * 列表用縮圖網址（老闆 2026-09-03）。R2 上 `products/` 的圖都有一張 400px 的 `<檔名>-thumb.webp`
 *（上傳時後台自動產、既有的已回填），卡片才 180px 寬，抓原圖（800px、60～100KB）是浪費。
 * 只認 R2 的 products/ 路徑；其他來源（外站、本站靜態圖）原樣回傳。缺縮圖時呼叫端要能退回原圖。
 */
export function thumbUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (!/\.r2\.dev\/products\//.test(src) || /-thumb\.webp$/.test(src)) return src;
  return src.replace(/\.[a-z0-9]+(\?.*)?$/i, '-thumb.webp');
}
