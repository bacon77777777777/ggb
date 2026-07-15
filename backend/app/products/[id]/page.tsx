'use client'

const MODULE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gacha:    [
    { value: 'gacha_classic', label: '原始經典（物理蛋球掉落）' },
    { value: 'gacha_modern',  label: '現代膠囊機（格列膠囊展示）' },
    { value: 'gacha_retro',   label: '復古街頭機（日式扭蛋街機）' },
  ],
  ichiban:  [
    { value: 'ichiban_grid', label: '經典列表（票券網格撕開）' },
    { value: 'ichiban_tear', label: '沉浸式撕紙（全畫面揭曉）' },
  ],
  card:     [
    { value: 'card_pack',  label: '蓄力開卡包（按住撕開 → 翻牌）' },
    { value: 'card_flip',  label: '直接翻牌（略過開包動畫）' },
  ],
  custom:   [
    { value: 'custom_grid', label: '經典列表（票券網格撕開）' },
    { value: 'custom_tear', label: '沉浸式撕紙（全畫面揭曉）' },
  ],
  blindbox: [
    { value: 'blindbox_classic', label: '原始經典（物理蛋球掉落）' },
    { value: 'blindbox_claw',    label: '夾娃娃機' },
  ],
}

import AdminLayout from '@/components/AdminLayout'
import { YearMonthPicker, DatePicker, Modal, Input, TagSelector } from '@/components'
import { useLog } from '@/contexts/LogContext'
import { normalizePrizeLevels } from '@/utils/normalizePrizes'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { generateTXID, calculateTXIDHash } from '@/utils/drawLogicClient'
import { supabase } from '@/lib/supabaseClient'
import { SmallItem } from '@/types/product'

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const { addLog } = useLog()
  const productId = params.id as string
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    cost: '',
    image: null as File | null,
    imagePreview: '',
    status: 'active',
    category: '一番賞',
    categoryId: '',
    type: 'ichiban',
    remaining: '',
    totalCount: '',
    isHot: false,
    releaseYear: '',
    releaseMonth: '',
    distributor: '',
    barcode: '',
    series: '',
    supplierId: '' as string,
    machineTheme: '' as string,
    rarity: 3,
    startedAt: '',
    endedAt: '',
    txidHash: '',
    seed: '',
    selectedTagIds: [] as string[],
  })

  const isLastOneLevel = (level: string) => {
    if (!level) return false
    const l = level.toLowerCase()
    return l.includes('last one') || level.includes('最後賞')
  }
  const ichibanLevels = [
    { value: 'A賞', label: 'A賞' },
    { value: 'B賞', label: 'B賞' },
    { value: 'C賞', label: 'C賞' },
    { value: 'D賞', label: 'D賞' },
    { value: 'E賞', label: 'E賞' },
    { value: 'F賞', label: 'F賞' },
    { value: 'G賞', label: 'G賞' },
    { value: 'H賞', label: 'H賞' },
    { value: 'I賞', label: 'I賞' },
    { value: 'J賞', label: 'J賞' },
    { value: '最後賞', label: '最後賞' },
  ]
  const gachaLevels = [
    { value: 'Normal / Common', label: '一般版 Normal / Common' },
    { value: 'Rare', label: '稀有版 Rare' },
    { value: 'Secret', label: '隱藏版 Secret' },
    { value: 'Color Variant', label: '異色版 Color Variant' },
    { value: 'Effect / Clear', label: '特效版 Effect / Clear' },
    { value: 'Limited', label: '限定版 Limited' },
    { value: 'Option Parts', label: '配件版 Option Parts' },
  ]
  const blindboxLevels = [
    { value: '普通款', label: '普通款 Normal' },
    { value: '稀有款', label: '稀有款 Rare' },
    { value: '隱藏款', label: '隱藏款 Secret / Chase' },
    { value: '異色款', label: '異色款 Color Variant' },
    { value: '夜光款', label: '夜光款 Glow' },
    { value: '透明款', label: '透明款 Clear' },
    { value: '店鋪限定', label: '店鋪限定 Store Limited' },
    { value: '首批限定', label: '首批限定 First Edition' },
  ]
  const cardLevels = [
    { value: 'N', label: 'N' },
    { value: 'R', label: 'R' },
    { value: 'SR', label: 'SR' },
    { value: 'SSR', label: 'SSR' },
    { value: 'UR', label: 'UR' },
    { value: 'LR', label: 'LR' },
    { value: 'SP', label: 'SP' },
    { value: 'SEC', label: 'SEC' },
    { value: 'PR', label: 'PR' },
    { value: 'HR', label: 'HR' },
    { value: 'GR', label: 'GR' },
    { value: 'MR', label: 'MR' },
    { value: 'CHR', label: 'CHR' },
  ]
  const [prizes, setPrizes] = useState<Array<{
    id: string
    name: string
    level: string
    image: string
    imageFile: File | null
    imagePreview: string
    total: number
    remaining: number
    probability: number
    decompose_type: 'auto' | 'percent' | 'fixed'
    decompose_value: number | null
  }>>([])
  const [savedFormData, setSavedFormData] = useState<typeof formData | null>(null)
  const [savedPrizes, setSavedPrizes] = useState<typeof prizes>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [productCode, setProductCode] = useState<string>('')
  const [deletedPrizeIds, setDeletedPrizeIds] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string; tax_id: string | null }>>([])

  // State for small item library
  const [showSmallItemLibrary, setShowSmallItemLibrary] = useState(false)
  const [libraryItems, setLibraryItems] = useState<SmallItem[]>([])
  const [selectedPrizeIndex, setSelectedPrizeIndex] = useState<number | null>(null)
  const [librarySearchQuery, setLibrarySearchQuery] = useState('')
  const [librarySelectedCategory, setLibrarySelectedCategory] = useState('all')

  // Fetch suppliers list
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSuppliers(data) })
      .catch(() => {})
  }, [])

  // Fetch small items when library is opened
  useEffect(() => {
    if (showSmallItemLibrary && libraryItems.length === 0) {
      const fetchLibraryItems = async () => {
        const { data, error } = await supabase
          .from('small_items')
          .select('*')
          .order('created_at', { ascending: false })

        if (data) {
          const mappedItems: SmallItem[] = data.map(item => ({
            id: item.id,
            name: item.name,
            imageUrl: item.image_url,
            category: item.category,
            level: item.level,
            description: item.description,
            createdAt: item.created_at
          }))
          setLibraryItems(mappedItems)
        }
      }
      fetchLibraryItems()
    }
  }, [showSmallItemLibrary])

  // 自動計算商品總數和剩餘數量（排除最後賞）
  const normalPrizes = prizes.filter(p => !isLastOneLevel(p.level))
  const calculatedTotalCount = normalPrizes.reduce((sum, prize) => sum + prize.total, 0)
  const calculatedRemaining = normalPrizes.reduce((sum, prize) => sum + prize.remaining, 0)

  // 當獎項數量變化時，自動更新機率
  useEffect(() => {
    if (calculatedTotalCount > 0) {
      setPrizes(prevPrizes => prevPrizes.map(prize => {
        if (isLastOneLevel(prize.level)) {
          return { ...prize, probability: 0 }
        }
        return {
          ...prize,
          probability: prize.total > 0 ? (prize.total / calculatedTotalCount) * 100 : 0
        }
      }))
    } else {
      setPrizes(prevPrizes => prevPrizes.map(prize => ({
        ...prize,
        probability: 0
      })))
    }
  }, [calculatedTotalCount])

  // 當狀態變為 ended 時，自動記錄完抽時間
  useEffect(() => {
    if (formData.status === 'ended' && !formData.endedAt) {
      const now = new Date()
      const endedAtStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      setFormData(prev => ({ ...prev, endedAt: endedAtStr }))
    } else if (formData.status !== 'ended' && formData.endedAt) {
      // 當狀態從 ended 變為其他狀態時，清除完抽時間
      setFormData(prev => ({ ...prev, endedAt: '' }))
    }
  }, [formData.status])

  // 當商品上架且開賣時，自動生成 TXID Hash（基於 Seed）
  useEffect(() => {
    const checkAndGenerateTXIDHash = async () => {
      // 檢查條件：狀態為 active（進行中）且有開賣時間，但還沒有 TXID Hash
      if (formData.status === 'active' && formData.startedAt && !formData.txidHash) {
        if (typeof window === 'undefined' || !window.crypto) {
          return
        }

        try {
          // 生成隨機 Seed
          const seed = Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')

          const { calculateSeedHash } = await import('@/utils/drawLogicClient')
          const hash = await calculateSeedHash(seed)

          // 同時保存 Seed 和 TXID Hash
          setFormData(prev => ({ ...prev, txidHash: hash, seed: seed }))
          addLog('自動生成 TXID Hash', '商品管理', `商品「${formData.name || '未命名'}」已開賣，自動生成 TXID Hash 和 Seed`, 'success')
        } catch (e) {
          console.error('自動生成 TXID Hash 失敗:', e)
        }
      }
    }

    checkAndGenerateTXIDHash()
  }, [formData.status, formData.startedAt, formData.name, addLog])
  useEffect(() => {
    const fetchProduct = async () => {
      if (!productId) return

      try {
        const { data: product, error } = await supabase
          .from('products')
          .select(`
            *,
            product_prizes (*)
          `)
          .eq('id', productId)
          .single()

        if (error) {
          throw error
        }

        if (product) {
          setProductCode(product.product_code)

          // 設置日期
          const now = new Date()
          const defaultYear = product.release_year || now.getFullYear().toString()
          const defaultMonth = product.release_month || (now.getMonth() + 1).toString().padStart(2, '0')

          // Fetch existing tags
          const { data: tags } = await supabase
            .from('product_tag_links')
            .select('tag_id')
            .eq('product_id', productId)

          const tagIds = tags ? tags.map((t: any) => t.tag_id) : []

          const loaded = {
            name: product.name,
            price: product.price.toString(),
            cost: product.cost != null ? product.cost.toString() : '',
            image: null as File | null,
            imagePreview: product.image_url || '/images/item.png',
            status: product.status,
            category: product.category || '',
            categoryId: product.category_id || '',
            type: product.type || 'ichiban',
            remaining: product.remaining.toString(),
            totalCount: product.total_count?.toString() || '0',
            isHot: product.is_hot,
            releaseYear: defaultYear,
            releaseMonth: defaultMonth,
            distributor: product.distributor || '',
            barcode: product.barcode || '',
            series: product.series || '',
            supplierId: product.supplier_id ? String(product.supplier_id) : '',
            machineTheme: product.machine_theme || '',
            rarity: product.rarity || 3,
            startedAt: product.started_at ? product.started_at.split('T')[0] : '',
            endedAt: product.ended_at ? product.ended_at.replace('T', ' ').split('.')[0] : '',
            txidHash: product.txid_hash || '',
            seed: product.seed || '',
            selectedTagIds: tagIds,
          }
          setFormData(loaded)
          setSavedFormData(loaded)

          const sortedPrizes = (product.product_prizes || []).sort((a: any, b: any) => {
            return a.level.localeCompare(b.level)
          })

          const loadedPrizes = sortedPrizes.map((prize: any) => ({
            id: prize.id,
            name: prize.name,
            level: prize.level,
            image: prize.image_url,
            imageFile: null as File | null,
            imagePreview: prize.image_url,
            total: prize.total,
            remaining: prize.remaining,
            probability: prize.probability,
            decompose_type: prize.decompose_type || 'auto',
            decompose_value: prize.decompose_value ?? null,
          }))
          setPrizes(loadedPrizes)
          setSavedPrizes(loadedPrizes)
        }
      } catch (e) {
        console.error('Error loading product:', e)
        // 商品不存在或錯誤，重定向回商品列表
        setTimeout(() => {
          router.push('/products')
        }, 1000)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProduct()
  }, [productId, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsSubmitting(true)

    try {
      const uploadViaAdmin = async (file: File, fileName: string) => {
        const form = new FormData()
        form.append('file', file)
        form.append('bucket', 'products')
        form.append('path', fileName)
        const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || '圖片上傳失敗')
        }
        const data = (await res.json()) as { publicUrl: string }
        return data.publicUrl
      }

      // 1. Upload Product Image
      let productImageUrl = formData.imagePreview
      // If the image is a blob URL (newly selected), upload it.
      // If it's a supabase URL (existing), keep it.
      // Or simply check if formData.image is not null.
      if (formData.image) {
        const file = formData.image
        const fileExt = file.name.split('.').pop()
        const fileName = `product-${Date.now()}.${fileExt}`
        productImageUrl = await uploadViaAdmin(file, fileName)
      }

      // 2. Prepare Product Data
      const productData: any = {
        name: formData.name,
        category: formData.category,
        type: formData.type,
        price: parseInt(formData.price) || 0,
        cost: formData.cost ? parseFloat(formData.cost) : null,
        remaining: calculatedRemaining,
        status: formData.status,
        is_hot: formData.isHot,
        total_count: calculatedTotalCount,
        distributor: formData.distributor,
        barcode: formData.barcode || null,
        series: formData.series || null,
        supplier_id: formData.supplierId ? parseInt(formData.supplierId) : null,
        machine_theme: formData.machineTheme || null,
        rarity: formData.rarity,
        ended_at: formData.status === 'ended' ? formData.endedAt : null,
        // txid_hash: formData.txidHash || null, // Seed and Hash should not be updated via Edit form to preserve fairness
        // seed: formData.seed || null,
        image_url: productImageUrl,
      }

      productData.release_year = formData.releaseYear || null
      productData.release_month = formData.releaseMonth || null

      const prizePayload = await Promise.all(prizes.map(async (prize) => {
        let prizeImageUrl = prize.imagePreview || '/images/item.png'
        if (prize.imageFile) {
          const file = prize.imageFile
          const fileExt = file.name.split('.').pop()
          const fileName = `prize-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
          prizeImageUrl = await uploadViaAdmin(file, fileName)
        }

        const payload: any = {
          name: prize.name,
          level: prize.level,
          image_url: prizeImageUrl,
          total: prize.total,
          remaining: prize.remaining,
          probability: prize.probability,
          decompose_type: prize.decompose_type || 'auto',
          decompose_value: prize.decompose_value ?? null,
        }

        if (!prize.id.toString().startsWith('p')) {
          payload.id = prize.id
        }

        return payload
      }))

      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: productData,
          tagIds: formData.selectedTagIds,
          deletedPrizeIds,
          prizes: prizePayload,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '更新商品失敗')
      }

      try {
        const names = ['realtime-products-home', 'realtime-products-shop']
        await Promise.all(
          names.map(async (name) => {
            const channel = supabase.channel(name)
            await new Promise<void>((resolve) => {
              channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') resolve()
              })
            })
            await channel.send({
              type: 'broadcast',
              event: 'products_updated',
              payload: { id: productId, is_hot: productData.is_hot, status: productData.status }
            })
            supabase.removeChannel(channel)
          })
        )
      } catch (err) {
        console.error('Failed to broadcast product updates', err)
      }

      addLog('修改商品', '商品管理', `修改商品「${formData.name}」`, 'success')
      router.push('/products')

    } catch (e: any) {
      const msg = e?.message || e?.error_description || JSON.stringify(e || {})
      console.error('Failed to update product:', msg)
      alert(`更新商品失敗：${msg || '請稍後再試'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    )
  }

  // 一番賞/抽卡/自製賞：可驗證，數量+剩餘鎖定，不可新增/刪除品項
  const isVerifiable = ['ichiban', 'card', 'custom'].includes(formData.type)
  // 轉蛋/盒玩：機率制，等級固定「普通」，數量可疊加
  const isGachaType = ['gacha', 'blindbox'].includes(formData.type)
  const defaultLevel = formData.type === 'gacha' ? 'Normal / Common' : '普通款'

  return (
    <AdminLayout
      pageTitle="編輯商品"
      breadcrumbs={[
        { label: '商品管理', href: '/products' },
        { label: productCode, href: `/products/${productId}` },
        { label: '編輯', href: `/products/${productId}` }
      ]}
    >
      <div className="space-y-4">
        {/* 頂部操作列 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-full hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <div className="flex items-center gap-2">
            {savedFormData && (
              <button
                type="button"
                onClick={() => {
                  setFormData(savedFormData)
                  setPrizes(savedPrizes)
                  setDeletedPrizeIds([])
                }}
                className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-full hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md"
              >
                重置
              </button>
            )}
            <button
              type="submit"
              form="product-form"
              disabled={isSubmitting}
              className="px-4 py-2 bg-primary text-white rounded-full hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm hover:shadow-md"
            >
              {isSubmitting ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>

        <form id="product-form" onSubmit={handleSubmit} className="space-y-3">

          {/* ── Section: 上架資訊 ── */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">上架資訊</h3>
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">狀態</label>
                <div className="relative">
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-2.5 py-1.5 pr-7 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer hover:border-neutral-300 transition-colors">
                    <option value="active">進行中</option>
                    <option value="pending">待上架</option>
                    <option value="ended">已完抽</option>
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>
              <div>
                <DatePicker label="開賣時間" value={formData.startedAt}
                  onChange={(value) => setFormData(prev => ({ ...prev, startedAt: value }))}
                  placeholder="選擇時間" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">售價 (G) <span className="text-red-500">*</span></label>
                <input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors"
                  placeholder="0" required min="1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">成本</label>
                <input type="number" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors"
                  placeholder="0" min="0" step="0.01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">稀有度</label>
                <div className="relative">
                  <select value={formData.rarity} onChange={(e) => setFormData({ ...formData, rarity: parseInt(e.target.value) })}
                    className="w-full px-2.5 py-1.5 pr-7 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer hover:border-neutral-300 transition-colors">
                    <option value="1">1★</option>
                    <option value="2">2★</option>
                    <option value="3">3★</option>
                    <option value="4">4★</option>
                    <option value="5">5★</option>
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>
            </div>
            {/* 完抽時間 / Seed（條件顯示） */}
            {formData.status === 'ended' && (
              <div className="grid grid-cols-5 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">完抽時間</label>
                  <div className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-600">
                    {formData.endedAt || '自動記錄中...'}
                  </div>
                </div>
                {formData.seed && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Seed</label>
                    <div className="flex gap-1">
                      <div className="flex-1 px-2 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-600 truncate">{formData.seed}</div>
                      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(formData.seed || ''); alert('已複製') } catch(e){} }}
                        className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 text-xs whitespace-nowrap">複製</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Section: 商品資訊 ── */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">商品資訊</h3>
            <div className="space-y-2">
              {/* Row 1: 名稱 + 圖 */}
              <div className="flex items-center gap-3">
                <label className="flex-shrink-0 cursor-pointer group relative">
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setFormData({ ...formData, image: file, imagePreview: URL.createObjectURL(file) })
                    }} />
                  <div className="w-14 h-14 rounded-lg border-2 border-dashed border-neutral-300 overflow-hidden bg-white flex items-center justify-center group-hover:border-primary transition-colors">
                    {formData.imagePreview
                      ? <img src={formData.imagePreview} alt="" className="w-full h-full object-cover" />
                      : <svg className="w-5 h-5 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    }
                  </div>
                  {formData.imagePreview && (
                    <button type="button" onClick={(e) => { e.preventDefault(); setFormData({ ...formData, image: null, imagePreview: '' }) }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 z-10">
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </label>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">商品名稱 <span className="text-red-500">*</span></label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors"
                    placeholder="請輸入商品名稱" required />
                </div>
              </div>

              {/* Row 2: 類型 廠商 抽獎模組 上市時間 代理商 */}
              <div className="grid grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">類別 <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select value={formData.type} disabled
                      className="w-full px-2 py-1.5 pr-6 bg-neutral-50 border border-neutral-200 rounded-lg text-sm appearance-none cursor-not-allowed text-neutral-500">
                      <option value="ichiban">一番賞</option>
                      <option value="blindbox">盒玩</option>
                      <option value="gacha">轉蛋</option>
                      <option value="card">抽卡</option>
                      <option value="custom">自製賞</option>
                    </select>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-3.5 h-3.5 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">廠商</label>
                  <select value={formData.supplierId} onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors">
                    <option value="">— 未指定 —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">抽獎模組</label>
                  <select value={formData.machineTheme} onChange={(e) => setFormData({ ...formData, machineTheme: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors">
                    <option value="">— 類別預設 —</option>
                    {(MODULE_OPTIONS[formData.type] ?? []).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">上市時間</label>
                  <YearMonthPicker year={formData.releaseYear} month={formData.releaseMonth}
                    onYearChange={(value) => setFormData({ ...formData, releaseYear: value })}
                    onMonthChange={(value) => setFormData({ ...formData, releaseMonth: value })}
                    onClear={() => setFormData({ ...formData, releaseYear: '', releaseMonth: '' })}
                    placeholder="選擇上市時間" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">代理商</label>
                  <input type="text" value={formData.distributor} onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors"
                    placeholder="萬代南夢宮" />
                </div>
              </div>

              {/* Row 3: 條碼 系列 熱賣 */}
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">條碼</label>
                  <input type="text" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors"
                    placeholder="4549660718956" maxLength={50} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">系列</label>
                  <input type="text" value={formData.series} onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary hover:border-neutral-300 transition-colors"
                    placeholder="寶可夢、鬼滅之刃..." />
                </div>
                <div className="flex items-center pb-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.isHot} onChange={(e) => setFormData({ ...formData, isHot: e.target.checked })}
                      className="w-4 h-4 text-primary focus:ring-primary rounded border border-neutral-300" />
                    <span className="text-xs font-medium text-neutral-600">熱賣商品</span>
                  </label>
                </div>
              </div>

              {/* 標籤 */}
              <div>
                <TagSelector value={formData.selectedTagIds}
                  onChange={(newTags) => setFormData((prev) => ({ ...prev, selectedTagIds: newTags }))}
                  label="標籤" />
              </div>
            </div>
          </div>

          {/* ── Section: 品項 ── */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">品項</h3>
              <span className="text-xs font-mono text-neutral-400">
                剩餘 <span className="text-neutral-700 font-semibold">{calculatedRemaining}</span>
                <span className="mx-1 text-neutral-300">/</span>
                總計 <span className="text-neutral-700 font-semibold">{calculatedTotalCount}</span>
              </span>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-3">
                {prizes.map((prize, index) => (
                  <div key={prize.id} className="border border-neutral-200 rounded-lg p-3 bg-neutral-50 hover:border-primary/50 transition-colors">
                    {/* 品項標頭 */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-neutral-500">品項 {index + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-neutral-400">
                          {prize.remaining}<span className="text-neutral-300">/</span>{prize.total}
                        </span>
                        {!isVerifiable && (
                          <button
                            type="button"
                            onClick={() => {
                              const prizeToDelete = prizes[index]
                              if (!prizeToDelete.id.toString().startsWith('p')) {
                                setDeletedPrizeIds(prev => [...prev, prizeToDelete.id])
                              }
                              setPrizes(prizes.filter((_, i) => i !== index))
                            }}
                            className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                            title="刪除此品項"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 主內容：縮圖 + 欄位 */}
                    <div className="flex gap-2">
                      {/* 可點擊圖片縮圖 */}
                      <label className="flex-shrink-0 cursor-pointer group relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const updated = [...prizes]
                              updated[index].imageFile = file
                              updated[index].imagePreview = URL.createObjectURL(file)
                              updated[index].image = ''
                              setPrizes(updated)
                            }
                          }}
                        />
                        <div className="w-14 h-14 rounded-lg border-2 border-dashed border-neutral-300 overflow-hidden bg-white flex items-center justify-center group-hover:border-primary transition-colors">
                          {prize.imagePreview ? (
                            <img src={prize.imagePreview} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-5 h-5 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          )}
                        </div>
                        {prize.imagePreview && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              const updated = [...prizes]
                              updated[index].imageFile = null
                              updated[index].imagePreview = ''
                              updated[index].image = ''
                              setPrizes(updated)
                            }}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </label>

                      {/* 欄位 */}
                      <div className="flex-1 space-y-1.5 min-w-0">
                        {/* 名稱 + 等級 */}
                        <div className="grid grid-cols-2 gap-1.5">
                          {/* 名稱：全類型可改 */}
                          <input
                            type="text"
                            value={prize.name}
                            onChange={(e) => {
                              const updated = [...prizes]
                              updated[index].name = e.target.value
                              setPrizes(updated)
                            }}
                            className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            placeholder="名稱"
                          />
                          {/* 等級：盒玩/轉蛋固定普通；一番賞/抽卡/自製賞可選 */}
                          {isGachaType ? (
                            <div className="w-full px-2 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-400">
                              普通
                            </div>
                          ) : (
                            <select
                              value={prize.level}
                              onChange={(e) => {
                                const updated = [...prizes]
                                const newLevel = e.target.value
                                updated[index].level = newLevel
                                if (isLastOneLevel(newLevel)) {
                                  const fixed = updated[index]
                                  const ensureOne = (v: number) => (v && v > 0 ? Math.min(v, 1) : 1)
                                  fixed.total = ensureOne(fixed.total)
                                  fixed.remaining = Math.max(0, Math.min(fixed.remaining, 1))
                                  fixed.probability = 0
                                }
                                setPrizes(updated)
                              }}
                              className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none"
                            >
                              <option value="">等級</option>
                              {(formData.type === 'card' ? cardLevels : ichibanLevels).map(level => (
                                <option key={level.value} value={level.value}>{level.label}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* 數量 + 剩餘 + 機率 */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {/* 數量：一番賞/抽卡/自製賞唯讀；盒玩/轉蛋可疊加 */}
                          {isVerifiable ? (
                            <div className="px-2 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-500">
                              {prize.total || 0}
                            </div>
                          ) : (
                            <input
                              type="number"
                              value={prize.total === 0 ? '' : prize.total}
                              onChange={(e) => {
                                const newTotal = e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                const delta = newTotal - prize.total
                                const updated = [...prizes]
                                updated[index].total = newTotal
                                updated[index].remaining = Math.max(0, prize.remaining + delta)
                                setPrizes(updated)
                              }}
                              className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                              min="0"
                              placeholder="數量"
                            />
                          )}
                          {/* 剩餘：全類型唯讀 */}
                          <div className="px-2 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-500">
                            {prize.remaining}
                          </div>
                          {/* 機率 */}
                          <div className="px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-600 flex items-center justify-center">
                            {isLastOneLevel(prize.level)
                              ? '最後賞'
                              : (calculatedTotalCount > 0 && prize.total > 0
                                  ? ((prize.total / calculatedTotalCount) * 100).toFixed(1) + '%'
                                  : '0%'
                                )
                            }
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 低階賞資源庫按鈕 */}
                    {['E賞', 'F賞', 'G賞', 'H賞', 'I賞', 'J賞'].includes(prize.level) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPrizeIndex(index)
                          setShowSmallItemLibrary(true)
                          setLibrarySearchQuery('')
                          setLibrarySelectedCategory('all')
                        }}
                        className="mt-2 w-full px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        從資源庫選擇
                      </button>
                    )}

                    {/* 分解設定 */}
                    {formData.type !== 'gacha' && formData.type !== 'blindbox' ? (
                      <div className="mt-2 pt-2 border-t border-neutral-100">
                        <div className="flex gap-2 items-start">
                          <div className="w-28 flex-shrink-0">
                            <select
                              value={prize.decompose_type}
                              onChange={(e) => {
                                const updated = [...prizes]
                                updated[index].decompose_type = e.target.value as 'auto' | 'percent' | 'fixed'
                                updated[index].decompose_value = null
                                setPrizes(updated)
                              }}
                              className="w-full px-2 py-1 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                            >
                              <option value="auto">智能分解</option>
                              <option value="percent">百分比 (%)</option>
                              <option value="fixed">固定代幣</option>
                            </select>
                          </div>
                          {prize.decompose_type === 'auto' ? (
                            <div className="flex-1 px-2 py-1 bg-neutral-100 border border-neutral-200 rounded-lg text-xs text-neutral-500">
                              庫存≤3 → 抽價20%；庫存≥4 → 10代幣
                            </div>
                          ) : (
                            <div className="flex-1">
                              <div className="relative">
                                <input
                                  type="number"
                                  min={1}
                                  value={prize.decompose_value ?? ''}
                                  onChange={(e) => {
                                    const updated = [...prizes]
                                    updated[index].decompose_value = e.target.value === '' ? null : parseInt(e.target.value) || null
                                    setPrizes(updated)
                                  }}
                                  className="w-full px-2 py-1 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                                  placeholder={prize.decompose_type === 'percent' ? '例如 20' : '例如 50'}
                                />
                                {prize.decompose_type === 'percent' && (
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">%</span>
                                )}
                              </div>
                              {prize.decompose_type === 'percent' && prize.decompose_value && (
                                <p className="text-xs text-neutral-400 mt-0.5">
                                  預估：{Math.max(1, Math.floor(parseInt(formData.price || '0') * prize.decompose_value / 100))} 代幣
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 pt-2 border-t border-neutral-100">
                        <p className="text-xs text-neutral-400">轉蛋／盒玩固定分解 10 代幣</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 空品項提示 */}
              {!isVerifiable && prizes.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPrizes([{ id: `p${Date.now()}`, name: '', level: isGachaType ? defaultLevel : '', image: '', imageFile: null as File | null, imagePreview: '', total: 0, remaining: 0, probability: 0, decompose_type: 'auto' as const, decompose_value: null as number | null }])
                  }}
                  className="w-full text-center py-10 border-2 border-dashed border-neutral-200 rounded-lg bg-neutral-50 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
                >
                  <svg className="w-8 h-8 mx-auto mb-2 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <p className="text-sm text-neutral-500">點擊新增品項</p>
                </button>
              )}

              {/* 新增品項按鈕 */}
              {!isVerifiable && prizes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const newPrize = {
                      id: `p${Date.now()}`,
                      name: '',
                      level: isGachaType ? defaultLevel : '',
                      image: '',
                      imageFile: null as File | null,
                      imagePreview: '',
                      total: 0,
                      remaining: 0,
                      probability: 0,
                      decompose_type: 'auto' as const,
                      decompose_value: null as number | null,
                    }
                    setPrizes([...prizes, newPrize])
                  }}
                  className="w-full text-center py-2.5 border-2 border-dashed border-neutral-200 rounded-lg bg-neutral-50 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 hover:text-primary">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>新增品項</span>
                  </div>
                </button>
              )}
            </div>
          </div>

        </form>

        {/* 小物資源庫選擇彈窗 */}
        <Modal
          isOpen={showSmallItemLibrary}
          onClose={() => {
            setShowSmallItemLibrary(false)
            setSelectedPrizeIndex(null)
            setLibrarySearchQuery('')
            setLibrarySelectedCategory('all')
          }}
          title="從資源庫選擇小物"
        >
          <div className="space-y-4">
            {/* 搜尋和篩選 */}
            <div className="space-y-3">
              <input
                type="text"
                value={librarySearchQuery}
                onChange={(e) => setLibrarySearchQuery(e.target.value)}
                placeholder="搜尋小物名稱、分類..."
                className="w-full px-3 py-2 border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <select
                value={librarySelectedCategory}
                onChange={(e) => setLibrarySelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">全部分類</option>
                {Array.from(new Set(libraryItems.map(item => item.category))).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* 小物列表 */}
            <div className="max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {libraryItems
                  .filter(item => {
                    const matchSearch = !librarySearchQuery ||
                      item.name.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
                      item.category.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
                      (item.description && item.description.toLowerCase().includes(librarySearchQuery.toLowerCase()))
                    const matchCategory = librarySelectedCategory === 'all' || item.category === librarySelectedCategory
                    return matchSearch && matchCategory
                  })
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (selectedPrizeIndex !== null) {
                          const updated = [...prizes]
                          updated[selectedPrizeIndex].name = item.name
                          updated[selectedPrizeIndex].image = item.imageUrl || ''
                          updated[selectedPrizeIndex].imagePreview = item.imageUrl || ''
                          updated[selectedPrizeIndex].imageFile = null
                          setPrizes(updated)
                        }
                        setShowSmallItemLibrary(false)
                        setSelectedPrizeIndex(null)
                        setLibrarySearchQuery('')
                        setLibrarySelectedCategory('all')
                      }}
                      className="p-3 border-2 border-neutral-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="relative w-full aspect-square bg-neutral-100 rounded-lg overflow-hidden mb-2">
                        <Image
                          src={item.imageUrl || 'https://via.placeholder.com/60'}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="text-sm font-medium text-neutral-900 mb-1">{item.name}</div>
                      <div className="text-xs text-neutral-500">{item.category}</div>
                    </button>
                  ))}
              </div>
              {libraryItems.filter(item => {
                const matchSearch = !librarySearchQuery ||
                  item.name.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
                  item.category.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
                  (item.description && item.description.toLowerCase().includes(librarySearchQuery.toLowerCase()))
                const matchCategory = librarySelectedCategory === 'all' || item.category === librarySelectedCategory
                return matchSearch && matchCategory
              }).length === 0 && (
                <div className="text-center py-8 text-neutral-500">
                  <p>找不到符合條件的小物</p>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
              <Link
                href="/small-items/new"
                className="px-4 py-2 text-sm text-primary hover:text-primary-dark font-medium"
              >
                + 新增小物到資源庫
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowSmallItemLibrary(false)
                  setSelectedPrizeIndex(null)
                  setLibrarySearchQuery('')
                  setLibrarySelectedCategory('all')
                }}
                className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  )
}
