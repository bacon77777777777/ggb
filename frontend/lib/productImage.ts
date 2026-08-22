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
