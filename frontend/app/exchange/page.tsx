'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export const dynamic = 'force-dynamic';

type ExchangeCard = {
  id: string;
  name: string;
  image: string;
  series?: string;
  value: number;
};

type ExchangeOffer = {
  id: string;
  user: { id: string; name: string; avatar: string; trades: number };
  getting: ExchangeCard[];
  giving: ExchangeCard[];
  createdAt: string;
};

type OfferCardRow = {
  side: 'want' | 'give';
  external_id: string | null;
  name: string | null;
  series: string | null;
  image_url: string | null;
  value: number | null;
  position: number | null;
};

type OfferRow = {
  id: string;
  owner_id: string;
  status: string;
  created_at: string;
  cards: OfferCardRow[] | null;
};

type UserDisplayRow = {
  id: string;
  name: string | null;
  avatar_url: string | null;
};

type SeriesOption = { id: string; name: string };

type SortMode = 'latest' | 'value-desc' | 'value-asc';

export default function ExchangeListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  useLayoutEffect(() => {
    if (window.innerWidth >= 768) router.replace('/');
  }, []);

  const cacheKey = 'exchange:listCache:v1';
  const searchQueryParam = searchParams.get('search') || '';
  const seedParam = searchParams.get('seed') || '';
  const [query, setQuery] = useState(searchQueryParam);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const lastAppliedSearchRef = useRef((searchQueryParam || '').trim());
  const latestQueryRef = useRef((searchQueryParam || '').trim());

  const [offers, setOffers] = useState<ExchangeOffer[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const emptyRetryRef = useRef(0);
  const seriesTabsRef = useRef<HTMLDivElement | null>(null);
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [activeSeries, setActiveSeries] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { offers?: ExchangeOffer[] } | null;
      const cachedOffers = Array.isArray(parsed?.offers) ? parsed!.offers! : [];
      if (cachedOffers.length > 0) {
        setOffers(cachedOffers);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/limitless/jp-sets?limit=12', { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as { sets?: SeriesOption[] } | null;
        const rows = Array.isArray(json?.sets) ? json!.sets : [];
        const normalized = rows
          .map((r) => ({ id: String((r as any)?.id || '').trim(), name: String((r as any)?.name || '').trim() }))
          .filter((r) => r.id);
        setSeriesOptions(normalized);
      } catch {
        setSeriesOptions([]);
      }
    };
    run();
  }, []);

  useEffect(() => {
    const el = seriesTabsRef.current;
    if (!el) return;
    const active = el.querySelector(`[data-series-id="${activeSeries}"]`) as HTMLElement | null;
    if (!active) return;
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeSeries]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => {
      setPage(0);
      setHasMore(true);
      setReloadKey((k) => k + 1);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const trimmedQ = query.trim();
    const currentSearch = (searchParams.get('search') || '').trim();
    if (trimmedQ === currentSearch) return;
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const nextQ = trimmedQ;
      if (!nextQ) params.delete('search');
      else params.set('search', nextQ);
      lastAppliedSearchRef.current = nextQ;
      const qs = params.toString();
      router.replace(qs ? `/exchange?${qs}` : '/exchange');
    }, 500);
    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, [query, router, searchParams]);

  useEffect(() => {
    const next = (searchQueryParam || '').trim();
    if (next === lastAppliedSearchRef.current) return;
    if (!next && query.trim() && lastAppliedSearchRef.current === query.trim()) return;
    lastAppliedSearchRef.current = next;
    setQuery(next);
  }, [searchQueryParam]);

  useEffect(() => {
    latestQueryRef.current = query.trim();
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (page === 0) setIsLoading(true);
      else setIsFetchingMore(true);
      try {
        const pageSize = 30;
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const supabase = createClient();

        const { data: rows, error } = await supabase
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
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        const offerRows = (Array.isArray(rows) ? rows : []) as unknown as OfferRow[];

        const ownerIds = Array.from(new Set(offerRows.map((r) => String(r.owner_id || '')).filter((x) => !!x)));
        const displayById = new Map<string, { name: string; avatar_url: string }>();
        if (ownerIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: ownerIds });
          if (!displayError) {
            const displayRows = (Array.isArray(displays) ? displays : []) as unknown as UserDisplayRow[];
            for (const d of displayRows) {
              const id = String(d.id || '');
              if (!id) continue;
              displayById.set(id, {
                name: String(d.name || 'user'),
                avatar_url: String(d.avatar_url || '/images/avatar.png'),
              });
            }
          }
        }

        const toCard = (r: OfferCardRow): ExchangeCard => ({
          id: String(r.external_id || ''),
          name: String(r.name || ''),
          image: String(r.image_url || ''),
          series: r.series ? String(r.series) : undefined,
          value: typeof r.value === 'number' ? r.value : Number(r.value || 0),
        });

        const mapped: ExchangeOffer[] = offerRows.map((row) => {
          const ownerId = String(row.owner_id || '');
          const display = displayById.get(ownerId) || { name: 'user', avatar_url: '/images/avatar.png' };
          const cardRows = Array.isArray(row.cards) ? row.cards : [];
          cardRows.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
          const getting = cardRows.filter((c) => c.side === 'want').map(toCard);
          const giving = cardRows.filter((c) => c.side === 'give').map(toCard);
          const createdAtRaw = String(row.created_at || '');
          const createdAt = createdAtRaw ? createdAtRaw.slice(0, 10) : '';
          return {
            id: String(row.id),
            user: { id: ownerId, name: display.name, avatar: display.avatar_url, trades: 0 },
            getting,
            giving,
            createdAt,
          };
        });

        if (cancelled) return;
        setOffers((prev) => {
          if (page === 0) return mapped;
          const existing = new Set(prev.map((o) => o.id));
          const next = [...prev];
          for (const o of mapped) {
            if (!existing.has(o.id)) next.push(o);
          }
          return next;
        });
        setHasMore(mapped.length >= pageSize);

        if (page === 0) {
          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify({ offers: mapped.slice(0, 30) }));
            } catch {
            }
          }
          const q = latestQueryRef.current;
          if (mapped.length > 0) {
            emptyRetryRef.current = 0;
          } else if (!q && emptyRetryRef.current < 3) {
            const retry = emptyRetryRef.current;
            emptyRetryRef.current += 1;
            const delayMs = retry === 0 ? 1500 : retry === 1 ? 3000 : 6000;
            window.setTimeout(() => {
              if (cancelled) return;
              setReloadKey((k) => k + 1);
            }, delayMs);
          }
        }
      } catch (e) {
        console.error('Failed to load exchange offers:', e);
        if (!cancelled && page === 0) setOffers([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsFetchingMore(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (seedParam !== '1') return;
    if (!user?.id) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('exchange:demoSeeded') === '1') return;

    const run = async () => {
      try {
        const supabase = createClient();
        const now = new Date().toISOString();
        const { data: inserted, error: insertOffersError } = await supabase
          .from('exchange_offers')
          .insert(
            Array.from({ length: 6 }).map((_, idx) => ({
              owner_id: user.id,
              status: 'active',
              note: `demo offer ${idx + 1}`,
              created_at: now,
              updated_at: now,
            }))
          )
          .select('id');

        if (insertOffersError) throw insertOffersError;

        const insertedRows = (Array.isArray(inserted) ? inserted : []) as unknown as Array<{ id: string }>;
        const offerIds = insertedRows.map((r) => String(r.id || '')).filter(Boolean);
        const makeValue = (id: string) => {
          const digits = '0123456789';
          let h = 0;
          for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
          const d1 = Number(digits[h % 10]);
          const d2 = Number(digits[(h >>> 4) % 10]);
          const d3 = Number(digits[(h >>> 8) % 10]);
          const base = d1 * 1000 + d2 * 100 + d3 * 10;
          return 200 + (base % 2800);
        };

        const cardsPool = await (async () => {
          const url = new URL('/api/limitless/jp-cards', window.location.origin);
          url.searchParams.set('set', 'M5');
          url.searchParams.set('limit', '50');
          url.searchParams.set('offset', '0');
          const res = await fetch(url.toString(), { cache: 'no-store' });
          const json = (await res.json().catch(() => null)) as { cards?: Array<{ id: string; name: string; image: string; series: string }> } | null;
          return Array.isArray(json?.cards) ? json!.cards : [];
        })();

        const fallback = [
          { id: 'demo:1', name: '示例卡 1', image: '/images/item/10017.jpg', series: 'JP' },
          { id: 'demo:2', name: '示例卡 2', image: '/images/item/10018.jpg', series: 'JP' },
          { id: 'demo:3', name: '示例卡 3', image: '/images/item/10019.jpg', series: 'JP' },
          { id: 'demo:4', name: '示例卡 4', image: '/images/item/10020.jpg', series: 'JP' },
        ];

        const pool = cardsPool.length >= 4 ? cardsPool : fallback;
        const pickCard = (offerIndex: number, offset: number) => pool[(offerIndex * 37 + offset * 11) % pool.length]!;

        const cardsPayload = offerIds.flatMap((offer_id, idx) => {
          const c1 = pickCard(idx, 0);
          const c2 = pickCard(idx, 1);
          const c3 = pickCard(idx, 2);
          const c4 = pickCard(idx, 3);
          return [
            { offer_id, side: 'want', external_id: c1.id, name: c1.name, series: c1.series || null, image_url: c1.image || null, value: makeValue(c1.id), position: 0 },
            { offer_id, side: 'want', external_id: c2.id, name: c2.name, series: c2.series || null, image_url: c2.image || null, value: makeValue(c2.id), position: 1 },
            { offer_id, side: 'give', external_id: c3.id, name: c3.name, series: c3.series || null, image_url: c3.image || null, value: makeValue(c3.id), position: 0 },
            { offer_id, side: 'give', external_id: c4.id, name: c4.name, series: c4.series || null, image_url: c4.image || null, value: makeValue(c4.id), position: 1 },
          ];
        });

        if (cardsPayload.length > 0) {
          const { error: insertCardsError } = await supabase.from('exchange_offer_cards').insert(cardsPayload);
          if (insertCardsError) throw insertCardsError;
        }

        sessionStorage.setItem('exchange:demoSeeded', '1');
        setPage(0);
        setHasMore(true);
        setReloadKey((k) => k + 1);
      } catch {
      }
    };

    run();
  }, [seedParam, user?.id]);

  useEffect(() => {
    if (!hasMore) return;
    if (isLoading || isFetchingMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setPage((p) => p + 1);
      },
      { rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, isFetchingMore, isLoading]);

  const formatTwd = (amount: number) => `NT$${Math.round(amount).toLocaleString()}`;

  const seriesTabs = useMemo(() => {
    const out = [{ id: 'all', label: '全部' }];
    const seen = new Set<string>();
    for (const s of seriesOptions) {
      const id = String(s.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, label: id });
    }
    return out.slice(0, 10);
  }, [seriesOptions]);

  const filteredOffers = useMemo(() => {
    let result = offers;
    if (activeSeries !== 'all') {
      result = result.filter((o) => {
        for (const c of [...o.getting, ...o.giving]) {
          if ((c.series || '').toLowerCase() === activeSeries.toLowerCase()) return true;
        }
        return false;
      });
    }
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((o) => {
      if (o.user.name.toLowerCase().includes(q)) return true;
      for (const c of [...o.getting, ...o.giving]) {
        if (c.name.toLowerCase().includes(q)) return true;
        if ((c.series || '').toLowerCase().includes(q)) return true;
      }
      return false;
      });
    }

    if (sortMode === 'latest') return result;
    const calcValue = (o: ExchangeOffer) => o.getting.reduce((sum, c) => sum + c.value, 0) + o.giving.reduce((sum, c) => sum + c.value, 0);
    const sorted = [...result].sort((a, b) => {
      const av = calcValue(a);
      const bv = calcValue(b);
      return sortMode === 'value-asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [activeSeries, offers, query, sortMode]);

  const handleSearchSubmit = (value?: string) => {
    const raw = (typeof value === 'string' ? value : query).trim();
    const params = new URLSearchParams(searchParams.toString());
    if (!raw) {
      setQuery('');
      params.delete('search');
      lastAppliedSearchRef.current = '';
      const qs = params.toString();
      router.replace(qs ? `/exchange?${qs}` : '/exchange');
      return;
    }
    setQuery(raw);
    params.set('search', raw);
    lastAppliedSearchRef.current = raw;
    const qs = params.toString();
    router.replace(qs ? `/exchange?${qs}` : '/exchange');
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24 transition-colors">
      <div className="fixed top-0 left-0 right-0 z-[100] bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 md:hidden">
        <div className="max-w-7xl mx-auto px-2 relative">
          <div className="flex items-center gap-3 h-[57px]">
            <span className="text-[18px] font-black text-neutral-900 dark:text-white">交換</span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchSubmit();
              }}
              className="flex-1 flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 stroke-[2.5]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋交換"
                  className="w-full h-10 bg-neutral-100 dark:bg-neutral-800 rounded-full pl-9 pr-8 text-base font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleSearchSubmit('');
                    inputRef.current?.blur();
                  }}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors",
                    query.trim() ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
              <button
                type="submit"
                className="px-3 h-9 rounded-full bg-primary text-white text-[12px] font-black whitespace-nowrap active:scale-95 transition-transform"
              >
                搜尋
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="fixed top-[57px] left-0 right-0 z-[90] bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 md:hidden">
        <div className="max-w-7xl mx-auto px-2 py-2 flex items-center gap-1.5">
          <div ref={seriesTabsRef} className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide">
            <div className="flex items-center gap-1.5">
              {seriesTabs.map((tab) => (
                <button
                  key={tab.id}
                  data-series-id={tab.id}
                  type="button"
                  onClick={() => setActiveSeries(tab.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors",
                    activeSeries === tab.id ? "bg-primary text-white" : "bg-neutral-100 text-neutral-600"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={cn(
                "ml-1 mr-1 p-1.5 rounded-full active:scale-95 transition-all",
                sortMode === 'latest' && !isFilterOpen ? "text-neutral-500 hover:text-primary hover:bg-primary/5" : "text-primary bg-primary/5"
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-4 h-4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16" />
                <path d="M6 12h12" />
                <path d="M10 20h4" />
              </svg>
            </button>
            {isFilterOpen && (
              <>
                <div className="fixed inset-0 z-[110]" onClick={() => setIsFilterOpen(false)} />
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-neutral-900 rounded-lg shadow-modal border border-neutral-100 dark:border-neutral-800 py-2 z-[120]">
                  {[
                    { id: 'latest' as const, label: '最新上架' },
                    { id: 'value-desc' as const, label: '價值：高到低' },
                    { id: 'value-asc' as const, label: '價值：低到高' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSortMode(opt.id);
                        setIsFilterOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-[13px] font-black transition-colors",
                        sortMode === opt.id ? "bg-primary/5 text-primary" : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pt-[105px] md:pt-6 max-w-7xl mx-auto px-2">
        <div className="hidden md:flex items-center gap-3 mb-4">
          <div className="text-[22px] font-black text-neutral-900 dark:text-white">交換</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchSubmit();
            }}
            className="flex-1 flex items-center gap-2"
          >
            <div className="relative flex-1 max-w-[520px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 stroke-[2.5]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋交換"
                className="w-full h-10 bg-white dark:bg-neutral-900 rounded-full pl-9 pr-8 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 border border-neutral-100 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <button
                type="button"
                onClick={() => handleSearchSubmit('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
            <button
              type="submit"
              className="px-4 h-10 rounded-full bg-primary text-white text-[12px] font-black whitespace-nowrap active:scale-95 transition-transform"
            >
              搜尋
            </button>
          </form>
        </div>

        <div className="hidden md:flex items-center gap-1.5 pb-2 mb-2">
          <div ref={seriesTabsRef} className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide">
            <div className="flex items-center gap-1.5">
              {seriesTabs.map((tab) => (
                <button
                  key={tab.id}
                  data-series-id={tab.id}
                  type="button"
                  onClick={() => setActiveSeries(tab.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors",
                    activeSeries === tab.id ? "bg-primary text-white" : "bg-neutral-100 text-neutral-600"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={cn(
                "ml-1 mr-1 p-1.5 rounded-full active:scale-95 transition-all",
                sortMode === 'latest' && !isFilterOpen ? "text-neutral-500 hover:text-primary hover:bg-primary/5" : "text-primary bg-primary/5"
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-4 h-4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16" />
                <path d="M6 12h12" />
                <path d="M10 20h4" />
              </svg>
            </button>
            {isFilterOpen && (
              <>
                <div className="fixed inset-0 z-[110]" onClick={() => setIsFilterOpen(false)} />
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-neutral-900 rounded-lg shadow-modal border border-neutral-100 dark:border-neutral-800 py-2 z-[120]">
                  {[
                    { id: 'latest' as const, label: '最新上架' },
                    { id: 'value-desc' as const, label: '價值：高到低' },
                    { id: 'value-asc' as const, label: '價值：低到高' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSortMode(opt.id);
                        setIsFilterOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-[13px] font-black transition-colors",
                        sortMode === opt.id ? "bg-primary/5 text-primary" : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
          {isLoading && offers.length === 0 ? (
            <div className="py-20 text-center text-[13px] font-black text-neutral-400">載入中</div>
          ) : filteredOffers.length > 0 ? (
            filteredOffers.map((offer) => (
              <button
                key={offer.id}
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem(`exchange:title:${offer.id}`, `@${offer.user.name}`);
                  }
                  router.push(`/exchange/${offer.id}`);
                }}
                className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden text-left active:scale-[0.99] transition-transform"
              >
                <div className="p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                        <Image src={offer.user.avatar} alt={offer.user.name} fill className="object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">@{offer.user.name}</div>
                      </div>
                    </div>
                    <div className="text-[11px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
                      {offer.createdAt}
                    </div>
                  </div>

                  <div className="relative grid grid-cols-2 gap-10">
                    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <RefreshCw className="w-7 h-7 text-neutral-500/80 dark:text-neutral-400/80 drop-shadow-sm" />
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">你拿到</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Array.from({ length: 4 }).map((_, idx) => {
                          const card = offer.getting[idx];
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "relative aspect-[5/7] rounded-lg overflow-hidden",
                                card ? "bg-neutral-100 dark:bg-neutral-800" : "bg-neutral-100/60 dark:bg-neutral-800/40"
                              )}
                            >
                              {card && (
                                <Image
                                  src={card.image}
                                  alt={card.name}
                                  width={200}
                                  height={200}
                                  className="w-full h-full object-contain"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
                        約價值 {formatTwd(offer.getting.reduce((sum, c) => sum + c.value, 0))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">你給出</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Array.from({ length: 4 }).map((_, idx) => {
                          const card = offer.giving[idx];
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "relative aspect-[5/7] rounded-lg overflow-hidden",
                                card ? "bg-neutral-100 dark:bg-neutral-800" : "bg-neutral-100/60 dark:bg-neutral-800/40"
                              )}
                            >
                              {card && (
                                <Image
                                  src={card.image}
                                  alt={card.name}
                                  width={200}
                                  height={200}
                                  className="w-full h-full object-contain"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
                        約價值 {formatTwd(offer.giving.reduce((sum, c) => sum + c.value, 0))}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="col-span-full py-20 text-center">
              <p className="text-[13px] text-neutral-400 font-bold">
                {query.trim() ? '找不到符合的交換' : '目前沒有交換'}
              </p>
            </div>
          )}
        </div>

        <div ref={sentinelRef} className="h-10" />
        {!isLoading && isFetchingMore && <div className="py-6 text-center text-[13px] font-black text-neutral-400">載入中</div>}
        {!isLoading && !isFetchingMore && !hasMore && offers.length > 0 && !query.trim() && filteredOffers.length > 0 && (
          <div className="py-6 text-center text-[13px] font-black text-neutral-400">到底了</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.push('/exchange/new')}
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 grid place-items-center active:scale-95 transition-transform"
        aria-label="上架交換小卡"
      >
        <Plus className="w-6 h-6 stroke-[2]" />
      </button>
    </div>
  );
}
