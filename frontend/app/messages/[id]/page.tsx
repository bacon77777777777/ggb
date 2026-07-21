'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftRight, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';

type ExchangeCard = {
  id: string;
  name: string;
  series: string;
  image: string;
  value: number;
};

type ExchangeOffer = {
  id: string;
  ownerId: string;
  user: { name: string; avatar: string; trades: number };
  getting: ExchangeCard[];
  giving: ExchangeCard[];
  createdAt: string;
};

type Message =
  | { id: string; type: 'offer'; sender: 'me' | 'them'; createdAt: number; offer: ExchangeOffer }
  | { id: string; type: 'text'; sender: 'me' | 'them'; createdAt: number; text: string }
  | { id: string; type: 'system'; createdAt: number; text: string };

const formatTwd = (amount: number) => `NT$${Math.round(amount).toLocaleString()}`;

function ExchangeOfferBubble({ offer }: { offer: ExchangeOffer }) {
  const router = useRouter();
  const gettingValue = useMemo(() => offer.getting.reduce((sum, c) => sum + c.value, 0), [offer]);
  const givingValue = useMemo(() => offer.giving.reduce((sum, c) => sum + c.value, 0), [offer]);

  return (
    <button
      type="button"
      onClick={() => router.push(`/exchange/${offer.id}`)}
      className="w-full text-left rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 active:scale-[0.99] transition-transform"
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400">交換小卡</div>
          <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            {offer.createdAt}
          </div>
        </div>

        <div className="relative grid grid-cols-2 gap-10">
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <ArrowLeftRight className="w-5 h-5 stroke-[2] text-neutral-500/70 dark:text-neutral-400/70" />
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400">我想要</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }).map((_, idx) => {
                const card = offer.getting[idx];
                return (
                  <div
                    key={idx}
                    className={cn(
                      'relative aspect-[5/7] rounded-lg overflow-hidden',
                      card ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-neutral-100/60 dark:bg-neutral-800/40'
                    )}
                  >
                    {card && (
                      <Image
                        src={card.image}
                        alt={card.name}
                        width={200}
                        height={280}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500">
              約價值 {formatTwd(gettingValue)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 text-right">我拿出</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }).map((_, idx) => {
                const card = offer.giving[idx];
                return (
                  <div
                    key={idx}
                    className={cn(
                      'relative aspect-[5/7] rounded-lg overflow-hidden',
                      card ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-neutral-100/60 dark:bg-neutral-800/40'
                    )}
                  >
                    {card && (
                      <Image
                        src={card.image}
                        alt={card.name}
                        width={200}
                        height={280}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500 text-right">
              約價值 {formatTwd(givingValue)}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function MessageThreadPage() {
  const params = useParams<{ id: string }>();
  const rawId = String(params?.id || '');
  const split = rawId.split('--');
  const left = split[0] || '';
  const isSellThread = left.startsWith('sell:');
  const listingId = isSellThread ? left.replace(/^sell:/, '') : '';
  const offerId = isSellThread ? '' : left;
  const otherFromUrl = split[1] || '';
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [offer, setOffer] = useState<ExchangeOffer | null>(null);
  const [otherUserId, setOtherUserId] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string>('');
  const [threads, setThreads] = useState<
    Array<{
      otherId: string;
      name: string;
      avatar: string;
      lastText: string;
      lastAt: number;
      orderState: string;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isAuthLoading) return;
    if (user?.id) return;
    if (!rawId) return;
    router.replace(`/login?redirect=${encodeURIComponent(`/messages/${rawId}`)}`);
  }, [isAuthLoading, rawId, router, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof window === 'undefined') return;
      if (!rawId) return;
      if (!user?.id) return;
      if (!otherUserId) return;
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc('get_user_displays', { p_ids: [otherUserId] });
        if (error) throw error;
        const d = Array.isArray(data) ? data[0] : null;
        const name = String((d as any)?.name || 'user');
        const avatar = String((d as any)?.avatar_url || '/images/avatar.png');
        if (cancelled) return;
        sessionStorage.setItem(`messages:title:${rawId}`, `@${name}`);
        sessionStorage.setItem(`messages:avatar:${rawId}`, avatar);
      } catch {}
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [otherUserId, rawId, user?.id]);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      if (!otherUserId) return;
      try {
        const supabase = createClient();
        if (isSellThread) {
          if (!listingId) return;
          await supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('type', 'sell_message')
            .eq('is_read', false)
            .contains('meta', { listing_id: Number(listingId), sender_id: otherUserId });
        } else {
          if (!offerId) return;
          await supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('type', 'exchange_message')
            .eq('is_read', false)
            .contains('meta', { offer_id: offerId, sender_id: otherUserId });
        }
      } catch {}
    };
    run();
  }, [isSellThread, listingId, offerId, otherUserId, user?.id]);

  useEffect(() => {
    if (isSellThread) return;
    let cancelled = false;
    const run = async () => {
      if (!offerId) return;
      if (!user?.id) {
        setOffer(null);
        setMessages([]);
        setThreads([]);
        setOtherUserId('');
        setIsOwner(false);
        return;
      }
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('exchange_offers')
          .select(
            `
              id,
              owner_id,
              status,
              created_at,
              cards:exchange_offer_cards (
                side,
                external_id,
                name,
                series,
                image_url,
                value,
                position
              )
            `
          )
          .eq('id', offerId)
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) {
          if (!cancelled) {
            setOffer(null);
            setMessages([]);
          }
          return;
        }

        const ownerId = String((data as any).owner_id || '');
        const ownerMode = user.id === ownerId;
        if (!cancelled) setIsOwner(ownerMode);

        const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: [ownerId] });
        if (displayError) throw displayError;
        const display = Array.isArray(displays) ? displays[0] : null;
        const ownerName = String(display?.name || 'user');
        const ownerAvatar = String(display?.avatar_url || '/images/avatar.png');

        const cardRows = Array.isArray((data as any).cards) ? (data as any).cards : [];
        cardRows.sort((a: any, b: any) => (Number(a.position) || 0) - (Number(b.position) || 0));
        const toCard = (r: any): ExchangeCard => ({
          id: String(r.external_id || ''),
          name: String(r.name || ''),
          series: String(r.series || ''),
          image: String(r.image_url || ''),
          value: typeof r.value === 'number' ? r.value : Number(r.value || 0),
        });
        const getting = cardRows.filter((c: any) => c.side === 'want').map(toCard);
        const giving = cardRows.filter((c: any) => c.side === 'give').map(toCard);

        const createdAtRaw = String((data as any).created_at || '');
        const createdAt = createdAtRaw ? createdAtRaw.slice(0, 10) : '';
        const nextOffer: ExchangeOffer = {
          id: String((data as any).id),
          ownerId,
          user: { name: ownerName, avatar: ownerAvatar, trades: 0 },
          getting,
          giving,
          createdAt,
        };

        if (cancelled) return;
        setOffer(nextOffer);

        if (ownerMode) {
          if (otherFromUrl) {
            setOtherUserId(otherFromUrl);
          } else {
            setOtherUserId('');
            setMessages([]);
            knownIdsRef.current = new Set();

            const { data: rows, error: listError } = await supabase
              .from('exchange_messages')
              .select('id, kind, body, sender_id, receiver_id, created_at')
              .eq('offer_id', offerId)
              .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
              .order('created_at', { ascending: true });
            if (listError) throw listError;

            const map = new Map<string, { lastText: string; lastAt: number }>();
            for (const r of rows || []) {
              const senderId = String((r as any).sender_id || '');
              const receiverId = String((r as any).receiver_id || '');
              const otherId = senderId === user.id ? receiverId : senderId;
              if (!otherId || otherId === user.id) continue;
              const createdAt = Date.parse(String((r as any).created_at || '')) || Date.now();
              const kind = String((r as any).kind || 'text');
              const body = String((r as any).body || '');
              const text = kind === 'offer' ? '交換小卡' : body || (kind === 'system' ? '系統訊息' : '訊息');
              const prev = map.get(otherId);
              if (!prev || createdAt >= prev.lastAt) map.set(otherId, { lastText: text, lastAt: createdAt });
            }

            const otherIds = Array.from(map.keys());
            const displayById = new Map<string, { name: string; avatar: string }>();
            if (otherIds.length > 0) {
              const { data: ds, error: de } = await supabase.rpc('get_user_displays', { p_ids: otherIds });
              if (de) throw de;
              for (const d of Array.isArray(ds) ? ds : []) {
                const id = String((d as any).id || '');
                if (!id) continue;
                displayById.set(id, { name: String((d as any).name || 'user'), avatar: String((d as any).avatar_url || '/images/avatar.png') });
              }
            }

            const { data: orderRows } = await supabase
              .from('exchange_orders')
              .select('id, initiator_id, step, done, cancelled')
              .eq('offer_id', offerId)
              .order('created_at', { ascending: false });
            const orderStateByInitiator = new Map<string, string>();
            for (const o of orderRows || []) {
              const initiatorId = String((o as any).initiator_id || '');
              if (!initiatorId) continue;
              if (orderStateByInitiator.has(initiatorId)) continue;
              if ((o as any).cancelled) orderStateByInitiator.set(initiatorId, '已取消');
              else if ((o as any).done || Number((o as any).step) === 5) orderStateByInitiator.set(initiatorId, '已完成');
              else orderStateByInitiator.set(initiatorId, '進行中');
            }

            const list = otherIds
              .map((otherId) => {
                const last = map.get(otherId)!;
                const display = displayById.get(otherId) || { name: 'user', avatar: '/images/avatar.png' };
                const state = orderStateByInitiator.get(otherId) || '';
                return { otherId, name: display.name, avatar: display.avatar, lastText: last.lastText, lastAt: last.lastAt, orderState: state };
              })
              .sort((a, b) => b.lastAt - a.lastAt);

            setThreads(list);
          }
        } else {
          setOtherUserId(ownerId);
        }
      } catch (e) {
        console.error('Failed to load messages:', e);
        if (!cancelled) {
          setOffer(null);
          setOtherUserId('');
          setMessages([]);
          setThreads([]);
          setIsOwner(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isSellThread, offerId, otherFromUrl, showToast, user?.id]);

  useEffect(() => {
    if (!isSellThread) return;
    let cancelled = false;
    const run = async () => {
      if (!listingId) return;
      if (!user?.id) {
        setOtherUserId('');
        setMessages([]);
        setThreads([]);
        setIsOwner(false);
        setOffer(null);
        return;
      }
      if (!otherFromUrl) {
        setOtherUserId('');
        setMessages([]);
        return;
      }
      setIsLoading(true);
      try {
        const supabase = createClient();
        const listingKey = Number.isFinite(Number(listingId)) ? Number(listingId) : listingId;
        const { data: l, error: le } = await supabase
          .from('sell_listings')
          .select('id, seller_id, title')
          .eq('id', listingKey as any)
          .maybeSingle();
        if (le) throw le;
        if (!l?.id) {
          if (!cancelled) {
            setOtherUserId('');
            setMessages([]);
          }
          return;
        }
        const otherId = otherFromUrl;

        const { data: rows, error: msgError } = await supabase
          .from('sell_messages')
          .select('id, kind, body, sender_id, receiver_id, created_at')
          .eq('listing_id', listingKey as any)
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });
        if (msgError) throw msgError;

        const mapped: Message[] = (rows || []).map((r: any) => {
          const sender = String(r.sender_id || '') === user.id ? 'me' : 'them';
          const createdAt = Date.parse(String(r.created_at || '')) || Date.now();
          const id = String(r.id);
          const kind = String(r.kind || 'text');
          if (kind === 'system') return { id, type: 'system', createdAt, text: String(r.body || '') };
          return { id, type: 'text', sender, createdAt, text: String(r.body || '') };
        });

        if (cancelled) return;
        setOffer(null);
        setThreads([]);
        setIsOwner(false);
        setOtherUserId(otherId);
        knownIdsRef.current = new Set(mapped.map((m) => m.id));
        setMessages(mapped);
      } catch (e) {
        console.error('Failed to load sell thread:', e);
        if (!cancelled) {
          setOtherUserId('');
          setMessages([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isSellThread, listingId, otherFromUrl, user?.id]);

  useEffect(() => {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [messages]);

  useEffect(() => {
    if (isSellThread) return;
    let cancelled = false;
    const run = async () => {
      if (!offerId) return;
      if (!user?.id) return;
      if (!otherUserId) {
        setCurrentOrderId('');
        return;
      }
      try {
        const supabase = createClient();
        const initiatorId = isOwner ? otherUserId : user.id;
        const { data, error } = await supabase
          .from('exchange_orders')
          .select('id')
          .eq('offer_id', offerId)
          .eq('initiator_id', initiatorId)
          .eq('cancelled', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setCurrentOrderId(data?.id ? String((data as any).id) : '');
      } catch {
        if (!cancelled) setCurrentOrderId('');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isSellThread, isOwner, offerId, otherUserId, user?.id]);

  useEffect(() => {
    if (isSellThread) return;
    if (!offerId) return;
    if (!user?.id) return;
    if (!otherUserId) return;
    if (!offer) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`exchange-messages-${offerId}-${otherUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'exchange_messages', filter: `offer_id=eq.${offerId}` }, (payload) => {
        const row: any = (payload as any).new;
        const senderId = String(row?.sender_id || '');
        const receiverId = String(row?.receiver_id || '');
        const isInThread =
          (senderId === user.id && receiverId === otherUserId) || (senderId === otherUserId && receiverId === user.id);
        if (!isInThread) return;
        const id = String(row?.id || '');
        if (!id || knownIdsRef.current.has(id)) return;
        knownIdsRef.current.add(id);
        const sender = senderId === user.id ? 'me' : 'them';
        const createdAt = Date.parse(String(row?.created_at || '')) || Date.now();
        const kind = String(row?.kind || 'text');
        if (kind === 'offer') {
          setMessages((prev) => [...prev, { id, type: 'offer', sender, createdAt, offer }]);
          return;
        }
        if (kind === 'system') {
          setMessages((prev) => [...prev, { id, type: 'system', createdAt, text: String(row?.body || '') }]);
          return;
        }
        setMessages((prev) => [...prev, { id, type: 'text', sender, createdAt, text: String(row?.body || '') }]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSellThread, offer, offerId, otherUserId, user?.id]);

  useEffect(() => {
    if (isSellThread) return;
    let cancelled = false;
    const run = async () => {
      if (!offerId) return;
      if (!user?.id) return;
      if (!otherUserId) return;
      if (!offer) return;
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: rows, error: msgError } = await supabase
          .from('exchange_messages')
          .select('id, kind, body, sender_id, receiver_id, created_at')
          .eq('offer_id', offerId)
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });
        if (msgError) throw msgError;

        const mapped: Message[] = (rows || []).map((r: any) => {
          const sender = String(r.sender_id || '') === user.id ? 'me' : 'them';
          const createdAt = Date.parse(String(r.created_at || '')) || Date.now();
          const id = String(r.id);
          const kind = String(r.kind || 'text');
          if (kind === 'offer') return { id, type: 'offer', sender, createdAt, offer };
          if (kind === 'system') return { id, type: 'system', createdAt, text: String(r.body || '') };
          return { id, type: 'text', sender, createdAt, text: String(r.body || '') };
        });

        if (cancelled) return;
        knownIdsRef.current = new Set(mapped.map((m) => m.id));
        setMessages(mapped);

        if (!isOwner && typeof window !== 'undefined') {
          const key = `messages:autoSendOffer:${offerId}`;
          const shouldAutoSend = sessionStorage.getItem(key) === '1';
          if (shouldAutoSend) {
            sessionStorage.removeItem(key);
            const hasOffer = mapped.some((m) => m.type === 'offer' && (m as any).sender === 'me');
            if (!hasOffer) {
              const { data: inserted, error: insertError } = await supabase
                .from('exchange_messages')
                .insert({
                  offer_id: offerId,
                  order_id: currentOrderId || null,
                  sender_id: user.id,
                  receiver_id: otherUserId,
                  kind: 'offer',
                  body: offerId,
                })
                .select('id')
                .single();
              if (!insertError && inserted?.id) {
                const id = String(inserted.id);
                if (!knownIdsRef.current.has(id)) {
                  knownIdsRef.current.add(id);
                  setMessages((prev) => [...prev, { id, type: 'offer', sender: 'me', createdAt: Date.now(), offer }]);
                }
              }
              showToast('已送出交換小卡', 'plain');
            }
          }
        }
      } catch (e) {
        console.error('Failed to load thread:', e);
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isSellThread, isOwner, offer, offerId, otherUserId, showToast, user?.id]);

  useEffect(() => {
    if (!isSellThread) return;
    if (!listingId) return;
    if (!user?.id) return;
    if (!otherUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`sell-messages-${listingId}-${otherUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sell_messages', filter: `listing_id=eq.${listingId}` }, (payload) => {
        const row: any = (payload as any).new;
        const senderId = String(row?.sender_id || '');
        const receiverId = String(row?.receiver_id || '');
        const isInThread =
          (senderId === user.id && receiverId === otherUserId) || (senderId === otherUserId && receiverId === user.id);
        if (!isInThread) return;
        const id = String(row?.id || '');
        if (!id || knownIdsRef.current.has(id)) return;
        knownIdsRef.current.add(id);
        const sender = senderId === user.id ? 'me' : 'them';
        const createdAt = Date.parse(String(row?.created_at || '')) || Date.now();
        const kind = String(row?.kind || 'text');
        if (kind === 'system') {
          setMessages((prev) => [...prev, { id, type: 'system', createdAt, text: String(row?.body || '') }]);
          return;
        }
        setMessages((prev) => [...prev, { id, type: 'text', sender, createdAt, text: String(row?.body || '') }]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSellThread, listingId, otherUserId, user?.id]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (!user?.id) return;
    if (!otherUserId) return;
    try {
      const supabase = createClient();
      const { data, error } = isSellThread
        ? await supabase
            .from('sell_messages')
            .insert({
              listing_id: Number(listingId),
              sender_id: user.id,
              receiver_id: otherUserId,
              kind: 'text',
              body: text,
            })
            .select('id, created_at')
            .single()
        : await supabase
            .from('exchange_messages')
            .insert({
              offer_id: offerId,
              order_id: currentOrderId || null,
              sender_id: user.id,
              receiver_id: otherUserId,
              kind: 'text',
              body: text,
            })
            .select('id, created_at')
            .single();
      if (error) throw error;
      const id = String((data as any)?.id || '');
      if (id && !knownIdsRef.current.has(id)) {
        knownIdsRef.current.add(id);
        setMessages((prev) => [...prev, { id, type: 'text', sender: 'me', createdAt: Date.now(), text }]);
      }
      setInput('');
    } catch (e) {
      console.error('Failed to send message:', e);
      showToast('送出失敗', 'plain');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto px-2 sm:px-6 pt-2 pb-24">
        {!isSellThread && isOwner && !otherUserId && (
          <div className="pt-2 pb-2">
            {threads.length === 0 ? (
              <div className="py-6 text-center text-[12px] font-black text-neutral-400 dark:text-neutral-500">
                {isLoading ? '載入中' : '目前沒有私訊'}
              </div>
            ) : (
              <div className="space-y-2">
                {threads.map((t) => (
                  <button
                    key={t.otherId}
                    type="button"
                    onClick={() => {
                      if (!offerId) return;
                      router.push(`/messages/${offerId}--${t.otherId}`);
                    }}
                    className="w-full text-left bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 px-3 py-3 active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                        <Image src={t.avatar} alt={t.name} fill className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate">@{t.name}</div>
                          <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500">
                            {new Date(t.lastAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 truncate">{t.lastText}</div>
                          {t.orderState && (
                            <div className="shrink-0 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
                              {t.orderState}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!isSellThread && isOwner && otherUserId && (
          <div className="pb-1">
            <button
              type="button"
              onClick={() => router.push(`/messages/${offerId}`)}
              className="text-[12px] font-black text-neutral-500 dark:text-neutral-400"
            >
              返回對話列表
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="pt-2 text-center text-[12px] font-black text-neutral-400 dark:text-neutral-500">
            {isLoading ? '載入中' : '開始私訊吧'}
          </div>
        )}

        <div className="pt-2 pb-3 space-y-1.5">
          {messages.map((m) => {
            if (m.type === 'system') {
              return (
                <div key={m.id} className="py-1 text-center text-[12px] font-black text-neutral-400 dark:text-neutral-500">
                  {m.text}
                </div>
              );
            }
            const isMe = m.sender === 'me';
            if (m.type === 'offer') {
              return (
                <div key={m.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                  <div className={cn('w-[92%] sm:w-[520px]')}>
                    <ExchangeOfferBubble offer={m.offer} />
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-1.5 text-[14px] font-black break-words',
                    isMe
                      ? 'bg-primary text-white'
                      : 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white border border-neutral-100 dark:border-neutral-800'
                  )}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>
        <div ref={endRef} />
      </div>

      {!!otherUserId && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 z-40">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <div className="flex-1 h-9 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700/60 px-3 flex items-center">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={1}
                maxLength={1000}
                placeholder="輸入文字"
                className="w-full h-[24px] leading-[24px] resize-none bg-transparent text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!input.trim()) return;
                handleSend();
              }}
              className={cn(
                'h-9 w-9 rounded-xl grid place-items-center active:scale-[0.98] transition-transform focus:outline-none',
                input.trim() ? 'text-primary' : 'text-neutral-400'
              )}
              aria-label="送出"
            >
              <Send className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
