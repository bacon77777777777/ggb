import { fetchJson } from '@/lib/swr';

export interface NewsListItem {
  id: string | number;
  title: string;
  summary: string | null;
  image_url: string | null;
  source_url: string | null;
  category: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
  view_count: number | null;
  likes_count: number;
  comments_count: number;
}

/** 情報列表（含讚／留言數）—— 走 /api/public/news（CDN 邊緣快取） */
export const newsListKey = (category: string) => ['news', 'list', category] as const;
export const fetchNewsList = (category: string) =>
  fetchJson<NewsListItem[]>(`/api/public/news?category=${encodeURIComponent(category)}`);
