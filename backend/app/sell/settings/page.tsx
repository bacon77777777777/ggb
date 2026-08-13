'use client'

/**
 * 商城設定
 *
 * 版型與「功能開關」頁共用（`components/settings/SettingsSection`）：左側分區、右側內容，
 * 控制項一律用 Segmented 不用 Switch —— 理由寫在那支共用檔裡。
 *
 * 玩家商城（sell_*）的規則都存在 `platform_settings`，真正執行的是 DB trigger
 * `sell_guard_listing()`，這頁只是把值改掉。
 *
 * ⚠️ 這裡設定的是「玩家商城」，不要跟這兩個搞混：
 *   · 交易所（marketplace_*）：倉庫裡的大賞轉手，貨不離開平台倉庫
 *   · 卡牌交換（exchange_*）：以物易物，沒有金流
 *
 * ── 為什麼規則要擋在 DB ──
 * 前台按鈕藏起來，會打 API 的人照樣能上架。所以每一條規則都做在 trigger 裡，
 * 這頁改的只是參數。關掉「用戶自由上架」之後，玩家真的插不進去 sell_listings。
 *
 * ── 為什麼是整頁一起存，不是改一項存一項 ──
 * 功能開關頁改一下就送出，因為那頁全是三態按鈕。這頁混了輸入框與文字區，
 * 一半即時存一半要按鈕，會讓人不知道自己改的東西到底進去了沒。
 */

import { AdminLayout, PageCard } from '@/components'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { useToast } from '@/contexts/ToastContext'
import {
  SettingsShell,
  SettingsNav,
  SectionHead,
  SettingsRow as Row,
  Segmented,
} from '@/components/settings/SettingsSection'
import { useCallback, useEffect, useState } from 'react'

type SectionKey = 'listing' | 'category' | 'deadline' | 'disclaimer'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'listing',    label: '上架規則' },
  { key: 'category',   label: '類別白名單' },
  { key: 'deadline',   label: '交易期限' },
  { key: 'disclaimer', label: '免責聲明' },
]

type Form = {
  userListing: boolean
  requirePhone: boolean
  maxActive: string
  categories: string[]
  payHours: string
  shipDays: string
  receiveDays: string
  disclaimer: string
}

const DEFAULTS: Form = {
  userListing: true,
  requirePhone: true,
  maxActive: '20',
  categories: [],
  payHours: '48',
  shipDays: '7',
  receiveDays: '7',
  disclaimer: '',
}

const ON_OFF = [
  { v: 'on',  label: '開放', tone: 'on'  as const },
  { v: 'off', label: '關閉', tone: 'off' as const },
]

