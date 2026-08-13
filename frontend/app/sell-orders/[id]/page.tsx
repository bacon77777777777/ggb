'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
  shippingFee: number;
  depositAmount: number;
  sellerConfirmedAt: string | null;
  overdueNotifiedAt: string | null;
  paymentMethod: 'bank' | 'linepay';
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
  payoutMethod: 'bank' | 'linepay';
  transferBank: string;
  transferAccount: string;
  transferName: string;
  linepayId: string;
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
  const [sellerAvatar, setSellerAvatar] = useState<string>('/images/avatar.webp');
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [trackingNumberDraft, setTrackingNumberDraft] = useState('');
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /**
   * 付款期限（小時），來自後台「商城設定」。
   * 一定要跟排程用的是同一個值 —— 之前這裡寫死 2 小時、排程卻是 48 小時，
   * 畫面倒數歸零了訂單還在，玩家只會覺得系統壞了。
   */
  const [payDeadlineHours, setPayDeadlineHours] = useState(48);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetail, setReportDetail] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  /** 商城免責聲明，後台「商城設定」維護。平台不碰錢，這段是唯一的界線 */
  const [disclaimer, setDisclaimer] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from('platform_settings')
        .select('key, value')
        .in('key', ['sell_pay_deadline_hours', 'sell_disclaimer']);
      const rows = Array.isArray(data) ? data : [];
      const get = (k: string) => String(rows.find((r: any) => r?.key === k)?.value ?? '').trim();
      const n = Number(get('sell_pay_deadline_hours'));
      if (cancelled) return;
      if (Number.isFinite(n) && n > 0) setPayDeadlineHours(n);
      setDisclaimer(get('sell_disclaimer'));
    })();
    return () => { cancelled = true; };
  }, []);

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
            'id, order_number, listing_id, seller_id, buyer_id, item_index, quantity, unit_price, shipping_fee, deposit_amount, payment_method, step, cancelled, tracking_number, paid_at, shipped_at, received_at, payment_proof_urls, seller_confirmed_at, overdue_notified_at, created_at'
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
          shippingFee: Math.max(0, Math.round(Number((o as any).shipping_fee) || 0)),
          depositAmount: Math.max(0, Math.round(Number((o as any).deposit_amount) || 0)),
          sellerConfirmedAt: (o as any).seller_confirmed_at ?? null,
          overdueNotifiedAt: (o as any).overdue_notified_at ?? null,
          // 玩家商城一律雙方自理，收款方式由賣家設定，只會是這兩種
          paymentMethod: String((o as any).payment_method || 'bank') === 'linepay' ? 'linepay' : 'bank',
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
        let displayAvatar = '/images/avatar.webp';
        if (nextOrder.sellerId) {
          const { data: displays } = await supabase.rpc('get_user_displays', { p_ids: [nextOrder.sellerId] });
          const d = Array.isArray(displays) ? (displays[0] as any) : null;
          displayName = String(d?.name || 'user');
          displayAvatar = String(d?.avatar_url || '/images/avatar.webp');
        }

        const { data: p, error: profileError } = await supabase
          .from('sell_seller_profiles')
          .select('payout_method, transfer_bank, transfer_account, transfer_name, linepay_id')
          .eq('seller_id', nextOrder.sellerId)
          .maybeSingle();

        if (cancelled) return;
        setOrder(nextOrder);
        setListing(nextListing);
        setSellerName(displayName);
        setSellerAvatar(displayAvatar);
        setTrackingNumberDraft(String(nextOrder.trackingNumber || ''));
        setProofUrls(nextOrder.paymentProofUrls);
        if (profileError) console.error('Failed to load seller payout info:', profileError);
        setSellerProfile(
          p
            ? {
                payoutMethod: String((p as any).payout_method || 'bank') === 'linepay' ? 'linepay' : 'bank',
                transferBank: String((p as any).transfer_bank || ''),
                transferAccount: String((p as any).transfer_account || ''),
                transferName: String((p as any).transfer_name || ''),
                linepayId: String((p as any).linepay_id || ''),
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

  /**
   * 買家還沒回報付款的階段。倒數顯示的是「商城設定」裡的付款期限，
   * 逾時由排程自動取消訂單、把庫存放回架上。
   */
  const showPayCountdown = Boolean(order && isBuyer && order.step === 1 && !order.cancelled);

  useEffect(() => {
    if (!showPayCountdown) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [showPayCountdown]);

  const payDeadlineText = useMemo(() => {
    if (!order?.createdAt) return '';
    const created = Date.parse(order.createdAt);
    const base = Number.isFinite(created) ? created : nowMs;
    const deadline = base + payDeadlineHours * 60 * 60 * 1000;
    const left = Math.max(0, deadline - nowMs);
    const totalSec = Math.floor(left / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }, [nowMs, order?.createdAt, payDeadlineHours]);

  const pickedItem = useMemo(() => {
    if (!order || !listing) return null;
    return listing.items[order.itemIndex] || null;
  }, [listing, order]);

  // 買家要匯的是「貨款 + 運費」。原本只算貨款，賣家收到的錢會少一筆運費
  const goodsPrice = useMemo(
    () => (order ? Math.round(order.unitPrice) * Math.max(1, order.quantity) : 0),
    [order]
  );
  const totalPrice = useMemo(
    () => goodsPrice + (order?.shippingFee || 0),
    [goodsPrice, order?.shippingFee]
  );

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

  /*
   * 逾時未出貨的補償申訴。
   *
   * 刻意由買家主動按，不自動賠付 —— 逾時一小時就自動罰錢，對只是晚一天
   * 出貨的賣家太重，而且東西可能已經在路上。由受害的一方決定要不要動用。
   * 期限與金額都由 DB 判定（sell_order_claim_compensation），前台不自己算。
   */
  const claimCompensation = async () => {
    if (!order || isActing) return;
    setIsActing(true);
    try {
      const { data, error } = await createClient().rpc('sell_order_claim_compensation', {
        p_order_id: Number(order.id),
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) {
        showToast(r?.message || '目前無法申訴', 'plain');
        return;
      }
      showToast(`已補償 ${Number(r.compensation).toLocaleString('zh-TW')} G幣到你的帳戶`, 'plain');
      router.refresh();
    } catch (e: any) {
      showToast(e?.message || '申訴失敗', 'plain');
    } finally {
      setIsActing(false);
    }
  };

  const actionBar = useMemo(() => {
    if (!order) return null;
    if (order.cancelled) return null;

    if (isBuyer && order.step === 1) {
      return {
        left: { label: '取消訂單', onClick: cancelOrder, disabled: isCancelling },
        right: { label: '我已付款', onClick: markPaid, disabled: isActing },
      };
    }

    if (isSeller && order.step === 2) {
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
    isSeller,
    markPaid,
    markShipped,
    order,
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

  const submitReport = async () => {
    if (!user?.id || !order) return;
    const reason = reportReason.trim();
    if (!reason) {
      showToast('請選擇檢舉原因', 'plain');
      return;
    }
    setIsReporting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('sell_reports').insert({
        reporter_id: user.id,
        target_type: 'order',
        order_id: Number(order.id),
        listing_id: Number(order.listingId) || null,
        seller_id: order.sellerId,
        reason,
        detail: reportDetail.trim() || null,
      } as any);
      if (error) throw error;
      showToast('已送出檢舉，平台會盡快處理', 'plain');
      setIsReportOpen(false);
      setReportReason('');
      setReportDetail('');
    } catch (e) {
      console.error('Submit sell report failed:', e);
      showToast('檢舉送出失敗', 'plain');
    } finally {
      setIsReporting(false);
    }
  };

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
      {/* 付款倒數。時間來自後台「商城設定」，跟排程自動取消用的是同一個值 */}
      {showPayCountdown && (
        <div className="bg-primary text-white px-4 py-2 text-[13px] font-black">
          請於 <span className="font-amount">{payDeadlineText}</span> 內完成付款並回報，逾時訂單會自動取消
        </div>
      )}

      <div className="space-y-2">

        {/*
          賣家收款資訊。平台不經手款項，買家是直接把錢付給賣家，
          所以這塊是整筆交易能不能成立的關鍵 —— 訂單成立後才顯示（RLS 也是這樣擋的）。
        */}
        {isBuyer && !order.cancelled && order.step <= 2 && (
          <div className="bg-white dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 md:rounded-3xl md:border md:shadow-card">
            <div className="px-3 py-3 sm:px-6 sm:py-5">
              <div className="text-[13px] font-black text-neutral-900 dark:text-white">
                付款給賣家
              </div>
              {!sellerProfile ? (
                <div className="mt-3 text-[13px] font-bold text-neutral-400">
                  賣家尚未提供收款資訊，請先用下方訊息與賣家聯繫
                </div>
              ) : sellerProfile.payoutMethod === 'linepay' ? (
                <div className="mt-3 space-y-1.5 text-[13px] font-bold text-neutral-700 dark:text-neutral-200">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 dark:text-neutral-500">收款方式</span>
                    <span className="font-black">LINE Pay 轉帳</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 dark:text-neutral-500">LINE Pay</span>
                    <span className="font-black font-amount break-all">{sellerProfile.linepayId || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 dark:text-neutral-500">應付金額</span>
                    <span className="font-black font-amount">NT${totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-1.5 text-[13px] font-bold text-neutral-700 dark:text-neutral-200">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 dark:text-neutral-500">銀行</span>
                    <span className="font-black">{sellerProfile.transferBank || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 dark:text-neutral-500">帳號</span>
                    <span className="font-black font-amount break-all">{sellerProfile.transferAccount || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 dark:text-neutral-500">戶名</span>
                    <span className="font-black">{sellerProfile.transferName || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 dark:text-neutral-500">應付金額</span>
                    <span className="font-black font-amount">NT${totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              )}
              {disclaimer && (
                <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-700 dark:text-amber-500">
                  {disclaimer}
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
                <Image src={pickedItem?.image || listing.images[0] || '/images/item_defaulet.webp'} alt="" fill className="object-cover" unoptimized />
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
                  <Image src="/images/gcoin.webp" alt="G" width={14} height={14} className="object-contain" />
                  <span className="text-[14px] font-black font-amount text-neutral-900 dark:text-white">
                    {totalPrice.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/*
              這筆是買家匯給賣家的**新台幣**（銀行轉帳或 LINE Pay），不是 G幣。
              原本這裡放 G幣圖示，會讓買家以為可以用站內餘額付。
            */}
            <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-1">
              <div className="flex items-center justify-between text-[12px] font-black text-neutral-400">
                <span>商品</span>
                <span className="font-amount">NT${goodsPrice.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-[12px] font-black text-neutral-400">
                <span>運費</span>
                <span className="font-amount">
                  {order.shippingFee ? `NT$${order.shippingFee.toLocaleString()}` : '免運費'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="text-[13px] font-black text-neutral-900 dark:text-white">訂單金額</div>
                <span className="text-[16px] font-black font-amount text-primary">
                  NT${totalPrice.toLocaleString()}
                </span>
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
                  sessionStorage.setItem(`messages:avatar:sell:${listing.id}--${order.sellerId}`, sellerAvatar || '/images/avatar.webp');
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
            {/*
              保證金：買家最在意「賣家跑了我拿得回什麼」，所以直接寫金額。
              step 3（待出貨）且系統已標記逾時，才出現申訴按鈕 ——
              overdue_notified_at 是排程寫的，等於 DB 已經認定超過出貨期限。
            */}
            {order.depositAmount > 0 && (
              <div className="py-2 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black text-neutral-900 dark:text-white">
                    賣家保證金
                  </span>
                  <span className="text-[13px] font-black text-primary font-amount">
                    {order.depositAmount.toLocaleString()} G
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] font-black text-neutral-400 leading-relaxed">
                  {order.step >= 5
                    ? '交易完成，保證金已退還賣家'
                    : order.cancelled
                      ? '訂單已結束'
                      : '賣家已押在平台。你確認收貨後退還；若賣家沒出貨，這筆會賠給你'}
                </p>
                {isBuyer && !order.cancelled && order.step === 3 && order.overdueNotifiedAt && (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={claimCompensation}
                    className="mt-2 w-full h-11 rounded-2xl bg-red-500 text-white text-[14px] font-black disabled:opacity-50 active:scale-[0.99] transition-transform"
                  >
                    賣家逾時未出貨 · 申請補償 {order.depositAmount.toLocaleString()}G
                  </button>
                )}
              </div>
            )}

            {/* 買家才需要檢舉入口 —— 平台不碰錢，出事時這是買家唯一的求助管道 */}
            {isBuyer && (
              <button
                type="button"
                onClick={() => setIsReportOpen(true)}
                className="w-full flex items-center justify-between text-left py-2"
              >
                <div className="text-[13px] font-black text-red-500">檢舉此交易</div>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {isReportOpen && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end md:items-center md:justify-center" onClick={() => setIsReportOpen(false)}>
          <div
            className="w-full md:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl md:rounded-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-black text-neutral-900 dark:text-white">檢舉此交易</div>
            <div className="mt-1 text-[11px] font-bold leading-relaxed text-neutral-400">
              檢舉會連同這筆訂單的完整紀錄一起送給平台。若賣家確認違規，平台會停止他在商城的交易資格。
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['付款後未出貨', '商品與描述不符', '疑似詐騙', '其他'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReportReason(r)}
                  className={`h-9 px-3 rounded-xl text-[13px] font-black transition-colors ${
                    reportReason === r
                      ? 'bg-red-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="補充說明（選填）：發生了什麼事、跟賣家聯繫的結果…"
              className="mt-3 w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-[13px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setIsReportOpen(false)}
                className="flex-1 h-[44px] rounded-xl border border-neutral-200 dark:border-neutral-800 text-[15px] font-black text-neutral-800 dark:text-neutral-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={isReporting || !reportReason}
                className="flex-1 h-[44px] rounded-xl bg-red-500 text-white text-[15px] font-black disabled:opacity-50"
              >
                {isReporting ? '送出中…' : '送出檢舉'}
              </button>
            </div>
          </div>
        </div>
      )}

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

    </div>
  );
}
