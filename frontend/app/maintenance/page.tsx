import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';

/**
 * 維護頁
 *
 * 維護期間 middleware 會把所有前台路徑 rewrite 到這裡。
 *
 * ── 為什麼是整頁覆蓋（fixed inset-0）而不是一般頁面 ──
 * rewrite 保留原本的網址，所以 Navbar / BottomNav 這些 client 元件用
 * usePathname() 拿到的是「/item/16」而不是「/maintenance」，
 * 沒辦法靠路徑判斷要不要隱藏自己。而 root layout 一定會渲染它們。
 * 用最上層的覆蓋層蓋掉整個畫面，不管底下是什麼都乾淨 ——
 * 維護中的玩家不該看到搜尋、鈴鐺、底部導航這些點了也沒用的東西。
 *
 * 另外刻意用 server component 直接查資料庫、不走 context：
 * 維護中的時候「前台是不是壞了」本來就是未知數，這一頁必須在
 * 其他東西都壞掉的情況下還能長出來。
 */

export const dynamic = 'force-dynamic';

async function getNotice() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data } = await supabase.from('public_maintenance').select('*').single();
    return {
      message: data?.message || '我們正在做一些調整，很快就回來。',
      until: data?.until || '',
    };
  } catch {
    return { message: '我們正在做一些調整，很快就回來。', until: '' };
  }
}

function formatUntil(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 玩家看的是台灣時間，不要丟 ISO 字串給他
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Taipei',
  }).format(d);
}

export default async function MaintenancePage() {
  const { message, until } = await getNotice();
  const untilText = formatUntil(until);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-white px-8 py-12 text-center dark:bg-neutral-950">
      {/* logo 不可點：維護中沒有能去的地方，點了只會回到同一頁 */}
      <Image
        src="/images/20260629/logo.svg"
        alt="吉吉比"
        width={148}
        height={48}
        priority
        className="h-auto w-[148px] object-contain"
      />

      <Image
        src="/loading/3.svg"
        alt=""
        width={132}
        height={132}
        priority
        className="opacity-90"
      />

      <div className="max-w-sm space-y-3">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-50">
          維護中
        </h1>
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-300">
          {message}
        </p>
        {untilText && (
          <p className="text-sm font-bold text-primary">
            預計 {untilText} 恢復
          </p>
        )}
      </div>

      <p className="max-w-xs text-xs leading-relaxed text-neutral-400">
        {untilText
          ? '維護時間如有變動會另行公告。恢復後這頁會自動回到你原本看的畫面。'
          : '完成時間會另行公告。恢復後這頁會自動回到你原本看的畫面。'}
      </p>
    </div>
  );
}