export default function SellSettingsPage() {
  const { toast } = useToast()
  const [section, setSection] = useState<SectionKey>('listing')
  const [form, setForm] = useState<Form>(DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState('')

  /** 一律走這個改狀態，才不會有哪一項忘了標記未存 */
  const patch = (p: Partial<Form>) => {
    setForm(f => ({ ...f, ...p }))
    setIsDirty(true)
  }

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) throw new Error((await res.json())?.error || '載入失敗')
      const s = await res.json() as Record<string, string>

      let categories: string[] = []
      try {
        const parsed = JSON.parse(s.sell_category_whitelist || '[]')
        if (Array.isArray(parsed)) categories = parsed.map(String)
      } catch {
        // 值被手動改壞的話當空白處理，不要整頁掛掉
        categories = []
      }

      setForm({
        userListing: (s.sell_user_listing_enabled ?? 'true') === 'true',
        requirePhone: (s.sell_require_phone_verified ?? 'true') === 'true',
        maxActive: s.sell_max_active_listings ?? '20',
        categories,
        payHours: s.sell_pay_deadline_hours ?? '48',
        shipDays: s.sell_ship_deadline_days ?? '7',
        receiveDays: s.sell_receive_deadline_days ?? '7',
        disclaimer: s.sell_disclaimer ?? '',
      })
      setIsDirty(false)
    } catch (e: any) {
      toast(e?.message || '載入失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const addCategory = () => {
    const v = categoryDraft.trim()
    if (!v) return
    if (form.categories.includes(v)) {
      toast('這個類別已經在清單裡了', 'error')
      return
    }
    patch({ categories: [...form.categories, v] })
    setCategoryDraft('')
  }

  const save = async () => {
    const nums: Array<[string, string]> = [
      ['每人同時上架上限', form.maxActive],
      ['付款期限', form.payHours],
      ['出貨期限', form.shipDays],
      ['確認收貨期限', form.receiveDays],
    ]
    for (const [label, v] of nums) {
      const n = Number(v)
      if (!Number.isInteger(n) || n <= 0) {
        toast(`${label}要填大於 0 的整數`, 'error')
        return
      }
    }
    if (form.userListing && form.categories.length === 0) {
      toast('開放玩家上架時，至少要留一個類別，不然沒人上得了架', 'error')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sell_user_listing_enabled: String(form.userListing),
          sell_require_phone_verified: String(form.requirePhone),
          sell_max_active_listings: String(Number(form.maxActive)),
          sell_category_whitelist: JSON.stringify(form.categories),
          sell_pay_deadline_hours: String(Number(form.payHours)),
          sell_ship_deadline_days: String(Number(form.shipDays)),
          sell_receive_deadline_days: String(Number(form.receiveDays)),
          sell_disclaimer: form.disclaimer.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json())?.error || '儲存失敗')
      toast('已儲存')
      setIsDirty(false)
    } catch (e: any) {
      toast(e?.message || '儲存失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const locked = isLoading || isSaving

  return (
    <AdminLayout pageTitle="商城設定">
      <div className="space-y-3">
        {/* 分區之後看不到全貌，這一行補回來：進這頁最想先知道的是「現在開著沒」 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm">
          {[
            { text: form.userListing ? '玩家可自由上架' : '僅官方商品', warn: !form.userListing },
            { text: form.requirePhone ? '需手機驗證' : '未要求手機驗證', warn: !form.requirePhone },
            { text: `${form.categories.length} 個開放類別`, warn: form.userListing && form.categories.length === 0 },
            { text: '平台不經手款項', warn: false },
          ].map((p, i) => (
            <span key={p.text} className="flex items-center gap-2">
              {i > 0 && <span className="text-neutral-300">·</span>}
              <span className={p.warn ? 'text-amber-600' : 'text-neutral-500'}>{p.text}</span>
            </span>
          ))}
        </div>

        <PageCard>
          <SettingsShell
            nav={<SettingsNav sections={SECTIONS} value={section} onChange={setSection} />}
          >
            {section === 'listing' && (
              <>
                <SectionHead
                  title="上架規則"
                  info="決定誰能在商城上架、上架前要通過什麼。這些規則擋在資料庫，不是只把前台按鈕藏起來，所以直接打 API 也繞不過去。"
                />
                <div className="divide-y divide-neutral-100">
                  <Row
                    title="用戶自由上架"
                    state={form.userListing ? 'on' : 'off'}
                    desc={<>
                      關閉後商城只剩官方商品，玩家不能再上架新商品。<br />
                      已經在架上的不受影響，要下架請到「商城商品」處理。
                    </>}
                  >
                    <Segmented
                      value={form.userListing ? 'on' : 'off'}
                      disabled={locked}
                      options={ON_OFF}
                      onChange={v => patch({ userListing: v === 'on' })}
                    />
                  </Row>

                  <Row
                    title="上架前必須完成手機驗證"
                    state={form.requirePhone ? 'on' : 'off'}
                    dimmed={!form.userListing}
                    desc="商城的錢不經過平台，實名是出事時唯一能追到人的方式。建議保持開放。"
                  >
                    <Segmented
                      value={form.requirePhone ? 'on' : 'off'}
                      disabled={locked || !form.userListing}
                      options={ON_OFF}
                      onChange={v => patch({ requirePhone: v === 'on' })}
                    />
                  </Row>

                  <Row
                    title="每人同時上架上限"
                    dimmed={!form.userListing}
                    desc="計入待審與上架中的商品，避免單一賣家洗版。"
                  >
                    <div className="w-28">
                      <Input
                        type="number" min={1} value={form.maxActive}
                        disabled={locked || !form.userListing}
                        onChange={e => patch({ maxActive: e.target.value })}
                      />
                    </div>
                  </Row>
                </div>
              </>
            )}

            {section === 'category' && (
              <>
                <SectionHead
                  title="類別白名單"
                  info="只有清單內的類別可以上架，玩家在上架頁只會看到這些選項。移除某個類別不會下架已經在架上的商品，那些要到「商城商品」另外處理。"
                />
                <div className="py-4">
                  <div className="flex flex-wrap gap-2">
                    {form.categories.map(c => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 py-1.5 pl-3 pr-2 text-sm text-neutral-700"
                      >
                        {c}
                        <button
                          type="button"
                          aria-label={`移除 ${c}`}
                          disabled={locked}
                          onClick={() => patch({ categories: form.categories.filter(x => x !== c) })}
                          className="text-neutral-400 transition-colors hover:text-red-500 disabled:opacity-60"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {form.categories.length === 0 && (
                      <span className="text-sm text-amber-600">
                        目前沒有任何開放類別，玩家會上不了架
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex items-end gap-2">
                    <div className="w-64">
                      <Input
                        label="新增類別"
                        placeholder="例如：公仔模型"
                        value={categoryDraft}
                        disabled={locked}
                        onChange={e => setCategoryDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                      />
                    </div>
                    <Button variant="secondary" disabled={locked} onClick={addCategory}>
                      新增
                    </Button>
                  </div>
                </div>
              </>
            )}

            {section === 'deadline' && (
              <>
                <SectionHead
                  title="交易期限"
                  info="由排程每小時檢查一次。平台不碰錢，所以能自動處理的只有「錢還沒付」與「東西已經寄到」這兩端，中間賣家不出貨那段只能通知與留紀錄。"
                />
                <div className="divide-y divide-neutral-100">
                  <Row
                    title="付款期限（小時）"
                    desc="買家下單後超過這個時間還沒回報付款，訂單自動取消、庫存放回架上。"
                  >
                    <div className="w-28">
                      <Input
                        type="number" min={1} value={form.payHours}
                        disabled={locked}
                        onChange={e => patch({ payHours: e.target.value })}
                      />
                    </div>
                  </Row>
                  <Row
                    title="出貨期限（天）"
                    desc={<>
                      賣家超過這個時間沒出貨，系統通知雙方並提示買家可以檢舉。<br />
                      <span className="text-amber-600">
                        這裡不會自動取消訂單 —— 錢已經直接匯給賣家了，平台取消也拿不回來。
                      </span>
                    </>}
                  >
                    <div className="w-28">
                      <Input
                        type="number" min={1} value={form.shipDays}
                        disabled={locked}
                        onChange={e => patch({ shipDays: e.target.value })}
                      />
                    </div>
                  </Row>
                  <Row
                    title="確認收貨期限（天）"
                    desc="賣家出貨後超過這個時間買家沒按確認，訂單自動完成。"
                  >
                    <div className="w-28">
                      <Input
                        type="number" min={1} value={form.receiveDays}
                        disabled={locked}
                        onChange={e => patch({ receiveDays: e.target.value })}
                      />
                    </div>
                  </Row>
                </div>
              </>
            )}

            {section === 'disclaimer' && (
              <>
                <SectionHead
                  title="免責聲明"
                  info="會顯示在商品頁與訂單頁。玩家商城的付款由買賣雙方自行完成，平台不經手款項，這段文字是出事時平台唯一能主張的界線，寫清楚、不要只塞在使用條款裡。"
                />
                <div className="py-4">
                  <Textarea
                    rows={5}
                    value={form.disclaimer}
                    disabled={locked}
                    onChange={e => patch({ disclaimer: e.target.value })}
                    helperText="留空的話商品頁與訂單頁就不會顯示任何提醒，不建議。"
                  />
                </div>
              </>
            )}

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
              {isDirty && <span className="mr-auto text-sm text-amber-600">有尚未儲存的變更</span>}
              <Button variant="secondary" disabled={locked || !isDirty} onClick={load}>
                還原
              </Button>
              <Button disabled={isLoading || !isDirty} isLoading={isSaving} onClick={save}>
                儲存設定
              </Button>
            </div>
          </SettingsShell>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
