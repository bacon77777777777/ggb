import type { Database } from '@/types/database.types';
import { fetchJson } from '@/lib/swr';

export type HomeProduct = Database['public']['Tables']['products']['Row'];
export type HomeBanner = Database['public']['Tables']['banners']['Row'] & {
  events?: { start_at: string | null; end_at: string | null } | null;
};
export interface HomeCatalog {
  products: HomeProduct[];
  banners: HomeBanner[];
  menus: { id: string; name: string }[];
}

/** 首頁商品／輪播／分類 —— 走 /api/public/home（CDN 邊緣快取，見該 route） */
export const HOME_KEY = ['home', 'catalog'] as const;
export const fetchHomeCatalog = () => fetchJson<HomeCatalog>('/api/public/home');
