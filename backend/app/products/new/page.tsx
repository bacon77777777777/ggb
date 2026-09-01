'use client'

const MODULE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  /* 順序＝下拉選單的順序，第一個同時是「沒設定時的預設」。
     老闆 2026-08-29 指定各類別把目前在用的那款排第一，並把三個叫「經典」的
     改成講得出畫面長相的名字（經典列表／經典動畫／經典蛋球 → 票券網格／
     華麗過場／蛋球機台）。 */
  gacha:    [
    { value: 'gacha_mode2',   label: '旋鈕機台' },
    { value: 'gacha_classic', label: '蛋球機台' },
    { value: 'gacha_mode3',   label: '金光機台' },
    { value: 'gacha_mode4',   label: '狗狗蛋箱' },
    { value: 'gacha_mode5',   label: '紫金機台' },
  ],
  ichiban:  [
    { value: 'ichiban_tear', label: '沉浸撕紙' },
    { value: 'ichiban_grid', label: '票券網格' },
  ],
  card:     [
    { value: 'card_pack',  label: '蓄力開包' },
    { value: 'card_peel',  label: '撕開封口' },
    { value: 'card_video', label: '過場影片' },
  ],
  custom:   [
    { value: 'custom_tear', label: '沉浸撕紙' },
    { value: 'custom_grid', label: '票券網格' },
  ],
  /* 盒玩只留兩款（老闆 2026-08-29：「只留這兩個，其他移除，不需要了」）。
     兔子／叢林／賽璐璐三款的前台程式與圖素都沒有刪，只是後台不再讓人選 ——
     查過 PROD 與 STG，沒有任何商品在用這三個值，所以移掉不會有商品變成
     選單裡找不到的狀態。 */
  blindbox: [
    { value: 'blindbox_mode5',   label: '立體販賣機' },
    { value: 'blindbox_classic', label: '華麗過場' },
  ],
}

import AdminLayout from '@/components/AdminLayout'
import ConfirmDialog from '@/components/ConfirmDialog'
import { YearMonthPicker, DatePicker, Modal, Input, TagSelector } from '@/components'
import SelectField from '@/components/ui/SelectField'
import { InfoIcon } from '@/components/analytics/StatCard'
import { useLog } from '@/contexts/LogContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { normalizePrizeLevels } from '@/utils/normalizePrizes'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { sanitizeImageUrl } from '@/lib/image-utils'
import { SmallItem } from '@/types/product'
import { useToast } from '@/contexts/ToastContext'

