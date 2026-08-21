'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/timeAgo';
import { getReadIds, isUnread, markRead, markAllRead } from '@/lib/announcementRead';
import { useSwipeTabs } from '@/lib/useSwipeTabs';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  published_at: string;
}

/** 個人通知（notifications 表）—— 綁定禮入帳、邀請獎勵可領、儲值到帳之類 */
interface UserNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/** 私訊類的通知歸「訊息」頁管，這裡不重複列 */
const MESSAGE_TYPES = ['exchange_message', 'sell_message'];

const CATEGORIES = [
  { key: 'all', label: '所有' },
  { key: 'mine', label: '我的' },
  { key: '消息', label: '消息' },
  { key: '活動', label: '活動' },
  { key: '系統', label: '系統' },
];

const CATEGORY_COLORS: Record<string, string> = {
  消息: 'bg-blue-100 text-blue-700',
  活動: 'bg-green-100 text-green-700',
  系統: 'bg-neutral-100 text-neutral-600',
};



function LoadingSkeleton() {
  return (
    <div className="px-4 pt-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="py-3 border-b border-neutral-100 dark:border-neutral-800 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [notes, setNotes] = useState<UserNotification[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const tabKeys = CATEGORIES.map(c => c.key);

  useEffect(() => {
    fetch('/api/announcements')
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));

    // 刻意不在進頁時全標已讀 —— 那樣逐則紅點就失去意義；
    // 已讀改由「點進內頁」或「全部已讀」觸發
    setReadIds(getReadIds());
  }, []);

  /* 個人通知：綁定禮入帳、邀請獎勵可領這類只給本人看的回條。
     以前只寫進 DB 沒有任何畫面，玩家收到獎勵完全沒感覺。 */
  useEffect(() => {
    if (!user) { setNotes([]); return; }
    let cancelled = false;
    supabase
      .from('notifications')
      .select('id, type, title, body, link, is_read, created_at')
      .not('type', 'in', `(${MESSAGE_TYPES.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled && data) setNotes(data as UserNotification[]);
      });
    return () => { cancelled = true; };
  }, [user, supabase]);

  const handleNoteClick = async (n: UserNotification) => {
    if (!n.is_read) {
      setNotes(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: true } : x)));
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', n.id);
    }
    if (n.link) router.push(n.link);
  };

  const handleMarkAll = useCallback(() => {
    markAllRead(items.map(i => i.id));
    setReadIds(getReadIds());
    // 個人通知一併標已讀（「全部已讀」在玩家眼裡就是整頁清乾淨）
    if (notes.some(n => !n.is_read)) {
      setNotes(prev => prev.map(n => ({ ...n, is_read: true })));
      void supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('is_read', false)
        .not('type', 'in', `(${MESSAGE_TYPES.join(',')})`);
    }
  }, [items, notes, supabase]);

  // 「全部已讀」按鈕在 Navbar 上（公告頁專用），透過事件觸發此處
  useEffect(() => {
    window.addEventListener('ggb:markAllAnnouncementsRead', handleMarkAll);
    return () => window.removeEventListener('ggb:markAllAnnouncementsRead', handleMarkAll);
  }, [handleMarkAll]);

  // 換成全站共用的手勢（含邊緣讓位、水平捲動區讓位、斜滑防誤觸）
  const swipeTabs = useSwipeTabs(tabKeys, activeTab, setActiveTab);

  /* 公告（全站）與個人通知（只給本人）併成一條時間軸：
     置頂公告排最前，其餘一律照時間新到舊。「我的」只看個人通知。 */
  type Row =
    | { kind: 'ann'; at: string; pinned: boolean; ann: Announcement }
    | { kind: 'note'; at: string; pinned: false; note: UserNotification };

  const rows: Row[] = (() => {
    const anns: Row[] =
      activeTab === 'mine'
        ? []
        : (activeTab === 'all' ? items : items.filter(i => i.category === activeTab)).map(a => ({
            kind: 'ann' as const, at: a.published_at, pinned: !!a.is_pinned, ann: a,
          }));
    const mine: Row[] =
      activeTab === 'all' || activeTab === 'mine'
        ? notes.map(n => ({ kind: 'note' as const, at: n.created_at, pinned: false as const, note: n }))
        : [];
    return [...anns, ...mine].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.at).getTime() - new Date(a.at).getTime();
    });
  })();

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 pb-24">

      {/* 固定 Tab 欄（在 Navbar 57px 下方） */}
      <div className="sticky top-[calc(57px+env(safe-area-inset-top))] z-20 bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 px-2">
        <div className="max-w-2xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-transparent px-0 gap-0 overflow-visible w-full">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key} className="flex-1 justify-center">{cat.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* 列表 */}
      {isLoading ? <div className="max-w-2xl mx-auto"><LoadingSkeleton /></div> : (
        <div className="max-w-2xl mx-auto px-4 min-h-[60vh]" {...swipeTabs}>
          {rows.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 dark:text-neutral-500 text-sm font-bold">
              {activeTab === 'mine'
                ? (user ? '目前沒有你的通知' : '登入後才看得到你的通知')
                : '此分類目前沒有公告'}
            </div>
          ) : (
            rows.map(row => row.kind === 'note' ? (
              /* 個人通知：整列可點，有 link 就帶去對應頁面 */
              <button
                key={`n${row.note.id}`}
                type="button"
                onClick={() => handleNoteClick(row.note)}
                className="relative block w-full py-3 text-left border-b border-neutral-100 dark:border-neutral-800 last:border-0 active:bg-neutral-50 dark:active:bg-neutral-800/40 transition-colors"
              >
                {!row.note.is_read && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-accent-red" aria-label="未讀" />
                )}
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                    我的
                  </span>
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">·</span>
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{timeAgo(row.note.created_at)}</span>
                </div>
                <h3 className="text-[14px] font-bold text-neutral-900 dark:text-white leading-[1.5] line-clamp-2 pr-5">
                  {row.note.title}
                </h3>
                {row.note.body && (
                  <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2 leading-relaxed pr-5">
                    {row.note.body}
                  </p>
                )}
              </button>
            ) : (
              ((item) => (
              <div key={item.id} className="relative py-3 border-b border-neutral-100 dark:border-neutral-800 last:border-0 active:bg-neutral-50 dark:active:bg-neutral-800/40 transition-colors">
                <Link
                  href={`/announcements/${item.id}`}
                  className="absolute inset-0 z-0"
                  aria-label={item.title}
                  onClick={() => markRead(item.id)}
                />
                {isUnread(item, readIds) && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-2.5 h-2.5 rounded-full bg-accent-red" aria-label="未讀" />
                )}
                <div className="pointer-events-none relative z-10">
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {item.is_pinned && (
                      <span className="text-[10px] font-bold text-accent-red">📌</span>
                    )}
                    <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded', CATEGORY_COLORS[item.category] || CATEGORY_COLORS['系統'])}>
                      {item.category}
                    </span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">·</span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{timeAgo(item.published_at)}</span>
                  </div>
                  <h3 className="text-[14px] font-bold text-neutral-900 dark:text-white leading-[1.5] line-clamp-2">
                    {item.title}
                  </h3>
                  {item.content && (
                    <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1 leading-relaxed">
                      {item.content}
                    </p>
                  )}
                </div>
              </div>
              ))(row.ann)
            ))
          )}
        </div>
      )}
    </div>
  );
}
