'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
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
  user: { name: string; avatar: string; trades: number };
  getting: ExchangeCard[];
  giving: ExchangeCard[];
  createdAt: string;
};

type SeriesOption = { id: string; name: string };

type LimitlessCardRow = {
  id: string;
  name: string;
  image: string;
  series: string;
};

const formatYmd = (ts: number) => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function NewExchangeOfferPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [mode, setMode] = useState<'getting' | 'giving'>('getting');
  const [gettingCards, setGettingCards] = useState<ExchangeCard[]>([]);
  const [givingCards, setGivingCards] = useState<ExchangeCard[]>([]);
  const [viewingCard, setViewingCard] = useState<ExchangeCard | null>(null);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [activeSeries, setActiveSeries] = useState<string>('');
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [cards, setCards] = useState<ExchangeCard[]>([]);
  const [total, setTotal] = useState(0);
  const [isCardsLoading, setIsCardsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);

  const makeValue = useMemo(() => {
    const digits = '0123456789';
    return (id: string) => {
      let h = 0;
      for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      const d1 = Number(digits[h % 10]);
      const d2 = Number(digits[(h >>> 4) % 10]);
      const d3 = Number(digits[(h >>> 8) % 10]);
      const base = d1 * 1000 + d2 * 100 + d3 * 10;
      return 200 + (base % 2800);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem('exchange:new:note') || '';
    if (raw) setNote(raw);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('exchange:new:note', note);
  }, [note]);

  useEffect(() => {
    const loadSeries = async () => {
      try {
        const res = await fetch('/api/limitless/jp-sets?limit=12', { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as { sets?: SeriesOption[] } | null;
        const rows = Array.isArray(json?.sets) ? json!.sets : [];
        setSeriesOptions(rows);
        setActiveSeries((prev) => prev || rows[0]?.id || '');
      } catch {
        setSeriesOptions([]);
      }
    };
    loadSeries();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => {
      if (window.scrollY > 10) setHasUserScrolled(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const fetchCardsPage = useCallback(
    async ({ offset, append }: { offset: number; append: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const q = query.trim();
      const setParam = activeSeries ? activeSeries : 'all';
      setIsCardsLoading(true);
      setLoadError(null);
      try {
        const url = new URL('/api/limitless/jp-cards', window.location.origin);
        url.searchParams.set('limit', '20');
        url.searchParams.set('offset', String(offset));
        if (q) url.searchParams.set('q', q);
        if (setParam) url.searchParams.set('set', setParam);
        const res = await fetch(url.toString(), { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as { total?: number; cards?: LimitlessCardRow[] } | null;
        const rows = Array.isArray(json?.cards) ? json!.cards : [];
        const mapped: ExchangeCard[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          series: r.series,
          image: r.image,
          value: makeValue(r.id),
        }));
        const nextTotal = typeof json?.total === 'number' ? json!.total : 0;
        setTotal(nextTotal);
        if (append) setCards((prev) => [...prev, ...mapped]);
        else setCards(mapped);
      } catch {
        setLoadError('無法載入卡牌');
        if (!append) setCards([]);
        setTotal(0);
      } finally {
        setIsCardsLoading(false);
        inFlightRef.current = false;
      }
    },
    [activeSeries, makeValue, query]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!query.trim() && !activeSeries) return;
    setHasUserScrolled(false);
    setCards([]);
    setTotal(0);
    fetchCardsPage({ offset: 0, append: false });
  }, [activeSeries, fetchCardsPage, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (!hasUserScrolled) return;
        if (isCardsLoading) return;
        if (cards.length >= total) return;
        fetchCardsPage({ offset: cards.length, append: true });
      },
      { root: null, rootMargin: '200px 0px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cards.length, fetchCardsPage, hasUserScrolled, isCardsLoading, total]);

  const togglePick = (card: ExchangeCard) => {
    const set = mode === 'getting' ? setGettingCards : setGivingCards;
    const current = mode === 'getting' ? gettingCards : givingCards;

    if (current.some((x) => x.id === card.id)) {
      set(current.filter((x) => x.id !== card.id));
      return;
    }

    if (current.length >= 4) {
      showToast('最多選 4 張', 'plain');
      return;
    }

    set([...current, card]);
  };

  const saveOffer = async () => {
    if (!user) return;
    if (gettingCards.length === 0 || givingCards.length === 0) {
      showToast('我想要 / 我拿出 各至少選 1 張', 'plain');
      return;
    }
    if (typeof window === 'undefined') return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { data: created, error } = await supabase
        .from('exchange_offers')
        .insert({
          owner_id: user.id,
          status: 'active',
          note: note.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error || !created?.id) {
        throw error || new Error('建立交換失敗');
      }

      const offerId = String(created.id);
      const cardRows = [
        ...gettingCards.map((c, idx) => ({
          offer_id: offerId,
          side: 'want' as const,
          external_id: c.id,
          name: c.name,
          series: c.series || null,
          image_url: c.image || null,
          value: typeof c.value === 'number' ? c.value : 0,
          position: idx,
        })),
        ...givingCards.map((c, idx) => ({
          offer_id: offerId,
          side: 'give' as const,
          external_id: c.id,
          name: c.name,
          series: c.series || null,
          image_url: c.image || null,
          value: typeof c.value === 'number' ? c.value : 0,
          position: idx,
        })),
      ];

      const { error: cardsError } = await supabase.from('exchange_offer_cards').insert(cardRows);
      if (cardsError) {
        throw cardsError;
      }

      sessionStorage.removeItem('exchange:new:note');

      showToast('已上架交換小卡', 'plain');
      router.replace(`/exchange/${offerId}`);
    } catch (e) {
      console.error('Failed to save exchange offer:', e);
      showToast('上架失敗', 'plain');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-[57px] md:pt-6">
        <div className="max-w-3xl mx-auto px-2 sm:px-6">
          <div className="py-24 text-center text-sm font-black text-neutral-400">載入中</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-[57px] md:pt-6">
        <div className="max-w-3xl mx-auto px-2 sm:px-6">
          <div className="py-16 text-center">
            <div className="text-base font-black text-neutral-900 dark:text-white mb-2">登入後才可上架</div>
            <div className="text-sm text-neutral-400 mb-6">先登入再來上架交換小卡</div>
            <Button
              variant="primary"
              size="lg"
              className="w-full h-[44px] text-base font-black rounded-xl shadow-xl transition-all active:scale-[0.95]"
              onClick={() => router.push('/login?redirect=%2Fexchange%2Fnew')}
            >
              前往登入
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isSelected = (cardId: string) => (mode === 'getting' ? gettingCards : givingCards).some((c) => c.id === cardId);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28 pt-3 md:pt-6">
      <div className="max-w-3xl mx-auto px-2 sm:px-6">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 px-4 py-4">
          <div>
            <div>
              <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-300 mb-2">簡易說明</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="商品狀況、寄出方式、注意事項"
                className={cn(
                  'w-full min-h-[96px] rounded-2xl bg-neutral-100 dark:bg-neutral-800 px-3 py-2.5',
                  'text-[13px] font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20'
                )}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('getting')}
                className={cn(
                  'h-9 px-3 rounded-xl text-[13px] font-black transition-colors',
                  mode === 'getting'
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                )}
              >
                我想要
              </button>
              <button
                type="button"
                onClick={() => setMode('giving')}
                className={cn(
                  'h-9 px-3 rounded-xl text-[13px] font-black transition-colors',
                  mode === 'giving'
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                )}
              >
                我拿出
              </button>
              <div className="ml-auto text-[11px] font-black text-neutral-400 uppercase tracking-widest">
                {mode === 'getting' ? `${gettingCards.length}/4` : `${givingCards.length}/4`}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, idx) => {
                const card = (mode === 'getting' ? gettingCards : givingCards)[idx];
                if (!card) {
                  return (
                    <div
                      key={idx}
                      className="relative aspect-[5/7] rounded-xl overflow-hidden bg-neutral-100/60 dark:bg-neutral-800/40"
                    />
                  );
                }
                return (
                  <div
                    key={idx}
                    onClick={() => setViewingCard(card)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setViewingCard(card);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="relative aspect-[5/7] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 active:scale-[0.99] transition-transform cursor-pointer"
                    aria-label={`預覽 ${card.name}`}
                  >
                    <Image src={card.image} alt={card.name} fill className="object-contain" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (mode === 'getting') setGettingCards((prev) => prev.filter((x) => x.id !== card.id));
                        else setGivingCards((prev) => prev.filter((x) => x.id !== card.id));
                      }}
                      className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white grid place-items-center active:scale-95 transition-transform"
                      aria-label="移除"
                    >
                      <X className="w-4 h-4 stroke-[2]" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 stroke-[2] text-neutral-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋卡牌"
                  className={cn(
                    'w-full h-10 pl-9 pr-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800',
                    'text-[13px] font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20'
                  )}
                />
              </div>

              <div className="mt-3 -mx-1 px-1 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSeries('')}
                    className={cn(
                      'shrink-0 h-8 px-3 rounded-full text-[12px] font-black transition-colors',
                      !activeSeries
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                    )}
                  >
                    全部
                  </button>
                  {seriesOptions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSeries(s.id)}
                      className={cn(
                        'shrink-0 h-8 px-3 rounded-full text-[12px] font-black transition-colors',
                        activeSeries === s.id
                          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                      )}
                    >
                      {s.id}
                    </button>
                  ))}
                </div>
              </div>

              {loadError && <div className="mt-3 text-[12px] font-black text-neutral-400">{loadError}</div>}

              <div className="mt-3 grid grid-cols-5 gap-2">
                {cards.map((card) => {
                  const selected = isSelected(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => togglePick(card)}
                      className={cn('text-left active:scale-[0.99] transition-transform')}
                      aria-label={card.name}
                    >
                      <div
                        className={cn(
                          'relative aspect-[5/7] rounded-xl overflow-hidden border',
                          selected
                            ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800'
                            : 'border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900'
                        )}
                      >
                        <Image src={card.image} alt={card.name} fill className="object-contain" />
                        <div className="absolute right-1 top-1">
                          {selected ? (
                            <div className="w-6 h-6 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 grid place-items-center">
                              <Check className="w-3.5 h-3.5 stroke-[2]" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-black/10 dark:bg-white/10 text-neutral-700 dark:text-white grid place-items-center">
                              <Plus className="w-3.5 h-3.5 stroke-[2]" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 px-0.5 h-8 flex items-center justify-center">
                        <div className="w-full text-center text-[11px] leading-[14px] font-black text-neutral-600 dark:text-neutral-300 line-clamp-2">
                          {card.name}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div ref={sentinelRef} className="h-1" />
              {!isCardsLoading && cards.length > 0 && cards.length < total && (
                <div className="mt-4 py-8 text-center text-[12px] font-black text-neutral-400">下滑載入更多</div>
              )}
              {!isCardsLoading && total > 0 && cards.length >= total && (
                <div className="mt-4 py-8 text-center text-[12px] font-black text-neutral-300">到底了</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {viewingCard && (
        <div
          className="fixed inset-0 z-[2200] bg-black/80 flex items-center justify-center"
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

      <div className="fixed left-0 right-0 bottom-0 z-40 bg-white/90 dark:bg-neutral-950/80 backdrop-blur border-t border-neutral-200/60 dark:border-neutral-800/60">
        <div className="max-w-3xl mx-auto px-2 sm:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button
            variant="primary"
            size="lg"
            className="w-full h-[44px] text-base font-black rounded-xl shadow-xl transition-all active:scale-[0.95]"
            onClick={saveOffer}
            disabled={isSaving}
          >
            {isSaving ? '上架中…' : '上架'}
          </Button>
        </div>
      </div>
    </div>
  );
}
