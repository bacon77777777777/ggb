'use client'

/**
 * 交易所設定
 *
 * 版型跟「功能開關」「回收價格設定」一致（左側分區、右側內容，共用 SettingsShell）。
 *
 * 這四個值以前散在三個地方：手續費在 platform_settings 但沒有介面、可上架賞等寫死在
 * DB 的 is_major_grade 與前台 isMajorGrade 兩份程式碼裡、售價根本沒有上下限。
 * migration 669 把它們統一成 platform_settings 的 `marketplace_%` 四個鍵，
 * 並讓前台讀得到 —— 玩家在按下上架之前就該知道規則，不是填完價格才被打回票。
 *
 * ⚠️ 真正的把關在 DB（create_listing → marketplace_level_allowed）。
 * 前台照這裡的設定決定「哪些東西給你按上架」，但就算有人直接打 API，DB 一樣擋得住。
 */

import { useEffect, useMemo, useState } from 'react'
import { AdminLayout, PageCard } from '@/components'
import { Button, Input, Note } from '@/components/ui'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { SettingsShell, SettingsNav, SectionHead, SettingsRow } from '@/components/settings/SettingsSection'
import { useToast } from '@/contexts/ToastContext'

type SectionKey = 'fee' | 'levels' | 'tools'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'fee', label: '手續費與價格' },
  { key: 'levels', label: '可上架賞等' },
  { key: 'tools', label: '測試工具' },
]

/**
 * 可勾選的賞等。
 * 順序照稀有度由高到低，跟前台倉庫的賞等顯示一致。
 * 「最後賞」是一番賞的 LAST ONE，DB 端會把 `LAST ONE` 正規化成它。
 */
const LEVEL_OPTIONS = ['SP賞', 'S賞', 'A賞', 'B賞', 'C賞', '最後賞', 'D賞', 'E賞', 'F賞', 'G賞']

