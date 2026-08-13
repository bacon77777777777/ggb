'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Settings, ChevronRight, Package, ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import MarketTabBar from '@/components/sell/MarketTabBar';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type View = 'listings' | 'orders';

type SellerListing = {
  id: number;
  title: string;
  price: number;
  status: string;
  reviewNote: string;
  created_at: string | null;
  image: string;
};

type SellerOrder = {
  id: number;
  created_at: string | null;
  step: number;
  cancelled: boolean;
  quantity: number;
  unit_price: number;
  item_index: number;
  listing: {
    id: number;
    title: string | null;
    images: string[] | null;
    items: any[] | null;
  } | null;
  buyer: { id: string; name: string; avatar: string };
};

const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function SellManagePage() {
  const router = useRouter();

  /*
   * 賣家儀表：等級、成交率、保證金鎖定金額。
   * 走 sell_my_dashboard RPC 一次拿完 —— 等級規則與保證金比例都在 DB，
   * 前台只負責顯示，不重算。
   */
  const [dash, setDash] = useState<{
    tier: { name: string; ratio: number; max_price: number };
    done_count: number;
    success_rate: number;
    locked_deposit: number;
    is_pro: boolean;
    tokens: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient().rpc('sell_my_dashboard');
      if (cancelled || !data || !(data as any).success) return;
      const d = data as any;
      setDash({
        tier: {
          name: String(d.tier?.name || '新手'),
          ratio: Number(d.tier?.ratio) || 100,
          max_price: Number(d.tier?.max_price) || 3000,
        },
        done_count: Number(d.done_count) || 0,
        success_rate: Number(d.success_rate) || 100,
        locked_deposit: Number(d.locked_deposit) || 0,
        is_pro: !!d.is_pro,
        tokens: Number(d.tokens) || 0,
      });
    })();
    return () => { cancelled = true; };
  }, []);
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const viewFromUrl = useMemo(() => {
    const raw = String(searchParams.get('tab') || '').trim();
    if (raw === 'orders') return 'orders';
    return 'listings';
  }, [searchParams]);

  const [view, setView] = useState<View>(viewFromUrl);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  useEffect(() => {
    setView(viewFromUrl);
  }, [viewFromUrl]);

  /**
   * 賣家自己的上架操作。改的是自己那列（RLS 擋別人的），
   * 狀態轉換的合法性由 DB trigger 把關：上架中→下架、已下架→重新送審，其餘擋掉。
   */
  const setListingStatus = async (id: number, status: 'removed' | 'pending', doneMsg: string) => {
    try {
      const { error } = await createClient()
        .from('sell_listings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('seller_id', String(user?.id || ''));
      if (error) throw error;
      setListings((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
      showToast(doneMsg, 'plain');
    } catch (e: any) {
      console.error('Update listing status failed:', e);
      const msg = String(e?.message || '');
      showToast(/[\u4e00-\u9fff]/.test(msg) ? msg : '操作失敗', 'plain');
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) router.replace('/login?redirect=%2Fsell%2Fmanage');
  }, [isLoading, router, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) return;
      setIsLoadingData(true);
      try {
        const supabase = createClient();
        const [{ data: listingRows, error: listingError }, { data: orderRows, error: orderError }] = await Promise.all([
          supabase
            .from('sell_listings')
            .select('id, title, price, status, review_note, created_at, images, items')
            .eq('seller_id', user.id)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('sell_orders')
            .select(
              `
                id,
                created_at,
                step,
                cancelled,
                quantity,
                unit_price,
                item_index,
                buyer_id,
                sell_listings ( id, title, images, items )
              `
            )
            .eq('seller_id', user.id)
            .order('created_at', { ascending: false })
            .limit(200),
        ]);

        if (listingError) throw listingError;
        if (orderError) throw orderError;

        const mappedListings: SellerListing[] = (Array.isArray(listingRows) ? listingRows : []).map((r: any) => {
          const rawImages = r?.images ?? null;
          const images = Array.isArray(rawImages) ? rawImages.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
          const rawItems = r?.items ?? [];
          const items = Array.isArray(rawItems) ? rawItems : [];
          const firstItemImage = String(items[0]?.image || '').trim();
          const image = images[0] || firstItemImage || '/images/item_defaulet.webp';
          return {
            id: toNum(r?.id),
            title: String(r?.title || '').trim() || (String(items[0]?.name || '').trim() || '商城商品'),
            price: toNum(r?.price),
            status: String(r?.status || 'pending'),
            reviewNote: String(r?.review_note || ''),
            created_at: r?.created_at ? String(r.created_at) : null,
            image,
          };
        });

        const list = Array.isArray(orderRows) ? orderRows : [];
        const buyerIds = Array.from(new Set(list.map((r: any) => String(r?.buyer_id || '')).filter(Boolean)));
        const displayById = new Map<string, { name: string; avatar_url: string }>();
        if (buyerIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: buyerIds });
          if (!displayError) {
            for (const d of Array.isArray(displays) ? displays : []) {
              const id = String((d as any)?.id || '');
              if (!id) continue;
              displayById.set(id, { name: String((d as any)?.name || 'user'), avatar_url: String((d as any)?.avatar_url || '/images/avatar.webp') });
            }
          }
        }

        const mappedOrders: SellerOrder[] = list.map((r: any) => {
          const buyerId = String(r?.buyer_id || '');
          const display = displayById.get(buyerId) || { name: 'user', avatar_url: '/images/avatar.webp' };
          const listing = r?.sell_listings || null;
          return {
            id: toNum(r?.id),
            created_at: r?.created_at ? String(r.created_at) : null,
            step: toNum(r?.step),
            cancelled: Boolean(r?.cancelled),
            quantity: Math.max(1, toNum(r?.quantity) || 1),
            unit_price: Math.max(0, toNum(r?.unit_price)),
            item_index: toNum(r?.item_index),
            listing: listing
              ? {
                  id: toNum(listing?.id),
                  title: listing?.title ? String(listing.title) : null,
                  images: Array.isArray(listing?.images) ? (listing.images as any[]).map((x) => String(x || '')).filter(Boolean) : null,
                  items: Array.isArray(listing?.items) ? listing.items : null,
                }
              : null,
            buyer: { id: buyerId, name: display.name, avatar: display.avatar_url },
          };
        });

        if (cancelled) return;
        setListings(mappedListings);
        setOrders(mappedOrders);
      } catch (e) {
        console.error('Failed to load sell manage:', e);
        if (!cancelled) {
          setListings([]);
          setOrders([]);
        }
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const orderCounts = useMemo(() => {
    const base = orders.filter((o) => !o.cancelled);
    const toPay = base.filter((o) => o.step === 1).length;
    const toShip = base.filter((o) => o.step === 2 || o.step === 3).length;
    const toReceive = base.filter((o) => o.step === 4).length;
    const done = base.filter((o) => o.step >= 5).length;
    return { toPay, toShip, toReceive, done };
  }, [orders]);

  const setNextView = (next: View) => {
    setView(next);
    const qs = new URLSearchParams(searchParams.toString());
    if (next === 'orders') qs.set('tab', 'orders');
    else qs.set('tab', 'listings');
    router.replace(`/sell/manage?${qs.toString()}`);
  };

  const formatDate = (raw: string | null) => (raw ? raw.slice(0, 10) : '');

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-[calc(64px+env(safe-area-inset-bottom))] pt-14">
      <div className="max-w-7xl mx-auto px-2">
        {dash && (
          <div className="mb-3 rounded-2xl bg-gradient-to-r from-primary to-primary-dark text-white p-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-black">
                {dash.tier.name}賣家
              </span>
              {dash.is_pro && (
                <span className="px-2 py-0.5 rounded-full bg-amber-300 text-amber-900 text-[11px] font-black">
                  官方認證商家
                </span>
              )}
              <span className="ml-auto text-[11.5px] font-black text-white/80">
                保證金 售價 {dash.tier.ratio}%
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ['完成單數', dash.done_count.toLocaleString('zh-TW')],
                ['成交率', `${dash.success_rate}%`],
                ['保證金鎖定', `${dash.locked_deposit.toLocaleString('zh-TW')}G`],
                ['單件上限', dash.tier.max_price.toLocaleString('zh-TW')],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-[15px] font-black">{val}</div>
                  <div className="text-[10.5px] font-black text-white/70">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => router.push('/sell/new')}
            className="h-10 px-3 rounded-2xl bg-primary text-white text-[13px] font-black flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" />
            上架
          </button>
          <button
            type="button"
            onClick={() => router.push('/sell/settings')}
            className="h-10 px-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 text-[13px] font-black text-neutral-700 dark:text-neutral-200 flex items-center gap-2 active:scale-95 transition-transform"
          >
            <Settings className="w-4 h-4" />
            收款設定
          </button>
          <button
            type="button"
            onClick={() => router.push('/sell/ads')}
            className="h-10 px-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 text-[13px] font-black text-neutral-700 dark:text-neutral-200 flex items-center gap-2 active:scale-95 transition-transform"
          >
            廣告中心
          </button>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() => setNextView('listings')}
              className={cn(
                'h-11 text-[13px] font-black border-b',
                view === 'listings' ? 'text-primary border-primary' : 'text-neutral-500 dark:text-neutral-400 border-neutral-100 dark:border-neutral-800'
              )}
            >
              我的上架
            </button>
            <button
              type="button"
              onClick={() => setNextView('orders')}
              className={cn(
                'h-11 text-[13px] font-black border-b',
                view === 'orders' ? 'text-primary border-primary' : 'text-neutral-500 dark:text-neutral-400 border-neutral-100 dark:border-neutral-800'
              )}
            >
              訂單
            </button>
          </div>

          {view === 'orders' && (
            <div className="grid grid-cols-4 gap-2 px-3 py-3 border-b border-neutral-50 dark:border-neutral-800">
              {[
                { label: '待付款', value: orderCounts.toPay },
                { label: '待出貨', value: orderCounts.toShip },
                { label: '待收貨', value: orderCounts.toReceive },
                { label: '完成', value: orderCounts.done },
              ].map((it) => (
                <div key={it.label} className="rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 py-2 text-center">
                  <div className="text-[16px] font-black text-neutral-900 dark:text-white">{it.value}</div>
                  <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-300">{it.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {isLoadingData ? (
            <div className="py-10 text-center text-[13px] font-black text-neutral-400">載入中</div>
          ) : view === 'listings' ? (
            listings.length === 0 ? (
              <div className="py-10 text-center text-[13px] font-black text-neutral-400">目前沒有上架</div>
            ) : (
              listings.map((l) => (
                <div
                  key={l.id}
                  className="w-full bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden p-3"
                >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/sell/${l.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/sell/${l.id}`); }}
                  className="flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex-shrink-0">
                    <Image src={l.image} alt={l.title} fill className="object-cover" unoptimized />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">{l.title}</div>
                    <div className="mt-1 text-[12px] font-black text-neutral-400 truncate">
                      {formatDate(l.created_at)} ·{' '}
                      {l.status === 'pending' ? '審核中'
                        : l.status === 'active' ? '上架中'
                        : l.status === 'rejected' ? '已退回'
                        : l.status === 'sold' ? '已售出'
                        : '已下架'}
                      {/* 退回原因一定要看得到，不然賣家只會原封不動再送一次 */}
                      {l.status === 'rejected' && l.reviewNote && (
                        <span className="block mt-1 text-[11px] font-bold text-red-500 leading-relaxed">
                          退回原因：{l.reviewNote}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Image src="/images/gcoin.webp" alt="G Coin" width={16} height={16} className="w-4 h-4 object-contain" />
                      <div className="text-[16px] font-black text-accent-red font-amount">{Math.round(l.price).toLocaleString()}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                </div>

                {/* 狀態對應的操作。待審/已售出沒有可做的事，就不放按鈕 */}
                {(l.status === 'active' || l.status === 'rejected' || l.status === 'removed') && (
                  <div className="mt-2 pt-2 border-t border-neutral-50 dark:border-neutral-800 flex justify-end gap-2">
                    {l.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => setListingStatus(l.id, 'removed', '已下架')}
                        className="h-9 px-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[13px] font-black text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform"
                      >
                        下架
                      </button>
                    )}
                    {l.status === 'rejected' && (
                      <button
                        type="button"
                        onClick={() => router.push(`/sell/new?edit=${l.id}`)}
                        className="h-9 px-4 rounded-xl bg-primary text-[13px] font-black text-white active:scale-95 transition-transform"
                      >
                        修改後重新送審
                      </button>
                    )}
                    {l.status === 'removed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => router.push(`/sell/new?edit=${l.id}`)}
                          className="h-9 px-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[13px] font-black text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform"
                        >
                          修改
                        </button>
                        <button
                          type="button"
                          onClick={() => setListingStatus(l.id, 'pending', '已送出審核，通過後就會恢復上架')}
                          className="h-9 px-4 rounded-xl bg-primary text-[13px] font-black text-white active:scale-95 transition-transform"
                        >
                          重新上架
                        </button>
                      </>
                    )}
                  </div>
                )}
                </div>
              ))
            )
          ) : orders.length === 0 ? (
            <div className="py-10 text-center text-[13px] font-black text-neutral-400">目前沒有訂單</div>
          ) : (
            orders
              .filter((o) => !o.cancelled)
              .map((o) => {
                const listingTitle = String(o.listing?.title || '').trim();
                const items = Array.isArray(o.listing?.items) ? (o.listing?.items as any[]) : [];
                const optionName = String(items[o.item_index]?.name || '').trim();
                const img =
                  (Array.isArray(o.listing?.images) ? (o.listing?.images as string[])[0] : '') ||
                  String(items[o.item_index]?.image || '').trim() ||
                  '/images/item_defaulet.webp';
                const total = Math.max(0, o.unit_price) * Math.max(1, o.quantity);
                const subtitle = optionName ? optionName : listingTitle || '商城商品';
                const statusText = o.step === 1 ? '待付款' : o.step === 2 || o.step === 3 ? '待出貨' : o.step === 4 ? '待收貨' : '完成';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => router.push(`/sell-orders/${o.id}`)}
                    className="w-full bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden p-3 flex items-center gap-3 text-left"
                  >
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex-shrink-0">
                      <Image src={img} alt={subtitle} fill className="object-cover" unoptimized />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">{subtitle}</div>
                        <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-300 flex items-center gap-1.5 flex-shrink-0">
                          {statusText}
                          {view === 'orders' ? <Package className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                      <div className="mt-1 text-[12px] font-black text-neutral-400 truncate">
                        {formatDate(o.created_at)} · x{o.quantity} · {o.buyer.name}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Image src="/images/gcoin.webp" alt="G Coin" width={16} height={16} className="w-4 h-4 object-contain" />
                        <div className="text-[16px] font-black text-accent-red font-amount">{Math.round(total).toLocaleString()}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                  </button>
                );
              })
          )}
        </div>
      </div>
      <MarketTabBar active="me" />
      </div>
  );
}
