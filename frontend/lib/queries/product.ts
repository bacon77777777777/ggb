import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { PRODUCT_PUBLIC_COLUMNS, PRIZE_PUBLIC_COLUMNS } from '@/lib/productColumns';

type ProductRow = Database['public']['Tables']['products']['Row'];
type PrizeRow = Database['public']['Tables']['product_prizes']['Row'];

export interface ProductDetail {
  product: ProductRow;
  supplierName: string | null;
  categories: { id: string; name: string }[];
  prizes: PrizeRow[];
}

/**
 * 商品頁的主資料（商品＋廠商名＋分類＋品項）。
 * 維持直連 Supabase、不走 CDN：庫存／剩餘數要即時。
 * ProductCard 在 touchstart 就用同一個 key 預取，商品頁掛載時直接有資料。
 */
export const productKey = (id: number) => ['product', id] as const;

export async function fetchProductDetail(
  supabase: SupabaseClient<Database>,
  productId: number,
): Promise<ProductDetail> {
  const { data: productData, error: productError } = await supabase
    .from('products')
    .select(PRODUCT_PUBLIC_COLUMNS)
    .eq('id', productId)
    .neq('status', 'pending')
    .single();
  if (productError) throw productError;
  const product = productData as unknown as ProductRow;

  const [supRes, menuRes, prizesRes] = await Promise.all([
    product.supplier_id
      ? supabase.from('suppliers').select('name').eq('id', product.supplier_id).single()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('product_categories').select('categories(id, name)').eq('product_id', productId),
    supabase.from('product_prizes').select(PRIZE_PUBLIC_COLUMNS).eq('product_id', productId)
      .order('level', { ascending: true }),
  ]);
  if (prizesRes.error) throw prizesRes.error;

  return {
    product,
    supplierName: (supRes.data as { name?: string } | null)?.name ?? null,
    categories: ((menuRes.data as Record<string, unknown>[] | null) || [])
      .map(r => r.categories as { id: string; name: string } | null)
      .filter((c): c is { id: string; name: string } => !!c),
    prizes: (prizesRes.data || []) as unknown as PrizeRow[],
  };
}