export default function NewProductPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { addLog } = useLog()
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string; tax_id: string | null; is_active?: boolean }>>([])

  useEffect(() => {
    fetch('/api/admin/suppliers').then(r => r.json()).then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
  }, [])

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    cost: '',
    image: null as File | null,
    imagePreview: '/images/item.png',
    // 抽卡三張圖：正面＝商品主圖，另兩張額外設定（migration 588）
    packFrontImage: null as File | null,
    packFrontImagePreview: '',
    packBackImage: null as File | null,
    packBackImagePreview: '',
    cardBackImage: null as File | null,
    cardBackImagePreview: '',
    // 一律先建成「待上架」（老闆指定）：一番賞／抽卡／自製賞一上架就會
    // 自動排籤封存、殺率同時鎖死，所以要留一個能調殺率的空檔
    status: 'pending',
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
    // 一包幾張（1／3／5／10）。migration 666 之後這是純粹的數量，不再是「模式」
    cardsPerPack: '',
    // 卡包樣式：builtin = 內建五款輪流、custom = 用自己上傳的卡包正／背面
    packStyle: 'builtin',
    // 抽籤販售必須在建立時就決定：上架當下就會排籤封存，
    // 之後再切換模式落選籤補不進去（DB trigger 也會擋）
  })
  
  const isLastOneLevel = (level: string) => {
    if (!level) return false
    const l = level.toLowerCase()
    return l.includes('last one') || level.includes('最後賞')
  }

  // 機台類別：品項庫商品，不上架、不售價；價值/庫存供機台獎池使用
  const isSlot = formData.type === 'slot'

  /*
   * 舊的「抽籤販售」販售模式已移除（老闆 2026-08-31）。
   *
   * 那是掛在一番賞／抽卡／自製賞底下的 sale_mode='lottery'：0 元抽、中籤後才付款。
   * 已改由獨立的「抽籤販售」功能取代（登記制，付積分登記 → 定時開獎 → 中籤付 G 幣，
   * 資料在 lottery_events / lottery_entries，migration 652 起）。
   *
   * sale_mode 欄位與 play_lottery RPC 都保留不動 —— 歷史資料還指著它們，
   * 只是前後台都不再產生新的 lottery 商品。
   */

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

  // 預設等級統一存中文「一般版」（migration 514 已把舊值正規化），前後台顯示同名
  const gachaLevels = [
    { value: '一般版', label: '一般版 Normal / Common' },
    { value: 'Rare', label: '稀有版 Rare' },
    { value: 'Secret', label: '隱藏版 Secret' },
    { value: 'Color Variant', label: '異色版 Color Variant' },
    { value: 'Effect / Clear', label: '特效版 Effect / Clear' },
    { value: 'Limited', label: '限定版 Limited' },
    { value: 'Option Parts', label: '配件版 Option Parts' },
  ]
  const blindboxLevels = [
    { value: '一般版', label: '一般版 Normal' },
    { value: '稀有款', label: '稀有款 Rare' },
    { value: '隱藏款', label: '隱藏款 Secret / Chase' },
    { value: '異色款', label: '異色款 Color Variant' },
    { value: '夜光款', label: '夜光款 Glow' },
    { value: '透明款', label: '透明款 Clear' },
    { value: '店鋪限定', label: '店鋪限定 Store Limited' },
    { value: '首批限定', label: '首批限定 First Edition' },
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
    recycleValue: number
    salePrice: number
    /** 品項詳情圖區塊的呈現方式（migration 593）。預設一般靜態 */
    displayMode: 'static' | 'showcase3d'
  }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 自動計算商品總數和剩餘數量（排除最後賞）
  const normalPrizes = prizes.filter(p => !isLastOneLevel(p.level))
  const calculatedTotalCount = normalPrizes.reduce((sum, prize) => sum + prize.total, 0)

  /*
   * 抽卡不再分「單抽／卡包」兩種模式（老闆 2026-09-01，migration 666）。
   * 全部都是「開一包卡」，一包裝 1／3／5／10 張，三種模組都能選。
   * 庫存一律以包為單位：總張數必須是每包張數的整數倍（一包 1 張時恆成立）。
   */
  const isCardType    = formData.type === 'card'
  const cardsPerPack  = Math.max(1, Number(formData.cardsPerPack) || 1)
  const isMultiPack   = isCardType && cardsPerPack >= 2
  const packTotal     = isMultiPack ? Math.floor(calculatedTotalCount / cardsPerPack) : 0
  const packRemainder = isMultiPack ? calculatedTotalCount % cardsPerPack : 0
  // migration 666 拿掉了「單抽不可用撕開封口」的限制，三種模組一律都能選
  const moduleOptions = MODULE_OPTIONS[formData.type] ?? []
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
  // 系列沒填時先攔一次（不強制擋，有些商品確實沒有 IP）
  const [showSeriesWarning, setShowSeriesWarning] = useState(false)
  const seriesWarningAcked = useRef(false)

  const addPrize = () => {
    const newPrize = {
      id: `p${Date.now()}`,
      name: '',
      // 轉蛋/盒玩預設一般版（老闆定案：沒特別設定就是一般版，不留空）
      level: ['gacha', 'blindbox'].includes(formData.type) ? '一般版' : '',
      image: '',
      imageFile: null as File | null,
      imagePreview: '/images/item.png',
      total: 0,
      remaining: 0,
      probability: 0,
      recycleValue: 0,
      salePrice: 0,
      displayMode: 'static' as const,
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
        /*
         * ⚠️ 一定要走 /api/admin/small-items，不要用瀏覽器的 supabase client。
         *
         * small_items 開了 RLS，policy 只放行 `authenticated`；而後台**不使用
         * Supabase Auth**（走自製的 admin_session cookie），所以瀏覽器那個 client
         * 永遠是 anon —— 查詢不會報錯，只是靜靜回一個空陣列。
         * 症狀就是資源庫彈窗顯示「找不到符合條件的小物」，但小物管理明明有資料
         * （老闆 2026-08-31 回報）。小物管理那頁沒事，因為它本來就走這支 API。
         */
        try {
          const res = await fetch('/api/admin/small-items')
          if (!res.ok) throw new Error('載入失敗')
          const data = await res.json() as any[]
          setLibraryItems((data ?? []).map(item => ({
            id: item.id,
            name: item.name,
            imageUrl: item.image_url,
            category: item.category,
            level: item.level,
            description: item.description,
            createdAt: item.created_at,
          })))
        } catch {
          toast('小物資源庫載入失敗', 'error')
        }
      }
      fetchLibraryItems()
    }
  }, [showSmallItemLibrary])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    // 驗證必填欄位
    if (!formData.name || (!isSlot && !formData.price) || prizes.length === 0) {
      toast('請填寫所有必填欄位並至少添加一個獎項', 'warning')
      return
    }
    // 卡包模式：庫存以包為單位，張數除不盡代表有永遠賣不掉的尾數張
    if (isMultiPack && packRemainder !== 0) {
      toast(`總張數必須是每包 ${cardsPerPack} 張的整數倍，目前 ${calculatedTotalCount} 張多出 ${packRemainder} 張`, 'warning')
      return
    }
    if (isMultiPack && packTotal < 1) {
      toast(`至少要湊得出一包（每包 ${cardsPerPack} 張）`, 'warning')
      return
    }
    if (!formData.supplierId) {
      toast('請選擇廠商', 'warning')
      return
    }
    // 系列是前台二級頁籤與推薦排序的唯一依據，沒填等於這檔商品在首頁隱形
    if (!isSlot && !formData.series?.trim() && !seriesWarningAcked.current) {
      setShowSeriesWarning(true)
      return
    }
    if (isSlot && prizes.some(p => !(p.recycleValue > 0))) {
      toast('機台品項必須填寫品項價值（大於 0）', 'warning')
      return
    }
    // 數量沒填的品項在這裡就擋下並指名是哪一個。
    // 原本要送到伺服器才被拒，畫面停在原地看起來像「按了沒反應」
    const blankTotal = prizes.findIndex(p => !p.total || p.total < 1)
    if (blankTotal >= 0) {
      const p = prizes[blankTotal]
      toast(`品項 ${blankTotal + 1}「${p.name || '未命名'}」的數量必須至少 1`, 'warning')
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

      // 1. Upload Product Image（機台：自動帶主題機台圖片）
      let productImageUrl = formData.imagePreview
      if (isSlot) {
        try {
          const res = await fetch('/api/admin/slot/themes')
          const data = await res.json()
          const theme = (data.themes ?? []).find((t: any) => formData.name.startsWith(t.name))
          if (theme?.image_url) productImageUrl = theme.image_url
        } catch { /* 比對不到主題時維持預設圖 */ }
      }
      if (formData.image) {
        const file = formData.image
        const fileExt = file.name.split('.').pop()
        const fileName = `product-${Date.now()}.${fileExt}`
        productImageUrl = await uploadViaAdmin(file, fileName)
      }
      productImageUrl = sanitizeImageUrl(productImageUrl) ?? productImageUrl

      // 抽卡的卡包背面／卡牌背面
      let packFrontUrl: string | null = formData.packFrontImagePreview || null
      if (formData.packFrontImage) {
        const f = formData.packFrontImage
        packFrontUrl = await uploadViaAdmin(f, `packfront-${Date.now()}.${f.name.split('.').pop()}`)
      }
      let packBackUrl: string | null = formData.packBackImagePreview || null
      if (formData.packBackImage) {
        const f = formData.packBackImage
        packBackUrl = await uploadViaAdmin(f, `packback-${Date.now()}.${f.name.split('.').pop()}`)
      }
      let cardBackUrl: string | null = formData.cardBackImagePreview || null
      if (formData.cardBackImage) {
        const f = formData.cardBackImage
        cardBackUrl = await uploadViaAdmin(f, `cardback-${Date.now()}.${f.name.split('.').pop()}`)
      }

      // 2. Insert Product
      const totalCount = calculatedTotalCount
      const remaining = calculatedRemaining
      
      // Handle startedAt
      let startedAt = formData.startedAt ? `${formData.startedAt} 00:00:00` : null
      if (!startedAt && formData.status === 'active') {
        startedAt = new Date().toISOString()
      }

      const slotOverrides = isSlot ? {
        price: 0,
        status: 'pending',
        started_at: null,
        is_hot: false,
        is_preorder: false,
        preorder_available_at: null,
        machine_theme: null,
      } : {}

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
        sale_mode: 'normal',
        rarity: formData.rarity,
        started_at: startedAt,
        image_url: productImageUrl || '/images/item.png',
        pack_front_image_url: isCardType ? packFrontUrl : null,
        pack_back_image_url: isCardType ? packBackUrl : null,
        card_back_image_url: isCardType ? cardBackUrl : null,
        is_preorder: formData.isPreorder,
        preorder_available_at: formData.preorderAvailableAt ? `${formData.preorderAvailableAt} 00:00:00` : null,
        machine_theme: formData.machineTheme || null,
        cards_per_pack: formData.type === 'card' && Number(formData.cardsPerPack) > 1
          ? Number(formData.cardsPerPack)
          : null,
        pack_style: formData.type === 'card' && formData.packStyle === 'custom' ? 'custom' : 'builtin',
        ...slotOverrides,
      }

      // 3.5 機台：等級依價值自動判定（前 10% 一等獎、次 30% 二等獎、其餘三等獎）
      const slotLevelById = new Map<string, string>()
      if (isSlot) {
        const ranked = [...prizes].sort((a, b) => b.recycleValue - a.recycleValue)
        const n = ranked.length
        const firstCount  = Math.max(1, Math.round(n * 0.1))
        const secondCount = Math.round(n * 0.3)
        ranked.forEach((prize, i) => {
          slotLevelById.set(prize.id, i < firstCount ? '一等獎' : i < firstCount + secondCount ? '二等獎' : '三等獎')
        })
      }

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
          // 轉蛋/盒玩沒選等級（舊表單留空）一律落一般版，不再寫空字串進 DB
          level: isSlot ? (slotLevelById.get(prize.id) ?? '三等獎')
            : (prize.level || (['gacha', 'blindbox'].includes(formData.type) ? '一般版' : prize.level)),
          image_url: prizeImageUrl,
          total: prize.total,
          remaining: prize.remaining,
          probability: prize.probability,
          recycle_value: Math.max(0, Math.round(prize.recycleValue) || 0),
          sale_price: Math.max(0, Math.round(prize.salePrice) || 0),
          // 展示方式（migration 593）：只有抽卡有意義，其餘一律靜態
          display_mode: formData.type === 'card' ? (prize.displayMode || 'static') : 'static',
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
      toast(`新增商品失敗：${msg || '請稍後再試'}`, 'error')
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
                  placeholder="請輸入商品名稱（30 字內）"
                  maxLength={30}
                  required
                />
              </div>
              {/* 商品圖 — 點擊上傳（機台：自動帶機台圖片）。
                  抽卡改到下面的三圖列，名稱獨佔一行 */}
              {!isSlot && !isCardType && <label className="flex-shrink-0 cursor-pointer group relative">
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
                    <img src={formData.imagePreview} alt="" className="w-full h-full object-contain" />
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
              </label>}
            </div>

            {/* 抽卡的圖。卡包正面／背面只在「卡包樣式＝自訂」時出現 ——
                選預設時前台走內建五款，那兩個欄位設了也不會生效 */}
            {isCardType && (
              <div className="grid grid-cols-4 gap-3">
                {(([
                  { key: 'image', label: '商品圖片', preview: formData.imagePreview },
                  ...(formData.packStyle === 'custom' ? [
                    { key: 'packFront', label: '卡包正面', preview: formData.packFrontImagePreview },
                    { key: 'packBack',  label: '卡包背面', preview: formData.packBackImagePreview },
                  ] : []),
                  { key: 'cardBack', label: '卡牌背面', preview: formData.cardBackImagePreview },
                ]) as { key: 'image' | 'packFront' | 'packBack' | 'cardBack'; label: string; preview: string }[]).map(({ key, label, preview }) => {
                  const fileKey = key === 'image' ? 'image' : `${key}Image`
                  const prevKey = key === 'image' ? 'imagePreview' : `${key}ImagePreview`
                  return (
                    <div key={key}>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" hidden onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setFormData(prev => ({ ...prev, [fileKey]: file, [prevKey]: URL.createObjectURL(file) }))
                          }} />
                          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-neutral-300 overflow-hidden bg-white flex items-center justify-center hover:border-primary transition-colors">
                            {preview
                              ? <img src={preview} alt={label} className="w-full h-full object-contain" />
                              : <span className="text-lg text-neutral-300">＋</span>}
                          </div>
                        </label>
                        {preview && (
                          <button type="button" className="text-xs text-neutral-400 hover:text-red-500"
                            onClick={() => setFormData(prev => ({ ...prev, [fileKey]: null, [prevKey]: '' }))}>
                            移除
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 類別（抽卡時右邊併排開卡模式 —— 兩者要一起決定，分開放會漏設） */}
            <div className={isCardType ? 'grid grid-cols-2 gap-3' : undefined}>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  類別 <span className="text-red-500">*</span>
                </label>
                <SelectField
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="ichiban">一番賞</option>
                  <option value="blindbox">盒玩 (盲盒)</option>
                  <option value="gacha">轉蛋</option>
                  <option value="card">抽卡</option>
                  <option value="custom">自製賞</option>
                  <option value="slot">機台</option>
                </SelectField>
              </div>
              {isCardType && (
                <>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="block text-sm font-medium text-neutral-700">一包幾張</label>
                      <InfoIcon width={300} text={
                        `售價是「一包」的價格，一抽開 ${cardsPerPack} 張、扣 ${cardsPerPack} 張籤。`
                        + '\n\n庫存以包為單位：品項總張數必須是每包張數的整數倍，否則會有湊不成包、永遠賣不掉的尾數。'
                        + '\n\n三種開包演出都可以用，不論一包幾張。'
                      } />
                    </div>
                    <SelectField
                      value={formData.cardsPerPack || '1'}
                      onChange={(e) => setFormData({ ...formData, cardsPerPack: e.target.value })}
                    >
                      <option value="1">1 張</option>
                      <option value="3">3 張</option>
                      <option value="5">5 張</option>
                      <option value="10">10 張</option>
                    </SelectField>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="block text-sm font-medium text-neutral-700">卡包樣式</label>
                      <InfoIcon width={300} text={
                        '商品頁上半部那個會轉的卡包長什麼樣。\n\n'
                        + '預設：站上內建的五款卡包輪流出現，玩家可以按「換一批」換。\n\n'
                        + '自訂：用你自己上傳的卡包正面／背面，整檔固定同一種（「換一批」會收起來）。'
                      } />
                    </div>
                    <SelectField
                      value={formData.packStyle}
                      onChange={(e) => setFormData({ ...formData, packStyle: e.target.value })}
                    >
                      <option value="builtin">預設（內建五款輪流）</option>
                      <option value="custom">自訂（上傳自己的卡包圖）</option>
                    </SelectField>
                  </div>
                </>
              )}
            </div>
            {/* 庫存換算只在「湊不成整包」時醒目提示；正常狀態的說明收在驚嘆號裡 */}
            {isMultiPack && packRemainder !== 0 && (
              <p className="-mt-1 text-xs text-red-500">
                庫存以包為單位：目前 {calculatedTotalCount} 張，多出 {packRemainder} 張湊不成整包
              </p>
            )}
            {isMultiPack && packRemainder === 0 && calculatedTotalCount > 0 && (
              <p className="-mt-1 text-xs text-primary">
                品項共 {calculatedTotalCount} 張 = {packTotal} 包
              </p>
            )}

            {/* 售價 / 成本（機台：價格由檔次決定，不適用） */}
            {!isSlot && <div className="grid grid-cols-2 gap-3">
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
            </div>}

            {/* 標籤 */}
            {!isSlot && <div>
              <TagSelector
                value={formData.selectedTagIds}
                onChange={(newTags) => setFormData((prev) => ({ ...prev, selectedTagIds: newTags }))}
                label="標籤"
              />
            </div>}

            {/* 狀態 / 開賣時間（機台：強制隱藏商品，不上架） */}
            {!isSlot && <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  狀態
                </label>
                <SelectField
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">進行中</option>
                  <option value="pending">待上架</option>
                  <option value="ended">已完抽</option>
                </SelectField>
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
            </div>}

            {/* 稀有度 */}
            {!isSlot && <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                稀有度
              </label>
              <SelectField
                value={formData.rarity}
                onChange={(e) => setFormData({ ...formData, rarity: parseInt(e.target.value) })}
              >
                <option value="1">1 星</option>
                <option value="2">2 星</option>
                <option value="3">3 星</option>
                <option value="4">4 星</option>
                <option value="5">5 星</option>
              </SelectField>
            </div>}

            {/* 上市時間與代理商 */}
            <div className="grid grid-cols-2 gap-3">
              {!isSlot && <div>
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
              </div>}
              {!isSlot && <div>
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
              </div>}
              {!isSlot && <div>
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
              </div>}
              {!isSlot && <div>
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
                <p className="mt-1 text-xs text-neutral-400">
                  首頁的二級頁籤與推薦排序都是照這欄分組算出來的，沒填的商品不會有頁籤、也會排在後面。
                </p>
              </div>}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  廠商 <span className="text-red-500">*</span>
                </label>
                <SelectField
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                >
                  <option value="">— 請選擇廠商 —</option>
                  {/* 停用的廠商不出現在選項裡 —— 停用就是不再接新案。
                      但目前已經掛著的那一家要留著，否則下拉會變成空白，
                      看起來像商品沒有廠商 */}
                  {suppliers
                    .filter((s) => s.is_active !== false || String(s.id) === formData.supplierId)
                    .map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}{s.tax_id ? `（${s.tax_id}）` : ''}{s.is_active === false ? '（已停用）' : ''}
                      </option>
                    ))}
                </SelectField>
                {formData.supplierId && (() => {
                  const sup = suppliers.find(s => String(s.id) === formData.supplierId)
                  return sup?.tax_id ? (
                    <p className="text-xs text-neutral-400 mt-0.5">統編：<span className="font-mono">{sup.tax_id}</span></p>
                  ) : null
                })()}
              </div>
              {!isSlot && <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-sm font-medium text-neutral-700">抽獎模組</label>
                  {isCardType && (
                    <InfoIcon width={260} text="三種開包演出都可以用，不論一包幾張。" />
                  )}
                </div>
                <SelectField
                  value={formData.machineTheme}
                  
                  onChange={(e) => setFormData({ ...formData, machineTheme: e.target.value })}
                >
                  <option value="">— 類別預設 —</option>
                  {moduleOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </SelectField>
              </div>}

            </div>

            {/* 機台說明 */}
            {isSlot && (
              <div className="bg-indigo-50 border-2 border-indigo-100 rounded-lg p-4 text-xs text-indigo-700 leading-relaxed">
                機台品項庫商品：不會出現在前台商城，售價由機台檔次決定。<br />
                建議命名「主題名稱(檔次)」，例：絕頂RUSH(10)。<br />
                品項的「價值」與「庫存」供機台獎池出獎與直衝定價使用（同主題全部機台共用庫存）。
              </div>
            )}

            {/* 預購商品設定 */}
            {!isSlot && <div className="bg-neutral-50 border-2 border-neutral-200 rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPreorder}
                  onChange={(e) => setFormData({ ...formData, isPreorder: e.target.checked })}
                  className="w-5 h-5 text-primary focus:ring-primary rounded border-2 border-neutral-300 focus:border-primary"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-700">預購商品</span>
                  <p className="text-xs text-neutral-500 mt-0.5">勾選後，抽中至預計出貨時間前不可配送與上架，但可回收</p>
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
            </div>}

            {/* 熱賣商品標記 */}
            {!isSlot && <div className="bg-neutral-50 border-2 border-neutral-200 rounded-lg p-4">
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
            </div>}

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
                              <img src={prize.imagePreview} alt="" className="w-full h-full object-contain" />
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
                          {/* 名稱 + 等級（機台：等級由價值自動判定，不顯示） */}
                          <div className={`grid gap-1.5 ${isSlot ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            <input
                              type="text"
                              value={prize.name}
                              onChange={(e) => {
                                const updated = [...prizes]
                                updated[index].name = e.target.value
                                setPrizes(updated)
                              }}
                              className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                              placeholder="名稱（30 字內）"
                              maxLength={30}
                            />
                            {!isSlot && (
                              <SelectField
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
                              >
                                <option value="">等級</option>
                                {(formData.type === 'gacha' ? gachaLevels
                                  : formData.type === 'blindbox' ? blindboxLevels
                                  : ichibanLevels).map(level => (
                                    <option key={level.value} value={level.value}>{level.label}</option>
                                ))}
                              </SelectField>
                            )}
                          </div>

                          {/* 非機台：數量 + 剩餘 + 機率｜機台：數量 + 剩餘 + 價值 */}
                          <div className="grid gap-1.5 grid-cols-3">
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
                            {!isSlot && (
                              <div className="px-2 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-600 flex items-center justify-center">
                                {isLastOneLevel(prize.level)
                                  ? '最後賞'
                                  : (calculatedTotalCount > 0 && prize.total > 0
                                      ? ((prize.total / calculatedTotalCount) * 100).toFixed(1) + '%'
                                      : '0%'
                                    )
                                }
                              </div>
                            )}
                            {/*
                              價值只留給機台（獎池出獎與直衝定價要用）。
                              轉蛋／盒玩／一番賞／抽卡／自製賞的回收價已改為統一設定，
                              見「商品管理 → 回收價格設定」（migration 619）。
                            */}
                            {isSlot && (
                              <input
                                type="number"
                                value={prize.recycleValue === 0 ? '' : prize.recycleValue}
                                onChange={(e) => {
                                  const updated = [...prizes]
                                  updated[index].recycleValue = e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                  setPrizes(updated)
                                }}
                                className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                                min="0"
                                placeholder="價值(G)"
                                title="機台品項價值（獎池出獎與直衝定價用）"
                              />
                            )}
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
                          className="object-contain"
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

        <ConfirmDialog
          isOpen={showSeriesWarning}
          onClose={() => setShowSeriesWarning(false)}
          onConfirm={() => {
            seriesWarningAcked.current = true
            setShowSeriesWarning(false)
            void handleSubmit()
          }}
          title="系列沒有填"
          message={'首頁的二級頁籤與推薦排序都是照「系列」分組算的。沒填的話，這檔商品不會出現在任何系列頁籤，在推薦頁也會排在有系列的商品後面。\n\n沒有明確 IP 的商品可以留空，確定要這樣存嗎？'}
          confirmText="就這樣存"
          cancelText="回去填"
          type="warning"
        />
      </div>
    </AdminLayout>
  )
}
