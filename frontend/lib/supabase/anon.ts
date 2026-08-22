import { createClient } from '@supabase/supabase-js';

/**
 * 伺服器端的「訪客」client：anon key、不帶 cookie。
 * 給 /api/public/* 用 —— 這些 route 回的是公開資料，必須跟訪客在瀏覽器看到的一模一樣
 * （同一套 RLS），而且回應要能被 CDN 快取，所以絕不能碰使用者 session。
 */
export function createAnonClient() {
  // 不帶 Database 泛型：types/database.types 沒跟上所有表（categories／news 會被推成 never），
  // 這些 route 回傳前都自己整理欄位，鬆散型別反而乾淨
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
