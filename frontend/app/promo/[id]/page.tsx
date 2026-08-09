'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns';
import ProductCard from '@/components/ProductCard';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import SimplePageHeader from '@/components/ui/SimplePageHeader';
import type { ProductType } from '@/components/ui/ProductBadge';

interface PromoProduct {
  id: number;
  name: string;
  image_url: string | null;
  price: number;
  remaining: number;
  total_count: number;
  is_hot: boolean;
  type: ProductType;
  status: string;
}

/**
 * 促銷分類清單頁：列出一檔促銷方案（買五送一等）涵蓋的全部商品。
 * 輪播圖／公告可直接連到 /promo/<id>。
 * 資料走 public_product_promotions view（檔期與優先權 DB 端已套用，
 * 過期或下架的方案這裡自然查不到 → 顯示已結束）。
 */
export default function PromoListPage() {
  const params = useParams();
  const router = useRouter();
  const promoId = Number(params.id);

  const [promoName, setPromoName] = useState<string | null>(null);
  const [products, setProducts] = useState<PromoProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(promoId)) { setIsLoading(false); return; }
    let alive = true;
    const supabase = createClient();
    (async () => {
      const { data: rows } = await supabase
        .from('public_product_promotions')
        .select('product_id, name')
        .eq('promotion_id', promoId);
      if (!alive) return;
      if (!rows || rows.length === 0) { setIsLoading(false); return; }
      setPromoName(rows[0].name ?? null);

      const { data: prods } = await supabase
        .from('products')
        .select(PRODUCT_PUBLIC_COLUMNS)
        .in('id', rows.map(r => r.product_id))
        .neq('status', 'pending')
        .order('is_hot', { ascending: false })
        .order('created_at', { ascending: false });
      if (!alive) return;
      setProducts((prods ?? []) as unknown as PromoProduct[]);
      setIsLoading(false);
    })();
    return () => { alive = false; };
  }, [promoId]);

  if (isLoading) return <ProductLoadingScreen />;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <SimplePageHeader title={promoName ?? '促銷活動'} onBack={() => router.back()} />
      <div className="pt-14">
        <div className="max-w-[1200px] mx-auto px-3 sm:px-4 py-4">
          {products.length === 0 ? (
            <div className="py-24 text-center text-sm text-neutral-400">
              這檔活動已結束或尚未開始，去逛逛其他商品吧！
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
              {products.map(p => (
                <ProductCard
                  key={p.id}
                  id={p.id.toString()}
                  name={p.name}
                  image={p.image_url || ''}
                  price={p.price}
                  remaining={p.remaining}
                  total={p.total_count}
                  isHot={p.is_hot}
                  type={p.type}
                  status={p.status}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
