'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 個人通知的詳情內頁（老闆 2026-08-26）
 *
 * 改版前列表上的每一則個人通知，點下去是 `router.push(n.link)` ——
 * 直接把玩家丟到別的功能頁（訂單、任務、儲值…）。玩家只是想看清楚這則在講什麼，
 * 結果整個頁面換掉，也回不到剛才看到哪裡。
 *
 * 現在一律先進這頁把話講完，要不要過去由玩家自己按。
 * 公告走 `/announcements/[id]`，個人通知走這裡的 `/announcements/n/[id]`——
 * 兩者 id 不同源（公告是 uuid、通知是 bigint），分開路由才不會互相誤判。
 */

interface UserNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** 通知的 link 大多是站內路徑，給一個看得懂的按鈕文字（不要把路徑丟給玩家看） */
function actionLabel(link: string): string {
  if (link.includes('tab=delivery')) return '查看配送訂單';
  if (link.includes('/profile')) return '前往會員中心';
  if (link.startsWith('/mission')) return '前往任務頁';
  if (link.startsWith('/warehouse') || link.includes('tab=warehouse')) return '前往我的倉庫';
  if (link.startsWith('/news')) return '查看情報';
  if (link.startsWith('/events')) return '查看活動';
  return '前往查看';
}

export default function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [supabase] = useState(() => createClient());
  const [note, setNote] = useState<UserNotification | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    let cancelled = false;
    supabase
      .from('notifications')
      .select('id, type, title, body, link, is_read, created_at')
      .eq('id', Number(id))
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setNote(data as UserNotification | null);
        setIsLoading(false);
        // 直接開網址進來也要標已讀，不只從列表點進來
        if (data && !(data as UserNotification).is_read) {
          void supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', Number(id));
        }
      });
    return () => { cancelled = true; };
  }, [id, user, supabase]);

  // 骨架拿掉，跟路由切換時的 app/loading.tsx 用同一個等待畫面（老闆 2026-08-29）
  if (isLoading) {
    return <ProductLoadingScreen />;
  }

  if (!note) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 p-8">
        <p className="text-5xl mb-4">📭</p>
        <h1 className="text-lg font-black text-neutral-900 dark:text-white mb-2">
          {user ? '找不到這則通知' : '登入後才看得到你的通知'}
        </h1>
        <Link href="/announcements" className="text-primary font-bold text-sm">回到通知</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-8">
      <article className="px-4 pt-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">我的</span>
          <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            <Clock className="w-3 h-3" />
            <span>{formatDateTime(note.created_at)}</span>
          </div>
        </div>

        <h1 className="text-[20px] font-black text-neutral-900 dark:text-white leading-[1.3] mb-4">
          {note.title}
        </h1>

        {note.body && (
          <div className="text-[15px] text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {note.body}
          </div>
        )}

        {/* 要不要過去由玩家決定，不再一點就把人丟走 */}
        {note.link && (
          <Link
            href={note.link}
            className="mt-6 flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-black text-white active:scale-[0.98] transition-transform"
          >
            {actionLabel(note.link)}
          </Link>
        )}
      </article>
    </div>
  );
}