export default function MarketplaceSettingsPage() {
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()

  const [section, setSection] = useState<SectionKey>('fee')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fee, setFee] = useState('5')
  const [minPrice, setMinPrice] = useState('50')
  const [maxPrice, setMaxPrice] = useState('100000')
  const [levels, setLevels] = useState<string[]>([])
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/marketplace/settings', { credentials: 'include' })
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '載入失敗')
        const map = (await res.json()) as Record<string, string>
        setFee(map.marketplace_fee_percent ?? '5')
        setMinPrice(map.marketplace_min_price ?? '50')
        setMaxPrice(map.marketplace_max_price ?? '100000')
        try {
          const parsed = JSON.parse(map.marketplace_allowed_levels || '[]')
          setLevels(Array.isArray(parsed) ? parsed.map(String) : [])
        } catch { setLevels([]) }
      } catch (e) {
        toast(e instanceof Error ? e.message : '載入失敗', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  const toggleLevel = (lv: string) => {
    setLevels(prev => prev.includes(lv) ? prev.filter(x => x !== lv) : [...prev, lv])
  }

  const save = async () => {
    try {
      setSaving(true)
      const res = await fetch('/api/admin/marketplace/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          marketplace_fee_percent: Number(fee),
          marketplace_min_price: Number(minPrice),
          marketplace_max_price: Number(maxPrice),
          // 照 LEVEL_OPTIONS 的順序存，之後在後台讀回來的排序才穩定
          marketplace_allowed_levels: LEVEL_OPTIONS.filter(lv => levels.includes(lv)),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '儲存失敗')
      toast('已儲存交易所設定', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  /** 手續費試算：讓老闆看得到「賣 1000 G 的東西，賣家實際拿多少」 */
  const feePreview = useMemo(() => {
    const p = 1000
    const f = Math.floor(p * (Number(fee) || 0) / 100)
    return { fee: f, net: p - f }
  }, [fee])

  const runSeed = () => {
    confirm({
      title: '插入交易所假資料',
      message: '會從倉庫裡挑可上架的賞項（status=in_warehouse 且有圖片）建立測試上架。\n⚠️ 這會把那些真實獎品的狀態改成 listing，正式環境請勿使用。',
      type: 'warning',
      onConfirm: async () => {
        try {
          setSeeding(true)
          const res = await fetch('/api/admin/marketplace/seed', { method: 'POST', credentials: 'include' })
          const data = await res.json().catch(() => null)
          if (!res.ok) throw new Error(data?.error || '建立失敗')
          if (data?.success === false) { toast(data?.message || '沒有可用的倉庫賞項', 'warning'); return }
          toast(`已建立 ${data?.created ?? 0} 筆測試上架`, 'success')
        } catch (e) {
          toast(e instanceof Error ? e.message : '建立失敗', 'error')
        } finally {
          setSeeding(false)
        }
      },
    })
  }

  const runClear = () => {
    confirm({
      title: '清除交易所 / 回收池資料',
      message: '會清空所有交易所上架、成交紀錄與回收池資料。\n⚠️ 不可復原，只在測試環境使用。',
      type: 'danger',
      onConfirm: async () => {
        try {
          setClearing(true)
          const res = await fetch('/api/admin/marketplace/clear', { method: 'POST', credentials: 'include' })
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '清除失敗')
          toast('已清除交易所測試資料', 'success')
        } catch (e) {
          toast(e instanceof Error ? e.message : '清除失敗', 'error')
        } finally {
          setClearing(false)
        }
      },
    })
  }

  return (
    <AdminLayout pageTitle="交易所設定">
      <PageCard>
        {loading ? (
          <CardSkeleton />
        ) : (
          <SettingsShell nav={<SettingsNav sections={SECTIONS} value={section} onChange={setSection} />}>
            {section === 'fee' && (
              <>
                <SectionHead
                  title="手續費與價格"
                  info="手續費是平台從交易所賺到的唯一收入：買家付全額、賣家收到扣完手續費的餘額，差額離開流通（token_ledger 的淨額會少掉這一塊）。費率只影響之後的成交，已成交的單照當時費率記在 marketplace_transactions，不會被追溯。"
                />
                <div className="divide-y divide-neutral-100">
                  <SettingsRow
                    title="成交手續費"
                    desc={`買家付的全額不變，從賣家實收裡扣。以 1,000 G 的品項為例：平台收 ${feePreview.fee.toLocaleString()} G，賣家實收 ${feePreview.net.toLocaleString()} G。`}
                  >
                    <div className="relative w-32">
                      <Input
                        type="number" min={0} max={50} step="1"
                        value={fee}
                        onChange={e => setFee(e.target.value)}
                        className="pr-7 font-mono"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="最低售價"
                    desc="擋掉 1 G 掛單。太低的價格沒有交易意義，只會洗版面與洗手續費紀錄。"
                  >
                    <div className="relative w-32">
                      <Input type="number" min={1} value={minPrice} onChange={e => setMinPrice(e.target.value)} className="pr-8 font-mono" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">G</span>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="最高售價"
                    desc="擋掉「掛天價佔版面」。玩家買不起也不會買，但那件東西會一直霸著清單第一排。"
                  >
                    <div className="relative w-32">
                      <Input type="number" min={1} value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="pr-8 font-mono" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">G</span>
                    </div>
                  </SettingsRow>
                </div>

                <div className="mt-5 flex justify-end">
                  <Button variant="primary" onClick={save} isLoading={saving}>儲存設定</Button>
                </div>
              </>
            )}

            {section === 'levels' && (
              <>
                <SectionHead
                  title="可上架賞等"
                  info="勾起來的賞等才能掛到交易所。判定會先正規化（「A賞 限定版」算 A 賞、「LAST ONE」算最後賞），所以不必把各種寫法都列出來。真正的把關在 DB 的 create_listing，前台只是照這份設定決定倉庫裡哪些東西給你按上架。"
                />

                <div className="py-4">
                  <div className="flex flex-wrap gap-2">
                    {LEVEL_OPTIONS.map(lv => {
                      const on = levels.includes(lv)
                      return (
                        <button
                          key={lv}
                          type="button"
                          onClick={() => toggleLevel(lv)}
                          className={`h-9 rounded-lg border px-4 text-sm transition-colors ${
                            on
                              ? 'border-primary bg-primary/5 font-medium text-primary'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          {lv}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-4">
                    <Note tone={levels.length === 0 ? 'warn' : 'info'}>
                      {levels.length === 0
                        ? '一個都沒勾等於「不限制」，儲存會被擋下來 —— 真要全開就把賞等全部勾起來。'
                        : `目前開放：${LEVEL_OPTIONS.filter(l => levels.includes(l)).join('、')}。放寬到一般賞之前先想清楚：一般賞數量級很大（抽卡的 D 賞全站兩萬多件），開了之後交易所會被它灌滿。`}
                    </Note>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <Button variant="primary" onClick={save} isLoading={saving}>儲存設定</Button>
                </div>
              </>
            )}

            {section === 'tools' && (
              <>
                <SectionHead
                  title="測試工具"
                  info="只在 STG 使用。這兩顆本來擺在「交易所品項管理」頁最上排、跟日常審核並列 —— 兩個都是不可逆操作，挪到這裡才不會誤觸。"
                />
                <div className="py-4">
                  <Note tone="danger">
                    這兩顆會直接改真實資料：插入假資料會把倉庫裡的真獎品改成上架中；清除會刪光所有上架、成交紀錄與回收池。正式環境請勿使用。
                  </Note>
                </div>
                <div className="divide-y divide-neutral-100">
                  <SettingsRow
                    title="插入交易所假資料"
                    desc="從倉庫挑最多 12 件可上架的賞項建立測試上架，價格由編號推算。"
                  >
                    <Button variant="outline" onClick={runSeed} isLoading={seeding}>插入假資料</Button>
                  </SettingsRow>
                  <SettingsRow
                    title="清除交易所 / 回收池資料"
                    desc="清空所有上架、成交紀錄與回收池。不可復原。"
                  >
                    <Button variant="danger" onClick={runClear} isLoading={clearing}>一鍵清除</Button>
                  </SettingsRow>
                </div>
              </>
            )}
          </SettingsShell>
        )}
      </PageCard>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
