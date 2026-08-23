import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

/**
 * App 更新檢查的唯一資料來源。
 *
 * 兩種更新是兩件事，一次問完（App 每次回前景只打這一支）：
 *
 *   build     這次線上部署的 commit sha。App 端跟自己 bundle 裡的
 *             `NEXT_PUBLIC_BUILD_ID` 比對，不同＝網頁版推過版 → 重載 webview 就好，
 *             **不必送審、不必上架**（殼是 remote URL 模式）。
 *   minNative 最低原生版本。App 端跟原生殼回報的版本比對，低於門檻＝原生層本身
 *             要換，只能去商店下載。空字串＝不啟用（上架前商店網址還不存在）。
 *
 * ── 為什麼 build 不進 unstable_cache ──
 * 它就是「這次部署」的常數，跟資料庫無關；快取它反而會在新舊部署之間拿到錯的值。
 * 只有設定那半邊需要快取。
 */

export const dynamic = 'force-dynamic';

type AppSettings = {
  webCheck: boolean;
  minNative: string;
  storeIos: string;
  storeAndroid: string;
};

const KEYS = [
  'app_web_update_check',
  'app_min_native_version',
  'app_store_url_ios',
  'app_store_url_android',
] as const;

/**
 * 設定值快取 60 秒。後台改完會打 `/api/revalidate`（tag: app-version）立刻失效，
 * 60 秒只是「那支沒打通時」的保險，不是主要的更新途徑。
 */
const getAppSettings = unstable_cache(
  async (): Promise<AppSettings> => {
    const fallback: AppSettings = { webCheck: true, minNative: '', storeIos: '', storeAndroid: '' };
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      const { data } = await supabase
        .from('platform_settings').select('key, value').in('key', [...KEYS]);
      const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value as string]));
      return {
        // 沒設定過就當開著 —— 網頁版更新提示是無害的，預設要能用
        webCheck: map['app_web_update_check'] !== '0',
        minNative: map['app_min_native_version'] ?? '',
        storeIos: map['app_store_url_ios'] ?? '',
        storeAndroid: map['app_store_url_android'] ?? '',
      };
    } catch {
      // 讀不到設定不該讓 App 卡在「檢查更新」，回預設值當作沒有強制更新
      return fallback;
    }
  },
  ['ggb-app-version-settings'],
  { revalidate: 60, tags: ['app-version'] },
);

export async function GET() {
  const settings = await getAppSettings();
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev', ...settings },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
