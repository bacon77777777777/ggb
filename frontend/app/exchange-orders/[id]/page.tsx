'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

type ExchangeCard = { id: string; name: string; series: string; image: string; value: number };
type RoleKey = 'owner' | 'initiator';
type Confirmations = Record<2 | 3 | 4, Record<RoleKey, boolean>>;
type RecipientInfo = { name: string; address: string; phone: string };
type ReceiptEntry = { kind: 'image' | 'video'; url: string; name: string };

type ExchangeOrder = {
  id: string;
  offerId: string;
  ownerId: string;
  initiatorId: string;
  title: string;
  avatar: string;
  getting: ExchangeCard[];
  giving: ExchangeCard[];
  recipient: Record<RoleKey, RecipientInfo | null>;
  trackingNumbers: Record<RoleKey, string>;
  receipt: Record<RoleKey, { media: ReceiptEntry[]; note: string; action: 'none' | 'return' }>;
  ratings: Record<RoleKey, { stars: 1 | 2 | 3 | 4 | 5 | null; comment: string; submitted: boolean }>;
  createdAt: number;
  step: 2 | 3 | 4 | 5;
  confirmations: Confirmations;
  done: boolean;
  cancelled: boolean;
  updatedAt: number;
};

const normalizeConfirmations = (raw: any): Confirmations => {
  const base: Confirmations = {
    2: { owner: false, initiator: false },
    3: { owner: false, initiator: false },
    4: { owner: false, initiator: false },
  };

  if (!raw || typeof raw !== 'object') return base;
  for (const step of [2, 3, 4] as const) {
    const row = (raw as any)[step] || (raw as any)[String(step)];
    if (!row || typeof row !== 'object') continue;
    if (typeof row.owner === 'boolean') base[step].owner = row.owner;
    if (typeof row.initiator === 'boolean') base[step].initiator = row.initiator;
  }
  return base;
};

const normalizeRecipientInfo = (raw: any): RecipientInfo | null => {
  if (!raw || typeof raw !== 'object') return null;
  const name = String((raw as any).name || '');
  const address = String((raw as any).address || '');
  const phone = String((raw as any).phone || '');
  if (!name && !address && !phone) return null;
  return { name, address, phone };
};

const normalizeRecipient = (raw: any): ExchangeOrder['recipient'] => {
  const base: ExchangeOrder['recipient'] = { owner: null, initiator: null };
  if (!raw || typeof raw !== 'object') return base;
  if ((raw as any).owner || (raw as any).initiator) {
    base.owner = normalizeRecipientInfo((raw as any).owner);
    base.initiator = normalizeRecipientInfo((raw as any).initiator);
    return base;
  }
  return base;
};

const normalizeTrackingNumbers = (raw: any): ExchangeOrder['trackingNumbers'] => {
  const base: ExchangeOrder['trackingNumbers'] = { owner: '', initiator: '' };
  if (!raw || typeof raw !== 'object') return base;
  const owner = (raw as any).owner;
  const initiator = (raw as any).initiator;
  if (typeof owner === 'string') base.owner = owner;
  if (typeof initiator === 'string') base.initiator = initiator;
  return base;
};

const normalizeReceipt = (raw: any): ExchangeOrder['receipt'] => {
  const base: ExchangeOrder['receipt'] = {
    owner: { media: [], note: '', action: 'none' },
    initiator: { media: [], note: '', action: 'none' },
  };
  if (!raw || typeof raw !== 'object') return base;
  for (const role of ['owner', 'initiator'] as const) {
    const row = (raw as any)[role];
    if (!row || typeof row !== 'object') continue;
    const mediaRaw = Array.isArray(row.media) ? row.media : Array.isArray(row) ? row : [];
    const media: ReceiptEntry[] = (mediaRaw || [])
      .map((m: any) => ({
        kind: m?.kind === 'video' ? 'video' : 'image',
        url: String(m?.url || ''),
        name: String(m?.name || ''),
      }))
      .filter((m: any) => !!m.url);
    base[role].media = media;
    if (typeof row.note === 'string') base[role].note = row.note;
    if (row.action === 'return') base[role].action = 'return';
  }
  return base;
};

