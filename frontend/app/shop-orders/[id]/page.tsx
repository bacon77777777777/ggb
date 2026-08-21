'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/*
 * 官方商城訂單。
 *
 * 綠界付款完會把買家導回這一頁（ClientBackURL）。
 * ⚠️ 導回不代表已入帳 —— 入帳走的是 server-to-server 的 ReturnURL callback，
 * 買家可能比 callback 早到。所以這頁在 payment_status 還是 unpaid 時
 * 會自己重查幾次，而不是直接說「付款失敗」。
 */

type Order = {
  id: number;
  order_number: string | null;
  listing_id: number;
  quantity: number;
  unit_price: number;
  shipping_fee: number;
  total_amount: number;
  step: number;
  payment_status: string;
  tracking_number: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_addr: string | null;
  created_at: string;
};

const STEPS = ['已付款', '備貨中', '已出貨', '完成'];

export default function ShopOrderPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const id = Number(Array.isArray(params?.id) ? params.id[0] : params?.id);

  const [order, setOrder] = useState<Order | null>(null);
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('/images/item_defaulet.webp');
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) return null;
    const supabase = createClient();
    const { data } = await supabase
      .from('shop_orders')
      .select(
        'id, order_number, listing_id, quantity, unit_price, shipping_fee, total_amount, step, payment_status, tracking_number, recipient_name, recipient_phone, recipient_addr, created_at'
      )
      .eq('id', id)
      .maybeSingle();

    const o = (data as Order) || null;
    setOrder(o);

    if (o?.listing_id) {
      const { data: l } = await supabase
        .from('sell_listings')
        .select('title, images, items')
        .eq('id', o.listing_id)
        .maybeSingle();
      if (l) {
        setTitle(String((l as any).title || ''));
        const imgs = Array.isArray((l as any).images) ? (l as any).images.filter(Boolean) : [];
        const items = Array.isArray((l as any).items) ? (l as any).items : [];
        setImage(imgs[0] || items.map((x: any) => x?.image).filter(Boolean)[0] || '/images/item_defaulet.webp');
      }
    }
    return o;
  }, [id]);

  useEffect(() => {
    if (!authLoading && !user?.id) router.replace('/login');
  }, [authLoading, router, user?.id]);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      const o = await load();
      if (cancelled) return;
      setIsLoading(false);
      // 從綠界回來時 callback 可能還沒到，重查幾次再放棄，
      // 不要一回來就對買家說沒付款
      if (o && o.payment_status === 'unpaid' && tries < 5) {
        tries += 1;
        timer = setTimeout(run, 2000);
      }
    };
    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const confirmReceived = async () => {
    if (!order || isActing) return;
    setIsActing(true);
    try {
      const { data, error } = await createClient().rpc('shop_order_confirm_received', {
        p_order_id: order.id,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) {
        showToast(r?.message || '操作失敗', 'plain');
        return;
      }
      showToast('已確認收貨', 'plain');
      await load();
    } catch (e: any) {
      showToast(e?.message || '操作失敗', 'plain');
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50 dark:bg-neutral-950">
        <span className="text-[13px] font-black text-neutral-400">載入中</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-center">
          <p className="text-[13px] font-black text-neutral-400">找不到這筆訂單</p>
          <button
            type="button"
            onClick={() => router.push('/sell')}
            className="mt-3 px-4 py-2 rounded-full bg-primary text-white text-[13px] font-black"
          >
            回商城
          </button>
        </div>
      </div>
    );
  }

  const paid = order.payment_status === 'paid';

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28">
      <div className="sticky top-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-2 h-[57px] flex items-center gap-2">
          <button type="button" onClick={() => router.push('/sell')} className="p-2 rounded-full text-neutral-700 dark:text-neutral-200">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[16px] font-black text-neutral-900 dark:text-white">官方商城訂單</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 pt-3 space-y-3">
        {!paid && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-[12.5px] font-black text-amber-700 dark:text-amber-300 leading-relaxed">
            付款結果確認中。若你已完成付款，這裡會在幾秒內更新；未完成付款的訂單一小時後會自動取消並釋出庫存。
          </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 p-4">
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={cn(
                  'flex-1 text-center text-[11.5px] font-black py-1.5 rounded-lg',
                  paid && order.step > i + 1
                    ? 'bg-primary/10 text-primary'
                    : paid && order.step === i + 1
                      ? 'bg-primary text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                )}
              >
                {s}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 p-4">
          <div className="flex gap-3">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
              <Image src={image} alt={title} fill className="object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black text-neutral-900 dark:text-white line-clamp-2">{title}</p>
              <p className="mt-1 text-[11.5px] font-black text-neutral-400">
                吉吉比官方旗艦店 · {order.order_number || `#${order.id}`}
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-1">
            <div className="flex justify-between text-[12px] font-black text-neutral-400">
              <span>商品 × {order.quantity}</span>
              <span className="font-amount">NT${(order.unit_price * order.quantity).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[12px] font-black text-neutral-400">
              <span>運費</span>
              <span className="font-amount">
                {order.shipping_fee ? `NT$${order.shipping_fee.toLocaleString()}` : '免運費'}
              </span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-[13px] font-black text-neutral-900 dark:text-white">訂單金額</span>
              <span className="text-[16px] font-black font-amount text-primary">
                NT${order.total_amount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 p-4 space-y-2">
          {[
            ['收件人', order.recipient_name || '—'],
            ['電話', order.recipient_phone || '—'],
            ['地址', order.recipient_addr || '—'],
            ['物流單號', order.tracking_number || '尚未出貨'],
            ['發票', paid ? '電子發票已開立' : '付款後開立'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3 text-[12.5px] font-black">
              <span className="text-neutral-400 shrink-0">{k}</span>
              <span className="text-neutral-900 dark:text-white text-right break-all">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {paid && order.step === 3 && (
        <div className="fixed left-0 right-0 bottom-0 z-40 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto">
            <button
              type="button"
              disabled={isActing}
              onClick={confirmReceived}
              className="w-full h-12 rounded-2xl bg-primary text-white text-[15px] font-black disabled:opacity-50"
            >
              確認收貨
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
