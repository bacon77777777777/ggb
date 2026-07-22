'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
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
  user: { name: string; avatar: string; trades: number };
  getting: ExchangeCard[];
  giving: ExchangeCard[];
  createdAt: string;
};

type ExchangeOrder = {
  id: string;
  offerId: string;
  title: string;
  avatar: string;
  createdAt: number;
  step: 1 | 2 | 3 | 4 | 5;
  done?: boolean;
  cancelled?: boolean;
  updatedAt: number;
};

export default function ExchangeManagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();

  const view = searchParams.get('view') === 'orders' ? 'orders' : 'offers';
  const rawStatus = view === 'orders' ? (searchParams.get('status') || 'ongoing') : '';
  const status = rawStatus === 'done' || rawStatus === 'all' ? rawStatus : 'ongoing';
  const offerIdFilter = view === 'orders' ? (searchParams.get('offerId') || '') : '';
  const rawOfferFilter = view === 'offers' ? (searchParams.get('filter') || '') : '';
  const offerFilter = rawOfferFilter === 'listed' || rawOfferFilter === 'ongoing' || rawOfferFilter === 'done' ? rawOfferFilter : 'listed';

  const [offers, setOffers] = useState<ExchangeOffer[]>([]);
  const [orders, setOrders] = useState<ExchangeOrder[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) {
        if (!cancelled) {
          setOffers([]);
          setOrders([]);
        }
        return;
      }
      setIsDataLoading(true);
      try {
        const supabase = createClient();

        const { data: offerRows, error: offersError } = await supabase
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
          .eq('owner_id', user.id)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false });

        if (offersError) throw offersError;

        const mappedOffers: ExchangeOffer[] = (offerRows || []).map((row: any) => {
          const cardRows = Array.isArray(row.cards) ? row.cards : [];
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
          const createdAtRaw = String(row.created_at || '');
          const createdAt = createdAtRaw ? createdAtRaw.slice(0, 10) : '';
          return {
            id: String(row.id),
            user: {
              name: user.name || user.email?.split('@')[0] || 'user',
              avatar: user.avatar_url || '/images/avatar.png',
              trades: 0,
            },
            getting,
            giving,
            createdAt,
          };
        });

        const { data: orderRows, error: ordersError } = await supabase
          .from('exchange_orders')
          .select('id, offer_id, owner_id, initiator_id, step, done, cancelled, created_at, updated_at')
          .or(`owner_id.eq.${user.id},initiator_id.eq.${user.id}`)
          .order('updated_at', { ascending: false });

        if (ordersError) throw ordersError;

        const otherIds = Array.from(
          new Set(
            (orderRows || [])
              .map((o: any) => (String(o.owner_id) === user.id ? String(o.initiator_id) : String(o.owner_id)))
              .filter((x) => !!x)
          )
        );

        const displayById = new Map<string, { name: string; avatar_url: string }>();
        if (otherIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: otherIds });
          if (displayError) throw displayError;
          for (const d of Array.isArray(displays) ? displays : []) {
            const id = String((d as any).id || '');
            if (!id) continue;
            displayById.set(id, { name: String((d as any).name || 'user'), avatar_url: String((d as any).avatar_url || '/images/avatar.png') });
          }
        }

        const mappedOrders: ExchangeOrder[] = (orderRows || []).map((row: any) => {
          const ownerId = String(row.owner_id || '');
          const initiatorId = String(row.initiator_id || '');
          const otherId = ownerId === user.id ? initiatorId : ownerId;
          const display = displayById.get(otherId) || { name: 'user', avatar_url: '/images/avatar.png' };
          const createdAt = Date.parse(String(row.created_at || '')) || Date.now();
          const updatedAt = Date.parse(String(row.updated_at || '')) || createdAt;
          const stepRaw = typeof row.step === 'number' ? row.step : Number(row.step || 1);
          const step = ([1, 2, 3, 4, 5].includes(stepRaw) ? stepRaw : 1) as 1 | 2 | 3 | 4 | 5;
          return {
            id: String(row.id),
            offerId: String(row.offer_id),
            title: `@${display.name}`,
            avatar: display.avatar_url,
            createdAt,
            updatedAt,
            step,
            done: !!row.done,
            cancelled: !!row.cancelled,
          };
        });

        if (cancelled) return;
        setOffers(mappedOffers);
        setOrders(mappedOrders);
      } catch (e) {
        console.error('Failed to load exchange manage data:', e);
        if (!cancelled) {
          setOffers([]);
          setOrders([]);
        }
      } finally {
        if (!cancelled) setIsDataLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user?.avatar_url, user?.email, user?.id, user?.name]);

  const ordersByOfferId = useMemo(() => {
    const map = new Map<string, ExchangeOrder[]>();
    for (const o of orders) {
      const list = map.get(o.offerId) || [];
      list.push(o);
      map.set(o.offerId, list);
    }
    return map;
  }, [orders]);

  const ordersScoped = useMemo(() => {
    const base = offerIdFilter ? orders.filter((o) => o.offerId === offerIdFilter) : orders;
    const ongoing = base.filter((o) => !o.cancelled && !(o.done || o.step >= 5));
    const done = base.filter((o) => o.cancelled || o.done || o.step >= 5);
    return { base, ongoing, done };
  }, [offerIdFilter, orders]);

  const filteredOrders = useMemo(() => {
    if (status === 'done') return ordersScoped.done;
    if (status === 'all') return ordersScoped.base;
    return ordersScoped.ongoing;
  }, [ordersScoped, status]);

  const setOrdersStatus = (next: string) => {
    const safe = next === 'done' || next === 'all' ? next : 'ongoing';
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'orders');
    params.set('status', safe);
    if (!offerIdFilter) params.delete('offerId');
    router.push(`/exchange/manage?${params.toString()}`, { scroll: false });
  };

  const openOfferOrders = (offerId: string) => {
    const params = new URLSearchParams();
    params.set('view', 'orders');
    params.set('status', 'ongoing');
    params.set('offerId', offerId);
    router.push(`/exchange/manage?${params.toString()}`);
  };

  const setOfferFilter = (next: string) => {
    const safe = next === 'listed' || next === 'ongoing' || next === 'done' ? next : 'listed';
    const params = new URLSearchParams(searchParams.toString());
    params.delete('status');
    params.delete('offerId');
    params.set('view', 'offers');
    params.set('filter', safe);
    router.push(`/exchange/manage?${params.toString()}`, { scroll: false });
  };

  const offerMeta = useMemo(() => {
    const meta = new Map<string, { ongoing: number; done: number; total: number }>();
    for (const offer of offers) {
      const list = ordersByOfferId.get(offer.id) || [];
      const ongoing = list.filter((o) => !o.cancelled && !(o.done || o.step >= 5)).length;
      const done = list.filter((o) => o.cancelled || o.done || o.step >= 5).length;
      meta.set(offer.id, { ongoing, done, total: list.length });
    }
    return meta;
  }, [offers, ordersByOfferId]);

  const offerCounts = useMemo(() => {
    let listed = 0;
    let ongoing = 0;
    let done = 0;
    for (const offer of offers) {
      const m = offerMeta.get(offer.id) || { ongoing: 0, done: 0, total: 0 };
      if (m.total === 0) listed += 1;
      else if (m.ongoing > 0) ongoing += 1;
      else if (m.done > 0) done += 1;
      else listed += 1;
    }
    return { listed, ongoing, done };
  }, [offerMeta, offers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (view !== 'offers') return;
    if (rawOfferFilter) return;
    const onlyOngoing = offerCounts.ongoing > 0 && offerCounts.done === 0 && offerCounts.listed === 0;
    const onlyDone = offerCounts.done > 0 && offerCounts.ongoing === 0 && offerCounts.listed === 0;
    if (onlyOngoing) {
      setOfferFilter('ongoing');
      return;
    }
    if (onlyDone) {
      setOfferFilter('done');
      return;
    }
    setOfferFilter('listed');
  }, [offerCounts, rawOfferFilter, view]);

  const filteredOffers = useMemo(() => {
    if (offerFilter === 'listed') return offers.filter((o) => (offerMeta.get(o.id)?.total || 0) === 0);
    if (offerFilter === 'ongoing') return offers.filter((o) => (offerMeta.get(o.id)?.ongoing || 0) > 0);
    if (offerFilter === 'done') return offers.filter((o) => (offerMeta.get(o.id)?.ongoing || 0) === 0 && (offerMeta.get(o.id)?.done || 0) > 0);
    return offers;
  }, [offerFilter, offerMeta, offers]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-0 md:pt-6">
        <div className="max-w-3xl mx-auto px-2 sm:px-6">
          <div className="py-24 text-center text-sm font-black text-neutral-400">載入中</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-0 md:pt-6">
        <div className="max-w-3xl mx-auto px-2 sm:px-6">
          <div className="py-16 text-center">
            <div className="text-base font-black text-neutral-900 dark:text-white mb-2">登入後才可管理</div>
            <div className="text-sm text-neutral-400 mb-6">先登入再來管理交換上架</div>
            <Button
              variant="primary"
              size="lg"
              className="w-full h-[44px] text-base font-black rounded-xl shadow-xl transition-all active:scale-[0.95]"
              onClick={() => router.push('/login?redirect=%2Fexchange%2Fmanage')}
            >
              前往登入
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="md:hidden fixed inset-0 z-[60] bg-neutral-50 dark:bg-neutral-950 flex flex-col h-[100dvh] overscroll-none">
        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (view === 'orders') {
                  router.push('/exchange/manage');
                } else {
                  router.push('/profile');
                }
              }}
              className="text-neutral-900 dark:text-white -ml-2 p-2"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-[18px] font-black text-neutral-900 dark:text-white">
              {view === 'orders' ? '交換紀錄' : '交換管理'}
            </span>
          </div>
          <div className="w-10" />
        </div>

        <div className="relative shrink-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 -mx-0">
          <div className="max-w-7xl mx-auto space-y-2 pt-0 pb-0">
            {view === 'orders' ? (
              <Tabs value={status} onValueChange={setOrdersStatus}>
                <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                  <TabsTrigger value="ongoing">進行中</TabsTrigger>
                  <TabsTrigger value="done">已完成</TabsTrigger>
                  <TabsTrigger value="all">全部</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <Tabs value={offerFilter} onValueChange={setOfferFilter}>
                <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                  <TabsTrigger value="listed">上架中({offerCounts.listed})</TabsTrigger>
                  <TabsTrigger value="ongoing">進行中({offerCounts.ongoing})</TabsTrigger>
                  <TabsTrigger value="done">已完成({offerCounts.done})</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-0 pb-24 bg-neutral-50 dark:bg-neutral-950">
          <div className="px-2 pt-2 space-y-2">
            {view === 'orders' ? (
              isDataLoading ? (
                <div className="py-20 text-center">
                  <div className="text-[13px] text-neutral-400 font-black">載入中</div>
                </div>
              ) : filteredOrders.length > 0 ? (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                  {filteredOrders.map((o) => {
                    const label = o.cancelled
                      ? '已取消'
                      : o.step === 1
                        ? '啟動'
                        : o.step === 2
                          ? '確認'
                          : o.step === 3
                            ? '寄出'
                            : o.step === 4
                              ? '收件'
                              : '完成';
                    const d = new Date(o.updatedAt || o.createdAt);
                    const time = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
                    const done = o.cancelled || o.done || o.step >= 5;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => router.push(`/exchange-orders/${o.id}`)}
                        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                      >
                        <div className="relative w-11 h-11 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                          <Image src={o.avatar || '/images/avatar.png'} alt={o.title} fill className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 text-[14px] font-black text-neutral-900 dark:text-white truncate">
                              {o.title}
                            </div>
                            <div className="shrink-0 text-[11px] font-black text-neutral-400 dark:text-neutral-500">{time}</div>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <div className="min-w-0 text-[12px] font-black text-neutral-500 dark:text-neutral-400 truncate">
                              進度：{label}
                            </div>
                            <div
                              className={cn(
                                'shrink-0 px-2 h-6 rounded-full text-[12px] font-black grid place-items-center border',
                                done ? 'bg-green-50 text-green-700 border-green-200' : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                              )}
                            >
                              {done ? '完成' : '進行中'}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <div className="text-[13px] text-neutral-400 font-black">目前沒有</div>
                </div>
              )
            ) : isDataLoading ? (
              <div className="py-20 text-center">
                <div className="text-[13px] text-neutral-400 font-black">載入中</div>
              </div>
            ) : filteredOffers.length > 0 ? (
              filteredOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden"
                >
                  <div
                    onClick={() => {
                      if (typeof window !== 'undefined') sessionStorage.setItem(`exchange:title:${offer.id}`, `@${offer.user.name}`);
                      router.push(`/exchange/${offer.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (typeof window !== 'undefined') sessionStorage.setItem(`exchange:title:${offer.id}`, `@${offer.user.name}`);
                        router.push(`/exchange/${offer.id}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left p-3 cursor-pointer active:scale-[0.99] transition-transform"
                  >
                    {(() => {
                      const m = offerMeta.get(offer.id) || { ongoing: 0, done: 0, total: 0 };
                      const ongoing = m.ongoing;
                      const done = m.done;
                      if (ongoing + done === 0) return null;
                      return (
                        <div className="flex justify-end mb-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openOfferOrders(offer.id);
                            }}
                            className="px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-black text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform"
                            aria-label="查看交換訂單"
                          >
                            訂單 {ongoing > 0 ? `進行中 ${ongoing}` : `已完成 ${done}`}
                          </button>
                        </div>
                      );
                    })()}

                    <div className="relative grid grid-cols-2 gap-10">
                      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <RefreshCw className="w-7 h-7 text-neutral-500/80 dark:text-neutral-400/80 drop-shadow-sm" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
                          我想要
                        </div>
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
                                    height={200}
                                    className="w-full h-full object-contain"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
                          約價值 NT${Math.round(offer.getting.reduce((sum, c) => sum + c.value, 0)).toLocaleString()}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
                          我拿出
                        </div>
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
                                    height={200}
                                    className="w-full h-full object-contain"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
                          約價值 NT${Math.round(offer.giving.reduce((sum, c) => sum + c.value, 0)).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-20 text-center">
                <div className="text-[13px] text-neutral-400 font-black">目前沒有上架</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28 pt-6">
        <div className="max-w-3xl mx-auto px-2 sm:px-6">
          <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
            {view === 'orders' ? (
              <Tabs value={status} onValueChange={setOrdersStatus}>
                <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                  <TabsTrigger value="ongoing">進行中</TabsTrigger>
                  <TabsTrigger value="done">已完成</TabsTrigger>
                  <TabsTrigger value="all">全部</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <Tabs value={offerFilter} onValueChange={setOfferFilter}>
                <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                  <TabsTrigger value="listed">上架中({offerCounts.listed})</TabsTrigger>
                  <TabsTrigger value="ongoing">進行中({offerCounts.ongoing})</TabsTrigger>
                  <TabsTrigger value="done">已完成({offerCounts.done})</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {view === 'orders' ? (
              isDataLoading ? (
                <div className="py-20 text-center">
                  <div className="text-[13px] text-neutral-400 font-black">載入中</div>
                </div>
              ) : filteredOrders.length > 0 ? (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                  {filteredOrders.map((o) => {
                    const label = o.cancelled
                      ? '已取消'
                      : o.step === 1
                        ? '啟動'
                        : o.step === 2
                          ? '確認'
                          : o.step === 3
                            ? '寄出'
                            : o.step === 4
                              ? '收件'
                              : '完成';
                    const d = new Date(o.updatedAt || o.createdAt);
                    const time = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
                    const done = o.cancelled || o.done || o.step >= 5;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => router.push(`/exchange-orders/${o.id}`)}
                        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                      >
                        <div className="relative w-11 h-11 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                          <Image src={o.avatar || '/images/avatar.png'} alt={o.title} fill className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 text-[14px] font-black text-neutral-900 dark:text-white truncate">
                              {o.title}
                            </div>
                            <div className="shrink-0 text-[11px] font-black text-neutral-400 dark:text-neutral-500">{time}</div>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <div className="min-w-0 text-[12px] font-black text-neutral-500 dark:text-neutral-400 truncate">
                              進度：{label}
                            </div>
                            <div
                              className={cn(
                                'shrink-0 px-2 h-6 rounded-full text-[12px] font-black grid place-items-center border',
                                done ? 'bg-green-50 text-green-700 border-green-200' : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                              )}
                            >
                              {done ? '完成' : '進行中'}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <div className="text-[13px] text-neutral-400 font-black">目前沒有</div>
                </div>
              )
            ) : isDataLoading ? (
              <div className="py-20 text-center">
                <div className="text-[13px] text-neutral-400 font-black">載入中</div>
              </div>
            ) : filteredOffers.length > 0 ? (
              filteredOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden"
                >
                  <div
                    onClick={() => {
                      if (typeof window !== 'undefined') sessionStorage.setItem(`exchange:title:${offer.id}`, `@${offer.user.name}`);
                      router.push(`/exchange/${offer.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (typeof window !== 'undefined') sessionStorage.setItem(`exchange:title:${offer.id}`, `@${offer.user.name}`);
                        router.push(`/exchange/${offer.id}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left p-3 cursor-pointer active:scale-[0.99] transition-transform"
                  >
                    {(() => {
                      const m = offerMeta.get(offer.id) || { ongoing: 0, done: 0, total: 0 };
                      const ongoing = m.ongoing;
                      const done = m.done;
                      if (ongoing + done === 0) return null;
                      return (
                        <div className="flex justify-end mb-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openOfferOrders(offer.id);
                            }}
                            className="px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-black text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform"
                            aria-label="查看交換訂單"
                          >
                            訂單 {ongoing > 0 ? `進行中 ${ongoing}` : `已完成 ${done}`}
                          </button>
                        </div>
                      );
                    })()}

                    <div className="relative grid grid-cols-2 gap-10">
                      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <RefreshCw className="w-7 h-7 text-neutral-500/80 dark:text-neutral-400/80 drop-shadow-sm" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
                          我想要
                        </div>
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
                                    height={200}
                                    className="w-full h-full object-contain"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
                          約價值 NT${Math.round(offer.getting.reduce((sum, c) => sum + c.value, 0)).toLocaleString()}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
                          我拿出
                        </div>
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
                                    height={200}
                                    className="w-full h-full object-contain"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
                          約價值 NT${Math.round(offer.giving.reduce((sum, c) => sum + c.value, 0)).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-20 text-center">
                <div className="text-[13px] text-neutral-400 font-black">目前沒有上架</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push('/exchange/new')}
        className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 grid place-items-center active:scale-95 transition-transform"
        aria-label="上架交換小卡"
      >
        <Plus className="w-6 h-6 stroke-[2]" />
      </button>
    </>
  );
}
