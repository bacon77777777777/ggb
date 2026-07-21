'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
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

const formatTwd = (amount: number) => `NT$${Math.round(amount).toLocaleString()}`;
 

function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = Array.from({ length: 4 }).map((_, i) => value[i] || '');

  const setDigit = (index: number, nextDigit: string) => {
    const safe = nextDigit.replace(/\D/g, '').slice(0, 1);
    const next = digits.map((d, i) => (i === index ? safe : d)).join('');
    onChange(next);
    if (safe && index < 3) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text') || '';
    const only = text.replace(/\D/g, '').slice(0, 4);
    if (!only) return;
    e.preventDefault();
    onChange(only.padEnd(4, '').slice(0, 4));
    const nextIndex = Math.min(only.length, 3);
    refs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {digits.map((d, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          value={d}
          onPaste={handlePaste}
          onChange={(e) => setDigit(idx, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
              refs.current[idx - 1]?.focus();
            }
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          className={cn(
            'w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800',
            'text-center text-lg font-black font-amount text-neutral-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-primary/20'
          )}
        />
      ))}
    </div>
  );
}

export default function ExchangeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isActivateOpen, setIsActivateOpen] = useState(false);
  const [code, setCode] = useState('');
  const [viewingCard, setViewingCard] = useState<ExchangeCard | null>(null);
  const [note, setNote] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [activationCode, setActivationCode] = useState<string | null>(null);

  const [offer, setOffer] = useState<ExchangeOffer | null>(null);
  const [isOfferLoading, setIsOfferLoading] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!id) return;
      setIsOfferLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('exchange_offers')
          .select(
            `
              id,
              owner_id,
              status,
              note,
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
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!data?.id) {
          if (!cancelled) setOffer(null);
          return;
        }

        const ownerId = String((data as any).owner_id || '');
        const status = String((data as any).status || 'active');
        if (status !== 'active' && (!user?.id || user.id !== ownerId)) {
          if (!cancelled) setOffer(null);
          return;
        }

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

        const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: [ownerId] });
        if (displayError) throw displayError;
        const display = Array.isArray(displays) ? displays[0] : null;
        const ownerName = String(display?.name || 'user');
        const ownerAvatar = String(display?.avatar_url || '/images/avatar.png');

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
        setNote(String((data as any).note || '') || '商品狀況：全新未拆／保存良好，卡角無明顯傷。可超商寄出。');
      } catch (e) {
        console.error('Failed to load exchange offer:', e);
        if (!cancelled) setOffer(null);
      } finally {
        if (!cancelled) setIsOfferLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  const gettingValue = useMemo(() => offer?.getting.reduce((sum, c) => sum + c.value, 0) || 0, [offer]);
  const givingValue = useMemo(() => offer?.giving.reduce((sum, c) => sum + c.value, 0) || 0, [offer]);

  useEffect(() => {
    if (!offer) return;
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(`messages:title:${offer.id}`, `@${offer.user.name}`);
    sessionStorage.setItem(`messages:offer:${offer.id}`, JSON.stringify(offer));
    sessionStorage.setItem(`messages:avatar:${offer.id}`, offer.user.avatar);
  }, [offer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user || !offer) {
      setIsOwner(false);
      setActivationCode(null);
      return;
    }
    setIsOwner(user.id === offer.ownerId);
  }, [offer, user]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!offer?.id) return;
      if (!user?.id) return;
      if (user.id !== offer.ownerId) {
        setActivationCode(null);
        return;
      }
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc('get_exchange_offer_activation_code', { p_offer_id: offer.id });
        if (error) throw error;
        if (!cancelled) setActivationCode(typeof data === 'string' ? data : data ? String(data) : null);
      } catch (e) {
        console.error('Failed to load activation code:', e);
        if (!cancelled) setActivationCode(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [offer?.id, offer?.ownerId, user?.id]);

  const removeOffer = async () => {
    if (!offer) return;
    if (!user || user.id !== offer.ownerId) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('exchange_offers')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', offer.id);
      if (error) throw error;
      showToast('已刪除', 'plain');
      router.push('/');
    } catch (e) {
      console.error('Failed to delete exchange offer:', e);
      showToast('刪除失敗', 'plain');
    }
  };

  const createExchangeOrder = async (activationCodeInput: string) => {
    if (!offer) return null;
    if (!user) {
      showToast('請先登入', 'plain');
      router.push(`/login?redirect=${encodeURIComponent(`/exchange/${offer.id}`)}`);
      return null;
    }
    if (user.id === offer.ownerId) return null;
    if (isActivating) return null;

    setIsActivating(true);
    try {
      const supabase = createClient();
      const codeDigits = activationCodeInput.replace(/\D/g, '').slice(0, 4);
      const { data, error } = await supabase.rpc('create_exchange_order_with_code', { p_offer_id: offer.id, p_code: codeDigits });
      if (error) {
        const errCode = typeof (error as any)?.code === 'string' ? (error as any).code : '';
        const errMsg = typeof (error as any)?.message === 'string' ? (error as any).message : '';
        if (errMsg.includes('create_exchange_order_with_code') && errMsg.includes('does not exist')) {
          showToast('系統更新中，請稍後再試', 'plain');
          return null;
        }
        if (errCode === '22023' || errMsg.includes('invalid_code')) {
          showToast('4 位碼錯誤', 'plain');
          return null;
        }
        if (errCode === '23505' || errMsg.includes('offer_already_started')) {
          showToast('此交換已有人進行中', 'plain');
          return null;
        }
        throw error;
      }
      const orderId = typeof data === 'string' ? data : data ? String(data) : '';
      if (!orderId) throw new Error('建立交換訂單失敗');
      return orderId;
    } catch (e) {
      console.error('Failed to create exchange order:', e);
      showToast('啟動失敗', 'plain');
      return null;
    } finally {
      setIsActivating(false);
    }
  };

  if (isOfferLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-[57px] md:pt-6">
        <div className="max-w-3xl mx-auto px-4">
          <div className="py-24 text-center text-sm font-black text-neutral-400">載入中</div>
        </div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-[57px] md:pt-6">
        <div className="max-w-3xl mx-auto px-4">
          <div className="py-24 text-center text-sm font-black text-neutral-400">找不到交換</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-32 pt-3 md:pt-6">
      <div className="max-w-3xl mx-auto px-2 sm:px-6">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                <Image src={offer.user.avatar} alt={offer.user.name} fill className="object-cover" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black text-neutral-900 dark:text-white truncate">@{offer.user.name}</div>
                <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
                  {offer.user.trades} 次交換
                </div>
                {isOwner && activationCode && (
                  <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">
                    啟動碼 {activationCode}
                  </div>
                )}
              </div>
            </div>
            {isOwner ? (
              <button
                type="button"
                onClick={removeOffer}
                className="h-8 px-3 rounded-xl bg-accent-red text-white text-[12px] font-black active:scale-[0.98] transition-transform"
              >
                刪除
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!user?.id) {
                    showToast('請先登入', 'plain');
                    router.push(`/login?redirect=${encodeURIComponent(`/messages/${offer.id}`)}`);
                    return;
                  }
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem(`messages:autoSendOffer:${offer.id}`, '1');
                  }
                  router.push(`/messages/${offer.id}`);
                }}
                className="h-8 px-3 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[12px] font-black active:scale-[0.98] transition-transform"
              >
                問問
              </button>
            )}
          </div>
          <div className="mt-3">
            <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">簡易說明</div>
            <div className="mt-1 text-[13px] font-black text-neutral-900 dark:text-white break-words">{note || '—'}</div>
          </div>
        </div>

        <div className="mt-4 space-y-5">
          <section>
            <div className="flex items-end justify-between">
              <div className="text-[13px] font-black text-neutral-900 dark:text-white">你拿到</div>
              <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">約價值 {formatTwd(gettingValue)}</div>
            </div>
            <div className="mt-2 space-y-2">
              {offer.getting.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setViewingCard(card)}
                  className="w-full flex items-center gap-3 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 px-3 py-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="relative w-[54px] shrink-0 aspect-[5/7] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <Image src={card.image} alt={card.name} width={200} height={280} className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate">{card.name}</div>
                    <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 truncate">
                      {card.series}
                    </div>
                    <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">約價值 {formatTwd(card.value)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between">
              <div className="text-[13px] font-black text-neutral-900 dark:text-white">你給出</div>
              <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">約價值 {formatTwd(givingValue)}</div>
            </div>
            <div className="mt-2 space-y-2">
              {offer.giving.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setViewingCard(card)}
                  className="w-full flex items-center gap-3 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 px-3 py-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="relative w-[54px] shrink-0 aspect-[5/7] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <Image src={card.image} alt={card.name} width={200} height={280} className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-black text-neutral-900 dark:text-white truncate">{card.name}</div>
                    <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500 truncate">
                      {card.series}
                    </div>
                    <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">約價值 {formatTwd(card.value)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 h-auto min-h-16 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 flex items-center md:hidden z-50 shadow-modal">
        <div className="w-full pb-2">
          <Button
            onClick={() => {
              if (!user?.id) {
                showToast('請先登入', 'plain');
                router.push(`/login?redirect=${encodeURIComponent(`/exchange/${offer.id}`)}`);
                return;
              }
              setIsActivateOpen(true);
            }}
            size="lg"
            className="w-full h-[44px] text-base font-black rounded-xl shadow-xl transition-all active:scale-[0.95] flex items-center justify-center"
            variant="danger"
          >
            啟動交換
          </Button>
        </div>
      </div>

      {isActivateOpen && (
        <div
          className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center"
          onClick={() => setIsActivateOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl md:rounded-3xl border border-neutral-100 dark:border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3 flex items-center justify-between">
              <div className="text-base font-black text-neutral-900 dark:text-white">輸入 4 位碼</div>
              <button
                type="button"
                onClick={() => setIsActivateOpen(false)}
                className="p-2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-300 active:scale-95 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-5 space-y-4">
              <OtpInput value={code} onChange={setCode} />
              <Button
                variant="danger"
                size="lg"
                className="w-full h-[44px] text-base font-black rounded-xl shadow-xl transition-all active:scale-[0.95]"
                disabled={code.replace(/\D/g, '').length !== 4 || isActivating}
                onClick={async () => {
                  const orderId = await createExchangeOrder(code);
                  if (!orderId) return;
                  showToast('交換已啟動', 'plain');
                  setIsActivateOpen(false);
                  setCode('');
                  router.push(`/exchange-orders/${orderId}`);
                }}
              >
                確認啟動
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewingCard && (
        <div
          className="fixed inset-0 z-[2300] bg-black/80 flex items-center justify-center"
          onClick={() => setViewingCard(null)}
        >
          <div
            className="relative w-[80vw] max-w-sm max-h-[80vh] flex flex-col items-center justify-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-white text-base font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] text-center px-3">
              {viewingCard.name}
            </div>
            <Image
              src={viewingCard.image}
              alt={viewingCard.name}
              width={800}
              height={1120}
              className="max-w-full max-h-full object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
