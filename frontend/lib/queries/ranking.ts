import { fetchJson } from '@/lib/swr';

export interface RankingRow {
  rank: number;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  total_spent: number | string | null;
  draw_count?: number | null;
  prize_level: string | null;
  prize_name: string | null;
  title_name: string | null;
  title_color: string | null;
}
export type RankingType = 'reward' | 'draws';
export type RankingRange = 'day' | 'week';

/** 排行榜 RPC 結果 —— 走 /api/public/ranking（CDN 邊緣快取；榜單本來就是每日結算） */
export const rankingKey = (type: RankingType, range: RankingRange) => ['ranking', type, range] as const;
export const fetchRanking = (type: RankingType, range: RankingRange) =>
  fetchJson<RankingRow[]>(`/api/public/ranking?type=${type}&range=${range}`);