const normalizeRatings = (raw: any): ExchangeOrder['ratings'] => {
  const base: ExchangeOrder['ratings'] = {
    owner: { stars: null, comment: '', submitted: false },
    initiator: { stars: null, comment: '', submitted: false },
  };
  if (!raw || typeof raw !== 'object') return base;
  for (const role of ['owner', 'initiator'] as const) {
    const row = (raw as any)[role];
    if (!row || typeof row !== 'object') continue;
    const stars = Number(row.stars);
    if ([1, 2, 3, 4, 5].includes(stars)) base[role].stars = stars as 1 | 2 | 3 | 4 | 5;
    if (typeof row.comment === 'string') base[role].comment = row.comment;
    base[role].submitted = !!row.submitted;
  }
  return base;
};

const STEPS = [
  { id: 1, label: '啟動' },
  { id: 2, label: '確認' },
  { id: 3, label: '寄出' },
  { id: 4, label: '收件' },
  { id: 5, label: '完成' },
] as const;

function Stepper({ step }: { step: number }) {
  const safeStep = Math.min(Math.max(step, 2), 5);
  return (
    <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
      <div className="px-0 py-2.5">
        <div className="flex items-start justify-center">
          {STEPS.map((s, idx) => {
            const active = safeStep === s.id;
            const done = safeStep > s.id;
            const isLast = idx === STEPS.length - 1;
            return (
              <div key={s.id} className="flex items-start">
                <div className="flex flex-col items-center w-[52px]">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full border grid place-items-center text-[12px] font-black',
                      done
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                        : active
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white dark:bg-neutral-900 text-neutral-400 border-neutral-200 dark:border-neutral-700'
                    )}
                  >
                    {s.id}
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-[12px] font-black leading-4',
                      done ? 'text-neutral-900 dark:text-white' : active ? 'text-primary' : 'text-neutral-400 dark:text-neutral-500'
                    )}
                  >
                    {s.label}
                  </div>
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      'w-5 h-[2px] mt-[12px]',
                      safeStep > s.id ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-100 dark:bg-neutral-800'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ExchangeOrderFlowPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const { user, isLoading } = useAuth();
  const [order, setOrder] = useState<ExchangeOrder | null>(null);
  const [tracking, setTracking] = useState('');
  const [receiptMedia, setReceiptMedia] = useState<ReceiptEntry[]>([]);
  const [receiptNote, setReceiptNote] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const autoAdvanceRef = useRef(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!id) return;
      if (!user?.id) {
        setOrder(null);
        return;
      }
      setIsFetching(true);
      try {
        const supabase = createClient();
        const { data: row, error } = await supabase
          .from('exchange_orders')
          .select(
            `
              id,
              offer_id,
              owner_id,
              initiator_id,
              step,
              confirmations,
              recipient,
              tracking_numbers,
              receipt_media,
              ratings,
              done,
              cancelled,
              created_at,
              updated_at
            `
          )
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!row?.id) {
          if (!cancelled) setOrder(null);
          return;
        }

        const offerId = String((row as any).offer_id || '');
        const ownerId = String((row as any).owner_id || '');
        const initiatorId = String((row as any).initiator_id || '');

        const { data: cardRows, error: cardsError } = await supabase
          .from('exchange_offer_cards')
          .select('side, external_id, name, series, image_url, value, position')
          .eq('offer_id', offerId)
          .order('position', { ascending: true });

        if (cardsError) throw cardsError;
        const toCard = (r: any): ExchangeCard => ({
          id: String(r.external_id || ''),
          name: String(r.name || ''),
          series: String(r.series || ''),
          image: String(r.image_url || ''),
          value: typeof r.value === 'number' ? r.value : Number(r.value || 0),
        });
        const getting = (cardRows || []).filter((c: any) => c.side === 'want').map(toCard);
        const giving = (cardRows || []).filter((c: any) => c.side === 'give').map(toCard);

        const otherId = ownerId === user.id ? initiatorId : ownerId;
        let title = '@user';
        let avatar = '/images/avatar.png';
        if (otherId) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: [otherId] });
          if (displayError) throw displayError;
          const d = Array.isArray(displays) ? displays[0] : null;
          title = `@${String(d?.name || 'user')}`;
          avatar = String(d?.avatar_url || '/images/avatar.png');
        }

        const createdAt = Date.parse(String((row as any).created_at || '')) || Date.now();
        const updatedAt = Date.parse(String((row as any).updated_at || '')) || createdAt;
        const stepRaw = typeof (row as any).step === 'number' ? (row as any).step : Number((row as any).step || 2);
        const step = ([2, 3, 4, 5].includes(stepRaw) ? stepRaw : 2) as 2 | 3 | 4 | 5;
        const confirmations = normalizeConfirmations((row as any).confirmations);

        const next: ExchangeOrder = {
          id: String((row as any).id),
          offerId,
          ownerId,
          initiatorId,
          title,
          avatar,
          getting,
          giving,
          recipient: normalizeRecipient((row as any).recipient),
          trackingNumbers: normalizeTrackingNumbers((row as any).tracking_numbers),
          receipt: normalizeReceipt((row as any).receipt_media),
          ratings: normalizeRatings((row as any).ratings),
          createdAt,
          step,
          confirmations,
          done: !!(row as any).done || step === 5,
          cancelled: !!(row as any).cancelled,
          updatedAt,
        };

        if (cancelled) return;
        setOrder(next);
      } catch (e) {
        console.error('Failed to load exchange order:', e);
        if (!cancelled) setOrder(null);
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [id, reloadSeq, user?.id]);

  useEffect(() => {
    if (!id) return;
    if (!user?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`exchange-order-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exchange_orders', filter: `id=eq.${id}` }, () => {
        setReloadSeq((v) => v + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user?.id]);

  useEffect(() => {
    const run = async () => {
      if (!order) return;
      if (order.done) return;
      if (![2, 3, 4].includes(order.step)) return;

      const current = order.step as 2 | 3 | 4;
      const c = order.confirmations[current];
      if (!c.owner || !c.initiator) return;
      if (autoAdvanceRef.current) return;
      autoAdvanceRef.current = true;

      try {
        const supabase = createClient();
        const nextStep = (current === 4 ? 5 : (current + 1)) as 3 | 4 | 5;
        const done = current === 4;
        const { error } = await supabase
          .from('exchange_orders')
          .update({ step: nextStep, done, updated_at: new Date().toISOString() })
          .eq('id', order.id);
        if (error) throw error;
      } catch (e) {
        console.error('Failed to auto-advance exchange order:', e);
      } finally {
        autoAdvanceRef.current = false;
      }
    };
    run();
  }, [order]);

  const step = order?.step || 2;

  const role = useMemo((): RoleKey | null => {
    if (!order || !user?.id) return null;
    if (user.id === order.ownerId) return 'owner';
    if (user.id === order.initiatorId) return 'initiator';
    return null;
  }, [order, user?.id]);

  const otherRole = useMemo((): RoleKey | null => {
    if (!role) return null;
    return role === 'owner' ? 'initiator' : 'owner';
  }, [role]);

  const isRecipientReady = useMemo(() => {
    if (!order || !role) return false;
    const r = order.recipient[role];
    return !!(r?.name && r.address && r.phone);
  }, [order, role]);

  useEffect(() => {
    if (!order) return;
    if (!role) return;
    const r = order.recipient[role];
    const fallbackName = String((user as any)?.recipient_name || '');
    const fallbackPhone = String((user as any)?.recipient_phone || '');
    const fallbackAddress = String((user as any)?.address || '');
    setRecipientName(r?.name || fallbackName);
    setRecipientPhone(r?.phone || fallbackPhone);
    setRecipientAddress(r?.address || fallbackAddress);
  }, [order?.id, role, user?.id]);

  useEffect(() => {
    if (!order) return;
    if (!role) return;
    setTracking(order.trackingNumbers[role] || '');
  }, [order?.id, order?.trackingNumbers?.initiator, order?.trackingNumbers?.owner, role]);

  useEffect(() => {
    if (!order) return;
    if (!role) return;
    setReceiptMedia(order.receipt[role]?.media || []);
    setReceiptNote(order.receipt[role]?.note || '');
  }, [order?.id, order?.receipt?.initiator?.note, order?.receipt?.owner?.note, order?.receipt?.initiator?.media?.length, order?.receipt?.owner?.media?.length, role]);

  const conf = useMemo(() => {
    if (!order || !role) return null;
    const confStep = (order.step === 5 ? 4 : order.step) as 2 | 3 | 4;
    const forStep = order.confirmations[confStep] || { owner: false, initiator: false };
    const me = !!forStep[role];
    const them = !!forStep[role === 'owner' ? 'initiator' : 'owner'];
    return { me, them };
  }, [order, role]);

  const isExpired = useMemo(() => {
    if (!order) return false;
    if (order.cancelled) return false;
    if (order.done) return false;
    const expiryMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - order.updatedAt > expiryMs;
  }, [order]);

  const theirStatus = useMemo(() => {
    if (!order) return null;
    if (isExpired) {
      return { text: '已逾時', tone: 'red' as const };
    }
    if (order.cancelled) {
      return { text: '已取消', tone: 'red' as const };
    }
    if (order.done) {
      return { text: '已完成', tone: 'green' as const };
    }
    if (!role) return { text: '對方未確認', tone: 'red' as const };
    const byStep = (s: 2 | 3 | 4) => {
      const row = order.confirmations[s];
      return role === 'owner' ? row.initiator : row.owner;
    };
    if (order.step === 2) {
      return byStep(2) ? { text: '對方已確認', tone: 'green' as const } : { text: '對方未確認', tone: 'red' as const };
    }
    if (order.step === 3) {
      return byStep(3) ? { text: '對方已寄出', tone: 'green' as const } : { text: '對方未寄出', tone: 'red' as const };
    }
    if (order.step === 4) {
      return byStep(4) ? { text: '對方已確認', tone: 'green' as const } : { text: '對方未確認', tone: 'red' as const };
    }
    return { text: '已完成', tone: 'green' as const };
  }, [isExpired, order, role]);

  const primary = useMemo(() => {
    if (!order) return null;
    if (isExpired) return null;
    if (order.cancelled) return null;
    if (order.done) return null;
    if (order.step === 2) return { label: conf?.me ? '等待對方確認' : '我已確認' };
    if (order.step === 3) return { label: conf?.me ? '等待對方確認' : '我已寄出' };
    return null;
  }, [conf?.me, isExpired, order]);

  const patchOrder = async (patch: Record<string, any>) => {
    if (!order) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('exchange_orders')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw error;
    } catch (e) {
      console.error('Failed to update exchange order:', e);
    }
  };

  const cancelOrder = async () => {
    if (!order) return;
    if (order.cancelled) return;
    if (order.done) return;
    setOrder({ ...order, cancelled: true, updatedAt: Date.now() });
    await patchOrder({ cancelled: true });
  };

  const saveRecipient = async () => {
    if (!order) return;
    if (!role) return;
    const trimmed: RecipientInfo = {
      name: recipientName.trim(),
      address: recipientAddress.trim(),
      phone: recipientPhone.trim(),
    };
    const nextRecipient = {
      ...order.recipient,
      [role]: trimmed.name && trimmed.address && trimmed.phone ? trimmed : null,
    } as ExchangeOrder['recipient'];
    setOrder({ ...order, recipient: nextRecipient, updatedAt: Date.now() });
    await patchOrder({ recipient: nextRecipient });
  };

  const updateMyConfirm = async () => {
    if (!order) return;
    if (!role) return;
    if (order.cancelled) return;
    if (order.done) return;
    if (order.step !== 2 && order.step !== 3) return;
    const current = order.step as 2 | 3;
    if (order.confirmations[current][role]) return;
    const trimmedRecipient: RecipientInfo = {
      name: recipientName.trim(),
      address: recipientAddress.trim(),
      phone: recipientPhone.trim(),
    };
    const nextRecipient =
      current === 2
        ? ({
            ...order.recipient,
            [role]: trimmedRecipient.name && trimmedRecipient.address && trimmedRecipient.phone ? trimmedRecipient : null,
          } as ExchangeOrder['recipient'])
        : order.recipient;
    if (current === 2 && !(trimmedRecipient.name && trimmedRecipient.address && trimmedRecipient.phone)) return;
    const next = {
      ...order.confirmations,
      [current]: { ...order.confirmations[current], [role]: true },
    } as Confirmations;
    setOrder({ ...order, recipient: nextRecipient, confirmations: next, updatedAt: Date.now() });
    await patchOrder({ recipient: nextRecipient, confirmations: next });
  };

  const updateReceipt = async (patch: Partial<{ media: ReceiptEntry[]; note: string; action: 'none' | 'return' }>) => {
    if (!order) return;
    if (!role) return;
    if (order.cancelled) return;
    const nextReceipt = {
      ...order.receipt,
      [role]: { ...order.receipt[role], ...patch },
    } as ExchangeOrder['receipt'];
    setOrder({ ...order, receipt: nextReceipt, updatedAt: Date.now() });
    if (patch.media) setReceiptMedia(patch.media);
    if (typeof patch.note === 'string') setReceiptNote(patch.note);
    await patchOrder({ receipt_media: nextReceipt });
  };

  const uploadReceiptFiles = async (files: File[]) => {
    if (!order) return;
    if (!role) return;
    if (files.length === 0) return;
    try {
      const supabase = createClient();
      const uploaded: ReceiptEntry[] = [];
      for (const f of files) {
        const safeName = String(f.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `exchange_orders/${order.id}/${role}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const { error } = await supabase.storage.from('exchange-receipts').upload(path, f, { upsert: false, contentType: f.type || undefined });
        if (error) continue;
        const { data } = supabase.storage.from('exchange-receipts').getPublicUrl(path);
        const url = String(data?.publicUrl || '');
        if (!url) continue;
        const kind: ReceiptEntry['kind'] = f.type.startsWith('video') ? 'video' : 'image';
        uploaded.push({ kind, url, name: String(f.name || 'file') });
      }
      if (uploaded.length === 0) return;
      const next = [...(order.receipt[role]?.media || []), ...uploaded];
      await updateReceipt({ media: next });
    } catch (e) {
      console.error('Failed to upload exchange receipts:', e);
    }
  };

  const removeReceiptEntry = async (entry: ReceiptEntry) => {
    if (!order) return;
    if (!role) return;
    if (order.cancelled) return;
    const current = order.receipt[role]?.media || [];
    const next = current.filter((m) => m.url !== entry.url);
    try {
      const marker = '/exchange-receipts/';
      const idx = entry.url.indexOf(marker);
      if (idx >= 0) {
        const path = entry.url.slice(idx + marker.length).split('?')[0];
        const supabase = createClient();
        await supabase.storage.from('exchange-receipts').remove([path]);
      }
    } catch {}
    await updateReceipt({ media: next });
  };

  const updateRating = async (patch: Partial<{ stars: 1 | 2 | 3 | 4 | 5 | null; comment: string }>) => {
    if (!order) return;
    if (!role) return;
    if (order.cancelled) return;
    const nextRatings = {
      ...order.ratings,
      [role]: { ...order.ratings[role], ...patch },
    } as ExchangeOrder['ratings'];
    setOrder({ ...order, ratings: nextRatings, updatedAt: Date.now() });
    await patchOrder({ ratings: nextRatings });
  };

  const submitRating = async () => {
    if (!order) return;
    if (!role) return;
    if (order.cancelled) return;
    if (!order.done) return;
    if (!order.ratings[role]?.stars) return;
    if (order.ratings[role]?.submitted) return;
    const nextRatings = {
      ...order.ratings,
      [role]: { ...order.ratings[role], submitted: true },
    } as ExchangeOrder['ratings'];
    setOrder({ ...order, ratings: nextRatings, updatedAt: Date.now() });
    await patchOrder({ ratings: nextRatings });
  };

  const confirmReceipt = async () => {
    if (!order) return;
    if (!role) return;
    if (order.cancelled) return;
    if (order.done) return;
    if (order.step !== 4) return;
    if (order.confirmations[4][role]) return;
    const next = { ...order.confirmations, 4: { ...order.confirmations[4], [role]: true } } as Confirmations;
    setOrder({ ...order, confirmations: next, updatedAt: Date.now() });
    await patchOrder({ confirmations: next });
  };

  if (isLoading || isFetching) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950">
        <div className="max-w-3xl mx-auto px-2 sm:px-6 py-24 text-center text-sm font-black text-neutral-400">
          載入中
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950">
        <div className="max-w-3xl mx-auto px-2 sm:px-6 py-24 text-center text-sm font-black text-neutral-400">
          登入後才可查看
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-24">
      <div className="max-w-3xl mx-auto px-2 sm:px-6">
        <div className="sticky top-[57px] z-40 -mx-2 sm:-mx-6 -mt-px">
          <Stepper step={step} />
        </div>

        <div className="pt-2 space-y-3">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                <Image src={order?.avatar || '/images/avatar.png'} alt={order?.title || ''} fill className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate">{order?.title || '找不到交換'}</div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'px-2.5 h-6 rounded-full text-[12px] font-black grid place-items-center border',
                    theirStatus?.tone === 'green'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  )}
                >
                  {theirStatus?.text || ''}
                </div>
                {order && !order.done && !order.cancelled && (
                  <button
                    type="button"
                    onClick={cancelOrder}
                    className="h-6 px-2 rounded-full text-[12px] font-black border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-300 active:scale-[0.98] transition-transform"
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          </div>

          {order && isExpired && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-2xl px-4 py-3 text-[13px] font-black">
              此交換已逾時，建議取消後重新啟動
            </div>
          )}

          {order && step === 2 && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400">你拿到</div>
                <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">
                  {(order.getting || []).reduce((sum, c) => sum + (c.value || 0), 0) ? `約 NT$${Math.round((order.getting || []).reduce((sum, c) => sum + (c.value || 0), 0)).toLocaleString()}` : ''}
                </div>
              </div>
              <div className="px-4 py-2 space-y-2">
                {(order.getting || []).length === 0 ? (
                  <div className="py-8 text-center text-[12px] font-black text-neutral-400 dark:text-neutral-500">尚未載入</div>
                ) : (
                  (order.getting || []).map((c) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="relative w-[44px] shrink-0 aspect-[5/7] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                        <Image src={c.image} alt={c.name} width={200} height={280} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate">{c.name}</div>
                        <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 truncate">{c.series}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400">你給出</div>
                <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">
                  {(order.giving || []).reduce((sum, c) => sum + (c.value || 0), 0) ? `約 NT$${Math.round((order.giving || []).reduce((sum, c) => sum + (c.value || 0), 0)).toLocaleString()}` : ''}
                </div>
              </div>
              <div className="px-4 py-2 space-y-2">
                {(order.giving || []).length === 0 ? (
                  <div className="py-8 text-center text-[12px] font-black text-neutral-400 dark:text-neutral-500">尚未載入</div>
                ) : (
                  (order.giving || []).map((c) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="relative w-[44px] shrink-0 aspect-[5/7] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                        <Image src={c.image} alt={c.name} width={200} height={280} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate">{c.name}</div>
                        <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 truncate">{c.series}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
                <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400 mb-2">我的收件資訊</div>
                <div className="space-y-2">
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    onBlur={saveRecipient}
                    placeholder="收件人"
                    className="w-full h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    onBlur={saveRecipient}
                    placeholder="收件地址"
                    className="w-full h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    onBlur={saveRecipient}
                    placeholder="收件電話"
                    className="w-full h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {!isRecipientReady && (
                    <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">填好收件資訊後才可按「我已確認」</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {order && step === 3 && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400">對方收件資訊</div>
              </div>
              <div className="px-4 py-2.5 space-y-2">
                {otherRole && (
                  <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">收件人</div>
                  <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">
                    {order.recipient[otherRole]?.name || '—'}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">收件地址</div>
                  <div className="text-[13px] font-black text-neutral-900 dark:text-white text-right truncate">
                    {order.recipient[otherRole]?.address || '—'}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">收件電話</div>
                  <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">
                    {order.recipient[otherRole]?.phone || '—'}
                  </div>
                </div>
                  </>
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-neutral-100 dark:border-neutral-800">
                <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 mb-2">物流編號</div>
                <input
                  value={tracking}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTracking(next);
                    if (!role) return;
                    setOrder({ ...order, trackingNumbers: { ...order.trackingNumbers, [role]: next }, updatedAt: Date.now() });
                  }}
                  onBlur={() => {
                    if (!role) return;
                    patchOrder({ tracking_numbers: { ...order.trackingNumbers, [role]: tracking.trim() } });
                  }}
                  placeholder="輸入物流編號"
                  className="w-full h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          {order && step === 4 && !order.done && !order.cancelled && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400">收件檢查</div>
              </div>
              <div className="px-4 py-3 space-y-3">
                <input
                  id="exchange-receipt-upload"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.currentTarget.value = '';
                    if (files.length === 0) return;
                    uploadReceiptFiles(files);
                  }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('exchange-receipt-upload')?.click()}
                  className="w-full h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[13px] font-black text-neutral-700 dark:text-neutral-200 active:scale-[0.98] transition-transform"
                >
                  上傳圖片/影片
                </button>

                {receiptMedia.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {receiptMedia.slice(0, 6).map((m, idx) => (
                      <div key={`${m.url}-${idx}`} className="relative aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                        {m.kind === 'image' ? (
                          <Image src={m.url} alt={m.name} fill className="object-cover" />
                        ) : (
                          <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                        )}
                        <button
                          type="button"
                          onClick={() => removeReceiptEntry(m)}
                          className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white text-[12px] font-black grid place-items-center active:scale-[0.98] transition-transform"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  value={receiptNote}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReceiptNote(next);
                    updateReceipt({ note: next });
                  }}
                  placeholder="備註"
                  rows={3}
                  className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>
            </div>
          )}

          {order && (step === 5 || order.done) && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400">給予評價</div>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center gap-1">
                  {([1, 2, 3, 4, 5] as const).map((n) => {
                    const active = ((role ? order.ratings[role]?.stars : 0) || 0) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => updateRating({ stars: n })}
                        disabled={!!(role && order.ratings[role]?.submitted)}
                        className={cn(
                          'w-9 h-9 rounded-xl grid place-items-center text-[20px] font-black active:scale-[0.98] transition-transform',
                          role && order.ratings[role]?.submitted && 'opacity-40 cursor-not-allowed active:scale-100',
                          active ? 'text-primary bg-neutral-100 dark:bg-neutral-800' : 'text-neutral-300 dark:text-neutral-700 bg-transparent'
                        )}
                        aria-label={`評分 ${n} 顆星`}
                      >
                        {active ? '★' : '☆'}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={(role ? order.ratings[role]?.comment : '') || ''}
                  onChange={(e) => updateRating({ comment: e.target.value })}
                  disabled={!!(role && order.ratings[role]?.submitted)}
                  placeholder="評語"
                  rows={3}
                  className={cn(
                    "w-full rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none",
                    role && order.ratings[role]?.submitted && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>
            </div>
          )}

          {!order && (
            <div className="py-12 text-center text-[13px] font-black text-neutral-400 dark:text-neutral-500">
              找不到交換訂單
            </div>
          )}
        </div>
      </div>

      {order && step === 4 && !order.done && !order.cancelled ? (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 z-50">
          <div className="max-w-3xl mx-auto grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => updateReceipt({ action: 'return' })}
              className="h-[44px] rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[14px] font-black text-neutral-700 dark:text-neutral-200 active:scale-[0.98] transition-transform"
            >
              退回
            </button>
            <button
              type="button"
              onClick={confirmReceipt}
              disabled={!!(role && order.confirmations[4][role])}
              className={cn(
                'col-span-2 h-[44px] rounded-xl text-[14px] font-black flex items-center justify-center active:scale-[0.98] transition-transform',
                role && order.confirmations[4][role]
                  ? 'bg-neutral-300 text-white dark:bg-neutral-700 dark:text-neutral-300'
                  : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
              )}
            >
              確認
            </button>
          </div>
        </div>
      ) : order && step === 5 && order.done ? (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 z-50">
          <div className="max-w-3xl mx-auto">
            <button
              type="button"
              onClick={submitRating}
              disabled={!role || !order.ratings[role]?.stars || !!order.ratings[role]?.submitted}
              className={cn(
                'w-full h-[44px] rounded-xl text-[14px] font-black flex items-center justify-center active:scale-[0.98] transition-transform',
                !role || !order.ratings[role]?.stars || order.ratings[role]?.submitted
                  ? 'bg-neutral-300 text-white dark:bg-neutral-700 dark:text-neutral-300'
                  : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
              )}
            >
              {role && order.ratings[role]?.submitted ? '已送出' : '送出'}
            </button>
          </div>
        </div>
      ) : (
        order && primary && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 z-50">
          <div className="max-w-3xl mx-auto">
            <button
              type="button"
              onClick={updateMyConfirm}
              disabled={!!conf?.me || (step === 2 && !isRecipientReady)}
              className={cn(
                'w-full h-[44px] rounded-xl text-[14px] font-black flex items-center justify-center active:scale-[0.98] transition-transform',
                conf?.me || (step === 2 && !isRecipientReady)
                  ? 'bg-neutral-300 text-white dark:bg-neutral-700 dark:text-neutral-300'
                  : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
              )}
            >
              {primary.label}
            </button>
          </div>
        </div>
        )
      )}
    </div>
  );
}
