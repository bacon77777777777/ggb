'use client';

import '../market.css';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';
import MarketTabBar from '@/components/sell/MarketTabBar';

/*
 * 商城訂單 —— 照原型 vOrders() 的 .olist / .ocard / .ohd / .orow 結構。
 *
 * 玩家商城（sell_orders）與官方商城（shop_orders）併在同一個清單，
 * 照原型的做法用 type 區分標題與狀態文字 —— 玩家心裡只有「我買的東西」，
 * 不會想先選是跟誰買的。
 */

type Row = {
  key: string;
  id: number;
  type: 'c2c' | 'b2c';
  orderNo: string;
  shop: string;
  title: string;
  image: string;
  amount: number;
  stepLabel: string;
  href: string;
  createdAt: string;
};

// C2C 比原型多一步「賣家確認收款」—— 平台不碰錢，收到款只有賣家知道
const C2C_STEPS = ['待付款', '待賣家確認收款', '待出貨', '待收貨', '完成'];
const B2C_STEPS = ['已付款', '備貨中', '已出貨', '完成'];

const pickImage = (l: any): string => {
  const imgs = Array.isArray(l?.images) ? l.images.filter(Boolean) : [];
  if (imgs[0]) return imgs[0];
  const items = Array.isArray(l?.items) ? l.items : [];
  return items.map((x: any) => String(x?.image || '').trim()).filter(Boolean)[0] || '/images/item_defaulet.webp';
};

export default function SellOrdersPage() {
  useFeatureGate('sell');

  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user?.id) router.replace('/login');
  }, [authLoading, router, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: c2c }, { data: b2c }] = await Promise.all([
        supabase
          .from('sell_orders')
          .select('id, order_number, listing_id, seller_id, buyer_id, quantity, unit_price, shipping_fee, step, cancelled, created_at')
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('shop_orders')
          .select('id, order_number, listing_id, quantity, unit_price, shipping_fee, total_amount, step, payment_status, created_at')
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;

      const listingIds = Array.from(
        new Set([...(c2c || []), ...(b2c || [])].map((o: any) => o.listing_id).filter(Boolean))
      );
      const { data: listings } = listingIds.length
        ? await supabase.from('sell_listings').select('id, title, images, items').in('id', listingIds)
        : { data: [] as any[] };
      const byId = new Map<number, any>((listings || []).map((l: any) => [l.id, l]));

      const sellerIds = Array.from(new Set((c2c || []).map((o: any) => o.seller_id).filter(Boolean)));
      const { data: displays } = sellerIds.length
        ? await supabase.rpc('get_user_displays', { p_ids: sellerIds })
        : { data: [] as any[] };
      const nameById = new Map<string, string>(
        (displays || []).map((d: any) => [String(d.id), String(d.name || 'user')])
      );

      const mapped: Row[] = [
        ...(c2c || []).map((o: any) => {
          const l = byId.get(o.listing_id);
          return {
            key: `c-${o.id}`,
            id: o.id,
            type: 'c2c' as const,
            orderNo: String(o.order_number || `#${o.id}`),
            shop: nameById.get(String(o.seller_id)) || '玩家賣場',
            title: String(l?.title || '商城商品'),
            image: pickImage(l),
            amount: Number(o.unit_price) * Number(o.quantity) + Number(o.shipping_fee || 0),
            stepLabel: o.cancelled ? '已取消' : C2C_STEPS[Math.max(0, Number(o.step) - 1)] || '處理中',
            href: `/sell-orders/${o.id}`,
            createdAt: String(o.created_at),
          };
        }),
        ...(b2c || []).map((o: any) => {
          const l = byId.get(o.listing_id);
          return {
            key: `s-${o.id}`,
            id: o.id,
            type: 'b2c' as const,
            orderNo: String(o.order_number || `#${o.id}`),
            shop: '吉吉比官方旗艦店',
            title: String(l?.title || '官方商品'),
            image: pickImage(l),
            amount: Number(o.total_amount) || 0,
            stepLabel:
              o.payment_status === 'unpaid'
                ? '待付款'
                : o.payment_status === 'failed'
                  ? '已取消'
                  : B2C_STEPS[Math.max(0, Number(o.step) - 1)] || '處理中',
            href: `/shop-orders/${o.id}`,
            createdAt: String(o.created_at),
          };
        }),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      setRows(mapped);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="mk min-h-screen pb-[calc(64px+env(safe-area-inset-bottom))]">
      <div className="hdr plain sticky top-0 z-40">
        <h1>我的訂單</h1>
      </div>

      {isLoading ? (
        <div className="empty">載入中</div>
      ) : rows.length === 0 ? (
        <div className="empty">目前沒有訂單</div>
      ) : (
        <div className="olist">
          {rows.map((r) => (
            <Link key={r.key} href={r.href} className="ocard">
              <div className="ohd">
                <span>{r.shop}</span>
                <span className="ost" style={{ marginLeft: 'auto' }}>
                  {r.stepLabel}
                </span>
              </div>
              <div className="orow">
                <div className="th" style={{ background: '#F5F5F5' }}>
                  <Image src={r.image} alt={r.title} fill style={{ objectFit: 'cover' }} sizes="62px" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ptitle">{r.title}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--sub)', marginTop: 4 }}>訂單 {r.orderNo}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="pprice" style={{ display: 'block' }}>
                    <i>NT$</i>
                    <b style={{ fontSize: 17 }}>{Math.round(r.amount).toLocaleString('zh-TW')}</b>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <MarketTabBar active="orders" />
    </div>
  );
}
