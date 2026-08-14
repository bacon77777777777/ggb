'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { cn } from '@/lib/utils';

/*
 * 官方商城（B2C）商品頁。
 *
 * 為什麼不跟 /sell/[id]（玩家商城）共用一頁：
 * 商品資料雖然同一張表，但買的流程完全不同 ——
 *   C2C  看賣家評價與保證金 → 下單 → 自己匯款給賣家
 *   B2C  填收件資訊 → 綠界刷卡 → 平台出貨、開發票、七天鑑賞期
 * 把兩套塞進同一個 949 行的檔案，只會讓每個判斷都要先問「這是哪一種」。
 */

type Item = { name?: string; image?: string; price?: number; quantity?: number };

type Product = {
  id: number;
  title: string;
  note: string | null;
  category: string | null;
  price: number;
  shipping_fee: number;
  images: string[] | null;
  items: Item[] | null;
  sold_count: number;
};

const nt = (n: number) => `NT$${Math.round(n || 0).toLocaleString('zh-TW')}`;

export default function OfficialProductPage() {
  useFeatureGate('sell');

  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const id = Number(Array.isArray(params?.id) ? params.id[0] : params?.id);

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [itemIndex, setItemIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [disclaimer, setDisclaimer] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addr, setAddr] = useState('');

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data }, { data: settingRow }] = await Promise.all([
        supabase
          .from('sell_listings')
          .select('id, title, note, category, price, shipping_fee, images, items, sold_count')
          .eq('id', id)
          .eq('is_official', true)
          .eq('status', 'active')
          .maybeSingle(),
        supabase.from('platform_settings').select('value').eq('key', 'shop_disclaimer').maybeSingle(),
      ]);
      if (cancelled) return;
      setProduct((data as Product) || null);
      setDisclaimer(String((settingRow as any)?.value || ''));
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const items = useMemo(
    () => (Array.isArray(product?.items) ? (product!.items as Item[]) : []),
    [product]
  );
  const current = items[itemIndex] || null;
  const unitPrice = Number(current?.price) || product?.price || 0;
  const stock = Number(current?.quantity) || 0;
  const total = unitPrice * qty + (product?.shipping_fee || 0);

  const mainImage =
    (product?.images || []).filter(Boolean)[0] ||
    items.map((i) => i.image).filter(Boolean)[0] ||
    '/images/item_defaulet.webp';

  const checkout = async () => {
    if (!user?.id) {
      router.push('/login');
      return;
    }
    if (!name.trim() || !phone.trim() || !addr.trim()) {
      showToast('請填寫完整的收件資訊', 'plain');
      return;
    }
    setIsPaying(true);
    try {
      const supabase = createClient();
      // 後台的綠界端點要 Bearer token 驗身分（跟儲值同一支 route）
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session?.access_token) {
        showToast('登入狀態已失效，請重新登入', 'plain');
        router.push('/login');
        return;
      }

      // ① 先建訂單（會先扣庫存，避免同一件被多人帶去綠界後全部付款成功）
      const { data, error } = await supabase.rpc('create_shop_order', {
        p_listing_id: id,
        p_item_index: itemIndex,
        p_quantity: qty,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_addr: addr.trim(),
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) {
        showToast(r?.message || '建立訂單失敗', 'plain');
        return;
      }

      // ② 再向後台換綠界表單並自動送出
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/payment/ecpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({ kind: 'shop', orderId: r.order_id, paymentMethod: 'credit_card' }),
      });
      const pay = await res.json();
      if (!res.ok || !pay?.action || !pay?.fields) {
        showToast(pay?.error || '無法前往付款', 'plain');
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = pay.action;
      Object.entries(pay.fields as Record<string, string>).forEach(([k, v]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = String(v);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (e: any) {
      showToast(e?.message || '結帳失敗', 'plain');
    } finally {
      setIsPaying(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50 dark:bg-neutral-950">
        <span className="text-[13px] font-black text-neutral-400">載入中</span>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-center">
          <p className="text-[13px] font-black text-neutral-400">找不到這件商品</p>
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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28">
      <div className="sticky top-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
        <div className="max-w-3xl mx-auto px-2 h-[57px] flex items-center gap-2">
          <button type="button" onClick={() => router.back()} className="p-2 rounded-full text-neutral-700 dark:text-neutral-200">
            <ChevronLeft className="w-7 h-7 stroke-[2.5]" />
          </button>
          <h1 className="text-[16px] font-black text-neutral-900 dark:text-white">官方商城</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800">
          <Image src={mainImage} alt={product.title} fill className="object-cover" />
          <span className="absolute left-0 top-0 bg-neutral-900 text-white text-[11px] font-black px-2 py-1 rounded-br-lg">
            官方
          </span>
        </div>

        <div className="bg-white dark:bg-neutral-900 px-4 py-3">
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] font-black text-primary">NT$</span>
            <span className="text-[26px] font-black text-primary leading-none">
              {Math.round(unitPrice).toLocaleString('zh-TW')}
            </span>
            <span className="ml-auto text-[11.5px] font-black text-neutral-400">
              {product.shipping_fee ? `運費 ${product.shipping_fee}` : '免運費'} · 已售 {product.sold_count}
            </span>
          </div>
          <h2 className="mt-2 text-[15px] font-black text-neutral-900 dark:text-white leading-snug">
            {product.title}
          </h2>
        </div>

        {items.length > 1 && (
          <div className="mt-2 bg-white dark:bg-neutral-900 px-4 py-3">
            <div className="text-[13.5px] font-black text-neutral-900 dark:text-white mb-2">規格</div>
            <div className="flex flex-wrap gap-2">
              {items.map((it, i) => {
                const out = (Number(it.quantity) || 0) <= 0;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={out}
                    onClick={() => {
                      setItemIndex(i);
                      setQty(1);
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[12.5px] font-black border transition-colors',
                      out
                        ? 'border-neutral-200 text-neutral-300 dark:border-neutral-700 dark:text-neutral-600'
                        : itemIndex === i
                          ? 'border-primary text-primary bg-primary/5'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                    )}
                  >
                    {it.name || `規格 ${i + 1}`}
                    {out ? '（售完）' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-2 bg-white dark:bg-neutral-900 px-4 py-3 space-y-2">
          {[
            ['庫存', `${stock} 件`],
            ['出貨', '付款後 48 小時內'],
            ['付款', '信用卡 / 分期'],
            ['退換', '7 天鑑賞期，原路退刷'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-[12.5px] font-black">
              <span className="text-neutral-400">{k}</span>
              <span className="text-neutral-900 dark:text-white">{v}</span>
            </div>
          ))}
        </div>

        {product.note && (
          <div className="mt-2 bg-white dark:bg-neutral-900 px-4 py-3">
            <div className="text-[13.5px] font-black text-neutral-900 dark:text-white mb-1">商品說明</div>
            <p className="text-[12.5px] font-black text-neutral-500 whitespace-pre-wrap leading-relaxed">
              {product.note}
            </p>
          </div>
        )}

        {disclaimer && (
          <p className="px-4 py-3 text-[11px] font-black text-neutral-400 leading-relaxed">{disclaimer}</p>
        )}
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-40 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            disabled={stock <= 0}
            onClick={() => setIsCheckoutOpen(true)}
            className="w-full h-12 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[15px] font-black disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {stock <= 0 ? '已售完' : `刷卡結帳 · ${nt(total)}`}
          </button>
        </div>
      </div>

      {isCheckoutOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/40 flex items-end md:items-center md:justify-center"
          onClick={() => setIsCheckoutOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl md:rounded-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-black text-neutral-900 dark:text-white mb-3">收件資訊</div>

            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="收件人姓名"
                className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="tel"
                placeholder="手機號碼"
                className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <textarea
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                rows={2}
                placeholder="收件地址"
                className="w-full bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 py-2 text-[14px] font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="text-[13px] font-black text-neutral-500">數量</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[16px] font-black"
                >
                  −
                </button>
                <span className="text-[15px] font-black w-6 text-center">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(stock, q + 1))}
                  className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[16px] font-black"
                >
                  ＋
                </button>
              </div>
              <span className="ml-auto text-[17px] font-black text-primary">{nt(total)}</span>
            </div>

            <button
              type="button"
              disabled={isPaying}
              onClick={checkout}
              className="mt-4 w-full h-12 rounded-2xl bg-primary text-white text-[15px] font-black disabled:opacity-50"
            >
              {isPaying ? '前往付款…' : '前往綠界付款'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
