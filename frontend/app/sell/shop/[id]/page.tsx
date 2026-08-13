'use client';

import '../../market.css';

/**
 * 個人店舖（/sell/shop/<sellerId>）
 *
 * 商品彈層「店舖」鈕的目的地：這位賣家的門面 —— 抬頭（頭像／等級／信譽數字）
 * 加上他所有上架中的商品。
 *
 * 資料走 migration 569 的兩支 SECURITY DEFINER RPC（sell_shop_header / sell_shop_feed）：
 * 統計 view join 了有 RLS 的表，前台直接查會被靜默濾成空的。
 *
 * 點商品卡 → `/sell?open=<id>`：購買整條龍都做在商城首頁的彈層裡（含保證金與付款），
 * 這裡不重做一份結帳，免得兩邊行為漂移。
 */

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type ShopHeader = {
  seller_id: string;
  seller_name: string;
  seller_avatar: string | null;
  tier_name: string | null;
  tier_key: number | null;
  success_rate: number | null;
  done_count: number | null;
  avg_ship_minutes: number | null;
  is_pro: boolean;
  phone_verified: boolean;
  suspended: boolean;
};

type ShopRow = {
  id: number;
  title: string;
  price: number;
  shipping_fee: number;
  images: string[] | null;
  items: any[] | null;
  sold_count: number;
  deposit: number;
  pay_method: string | null;
  tier_name: string | null;
  tier_key: number | null;
};

const nt = (n: number) => Math.round(Number(n) || 0).toLocaleString();

const imgOf = (r: ShopRow) =>
  (Array.isArray(r.images) ? r.images.map((x) => String(x || '').trim()).find(Boolean) : '') ||
  (Array.isArray(r.items) ? r.items.map((x: any) => String(x?.image || '').trim()).find(Boolean) : '') ||
  '/images/item_defaulet.webp';

const payLabel = (m: string | null) =>
  m === 'linepay' ? 'LINE Pay' : m === 'bank' ? '銀行轉帳' : '';

export default function SellerShopPage() {
  const params = useParams<{ id: string }>();
  const sellerId = String(params?.id || '');
  const router = useRouter();
  const { user } = useAuth();

  const [header, setHeader] = useState<ShopHeader | null>(null);
  const [rows, setRows] = useState<ShopRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const [{ data: hd }, { data: feed }] = await Promise.all([
          supabase.rpc('sell_shop_header', { p_seller: sellerId }),
          supabase.rpc('sell_shop_feed', { p_seller: sellerId, p_limit: 60, p_offset: 0 }),
        ]);
        if (cancelled) return;
        const h = Array.isArray(hd) ? (hd[0] as ShopHeader | undefined) : undefined;
        if (!h) {
          setNotFound(true);
          return;
        }
        setHeader(h);
        setRows(Array.isArray(feed) ? (feed as ShopRow[]) : []);
      } catch (e) {
        console.error('Load seller shop failed:', e);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const chat = () => {
    if (!user?.id) {
      router.push(`/login?next=${encodeURIComponent(`/sell/shop/${sellerId}`)}`);
      return;
    }
    // 聊聊要掛在一個商品底下（sell_messages 以 listing 為 thread key）；
    // 從店舖進來就掛在他最新的上架，沒有上架就不給聊 —— 沒有商品也沒什麼好聊
    const first = rows[0];
    if (!first) return;
    router.push(`/messages/sell:${first.id}--${sellerId}`);
  };

  return (
    <div className="mk min-h-screen pb-[calc(24px+env(safe-area-inset-bottom))]" style={{ background: 'var(--bg, #f6f6f6)' }}>
      {/* 抬頭 */}
      <div className="shophd">
        <div className="row">
          <button type="button" aria-label="返回" onClick={() => router.back()} style={{ marginRight: 2 }}>
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--ink)' }} />
          </button>
          <div className="av">
            {header?.seller_avatar ? (
              <Image src={header.seller_avatar} alt={header.seller_name} fill style={{ objectFit: 'cover' }} sizes="52px" unoptimized />
            ) : (
              (header?.seller_name?.[0] || 'U').toUpperCase()
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {header?.seller_name || '…'}
              </b>
              {header?.tier_name && (
                <span className={`lvl${header.tier_key === 2 ? ' g2' : header.tier_key === 1 ? ' g1' : ''}`}>
                  {header.tier_name}
                </span>
              )}
              {header?.is_pro && <span className="tg tg--off">官方認證商家</span>}
            </div>
            <div className="sub">
              {header?.suspended
                ? '此賣家目前無法交易'
                : header?.phone_verified
                  ? '已完成手機實名'
                  : '尚未實名'}
            </div>
          </div>
          {rows.length > 0 && !header?.suspended && (
            <div className="shopacts">
              <button type="button" onClick={chat}>
                <MessageCircle className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 3 }} />
                聊聊
              </button>
            </div>
          )}
        </div>

        <div className="mstat">
          <div>
            成交率<b>{header?.success_rate ?? 100}%</b>
          </div>
          <div>
            平均出貨<b>{header?.avg_ship_minutes ?? 0} 分</b>
          </div>
          <div>
            完成單數<b>{nt(Number(header?.done_count || 0))}</b>
          </div>
          <div>
            上架中<b>{rows.length}</b>
          </div>
        </div>
      </div>

      {/* 商品 */}
      {isLoading ? (
        <div className="empty">載入中…</div>
      ) : notFound ? (
        <div className="empty">找不到這位賣家</div>
      ) : rows.length === 0 ? (
        <div className="empty">這間店舖目前沒有上架商品</div>
      ) : (
        <div className="grid" style={{ marginTop: 8 }}>
          {rows.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => router.push(`/sell?open=${r.id}`)}
              className="pcard"
            >
              <div className="pimg" style={{ background: '#F5F5F5' }}>
                <Image src={imgOf(r)} alt={r.title} fill style={{ objectFit: 'cover' }} sizes="(max-width:640px) 50vw, 200px" />
                <span className="badge">玩家</span>
              </div>
              <div className="pbody">
                <div className="ptitle">{r.title}</div>
                <div className="pprice">
                  <i>NT$</i>
                  <b>{nt(r.price)}</b>
                  <span className="dep">保證金 {nt(r.deposit)}G</span>
                </div>
                <div className="tags">
                  {!r.shipping_fee && <span className="tg tg--dep">免運</span>}
                  {payLabel(r.pay_method) && <span className="tg tg--pay">{payLabel(r.pay_method)}</span>}
                  <span className="tg tg--pay">已售 {nt(r.sold_count)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
