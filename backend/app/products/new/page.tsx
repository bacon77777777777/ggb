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
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { normalizePrizeLevels } from '@/utils/normalizePrizes'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { sanitizeImageUrl } from '@/lib/image-utils'
import { SmallItem } from '@/types/product'

export default function NewProductPage() {
  const router = useRouter()
  const { addLog } = useLog()
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string; tax_id: string | null }>>([])

  useEffect(() => {
    fetch('/api/admin/suppliers').then(r => r.json()).then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
  }, [])

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    cost: '',
    image: null as File | null,
    imagePreview: '/images/item.png',
    status: 'active',
    category: '',
    categoryId: '',
    selectedTagIds: [] as string[],
    type: 'ichiban', // Default type
    remaining: '',
    totalCount: '',  // 商品總數（用於自動計算原始機率）
    isHot: false,
    releaseYear: '',
    releaseMonth: '',
    distributor: '',
    barcode: '',
    series: '',
    supplierId: '',
    rarity: 3,
    startedAt: '',  // 開賣時間（選填，格式：YYYY-MM-DD）
    isPreorder: false,
    preorderAvailableAt: '',
    machineTheme: '',
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

  // 在客戶端設置日期，避免 Hydration Error
  useEffect(() => {
    const now = new Date()
    setFormData(prev => ({
      ...prev,
      releaseYear: now.getFullYear().toString(),
      releaseMonth: (now.getMonth() + 1).toString().padStart(2, '0'),
    }))
  }, [])

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
  }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

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
  const [showSmallItemLibrary, setShowSmallItemLibrary] = useState(false)
  const [libraryItems, setLibraryItems] = useState<SmallItem[]>([])
  const [selectedPrizeIndex, setSelectedPrizeIndex] = useState<number | null>(null)
  const [librarySearchQuery, setLibrarySearchQuery] = useState('')
  const [librarySelectedCategory, setLibrarySelectedCategory] = useState('all')
  const prizeSectionRef = useRef<HTMLDivElement | null>(null)

  const addPrize = () => {
    const newPrize = {
      id: `p${Date.now()}`,
      name: '',
      level: '',
      image: '',
      imageFile: null as File | null,
      imagePreview: '/images/item.png',
      total: 0,
      remaining: 0,
      probability: 0,
    }
    setPrizes(prev => [...prev, newPrize])
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const scrollTarget =
          document.documentElement?.scrollHeight || document.body?.scrollHeight || 0
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' })
      })
    }
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 驗證必填欄位
    if (!formData.name || !formData.price || prizes.length === 0) {
      alert('請填寫所有必填欄位並至少添加一個獎項')
      return
    }
    setIsSubmitting(true)
    
    try {
      const uploadViaAdmin = async (file: File, fileName: string) => {
        const form = new FormData()
        form.append('file', file)
        form.append('bucket', 'products')
        form.append('path', fileName)
        const res = await fetch('/api/admin/upload', { method: 'POST', body: form, credentials: 'include' })
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
      productImageUrl = sanitizeImageUrl(productImageUrl) ?? productImageUrl

      // 2. Insert Product
      const totalCount = calculatedTotalCount
      const remaining = calculatedRemaining
      
      // Handle startedAt
      let startedAt = formData.startedAt ? `${formData.startedAt} 00:00:00` : null
      if (!startedAt && formData.status === 'active') {
        startedAt = new Date().toISOString()
      }

      const productData = {
        name: formData.name,
        category: formData.category,
        category_id: formData.categoryId || null,
        type: formData.type,
        price: parseInt(formData.price) || 0,
        cost: formData.cost ? parseFloat(formData.cost) : null,
        remaining: remaining,
        status: formData.status,
        sales: 0,
        is_hot: formData.isHot,
        total_count: totalCount,
        release_year: formData.releaseYear,
        release_month: formData.releaseMonth,
        distributor: formData.distributor,
        barcode: formData.barcode || null,
        series: formData.series || null,
        supplier_id: formData.supplierId ? parseInt(formData.supplierId) : null,
        rarity: formData.rarity,
        started_at: startedAt,
        image_url: productImageUrl || '/images/item.png',
        is_preorder: formData.isPreorder,
        preorder_available_at: formData.preorderAvailableAt ? `${formData.preorderAvailableAt} 00:00:00` : null,
        machine_theme: formData.machineTheme || null,
      }

      // 3.5 Insert Product Tags
      // 4. Upload Prize Images and Insert Prizes
      const prizePayload = await Promise.all(prizes.map(async (prize) => {
        let prizeImageUrl = prize.imagePreview || prize.image || '/images/item.png'
        if (prize.imageFile) {
          const file = prize.imageFile
          const fileExt = file.name.split('.').pop()
          const fileName = `prize-${Date.now()}-${prize.level}.${fileExt}`
          prizeImageUrl = await uploadViaAdmin(file, fileName)
        }
        prizeImageUrl = sanitizeImageUrl(prizeImageUrl) ?? prizeImageUrl

        return {
          name: prize.name,
          level: prize.level,
          image_url: prizeImageUrl,
          total: prize.total,
          remaining: prize.remaining,
          probability: prize.probability
        }
      }))

      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product: productData,
          prizes: prizePayload,
          tagIds: formData.selectedTagIds,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '新增商品失敗')
      }
      
      addLog('新增商品', '商品管理', `新增商品「${formData.name}」`, 'success')
      router.push('/products')

    } catch (error: any) {
      const msg =
        error?.message ||
        error?.error_description ||
        (typeof error === 'string' ? error : '')
      console.error('Error creating product:', error)
      alert(`新增商品失敗：${msg || '請稍後再試'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminLayout 
      pageTitle="新增商品" 
      breadcrumbs={[
        { label: '商品管理', href: '/products' },
        { label: '新增商品', href: undefined }
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
          <button
            type="submit"
            form="new-product-form"
            disabled={isSubmitting}
            className="px-4 py-2 bg-primary text-white rounded-full hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm hover:shadow-md"
          >
            {isSubmitting ? '建立中...' : '建立商品'}
          </button>
        </div>

        <form id="new-product-form" onSubmit={handleSubmit} className="flex gap-4 items-start">
          {/* 左卡：商品設定 */}
          <div className="w-[440px] flex-shrink-0 bg-white rounded-xl shadow-sm border border-neutral-200 p-4 space-y-3 overflow-y-auto h-[calc(100dvh-9rem)]">
            {/* 商品名稱 + 商品圖 同一行 */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  商品名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
                  placeholder="請輸入商品名稱"
                  required
                />
              </div>
              {/* 商品圖 — 點擊上傳 */}
              <label className="flex-shrink-0 cursor-pointer group relative">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) setFormData({ ...formData, image: file, imagePreview: URL.createObjectURL(file) })
                  }}
                />
                <div className="w-[100px] h-[100px] rounded-lg border-2 border-dashed border-neutral-300 overflow-hidden bg-white flex items-center justify-center group-hover:border-primary transition-colors">
                  {formData.imagePreview ? (
                    <img src={formData.imagePreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-4 h-4 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  )}
                </div>
                {formData.imagePreview && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setFormData({ ...formData, image: null, imagePreview: '' }) }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </label>
            </div>

            {/* 類型 */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                類型 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-1.5 pr-10 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300 appearance-none cursor-pointer"
                >
                  <option value="ichiban">一番賞</option>
                  <option value="blindbox">盒玩 (盲盒)</option>
                  <option value="gacha">轉蛋</option>
                  <option value="card">抽卡</option>
                  <option value="custom">自製賞</option>
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* 售價 / 成本 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  售價 (G) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
                  placeholder="0"
                  required
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  成本
                </label>
                <input
                  type="number"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* 標籤 */}
            <div>
              <TagSelector
                value={formData.selectedTagIds}
                onChange={(newTags) => setFormData((prev) => ({ ...prev, selectedTagIds: newTags }))}
                label="標籤"
              />
            </div>

            {/* 狀態 / 開賣時間 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  狀態
                </label>
                <div className="relative">
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-1.5 pr-10 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300 appearance-none cursor-pointer"
                  >
                    <option value="active">進行中</option>
                    <option value="pending">待上架</option>
                    <option value="ended">已完抽</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
              <div>
                <DatePicker
                  label="開賣時間"
                  value={formData.startedAt ? formData.startedAt.split(' ')[0] : ''}
                  onChange={(value) => {
                    setFormData(prev => ({ ...prev, startedAt: value }))
                  }}
                  placeholder="選擇開賣時間"
                />
              </div>
            </div>

            {/* 稀有度 */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                稀有度
              </label>
              <div className="relative">
                <select
                  value={formData.rarity}
                  onChange={(e) => setFormData({ ...formData, rarity: parseInt(e.target.value) })}
                  className="w-full px-3 py-1.5 pr-10 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300 appearance-none cursor-pointer"
                >
                  <option value="1">1 星</option>
                  <option value="2">2 星</option>
                  <option value="3">3 星</option>
                  <option value="4">4 星</option>
                  <option value="5">5 星</option>
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* 上市時間與代理商 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  上市時間
                </label>
                <YearMonthPicker
                  year={formData.releaseYear}
                  month={formData.releaseMonth}
                  onYearChange={(value) => setFormData({ ...formData, releaseYear: value })}
                  onMonthChange={(value) => setFormData({ ...formData, releaseMonth: value })}
                  onClear={() => setFormData({ ...formData, releaseYear: '', releaseMonth: '' })}
                  placeholder="選擇上市時間"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  代理商
                </label>
                <input
                  type="text"
                  value={formData.distributor}
                  onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
                  placeholder="例如：萬代南夢宮"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  條碼
                </label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300 font-mono"
                  placeholder="4549660718956"
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  系列
                </label>
                <input
                  type="text"
                  value={formData.series ?? ''}
                  onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
                  placeholder="寶可夢、鬼滅之刃..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  廠商
                </label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
                >
                  <option value="">— 未指定 —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}{s.tax_id ? `（${s.tax_id}）` : ''}</option>
                  ))}
                </select>
                {formData.supplierId && (() => {
                  const sup = suppliers.find(s => String(s.id) === formData.supplierId)
                  return sup?.tax_id ? (
                    <p className="text-xs text-neutral-400 mt-0.5">統編：<span className="font-mono">{sup.tax_id}</span></p>
                  ) : null
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  抽獎模組
                </label>
                <select
                  value={formData.machineTheme}
                  onChange={(e) => setFormData({ ...formData, machineTheme: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
                >
                  <option value="">— 類別預設 —</option>
                  {(MODULE_OPTIONS[formData.type] ?? []).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 預購商品設定 */}
            <div className="bg-neutral-50 border-2 border-neutral-200 rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPreorder}
                  onChange={(e) => setFormData({ ...formData, isPreorder: e.target.checked })}
                  className="w-5 h-5 text-primary focus:ring-primary rounded border-2 border-neutral-300 focus:border-primary"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-700">預購商品</span>
                  <p className="text-xs text-neutral-500 mt-0.5">勾選後，抽中至預計出貨時間前不可配送與上架，但可分解</p>
                </div>
              </label>
              {formData.isPreorder && (
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker
                    label="預計出貨時間"
                    value={formData.preorderAvailableAt}
                    onChange={(value) => setFormData(prev => ({ ...prev, preorderAvailableAt: value }))}
                    placeholder="選擇可配送起始日期"
                  />
                  <p className="text-xs text-neutral-500 self-end">到達此日期後，倉庫可申請配送與上架</p>
                </div>
              )}
            </div>

            {/* 熱賣商品標記 */}
            <div className="bg-neutral-50 border-2 border-neutral-200 rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isHot}
                  onChange={(e) => setFormData({ ...formData, isHot: e.target.checked })}
                  className="w-5 h-5 text-primary focus:ring-primary rounded border-2 border-neutral-300 focus:border-primary"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-700">標記為熱賣商品</span>
                  <p className="text-xs text-neutral-500 mt-0.5">熱賣商品將在前台顯示熱賣標籤</p>
                </div>
              </label>
            </div>

          </div>

          {/* 右卡：品項設定 */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-neutral-200 h-[calc(100dvh-9rem)] overflow-y-auto p-4">
            <div ref={prizeSectionRef} className="space-y-2">
                  {prizes.map((prize, index) => (
                    <div key={prize.id} className="border border-neutral-200 rounded-lg p-3 bg-neutral-50 hover:border-primary/50 transition-colors">
                      {/* 刪除按鈕 - 右上角，與內容區隔 */}
                      {/* 品項標頭 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-neutral-500">品項 {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPrizes(prizes.filter((_, i) => i !== index))
                          }}
                          className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                          title="刪除此品項"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
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
                            <select
                              value={prize.level}
                              onChange={(e) => {
                                const updated = [...prizes]
                                const newLevel = e.target.value
                                updated[index].level = newLevel
                                if (isLastOneLevel(newLevel)) {
                                  const fixed = updated[index]
                                  const ensureOne = (v: number) => (v && v > 0 ? v : 1)
                                  fixed.total = ensureOne(fixed.total)
                                  fixed.remaining = ensureOne(fixed.remaining)
                                  fixed.probability = 0
                                }
                                setPrizes(updated)
                              }}
                              className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none"
                            >
                              <option value="">等級</option>
                              {(formData.type === 'gacha' ? gachaLevels
                                : formData.type === 'blindbox' ? blindboxLevels
                                : formData.type === 'card' ? cardLevels
                                : ichibanLevels).map(level => (
                                  <option key={level.value} value={level.value}>{level.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* 數量 + 剩餘 + 機率 */}
                          <div className="grid grid-cols-3 gap-1.5">
                            <input
                              type="number"
                              value={prize.total === 0 ? '' : prize.total}
                              onChange={(e) => {
                                const updated = [...prizes]
                                const newTotal = e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                updated[index].total = newTotal
                                updated[index].remaining = newTotal
                                setPrizes(updated)
                              }}
                              className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary font-mono disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                              disabled={isLastOneLevel(prize.level)}
                              min="0"
                              placeholder="數量"
                            />
                            <div className="px-2 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-700">
                              {prize.remaining === 0 ? '0' : prize.remaining}
                            </div>
                            <div className="px-2 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-600 flex items-center justify-center">
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
                    </div>
                  ))}

                  {/* 空狀態 / 新增按鈕 */}
                  {prizes.length === 0 ? (
                    <button
                      type="button"
                      onClick={addPrize}
                      className="w-full text-center py-10 border-2 border-dashed border-neutral-200 rounded-lg bg-neutral-50 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
                    >
                      <svg className="w-8 h-8 mx-auto mb-2 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <p className="text-sm text-neutral-500">點擊新增品項</p>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={addPrize}
                      className="w-full text-center py-3 border-2 border-dashed border-neutral-200 rounded-lg bg-neutral-50 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
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
                className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
              />
              <select
                value={librarySelectedCategory}
                onChange={(e) => setLibrarySelectedCategory(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors hover:border-neutral-300"
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
