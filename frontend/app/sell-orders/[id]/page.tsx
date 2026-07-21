'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Order = {
  id: string;
  orderNumber: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  itemIndex: number;
  quantity: number;
  unitPrice: number;
  paymentMethod: 'transfer' | 'private' | 'escrow';
  step: number;
  cancelled: boolean;
  trackingNumber: string;
  paidAt: string;
  shippedAt: string;
  receivedAt: string;
  paymentProofUrls: string[];
  createdAt: string;
};

type Listing = {
  id: string;
  title: string;
  images: string[];
  items: Array<{ name: string; image: string; quantity: number }>;
};

type SellerProfile = {
  transfer_bank: string;
  transfer_account: string;
  transfer_name: string;
  private_trade_note: string;
};

export default function SellOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = String(params?.id || '');
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [sellerName, setSellerName] = useState<string>('user');
  const [sellerAvatar, setSellerAvatar] = useState<string>('/images/avatar.png');
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [trackingNumberDraft, setTrackingNumberDraft] = useState('');
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [escrowPayMethod, setEscrowPayMethod] = useState<'credit_card' | 'webatm' | 'vacc'>('credit_card');
  const [isPayMethodOpen, setIsPayMethodOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    action: string;
    fields: Record<string, string>;
  } | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (paymentData && formRef.current) {
      formRef.current.submit();
    }
  }, [paymentData]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (user?.id) return;
    if (!orderId) return;
    router.replace(`/login?redirect=${encodeURIComponent(`/sell-orders/${orderId}`)}`);
  }, [isAuthLoading, orderId, router, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orderId) return;
      if (!user?.id) return;
      setIsLoading(true);
      try {
        const supabase = createClient();
        const rawOrderId = Number.isFinite(Number(orderId)) ? Number(orderId) : orderId;
        const { data: o, error: orderError } = await supabase
          .from('sell_orders')
          .select(
            'id, order_number, listing_id, seller_id, buyer_id, item_index, quantity, unit_price, payment_method, step, cancelled, tracking_number, paid_at, shipped_at, received_at, payment_proof_urls, created_at'
          )
          .eq('id', rawOrderId as any)
          .maybeSingle();

        if (orderError) throw orderError;
        if (!o?.id) {
          if (!cancelled) setOrder(null);
          return;
        }

        const nextOrder: Order = {
          id: String((o as any).id),
          orderNumber: String((o as any).order_number || ''),
          listingId: String((o as any).listing_id),
          sellerId: String((o as any).seller_id),
          buyerId: String((o as any).buyer_id),
          itemIndex: Number((o as any).item_index || 0),
          quantity: Math.max(1, Math.round(Number((o as any).quantity) || 1)),
          unitPrice: Math.max(1, Math.round(Number((o as any).unit_price) || 1)),
          paymentMethod: (() => {
            const raw = String((o as any).payment_method || 'transfer');
            if (raw === 'private') return 'private';
            if (raw === 'escrow') return 'escrow';
            return 'transfer';
          })(),
          step: Math.max(1, Math.round(Number((o as any).step) || 1)),
          cancelled: Boolean((o as any).cancelled),
          trackingNumber: String((o as any).tracking_number || ''),
          paidAt: String((o as any).paid_at || ''),
          shippedAt: String((o as any).shipped_at || ''),
          receivedAt: String((o as any).received_at || ''),
          paymentProofUrls: Array.isArray((o as any).payment_proof_urls)
            ? (o as any).payment_proof_urls.map((x: any) => String(x || '').trim()).filter(Boolean)
            : [],
          createdAt: String((o as any).created_at || ''),
        };

        const { data: l, error: listingError } = await supabase
          .from('sell_listings')
          .select('id, title, images, items')
          .eq('id', Number.isFinite(Number(nextOrder.listingId)) ? Number(nextOrder.listingId) : nextOrder.listingId)
          .maybeSingle();
        if (listingError) throw listingError;

        const rawImages = (l as any)?.images ?? [];
        const images = Array.isArray(rawImages) ? rawImages.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
        const rawItems = (l as any)?.items ?? [];
        const items = Array.isArray(rawItems)
          ? rawItems.map((x: any) => ({
              name: String(x?.name || '').trim(),
              image: String(x?.image || '').trim(),
              quantity: Math.max(0, Math.round(Number(x?.quantity ?? 0) || 0)),
            }))
          : [];

        const nextListing: Listing = {
          id: String((l as any)?.id || ''),
          title: String((l as any)?.title || ''),
          images,
          items,
        };

        let displayName = 'user';
        let displayAvatar = '/images/avatar.png';
        if (nextOrder.sellerId) {
          const { data: displays } = await supabase.rpc('get_user_displays', { p_ids: [nextOrder.sellerId] });
          const d = Array.isArray(displays) ? (displays[0] as any) : null;
          displayName = String(d?.name || 'user');
          displayAvatar = String(d?.avatar_url || '/images/avatar.png');
        }

        const { data: p, error: profileError } = await supabase
          .from('sell_seller_profiles')
          .select('transfer_bank, transfer_account, transfer_name, private_trade_note')
          .eq('seller_id', nextOrder.sellerId)
          .maybeSingle();

        if (cancelled) return;
        setOrder(nextOrder);
        setListing(nextListing);
        setSellerName(displayName);
        setSellerAvatar(displayAvatar);
        setTrackingNumberDraft(String(nextOrder.trackingNumber || ''));
        setProofUrls(nextOrder.paymentProofUrls);
        setSellerProfile(
          p
            ? {
                transfer_bank: String((p as any).transfer_bank || ''),
                transfer_account: String((p as any).transfer_account || ''),
                transfer_name: String((p as any).transfer_name || ''),
                private_trade_note: String((p as any).private_trade_note || ''),
              }
            : null
        );
      } catch (e) {
        console.error('Failed to load sell order:', e);
        if (!cancelled) {
          setOrder(null);
          setListing(null);
          setSellerProfile(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [orderId, user?.id]);

  const isBuyer = user?.id === order?.buyerId;
  const isSeller = user?.id === order?.sellerId;

  const showEscrowPay = Boolean(order && isBuyer && order.paymentMethod === 'escrow' && order.step === 1 && !order.cancelled);

  useEffect(() => {
    if (!showEscrowPay) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [showEscrowPay]);

  const escrowMethodLabel = useMemo(() => {
    if (escrowPayMethod === 'credit_card') return '信用卡 / 金融卡';
    if (escrowPayMethod === 'webatm') return 'WebATM';
    if (escrowPayMethod === 'vacc') return 'ATM 轉帳';
    return '信用卡 / 金融卡';
  }, [escrowPayMethod]);

  const payDeadlineText = useMemo(() => {
    if (!order?.createdAt) return '';
    const created = Date.parse(order.createdAt);
    const base = Number.isFinite(created) ? created : nowMs;
    const deadline = base + 2 * 60 * 60 * 1000;
    const left = Math.max(0, deadline - nowMs);
    const totalSec = Math.floor(left / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }, [nowMs, order?.createdAt]);

  const pickedItem = useMemo(() => {
    if (!order || !listing) return null;
    return listing.items[order.itemIndex] || null;
  }, [listing, order]);

  const totalPrice = useMemo(() => {
    if (!order) return 0;
    return Math.round(order.unitPrice) * Math.max(1, order.quantity);
  }, [order]);

  const cancelOrder = async () => {
    if (!order) return;
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('cancel_sell_order', { p_order_id: Number(order.id) });
      if (error) throw error;
      const ok = Boolean((data as any)?.success);
      if (!ok) {
        const msg = String((data as any)?.message || '取消失敗');
        showToast(msg, 'plain');
        return;
      }
      showToast('已取消訂單', 'plain');
      router.replace(`/sell/${order.listingId}`);
    } catch (e) {
      console.error('Cancel sell order failed:', e);
      showToast('取消失敗', 'plain');
    } finally {
      setIsCancelling(false);
    }
  };

  const startEscrowPay = async () => {
    if (!order) return;
    if (order.paymentMethod !== 'escrow') return;
    if (user?.id !== order.buyerId) return;
    if (order.step !== 1 || order.cancelled) return;
    if (isPaying) return;
    setIsPaying(true);
    try {
      const supabase = createClient();
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        showToast('找不到有效登入狀態，請重新登入後再試', 'plain');
        return;
      }

      let apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        if (typeof window !== 'undefined' && window.location.hostname === 'localhost') apiUrl = 'http://127.0.0.1:3001';
        else apiUrl = 'http://127.0.0.1:3001';
      }
      if (apiUrl.includes('localhost')) apiUrl = apiUrl.replace('localhost', '127.0.0.1');

      const res = await fetch(`${apiUrl}/api/payment/ecpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({
          kind: 'sell_escrow',
          orderId: Number(order.id),
          paymentMethod: escrowPayMethod,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.indexOf('application/json') !== -1) {
        const pay = await res.json();
        if (!res.ok) throw new Error(String(pay?.error || 'Payment initialization failed'));
        setPaymentData(pay);
        return;
      }
      const text = await res.text();
      console.error('API Error (Non-JSON response):', text);
      throw new Error(`連線失敗 (${res.status})：請檢查後端 API URL 設定`);
    } catch (e) {
      console.error('Init escrow payment failed:', e);
      showToast('付款初始化失敗', 'plain');
    } finally {
      setIsPaying(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!user?.id) throw new Error('login_required');
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error('file_too_large');
    if (!file.type.startsWith('image/')) throw new Error('invalid_file');

    const ext = (() => {
      const name = String(file.name || '').toLowerCase();
      const m = name.match(/\.(png|jpg|jpeg|webp|gif|heic)$/);
      if (m?.[1]) return m[1] === 'jpeg' ? 'jpg' : m[1];
      const t = String(file.type || '').toLowerCase();
      if (t.includes('png')) return 'png';
      if (t.includes('webp')) return 'webp';
      if (t.includes('gif')) return 'gif';
      if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
      if (t.includes('heic')) return 'heic';
      return 'jpg';
    })();

    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    const objectPath = `${user.id}/orders/${Date.now()}-${id}`;

    const form = new FormData();
    form.append('file', file);
    form.append('bucket', 'marketplace');
    form.append('path', objectPath);
    const res = await fetch('/api/upload/image', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).error || 'no_public_url');
    const { publicUrl } = await res.json();
    if (!publicUrl) throw new Error('no_public_url');
    return publicUrl;
  };

  const markPaid = async () => {
    if (!order) return;
    if (isActing) return;
    setIsActing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('sell_order_mark_paid', {
        p_order_id: Number(order.id),
        p_proof_urls: proofUrls,
      });
      if (error) throw error;
      const ok = Boolean((data as any)?.success);
      if (!ok) {
        showToast(String((data as any)?.message || '操作失敗'), 'plain');
        return;
      }
      showToast('已標記付款', 'plain');
      router.refresh();
    } catch (e) {
      console.error('Mark paid failed:', e);
      showToast('操作失敗', 'plain');
    } finally {
      setIsActing(false);
    }
  };

  const confirmPayment = async () => {
    if (!order) return;
    if (isActing) return;
    setIsActing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('sell_order_confirm_payment', { p_order_id: Number(order.id) });
      if (error) throw error;
      const ok = Boolean((data as any)?.success);
      if (!ok) {
        showToast(String((data as any)?.message || '操作失敗'), 'plain');
        return;
      }
      showToast('已確認收款', 'plain');
      router.refresh();
    } catch (e) {
      console.error('Confirm payment failed:', e);
      showToast('操作失敗', 'plain');
    } finally {
      setIsActing(false);
    }
  };

  const markShipped = async () => {
    if (!order) return;
    if (isActing) return;
    setIsActing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('sell_order_mark_shipped', {
        p_order_id: Number(order.id),
        p_tracking_number: trackingNumberDraft.trim(),
      });
      if (error) throw error;
      const ok = Boolean((data as any)?.success);
      if (!ok) {
        showToast(String((data as any)?.message || '操作失敗'), 'plain');
        return;
      }
      showToast('已標記出貨', 'plain');
      router.refresh();
    } catch (e) {
      console.error('Mark shipped failed:', e);
      showToast('操作失敗', 'plain');
    } finally {
      setIsActing(false);
    }
  };

  const confirmReceived = async () => {
    if (!order) return;
    if (isActing) return;
    setIsActing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('sell_order_confirm_received', { p_order_id: Number(order.id) });
      if (error) throw error;
      const ok = Boolean((data as any)?.success);
      if (!ok) {
        showToast(String((data as any)?.message || '操作失敗'), 'plain');
        return;
      }
      showToast('已確認收貨', 'plain');
      router.refresh();
    } catch (e) {
      console.error('Confirm received failed:', e);
      showToast('操作失敗', 'plain');
    } finally {
      setIsActing(false);
    }
  };

  const actionBar = useMemo(() => {
    if (!order) return null;
    if (order.cancelled) return null;

    if (isBuyer && order.step === 1) {
      if (order.paymentMethod === 'escrow') {
        return {
          left: { label: '取消訂單', onClick: cancelOrder, disabled: isCancelling },
          right: { label: '直接付款', onClick: startEscrowPay, disabled: isPaying },
        };
      }
      return {
        left: { label: '取消訂單', onClick: cancelOrder, disabled: isCancelling },
        right: { label: '我已付款', onClick: markPaid, disabled: isActing },
      };
    }

    if (isSeller && order.step === 2 && order.paymentMethod !== 'escrow') {
      return { left: null, right: { label: '確認收款', onClick: confirmPayment, disabled: isActing } };
    }

    if (isSeller && order.step === 3) {
      return { left: null, right: { label: '已出貨', onClick: markShipped, disabled: isActing } };
    }

    if (isBuyer && order.step === 4) {
      return { left: null, right: { label: '確認收貨', onClick: confirmReceived, disabled: isActing } };
    }

    return null;
  }, [
    cancelOrder,
    confirmPayment,
    confirmReceived,
    isActing,
    isBuyer,
    isCancelling,
    isPaying,
    isSeller,
    markPaid,
    markShipped,
    order,
    startEscrowPay,
  ]);

  if (isAuthLoading || isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24 flex items-center justify-center">
        <div className="text-[13px] font-black text-neutral-400">載入中</div>
      </div>
    );
  }

  if (!order || !listing) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24 flex items-center justify-center">
        <div className="text-[13px] font-black text-neutral-400">找不到訂單</div>
      </div>
    );
  }

  const orderNoText = order.orderNumber ? order.orderNumber : `#${order.id}`;
  const recipientName = '王小明';
  const recipientPhone = '0912-345-678';
  const recipientAddress = '台北市中正區仁愛路一段 1 號 10 樓';
  const createdAtText = (() => {
    const d = new Date(order.createdAt);
    if (!order.createdAt || Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  })();

  return (
    <div
      className={cn(
        'min-h-screen bg-neutral-50 dark:bg-neutral-950',
        actionBar ? 'pb-[calc(88px+env(safe-area-inset-bottom))]' : 'pb-24'
      )}
    >
      {showEscrowPay && (
        <div className="bg-primary text-white px-4 py-2 text-[13px] font-black">
          請於 <span className="font-amount">{payDeadlineText}</span> 前完成付款
        </div>
      )}

      <div className="space-y-2">
        {order.paymentMethod === 'escrow' && (
          <div className="bg-white dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 md:rounded-3xl md:border md:shadow-card">
            <div className="px-3 py-3 sm:px-6 sm:py-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 grid place-items-center text-neutral-500 font-black">
                    $
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">
                      以{escrowMethodLabel}完成付款
                    </div>
                  </div>
                </div>
                {showEscrowPay && (
                  <button
                    type="button"
                    onClick={() => setIsPayMethodOpen((v) => !v)}
                    className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 whitespace-nowrap shrink-0"
                  >
                    更改
                  </button>
                )}
              </div>

              {showEscrowPay && isPayMethodOpen && (
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={escrowPayMethod}
                    onChange={(e) => setEscrowPayMethod(e.target.value as any)}
                    className="flex-1 h-10 px-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[13px] font-black text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="credit_card">信用卡 / 金融卡</option>
                    <option value="webatm">WebATM</option>
                    <option value="vacc">ATM 轉帳</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsPayMethodOpen(false)}
                    className="h-10 px-3 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[13px] font-black"
                  >
                    完成
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 md:rounded-3xl md:border md:shadow-card">
          <div className="px-3 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-black text-neutral-900 dark:text-white">收件資訊</div>
              <button
                type="button"
                onClick={() => router.push('/profile?tab=settings')}
                className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 whitespace-nowrap shrink-0"
              >
                更改
              </button>
            </div>
            <div className="mt-3 space-y-1.5 text-[13px] font-bold text-neutral-700 dark:text-neutral-200">
              <div className="flex items-start gap-2">
                <div className="font-black">{recipientName || '—'}</div>
                <div className="text-neutral-400 dark:text-neutral-500 font-black">{recipientPhone || '—'}</div>
              </div>
              <div className="text-[13px] font-bold text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {recipientAddress || '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 md:rounded-3xl md:border md:shadow-card">
          <div className="px-3 py-3 sm:px-6 sm:py-5">
            <button
              type="button"
              onClick={() => router.push(`/sell/${listing.id}`)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">
                @<span className="font-black">{sellerName}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400" />
            </button>

            <div className="mt-3 flex items-start gap-3">
              <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex-shrink-0">
                <Image src={pickedItem?.image || listing.images[0] || '/images/item.png'} alt="" fill className="object-cover" unoptimized />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-black text-neutral-900 dark:text-white leading-tight break-all line-clamp-2">
                  {listing.title || '商品'}
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[12px] font-bold text-neutral-400 dark:text-neutral-500">
                  <div className="min-w-0 truncate">{pickedItem?.name || ''}</div>
                  <div className="shrink-0">x{order.quantity}</div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1 justify-end">
                  <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
                  <span className="text-[14px] font-black font-amount text-neutral-900 dark:text-white">
                    {totalPrice.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div className="text-[13px] font-black text-neutral-900 dark:text-white">訂單金額</div>
              <div className="flex items-center gap-1.5">
                <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
                <span className="text-[16px] font-black font-amount text-primary">{totalPrice.toLocaleString()}</span>
              </div>
            </div>

          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 md:rounded-3xl md:border md:shadow-card">
          <div className="px-3 py-3 sm:px-6 sm:py-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-black text-neutral-900 dark:text-white">訂單編號</div>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-[13px] font-black text-neutral-900 dark:text-white truncate">{orderNoText}</div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(orderNoText);
                        showToast('已複製', 'plain');
                      } catch {
                        showToast('複製失敗', 'plain');
                      }
                    }}
                    className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 whitespace-nowrap shrink-0"
                  >
                    複製
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-black text-neutral-900 dark:text-white">建立時間</div>
                <div className="text-[13px] font-black text-neutral-900 dark:text-white">{createdAtText}</div>
              </div>

              {isSeller && order.step === 3 && (
                <div className="pt-2">
                  <div className="text-[12px] font-black text-neutral-500 dark:text-neutral-400 mb-2">物流單號（選填）</div>
                  <input
                    value={trackingNumberDraft}
                    onChange={(e) => setTrackingNumberDraft(e.target.value)}
                    placeholder="填寫物流單號"
                    className="w-full h-11 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 text-[13px] font-black text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 md:rounded-3xl md:border md:shadow-card">
          <div className="px-3 py-3 sm:px-6 sm:py-5 space-y-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem(`messages:title:sell:${listing.id}--${order.sellerId}`, `@${sellerName}`);
                  sessionStorage.setItem(`messages:avatar:sell:${listing.id}--${order.sellerId}`, sellerAvatar || '/images/avatar.png');
                }
                router.push(`/messages/sell:${listing.id}--${order.sellerId}`);
              }}
              className="w-full flex items-center justify-between text-left py-2"
            >
              <div className="text-[13px] font-black text-neutral-900 dark:text-white">聯絡賣家</div>
              <ChevronRight className="w-4 h-4 text-neutral-400" />
            </button>
            <button
              type="button"
              onClick={() => router.push('/faq')}
              className="w-full flex items-center justify-between text-left py-2"
            >
              <div className="text-[13px] font-black text-neutral-900 dark:text-white">幫助中心</div>
              <ChevronRight className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
        </div>
      </div>

      {actionBar && (
        <div className="fixed left-0 right-0 bottom-0 z-[60] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 pt-3 pb-3 flex items-center gap-3">
            {actionBar.left ? (
              <button
                type="button"
                onClick={actionBar.left.onClick}
                disabled={actionBar.left.disabled}
                className={cn(
                  'flex-1 h-[44px] rounded-xl border text-[15px] font-black',
                  actionBar.left.disabled ? 'opacity-60' : '',
                  'border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 bg-white dark:bg-neutral-950'
                )}
              >
                {actionBar.left.label}
              </button>
            ) : (
              <div className="flex-1" />
            )}
            <button
              type="button"
              onClick={actionBar.right.onClick}
              disabled={actionBar.right.disabled}
              className={cn(
                'flex-1 h-[44px] rounded-xl text-[15px] font-black text-white bg-primary active:scale-[0.99] transition-transform',
                actionBar.right.disabled ? 'opacity-60' : ''
              )}
            >
              {actionBar.right.disabled ? '處理中…' : actionBar.right.label}
            </button>
          </div>
        </div>
      )}

      {paymentData && (
        <form ref={formRef} action={paymentData.action} method="POST" className="hidden">
          {Object.entries(paymentData.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}
    </div>
  );
}
