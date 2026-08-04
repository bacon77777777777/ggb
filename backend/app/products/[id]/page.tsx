'use client'

const MODULE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gacha:    [
    { value: 'gacha_classic', label: '原始經典（物理蛋球掉落）' },
    { value: 'gacha_mode2',   label: '新款機台（旋鈕式蛋口出蛋）' },
    { value: 'gacha_mode3',   label: '金光閃閃機台（旋鈕式蛋口出蛋）' },
    { value: 'gacha_mode4',   label: '狗狗蛋箱（無旋鈕，蛋口出蛋）' },
  ],
  ichiban:  [
    { value: 'ichiban_grid', label: '經典列表（票券網格撕開）' },
    { value: 'ichiban_tear', label: '沉浸式撕紙（全畫面揭曉）' },
  ],
  card:     [
    { value: 'card_pack',  label: '蓄力開卡包（按住撕開 → 翻牌）' },
    { value: 'card_video', label: '過場影片（播完回商品頁彈出恭喜）' },
  ],
  custom:   [
    { value: 'custom_combo', label: '影片互動 Combo（全畫面影片＋互動點擊）' },
  ],
  blindbox: [
    { value: 'blindbox_classic', label: '原始經典（過場華麗動畫）' },
    { value: 'blindbox_mode2',   label: '販賣機（可愛兔子貨架，盒子飛入取物口）' },
    { value: 'blindbox_mode3',   label: '販賣機（叢林探險，盒子飛入取物口）' },
    { value: 'blindbox_mode4',   label: '販賣機（賽璐璐風格，盒子飛入取物口）' },
  ],
}

import AdminLayout from '@/components/AdminLayout'
import { YearMonthPicker, DatePicker, Modal, Input, TagSelector } from '@/components'
import SelectField from '@/components/ui/SelectField'
import { useLog } from '@/contexts/LogContext'
import { normalizePrizeLevels } from '@/utils/normalizePrizes'
import { useRouter, useParams } from 'next/navigation'
import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { generateTXID, calculateTXIDHash } from '@/utils/drawLogicClient'
import { supabase } from '@/lib/supabaseClient'
import { SmallItem } from '@/types/product'
import { useToast } from '@/contexts/ToastContext'
import FileInput from '@/components/ui/FileInput'

