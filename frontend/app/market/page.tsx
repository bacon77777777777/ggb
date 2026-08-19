'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { useToast } from '@/components/ui/Toast';
import { useAlert } from '@/components/ui/AlertDialog';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import SimplePageHeader from '@/components/ui/SimplePageHeader';

/**
 * 交易所
 *
 * 玩家把倉庫裡還沒配送、而且是大賞的品項掛上來，賣掉換成 G 幣。
 * 跟「商城」不同 —— 那個像露天拍賣，收的是真錢、賣什麼都行。
 *
 * 這一頁原本只是一個轉址：`/market` 把人丟到 `/profile?tab=market`，
 * 而那裡只看得到「自己上架的東西」。也就是說買方這一側從來不存在 ——
 * 沒有地方逛，也沒有地方買。
 *
 * 所有驗證都在 DB 的 buy_listing 裡（餘額、重複購買、買自己的、狀態競態），
 * 這裡只負責把結果講清楚。前端擋不住直接打 API 的人。
 */

type Listing = {
  id: number;
  price: number;
  seller_id: string;
  prize_name: string;
  prize_level: string;
  prize_image: string | null;
  product_name: string;
  seller_name: string;
};

const FALLBACK_IMAGE = '/images/banner_defaulet.png';

export default function MarketPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const { showToast } = useToast();
  const { showAlert } = useAlert();
  const requireLogin = useRequireLogin();

  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      /*
       * 讀的是 public_marketplace_listings 這個 view，不是直接查
       * marketplace_listings 再 join 過去。draw_records 與 users 的 RLS
       * 都是「只看得到自己的」，join 出來別人的上架會是一張沒有圖、
       * 沒有名字、沒有賣家的空白卡片。view 只曝露逛街要用的欄位，
       * 不含籤號、種子雜湊與賣家的其他資料。
       */
      const { data, error } = await supabase
        .from('public_marketplace_listings')
        .select('id, price, seller_id, seller_name, prize_name, prize_level, prize_image, product_name')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setListings(((data ?? []) as unknown as Array<any>).map((r) => ({
        id: Number(r.id),
        price: Number(r.price),
        seller_id: String(r.seller_id),
        prize_name: r.prize_name ?? '未知品項',
        prize_level: r.prize_level ?? '',
        prize_image: r.prize_image ?? null,
        product_name: r.product_name ?? '',
        seller_name: r.seller_name ?? '玩家',
      })));
    } catch {
      showToast('讀取失敗，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, showToast]);

  useEffect(() => { load(); }, [load]);

  // 關閉或維護中直接 404（見 lib/useFeatureGate）。
  // 原本是 router.replace('/')，頁面會先閃一下再彈回首頁，體感很差
  useFeatureGate('market');

  const doBuy = async (item: Listing) => {
    setBuyingId(item.id);
    try {
      const { data, error } = await supabase.rpc('buy_listing', { p_listing_id: item.id });
      if (error) throw error;
      const res = data as { success: boolean; message: string };
      if (!res?.success) {
        showToast(res?.message || '購買失敗', 'error');
        // 失敗多半是被別人先買走或賣家下架了，重讀一次讓畫面對上現況
        load();
        return;
      }
      showToast('買到了！東西已經進倉庫', 'success');
      refreshProfile?.();
      load();
    } catch {
      showToast('購買失敗，請稍後再試', 'error');
    } finally {
      setBuyingId(null);
    }
  };

  const handleBuy = (item: Listing) => {
    if (!user) { requireLogin(); return; }
    if (item.seller_id === user.id) return;

    showAlert({
      type: 'confirm',
      title: '確定要買嗎？',
      message: `${item.prize_name}\n付出 ${item.price.toLocaleString()} G 幣。買到之後東西直接進你的倉庫，可以申請配送或再上架。交易完成不能反悔。`,
      confirmText: '確定購買',
      onConfirm: () => { void doBuy(item); },
    });
  };

  if (isLoading) return <ProductLoadingScreen />;

  // safe-header-offset：SimplePageHeader 是 fixed，內容要自己讓開頭部高度
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28 safe-header-offset">
      <SimplePageHeader title="交易所" onBack={() => router.back()} />

      <div className="max-w-3xl mx-auto px-4 pt-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-bold leading-relaxed text-neutral-400">
            玩家把倉庫裡的大賞掛上來，買到直接進你的倉庫。
          </p>
          <Link
            href="/profile?tab=market"
            className="shrink-0 text-[13px] font-black text-primary underline underline-offset-2"
          >
            我的上架
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-sm font-black text-neutral-400">目前沒有人上架</p>
            <p className="mt-1 text-[13px] text-neutral-400">
              倉庫裡還沒配送的大賞可以掛上來換 G 幣。
            </p>
            <Link
              href="/profile"
              className="mt-5 inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-black text-white"
            >
              去我的倉庫看看
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {listings.map((item) => {
              const isMine = user?.id === item.seller_id;
              return (
                <div
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
                    <Image
                      src={item.prize_image || FALLBACK_IMAGE}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 50vw, 240px"
                      className="object-cover"
                      unoptimized
                    />
                    {item.prize_level && (
                      <span className="absolute left-0 top-0 rounded-br-lg bg-primary px-2 py-0.5 text-[11px] font-black text-white">
                        {item.prize_level}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-2.5">
                    <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-neutral-900 dark:text-white">
                      {item.prize_name}
                    </h3>
                    {item.product_name && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-400">{item.product_name}</p>
                    )}

                    <div className="mt-auto pt-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[15px] font-black tabular-nums text-primary">
                          {item.price.toLocaleString()}
                        </span>
                        <span className="text-[11px] font-bold text-neutral-400">G 幣</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-400">
                        賣家：{item.seller_name}
                      </p>

                      {isMine ? (
                        // 自己的東西不給買，但也不要藏起來 —— 看得到才知道自己掛了什麼價
                        <div className="mt-2 flex h-9 items-center justify-center rounded-lg bg-neutral-100 text-[13px] font-black text-neutral-400 dark:bg-neutral-800">
                          你上架的
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBuy(item)}
                          disabled={buyingId !== null}
                          className="mt-2 h-9 w-full rounded-lg bg-primary text-[13px] font-black text-white transition-opacity disabled:opacity-50"
                        >
                          {buyingId === item.id ? '購買中…' : '購買'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
