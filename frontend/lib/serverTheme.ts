import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { paletteToCss, type ThemePalette } from './theme';

/**
 * 讀後台設定的主題色，產出要塞進 <head> 的那段 CSS。
 *
 * ── 為什麼在伺服器端做 ──
 * 交給 client 端載入後再套的話，畫面會先用 globals.css 的預設色畫一次，
 * 拿到設定值再重畫 —— 每次開站都閃一下顏色。
 *
 * ── 為什麼要快取 ──
 * 這是 root layout，每一頁都會經過。不快取的話每個請求都多一次資料庫往返，
 * 而且整站會因此變成動態渲染。主題色一年改不到幾次，快一分鐘生效綽綽有餘。
 *
 * ── 查不到就回 null ──
 * 沒設定過、或資料庫掛了，都讓 globals.css 的預設值接手。
 * 顏色讀不到不該讓整站白畫面。
 */
export const getThemeCss = unstable_cache(
  async (): Promise<string | null> => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      const { data } = await supabase.from('public_theme').select('*').single();
      if (!data) return null;
      return paletteToCss({
        primary: data.primary ?? undefined,
        dark: data.dark ?? undefined,
        light: data.light ?? undefined,
        soft: data.soft ?? undefined,
      } as Partial<ThemePalette>);
    } catch {
      return null;
    }
  },
  ['ggb-theme-css'],
  { revalidate: 60, tags: ['theme'] },
);
