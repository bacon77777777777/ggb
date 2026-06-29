'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

type ThreadPreview = {
  id: string;
  title: string;
  avatar: string;
  lastText: string;
  lastAt: number;
  unread: number;
};

function formatTime(ts: number) {
  if (!ts) return '';
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function MessagesListPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user, isLoading: isAuthLoading } = useAuth();

  useEffect(() => {
    if (isAuthLoading) return;
    if (user?.id) return;
    router.replace(`/login?redirect=${encodeURIComponent('/messages')}`);
  }, [isAuthLoading, router, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) {
        setThreads([]);
        return;
      }
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase
          .from('exchange_messages')
          .select('id, kind, body, offer_id, sender_id, receiver_id, created_at')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(300);
        if (error) throw error;

        const { data: sellRows, error: sellError } = await supabase
          .from('sell_messages')
          .select('id, kind, body, listing_id, sender_id, receiver_id, created_at')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(300);
        if (sellError) throw sellError;

        const byThread = new Map<
          string,
          {
            otherId: string;
            lastText: string;
            lastAt: number;
          }
        >();

        for (const r of rows || []) {
          const offerId = String((r as any).offer_id || '');
          const senderId = String((r as any).sender_id || '');
          const receiverId = String((r as any).receiver_id || '');
          const otherId = senderId === user.id ? receiverId : senderId;
          if (!offerId || !otherId || otherId === user.id) continue;
          const threadId = `${offerId}--${otherId}`;
          if (byThread.has(threadId)) continue;
          const kind = String((r as any).kind || 'text');
          const body = String((r as any).body || '');
          const lastText = kind === 'offer' ? '交換小卡' : kind === 'system' ? '系統訊息' : body || '訊息';
          const lastAt = Date.parse(String((r as any).created_at || '')) || Date.now();
          byThread.set(threadId, { otherId, lastText: lastText.slice(0, 80), lastAt });
        }

        for (const r of sellRows || []) {
          const listingId = String((r as any).listing_id || '');
          const senderId = String((r as any).sender_id || '');
          const receiverId = String((r as any).receiver_id || '');
          const otherId = senderId === user.id ? receiverId : senderId;
          if (!listingId || !otherId || otherId === user.id) continue;
          const threadId = `sell:${listingId}--${otherId}`;
          if (byThread.has(threadId)) continue;
          const kind = String((r as any).kind || 'text');
          const body = String((r as any).body || '');
          const lastText = kind === 'system' ? '系統訊息' : body || '訊息';
          const lastAt = Date.parse(String((r as any).created_at || '')) || Date.now();
          byThread.set(threadId, { otherId, lastText: lastText.slice(0, 80), lastAt });
        }

        const { data: unreadRows } = await supabase
          .from('notifications')
          .select('id, type, meta')
          .in('type', ['exchange_message', 'sell_message'])
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(500);

        const unreadByThread = new Map<string, number>();
        for (const n of unreadRows || []) {
          const meta: any = (n as any).meta || {};
          const senderId = String(meta.sender_id || '');
          const type = String((n as any).type || '');
          if (type === 'sell_message') {
            const listingId = meta.listing_id;
            const lid = typeof listingId === 'number' ? String(listingId) : String(listingId || '');
            if (!lid || !senderId) continue;
            const threadId = `sell:${lid}--${senderId}`;
            unreadByThread.set(threadId, (unreadByThread.get(threadId) || 0) + 1);
            continue;
          }
          const offerId = String(meta.offer_id || '');
          if (!offerId || !senderId) continue;
          const threadId = `${offerId}--${senderId}`;
          unreadByThread.set(threadId, (unreadByThread.get(threadId) || 0) + 1);
        }

        const otherIds = Array.from(new Set(Array.from(byThread.values()).map((t) => t.otherId)));
        const displayById = new Map<string, { name: string; avatar: string }>();
        if (otherIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: otherIds });
          if (displayError) throw displayError;
          for (const d of Array.isArray(displays) ? displays : []) {
            const id = String((d as any).id || '');
            if (!id) continue;
            displayById.set(id, { name: String((d as any).name || 'user'), avatar: String((d as any).avatar_url || '/images/avatar.png') });
          }
        }

        const list: ThreadPreview[] = Array.from(byThread.entries())
          .map(([id, t]) => {
            const display = displayById.get(t.otherId) || { name: 'user', avatar: '/images/avatar.png' };
            return {
              id,
              title: `@${display.name}`,
              avatar: display.avatar,
              lastText: t.lastText || '開始私訊吧',
              lastAt: t.lastAt,
              unread: unreadByThread.get(id) || 0,
            };
          })
          .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

        if (cancelled) return;
        setThreads(list);
      } catch (e) {
        console.error('Failed to load message threads:', e);
        if (!cancelled) setThreads([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const onMarkAllRead = () => {
      setThreads((prev) => prev.map((t) => ({ ...t, unread: 0 })));
    };
    window.addEventListener('messages:markAllRead', onMarkAllRead as EventListener);
    return () => window.removeEventListener('messages:markAllRead', onMarkAllRead as EventListener);
  }, []);

  const list = useMemo(() => threads, [threads]);

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto px-2 sm:px-6 pt-2 pb-24">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
          {isAuthLoading || isLoading ? (
            <div className="py-20 text-center">
              <div className="text-[13px] font-black text-neutral-400 dark:text-neutral-500">載入中</div>
            </div>
          ) : !user ? (
            <div className="py-20 text-center">
              <div className="text-[13px] font-black text-neutral-400 dark:text-neutral-500">登入後才可查看</div>
            </div>
          ) : list.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-[13px] font-black text-neutral-400 dark:text-neutral-500">目前沒有對話</div>
            </div>
          ) : (
            <div>
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={async () => {
                    setThreads((prev) => prev.map((p) => (p.id === t.id ? { ...p, unread: 0 } : p)));
                    try {
                      const supabase = createClient();
                      const [left, otherId] = t.id.split('--');
                      if (String(left || '').startsWith('sell:')) {
                        const listingId = String(left || '').replace(/^sell:/, '');
                        await supabase
                          .from('notifications')
                          .update({ is_read: true, read_at: new Date().toISOString() })
                          .eq('type', 'sell_message')
                          .eq('is_read', false)
                          .contains('meta', { listing_id: Number(listingId), sender_id: otherId });
                      } else {
                        const offerId = left;
                        await supabase
                          .from('notifications')
                          .update({ is_read: true, read_at: new Date().toISOString() })
                          .eq('type', 'exchange_message')
                          .eq('is_read', false)
                          .contains('meta', { offer_id: offerId, sender_id: otherId });
                      }
                    } catch {}
                    router.push(`/messages/${t.id}`);
                  }}
                  className={cn(
                    'w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors',
                    'border-b border-neutral-100 dark:border-neutral-800 last:border-0'
                  )}
                >
                  <div className="relative w-11 h-11 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                    <Image src={t.avatar} alt={t.title} fill className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-[14px] font-black text-neutral-900 dark:text-white truncate">
                        {t.title}
                      </div>
                      <div className="shrink-0 flex flex-col items-end">
                        <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500">{formatTime(t.lastAt)}</div>
                        {t.unread > 0 && <div className="mt-1 w-1.5 h-1.5 rounded-full bg-accent-red" />}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="min-w-0 text-[12px] font-black text-neutral-500 dark:text-neutral-400 truncate">
                        {t.lastText}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
