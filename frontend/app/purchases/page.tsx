'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';

export const dynamic = 'force-dynamic';

type OrderFilter = 'to_pay' | 'to_ship' | 'to_receive' | 'review' | 'cancelled';

type PurchaseOrder = {
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
  seller: { id: string; name: string; avatar: string };
};

const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function PurchasesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();

  const filterFromUrl = useMemo(() => {
    const raw = String(searchParams.get('tab') || '').trim();
    if (raw === 'to_pay' || raw === 'to_ship' || raw === 'to_receive' || raw === 'review' || raw === 'cancelled') return raw;
    return 'to_pay';
  }, [searchParams]);

  const [activeFilter, setActiveFilter] = useState<OrderFilter>(filterFromUrl);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);

  useEffect(() => {
    setActiveFilter(filterFromUrl);
  }, [filterFromUrl]);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      router.replace('/login?redirect=%2Fpurchases');
      return;
    }
  }, [isLoading, router, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) return;
      setIsOrdersLoading(true);
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase
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
              seller_id,
              sell_listings ( id, title, images, items )
            `
          )
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;
        const list = Array.isArray(rows) ? rows : [];

        const sellerIds = Array.from(new Set(list.map((r: any) => String(r?.seller_id || '')).filter(Boolean)));
        const displayById = new Map<string, { name: string; avatar_url: string }>();
        if (sellerIds.length > 0) {
          const { data: displays, error: displayError } = await supabase.rpc('get_user_displays', { p_ids: sellerIds });
          if (!displayError) {
            for (const d of Array.isArray(displays) ? displays : []) {
              const id = String((d as any)?.id || '');
              if (!id) continue;
              displayById.set(id, { name: String((d as any)?.name || 'user'), avatar_url: String((d as any)?.avatar_url || '/images/avatar.png') });
            }
          }
        }

        const mapped: PurchaseOrder[] = list.map((r: any) => {
          const sellerId = String(r?.seller_id || '');
          const display = displayById.get(sellerId) || { name: 'user', avatar_url: '/images/avatar.png' };
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
            seller: { id: sellerId, name: display.name, avatar: display.avatar_url },
          };
        });

        if (cancelled) return;
        setOrders(mapped);
      } catch (e) {
        console.error('Failed to load purchases:', e);
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setIsOrdersLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const filteredOrders = useMemo(() => {
    const base = orders.filter((o) => !o.cancelled);
    if (activeFilter === 'to_pay') return base.filter((o) => o.step === 1);
    if (activeFilter === 'to_ship') return base.filter((o) => o.step === 2 || o.step === 3);
    if (activeFilter === 'to_receive') return base.filter((o) => o.step === 4);
    if (activeFilter === 'review') return base.filter((o) => o.step >= 5);
    if (activeFilter === 'cancelled') return orders.filter((o) => o.cancelled);
    return base;
  }, [activeFilter, orders]);

  const setFilter = (next: OrderFilter) => {
    setActiveFilter(next);
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('tab', next);
    const s = qs.toString();
    router.replace(s ? `/purchases?${s}` : '/purchases');
  };

  const formatDateTime = (raw: string | null) => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusConfig = (step: number, cancelled: boolean) => {
    if (cancelled) return { label: '未付款', className: 'text-neutral-600 bg-neutral-50 border-neutral-200' };
    if (step === 1) return { label: '待付款', className: 'text-amber-600 bg-amber-50 border-amber-100' };
    if (step === 2 || step === 3) return { label: '待出貨', className: 'text-blue-600 bg-blue-50 border-blue-100' };
    if (step === 4) return { label: '待收貨', className: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
    return { label: '完成', className: 'text-neutral-600 bg-neutral-50 border-neutral-200' };
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-24">
      <div className="sticky top-[57px] z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
        <div className="space-y-2 pt-0 pb-0 px-2">
          <Tabs value={activeFilter} onValueChange={(v) => setFilter(v as OrderFilter)} className="w-full">
            <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b-0 pb-0 overflow-x-auto no-scrollbar">
              {[
                { id: 'to_pay', label: '待付款' },
                { id: 'to_ship', label: '待出貨' },
                { id: 'to_receive', label: '待收貨' },
                { id: 'review', label: '評價' },
                { id: 'cancelled', label: '已取消' },
              ].map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="whitespace-nowrap">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="pt-0">
        <div>
          {isOrdersLoading ? (
            <div className="py-16 text-center text-[12px] font-black text-neutral-400">載入中</div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center text-[12px] font-black text-neutral-400">目前沒有訂單</div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 border-t border-b border-neutral-100 dark:border-neutral-800">
              {filteredOrders.map((o) => {
                const listingTitle = String(o.listing?.title || '').trim();
                const items = Array.isArray(o.listing?.items) ? (o.listing?.items as any[]) : [];
                const optionName = String(items[o.item_index]?.name || '').trim();
                const img =
                  (Array.isArray(o.listing?.images) ? (o.listing?.images as string[])[0] : '') ||
                  String(items[o.item_index]?.image || '').trim() ||
                  '/images/item.png';
                const total = Math.max(0, o.unit_price) * Math.max(1, o.quantity);
                const subtitle = optionName ? optionName : listingTitle || '販售商品';
                const status = getStatusConfig(o.step, o.cancelled);

                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => router.push(`/sell-orders/${o.id}`)}
                    className="w-full text-left bg-white dark:bg-neutral-900 active:bg-neutral-50 dark:active:bg-neutral-800/50 transition-colors"
                  >
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono">
                          #{o.id}
                        </span>
                        <div className="text-[11px] text-neutral-400 font-bold flex items-center gap-1">
                          {formatDateTime(o.created_at)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex-shrink-0">
                            <Image src={img} alt={subtitle} fill className="object-cover" unoptimized />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-[13px] font-black text-neutral-900 dark:text-white leading-tight tracking-tight line-clamp-2">
                              {subtitle}
                            </h4>
                            <div className="mt-0.5 text-[11px] text-neutral-400 font-bold truncate">
                              x{o.quantity} · {o.seller.name}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black border', status.className)}>
                          {status.label}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Image src="/images/gcoin.png" alt="G Coin" width={14} height={14} className="object-contain" />
                          <span className="text-[14px] font-black text-accent-red font-amount tracking-tighter">
                            {Math.round(total).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
