'use client'

import { AdminLayout, PageCard } from '@/components'
import { supabase } from '@/lib/supabaseClient'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { CardSkeleton } from '@/components/ui/Skeleton'

type ProductRow = {
  id: number
  product_code: string | null
  name: string
  type: string
  price: number
  status: string
  remaining: number
}

export default function MenuProductsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams()
  const menuId = params.id as string

  const [menuName, setMenuName] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [selectedProducts, setSelectedProducts] = useState<ProductRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProductRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    const run = async () => {
      if (!menuId) return
      setIsLoading(true)
      try {
        const { data: menu } = await supabase.from('categories').select('id, name').eq('id', menuId).single()
        if (menu?.name) setMenuName(menu.name)

        const { data: links } = await supabase
          .from('menu_products')
          .select('product_id')
          .eq('menu_id', menuId)
          .order('sort_order', { ascending: false })

        const ids = (links || [])
          .map((r: any) => Number(r.product_id))
          .filter((n: number) => Number.isFinite(n))

        setSelectedIds(ids)
      } finally {
        setIsLoading(false)
      }
    }
    run()
  }, [menuId])

  useEffect(() => {
    const run = async () => {
      if (!menuId) return
      if (selectedIds.length === 0) {
        setSelectedProducts([])
        return
      }
      const { data } = await supabase
        .from('products')
        .select('id, product_code, name, type, price, status, remaining')
        .in('id', selectedIds)
      const byId = new Map<number, ProductRow>((data || []).map((p: any) => [Number(p.id), p as ProductRow]))
      setSelectedProducts(selectedIds.map((id) => byId.get(id)).filter(Boolean) as ProductRow[])
    }
    run()
  }, [menuId, selectedIds])

  useEffect(() => {
    const q = searchQuery.trim()
    const timer = setTimeout(async () => {
      const baseQuery = supabase
        .from('products')
        .select('id, product_code, name, type, price, status, remaining')
        .neq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50)

      const query = q
        ? baseQuery.or(`name.ilike.%${q}%,product_code.ilike.%${q}%`)
        : baseQuery

      const { data } = await query
      setSearchResults((data || []) as any)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const addProduct = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const removeProduct = (id: number) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  const save = async () => {
    if (!menuId) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/menus/${menuId}/products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: selectedIds }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || '儲存失敗')
      router.push('/categories')
    } catch (e: any) {
      toast(e?.message || '儲存失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminLayout
      pageTitle="綁定商品"
      breadcrumbs={[
        { label: '分類清單', href: '/categories' },
        { label: menuName || '綁定商品', href: undefined },
      ]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-800">綁定商品</h2>
            <div className="text-sm text-neutral-500 mt-1">{menuName || menuId}</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/categories')}
              className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              儲存
            </button>
          </div>
        </div>

        <PageCard>
          <div className="p-4 space-y-4">
            <div>
              <div className="text-sm font-bold text-neutral-800 mb-2">已選商品（{selectedIds.length}）</div>
              {isLoading ? (
                <CardSkeleton rows={3} />
              ) : selectedProducts.length === 0 ? (
                <div className="text-sm text-neutral-500">尚未綁定商品</div>
              ) : (
                <div className="space-y-2">
                  {selectedProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-neutral-900 truncate">
                          {p.product_code ? `${p.product_code} ` : ''}{p.name}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {p.type} · {p.status} · 剩餘 {p.remaining}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProduct(p.id)}
                        className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-bold"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-neutral-100 pt-4">
              <div className="text-sm font-bold text-neutral-800 mb-2">搜尋商品</div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 px-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20"
                placeholder="輸入商品名稱或商品編號"
              />
              <div className="mt-3 space-y-2">
                {searchResults.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-neutral-900 truncate">
                        {p.product_code ? `${p.product_code} ` : ''}{p.name}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {p.type} · {p.status} · 剩餘 {p.remaining}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addProduct(p.id)}
                      disabled={selectedIdSet.has(p.id)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50"
                    >
                      加入
                    </button>
                  </div>
                ))}
                {searchResults.length === 0 && (
                  <div className="text-sm text-neutral-500">沒有找到商品</div>
                )}
              </div>
            </div>
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}