function CategoryMultiSelect({ categories, selected, onChange }: {
  categories: { id: string; name: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  const label = selected.length === 0 ? '選擇分類' : selected.map(id => categories.find(c => c.id === id)?.name).filter(Boolean).join('、')
  return (
    <div className="col-span-2 relative" ref={ref}>
      <label className="block text-xs font-medium text-neutral-500 mb-1">分類清單</label>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-primary transition-colors text-left">
        <span className={selected.length === 0 ? 'text-neutral-400' : 'text-neutral-800 truncate'}>{label}</span>
        <span className="text-neutral-400 ml-2 flex-none">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
          {categories.map(cat => (
            <label key={cat.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(cat.id)} onChange={() => toggle(cat.id)}
                className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm text-neutral-700">{cat.name}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <div className="px-3 py-1.5 border-t border-neutral-100">
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-600">清除全部</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EditProductPage() {
  const { toast } = useToast()
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
    boxImage: null as File | null,
    boxImagePreview: '',
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
    selectedCategoryIds: [] as string[],
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
    recycleValue: number
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
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string }>>([])

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

  // Fetch categories (分類清單)
  useEffect(() => {
    fetch('/api/admin/categories')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAllCategories(data) })
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
  // 這裡原本會在「狀態 active 且有開賣時間」時，用 window.crypto 生一組 Seed
  // 再算 calculateSeedHash 塞進 formData —— 但存檔那兩行是註解掉的，
  // 所以那組值從來沒進過資料庫，只是畫面上好看。
  //
  // 現在更不能留：seed 與 txid_hash 由 seal_product_tickets 在排籤封存時寫入，
  // txid_hash 就是對外公布的承諾值。這個 effect 會用一組假值蓋掉它，
  // 管理員在後台看到的就會跟商品頁公布的、玩家拿去驗的那串不一樣。
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

          // Fetch existing category memberships (分類清單)
          const catRes = await fetch(`/api/admin/products/${productId}/categories`)
          const categoryIds: string[] = catRes.ok ? await catRes.json() : []

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
            selectedCategoryIds: categoryIds,
            machineTheme: product.machine_theme || '',
            rarity: product.rarity || 3,
            startedAt: product.started_at ? product.started_at.split('T')[0] : '',
            endedAt: product.ended_at ? product.ended_at.replace('T', ' ').split('.')[0] : '',
            txidHash: product.txid_hash || '',
            seed: product.seed || '',
            selectedTagIds: tagIds,
            boxImage: null as File | null,
            boxImagePreview: (product as any).box_image_url || '',
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
            recycleValue: prize.recycle_value ?? 0,
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

    // 盒玩/轉蛋：數量不能低於已抽數量；新品項數量必須 >= 1
    if (isGachaType) {
      for (const prize of prizes) {
        if (!prize.name?.trim()) {
          toast(`請填寫品項名稱`, 'success')
          return
        }
        if (prize.total < 1) {
          toast(`品項「${prize.name || '未命名'}」總數量必須至少 1`, 'success')
          return
        }
        const saved = savedPrizes.find(sp => String(sp.id) === String(prize.id))
        if (saved) {
          const drawn = saved.total - saved.remaining
          if (prize.total < drawn) {
            toast(`品項「${prize.name || '未命名'}」已抽出 ${drawn} 個，總數量不能低於 ${drawn}`, 'success')
            return
          }
        }
      }
    }

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
      if (formData.image) {
        const file = formData.image
        const fileExt = file.name.split('.').pop()
        const fileName = `product-${Date.now()}.${fileExt}`
        productImageUrl = await uploadViaAdmin(file, fileName)
      }

      // 1b. Upload Box Image (blindbox_mode2)
      let boxImageUrl = formData.boxImagePreview || null
      if (formData.boxImage) {
        const file = formData.boxImage
        const fileExt = file.name.split('.').pop()
        const fileName = `box-${Date.now()}.${fileExt}`
        boxImageUrl = await uploadViaAdmin(file, fileName)
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
        // txid_hash: formData.txidHash || null,
        // seed: formData.seed || null,
        image_url: productImageUrl,
        box_image_url: boxImageUrl,
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
          recycle_value: Math.max(0, Math.round(prize.recycleValue) || 0),
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

      // Save category memberships (分類清單)
      await fetch(`/api/admin/products/${productId}/categories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryIds: formData.selectedCategoryIds }),
      })

      addLog('修改商品', '商品管理', `修改商品「${formData.name}」`, 'success')
      router.push('/products')

    } catch (e: any) {
      const msg = e?.message || e?.error_description || JSON.stringify(e || {})
      console.error('Failed to update product:', msg)
      toast(`更新商品失敗：${msg || '請稍後再試'}`, 'error')
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

  // 機台：品項庫商品（不上架、無售價；數量=共用庫存、價值=定價依據）
  const isSlot = formData.type === 'slot'
  const slotLevels = [
    { value: '一等獎', label: '一等獎（大獎）' },
    { value: '二等獎', label: '二等獎' },
    { value: '三等獎', label: '三等獎' },
    { value: '四等獎', label: '四等獎' },
    { value: '五等獎', label: '五等獎' },
  ]
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

        <form id="product-form" onSubmit={handleSubmit} className="flex gap-4 items-start">
          {/* 左欄：商品設定 */}
          <div className="w-[440px] flex-shrink-0 space-y-3 overflow-y-auto h-[calc(100dvh-9rem)] pr-0.5">
          {/* ── Section: 商品資訊 ── */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">商品資訊</h3>
            <div className="space-y-2">
              {/* Row 1: 名稱 + 圖（機台：主圖自動帶機台圖片，不可上傳） */}
              <div className="flex items-center gap-3">
                {!isSlot && <label className="flex-shrink-0 cursor-pointer group relative">
                  <FileInput accept="image/*" className="hidden"
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
                </label>}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">商品名稱 <span className="text-red-500">*</span></label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="請輸入商品名稱" required />
                </div>
              </div>

              {/* Row 2: 類型 廠商 抽獎模組 上市時間 代理商 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">類別 <span className="text-red-500">*</span></label>
                  <SelectField value={formData.type} disabled>
                    <option value="ichiban">一番賞</option>
                    <option value="blindbox">盒玩</option>
                    <option value="gacha">轉蛋</option>
                    <option value="card">抽卡</option>
                    <option value="custom">自製賞</option>
                    <option value="slot">機台</option>
                  </SelectField>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">廠商</label>
                  <SelectField value={formData.supplierId} onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}>
                    <option value="">— 未指定 —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </SelectField>
                </div>
                {!isSlot && <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">抽獎模組</label>
                  <SelectField value={formData.machineTheme} onChange={(e) => setFormData({ ...formData, machineTheme: e.target.value })}>
                    <option value="">— 類別預設 —</option>
                    {(MODULE_OPTIONS[formData.type] ?? []).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </SelectField>
                </div>}
                {!isSlot && <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">上市時間</label>
                  <YearMonthPicker year={formData.releaseYear} month={formData.releaseMonth}
                    onYearChange={(value) => setFormData({ ...formData, releaseYear: value })}
                    onMonthChange={(value) => setFormData({ ...formData, releaseMonth: value })}
                    onClear={() => setFormData({ ...formData, releaseYear: '', releaseMonth: '' })}
                    placeholder="選擇上市時間" />
                </div>}
                {!isSlot && <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">代理商</label>
                  <Input value={formData.distributor} onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
                    placeholder="萬代南夢宮" />
                </div>}
              </div>

              {/* Row 3: 條碼 系列 熱賣（機台不適用） */}
              {!isSlot && <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">條碼</label>
                  <Input value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} className="font-mono"
                    placeholder="4549660718956" maxLength={50} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">系列</label>
                  <Input value={formData.series} onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                    placeholder="寶可夢、鬼滅之刃..." />
                </div>
                {allCategories.length > 0 && (
                  <CategoryMultiSelect
                    categories={allCategories}
                    selected={formData.selectedCategoryIds}
                    onChange={ids => setFormData(p => ({ ...p, selectedCategoryIds: ids }))}
                  />
                )}
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">熱賣商品</label>
                  <SelectField value={formData.isHot ? '1' : '0'} onChange={e => setFormData({ ...formData, isHot: e.target.value === '1' })}>
                    <option value="0">否</option>
                    <option value="1">是</option>
                  </SelectField>
                </div>
              </div>}

              {/* 標籤 */}
              {!isSlot && <div>
                <TagSelector value={formData.selectedTagIds}
                  onChange={(newTags) => setFormData((prev) => ({ ...prev, selectedTagIds: newTags }))}
                  label="標籤" />
              </div>}
            </div>
          </div>

          {/* ── Section: 上架資訊（機台：不上架、無售價，整區隱藏） ── */}
          {isSlot && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-700 leading-relaxed">
              機台品項庫商品：不會出現在前台商城，售價由機台檔次決定。品項的「價值」與「庫存」供機台獎池出獎與直衝定價使用（同主題全部機台共用庫存）。
            </div>
          )}
          {!isSlot && <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">上架資訊</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">狀態</label>
                <SelectField value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="active">進行中</option>
                  <option value="pending">待上架</option>
                  <option value="ended">已完抽</option>
                </SelectField>
              </div>
              <div>
                <DatePicker label="開賣時間" value={formData.startedAt}
                  onChange={(value) => setFormData(prev => ({ ...prev, startedAt: value }))}
                  placeholder="選擇時間" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">售價 (G) <span className="text-red-500">*</span></label>
                <Input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0" required min="1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">成本</label>
                <Input type="number" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0" min="0" step="0.01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">稀有度</label>
                <SelectField value={formData.rarity} onChange={(e) => setFormData({ ...formData, rarity: parseInt(e.target.value) })}>
                  <option value="1">1★</option>
                  <option value="2">2★</option>
                  <option value="3">3★</option>
                  <option value="4">4★</option>
                  <option value="5">5★</option>
                </SelectField>
              </div>
            </div>
            {/* 完抽時間 / Seed（條件顯示） */}
            {formData.status === 'ended' && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">完抽時間</label>
                  <div className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-600">
                    {formData.endedAt || '自動記錄中...'}
                  </div>
                </div>
                {formData.txidHash && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-500 mb-1">承諾值（開賣時公布）</label>
                    <div className="flex gap-1">
                      <div className="flex-1 px-2 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-600 truncate">{formData.txidHash}</div>
                      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(formData.txidHash || ''); toast('已複製', 'success') } catch(_e){ /* clipboard unavailable */ } }}
                        className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 text-xs whitespace-nowrap">複製</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>}

          </div>

          {/* 右欄：品項 */}
          {/* ── Section: 品項 ── */}
          <div className="flex-1 bg-white rounded-xl border border-neutral-200 shadow-sm p-4 overflow-y-auto h-[calc(100dvh-9rem)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">品項</h3>
              <span className="text-xs font-mono text-neutral-400">
                剩餘 <span className="text-neutral-700 font-semibold">{calculatedRemaining}</span>
                <span className="mx-1 text-neutral-300">/</span>
                總計 <span className="text-neutral-700 font-semibold">{calculatedTotalCount}</span>
              </span>
            </div>
            <div className="space-y-2">
              <div className="space-y-2.5">
                {prizes.map((prize, index) => (
                  <div key={prize.id} className="border border-neutral-200 rounded-xl bg-white hover:border-primary/40 hover:shadow-sm transition-all">

                    {/* ── 卡片標頭 ── */}
                    <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b border-neutral-100 rounded-t-xl">
                      <span className="text-xs font-semibold text-neutral-600">品項 {index + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-400">
                          剩 <span className="font-semibold text-neutral-700 font-mono">{prize.remaining}</span>
                          <span className="mx-0.5 text-neutral-300">/</span>
                          <span className="font-semibold text-neutral-700 font-mono">{prize.total}</span>
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
                            className="w-5 h-5 flex items-center justify-center rounded text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="刪除此品項"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── 卡片主體 ── */}
                    <div className="p-3 space-y-3">

                      {/* 圖片 + 品項名稱 */}
                      <div className="flex items-start gap-2.5">
                        <label className="flex-shrink-0 cursor-pointer group relative">
                          <FileInput
                            accept="image/*" className="hidden"
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
                          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-neutral-300 overflow-hidden bg-neutral-50 flex items-center justify-center group-hover:border-primary transition-colors">
                            {prize.imagePreview ? (
                              <img src={prize.imagePreview} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <svg className="w-5 h-5 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">品項名稱</label>
                          <Input
                            value={prize.name}
                            onChange={(e) => {
                              const updated = [...prizes]
                              updated[index].name = e.target.value
                              setPrizes(updated)
                            }}
                            placeholder="例：A賞 草莓大耳狗吊飾"
                          />
                        </div>
                      </div>

                      {/* 等級 */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">等級</label>
                        {isGachaType ? (
                          <div className="w-full px-2.5 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-400">
                            普通
                          </div>
                        ) : (
                          <SelectField
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
                          >
                            <option value="">— 選擇等級 —</option>
                            {(isSlot ? slotLevels : ichibanLevels).map(level => (
                              <option key={level.value} value={level.value}>{level.label}</option>
                            ))}
                          </SelectField>
                        )}
                      </div>

                      {/* 數量資訊 */}
                      <div className={`grid gap-2 ${isSlot ? 'grid-cols-3' : 'grid-cols-4'}`}>
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">總數量</label>
                          {isVerifiable ? (
                            <div className="px-2.5 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-500 text-center">
                              {prize.total || 0}
                            </div>
                          ) : (
                            <Input
                              type="number"
                              value={prize.total === 0 ? '' : prize.total}
                              onChange={(e) => {
                                const newTotal = e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                const delta = newTotal - prize.total
                                const updated = [...prizes]
                                updated[index].total = Math.max(0, newTotal)
                                updated[index].remaining = Math.max(0, prize.remaining + delta)
                                setPrizes(updated)
                              }} className="font-mono text-center"
                              min="1"
                              placeholder="0"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">剩餘庫存</label>
                          <div className="px-2.5 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-500 text-center">
                            {prize.remaining}
                          </div>
                        </div>
                        {!isSlot && <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">抽中機率</label>
                          <div className="px-2.5 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-600 text-center">
                            {isLastOneLevel(prize.level)
                              ? '最後賞'
                              : (calculatedTotalCount > 0 && prize.total > 0
                                  ? ((prize.total / calculatedTotalCount) * 100).toFixed(1) + '%'
                                  : '0%'
                                )
                            }
                          </div>
                        </div>}
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">品項價值 (G)</label>
                          <Input
                            type="number"
                            value={prize.recycleValue === 0 ? '' : prize.recycleValue}
                            onChange={(e) => {
                              const updated = [...prizes]
                              updated[index].recycleValue = e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                              setPrizes(updated)
                            }} className="font-mono text-center"
                            min="0"
                            placeholder="0"
                          />
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
                          className="w-full px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          從資源庫選擇
                        </button>
                      )}

                      {/* 分解設定 */}
                      <div className="pt-2.5 border-t border-neutral-100">
                        <label className="block text-xs font-medium text-neutral-500 mb-1.5">分解設定</label>
                        {formData.type !== 'gacha' && formData.type !== 'blindbox' ? (
                          <div className="flex gap-2 items-start">
                            <div className="w-28 flex-shrink-0">
                              <SelectField
                                compact
                                value={prize.decompose_type}
                                onChange={(e) => {
                                  const updated = [...prizes]
                                  updated[index].decompose_type = e.target.value as 'auto' | 'percent' | 'fixed'
                                  updated[index].decompose_value = null
                                  setPrizes(updated)
                                }}
                              >
                                <option value="auto">智能分解</option>
                                <option value="percent">百分比 (%)</option>
                                <option value="fixed">固定代幣</option>
                              </SelectField>
                            </div>
                            {prize.decompose_type === 'auto' ? (
                              <div className="flex-1 px-2 py-1 bg-neutral-100 border border-neutral-200 rounded-lg text-xs text-neutral-500 leading-relaxed">
                                庫存 ≤ 3 → 抽價 20%；庫存 ≥ 4 → 10 代幣
                              </div>
                            ) : (
                              <div className="flex-1">
                                <div className="relative">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={prize.decompose_value ?? ''}
                                    onChange={(e) => {
                                      const updated = [...prizes]
                                      updated[index].decompose_value = e.target.value === '' ? null : parseInt(e.target.value) || null
                                      setPrizes(updated)
                                    }} className="text-xs"
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
                        ) : (
                          <div className="flex gap-2 items-center">
                            <div className="w-28 flex-shrink-0">
                              <SelectField compact value="fixed" disabled>
                                <option value="fixed">固定代幣</option>
                              </SelectField>
                            </div>
                            <div className="flex-1 relative">
                              <Input
                                type="number"
                                value={10}
                                disabled
                                readOnly className="text-xs bg-neutral-50 text-neutral-400 cursor-not-allowed font-mono"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">幣</span>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                ))}
              </div>

              {/* 空品項提示 */}
              {!isVerifiable && prizes.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPrizes([{ id: `p${Date.now()}`, name: '', level: isGachaType ? defaultLevel : '', image: '', imageFile: null as File | null, imagePreview: '', total: 0, remaining: 0, probability: 0, recycleValue: 0, decompose_type: 'auto' as const, decompose_value: null as number | null }])
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
                      recycleValue: 0,
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
              <Input
                value={librarySearchQuery}
                onChange={(e) => setLibrarySearchQuery(e.target.value)}
                placeholder="搜尋小物名稱、分類..."
              />
              <SelectField
                value={librarySelectedCategory}
                onChange={(e) => setLibrarySelectedCategory(e.target.value)}
              >
                <option value="all">全部分類</option>
                {Array.from(new Set(libraryItems.map(item => item.category))).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </SelectField>
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
