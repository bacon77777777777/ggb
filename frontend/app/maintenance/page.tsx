import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import MaintenanceReloadButton from '@/components/MaintenanceReloadButton';

/**
 * 維護頁
 *
 * 維護期間 middleware 會把所有前台路徑導到這裡。
 *
 * 刻意用 server component 直接查資料庫，不走 context：
 * 維護中的時候「前台是不是壞了」本來就是未知數，這一頁必須在
 * 其他東西都壞掉的情況下還能長出來，所以它不依賴任何前端狀態。
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
      message: data?.message || '系統維護中，我們正在做一些調整，很快就回來。',
      until: data?.until || '',
    };
  } catch {
    return { message: '系統維護中，我們正在做一些調整，很快就回來。', until: '' };
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
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center bg-white dark:bg-neutral-950">
      <Image
        src="/loading/3.svg"
        alt=""
        width={140}
        height={140}
        priority
        className="opacity-90"
      />

      <div className="space-y-3 max-w-md">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-50">
          維護中
        </h1>
        <p className="text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-300 whitespace-pre-line">
          {message}
        </p>
        {untilText && (
          <p className="text-sm font-bold text-primary">
            預計 {untilText} 恢復
          </p>
        )}
      </div>

      <MaintenanceReloadButton />

      <p className="text-xs text-neutral-400">
        造成不便很抱歉，維護結束後這頁會自動恢復。
      </p>
    </main>
  );
}
