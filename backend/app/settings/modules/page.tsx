'use client'

import { AdminLayout, PageCard } from '@/components'
import Badge from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { useState, useEffect } from 'react'
import SelectField from '@/components/ui/SelectField'
import ParamsModal from './ParamsModal'

const PRODUCT_TYPES: {
  type: string
  label: string
  themes: { value: string; label: string; desc: string }[]
}[] = [
  {
    type: 'gacha',
    label: '轉蛋',
    themes: [
      { value: 'gacha_classic', label: '原始經典', desc: '物理蛋球掉落轉蛋機' },
      { value: 'gacha_mode2', label: '新款機台', desc: '旋鈕式轉蛋機，蛋口出蛋設計' },
      { value: 'gacha_mode3', label: '金光閃閃機台', desc: '旋鈕式轉蛋機，金光閃閃特效版' },
      { value: 'gacha_mode4', label: '狗狗蛋箱', desc: '蛋箱風格轉蛋機，無旋鈕設計' },
      { value: 'gacha_mode5', label: '紫金旋鈕機台', desc: '旋鈕式轉蛋機，操作鈕在頁面底部' },
    ],
  },
  {
    type: 'ichiban',
    label: '一番賞',
    themes: [
      { value: 'ichiban_grid', label: '經典列表', desc: '票券網格排列，各自拖拉撕開（預設）' },
      { value: 'ichiban_tear', label: '沉浸式撕紙', desc: '全畫面場景，撕開揭曉最大賞，再進開獎列表' },
    ],
  },
  /* 抽卡拆成兩種模式各自的預設（老闆 2026-08-18）：
     兩種模式的演出不通用 —— 撕開封口是整包的演出，蓄力開卡包是單張的，
     混在同一個下拉會讓人以為可以互換（DB 端 migration 586 的 CHECK 也會擋）。
     設定鍵 card = 單抽模式、card_pack_mode = 卡包模式 */
  {
    type: 'card',
    label: '抽卡・單抽模式',
    themes: [
      { value: 'card_pack',  label: '蓄力開卡包', desc: '按住蓄力撕開卡包，卡牌一一揭曉（預設）' },
      { value: 'card_video', label: '過場影片',   desc: '播放開卡影片，播完回商品頁彈出恭喜獲得' },
    ],
  },
  {
    type: 'card_pack_mode',
    label: '抽卡・卡包模式',
    themes: [
      { value: 'card_peel',  label: '撕開封口',   desc: '拖曳封口把手撕開卡包，卡牌一一揭曉並累計價值（目前僅此一款）' },
    ],
  },
  {
    type: 'custom',
    label: '自製賞',
    themes: [
      { value: 'custom_combo', label: '影片互動 Combo', desc: '全畫面影片播放，互動點擊揭曉最大賞（預設）' },
    ],
  },
  {
    type: 'blindbox',
    label: '盒玩',
    themes: [
      { value: 'blindbox_classic', label: '原始經典', desc: '過場華麗動畫（預設）' },
      { value: 'blindbox_mode2', label: '販賣機', desc: '可愛兔子貨架機台，盒子飛入取物口動畫' },
      { value: 'blindbox_mode3', label: '叢林探險販賣機', desc: '叢林主題貨架機台，盒子飛入取物口動畫' },
      { value: 'blindbox_mode4', label: '賽璐璐風格販賣機', desc: '賽璐璐動畫風貨架機台，盒子飛入取物口動畫' },
      { value: 'blindbox_mode5', label: '立體物理販賣機', desc: '3D 盒子推出傾倒，真物理落盒滾進取物口（手感可調）' },
    ],
  },
]

type Setting = { product_type: string; machine_theme: string }

export default function ModuleSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [paramsFor, setParamsFor] = useState<{ theme: string; label: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/settings/modules')
      .then(r => r.json())
      .then((data: Setting[]) => {
        const map: Record<string, string> = {}
        for (const row of data) map[row.product_type] = row.machine_theme
        setSettings(map)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleChange = (type: string, theme: string) => {
    setSettings(prev => ({ ...prev, [type]: theme }))
    setSaved(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaved(false)
    try {
      const body = PRODUCT_TYPES.map(({ type, themes }) => ({
        product_type: type,
        machine_theme: settings[type] || themes[0].value,
      }))
      const res = await fetch('/api/admin/settings/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) setSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminLayout>
      <PageCard title="抽獎模組設定">
        {isLoading ? (
          <CardSkeleton rows={3} />
        ) : (
          <div className="space-y-4">
            {PRODUCT_TYPES.map(({ type, label, themes }) => (
              <div key={type} className="p-4 border border-neutral-200 rounded-lg bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-20 shrink-0">
                    <Badge variant="default">{label}</Badge>
                  </div>
                  <div className="flex-1">
                    <SelectField
                      value={settings[type] || themes[0].value}
                      onChange={e => handleChange(type, e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {themes.map(({ value, label: themeLabel, desc }) => (
                        <option key={value} value={value}>
                          {themeLabel}（{desc}）
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {/* 原本這裡是重複顯示選中主題名的灰字（下拉裡已經看得到），
                      老闆指定換成參數設定入口 */}
                  <div className="w-24 shrink-0 text-right">
                    <button
                      onClick={() => {
                        const cur = settings[type] || themes[0].value
                        setParamsFor({ theme: cur, label: themes.find(t => t.value === cur)?.label ?? cur })
                      }}
                      className="text-sm font-medium text-primary hover:text-primary"
                    >
                      參數設定
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
              <p className="text-xs text-neutral-400">
                ※ 各類別未自訂的商品會套用此設定；已在商品頁個別設定的不受影響
              </p>
              <div className="flex items-center gap-3">
                {saved && <span className="text-sm text-green-600 font-medium">已儲存</span>}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-colors"
                >
                  {isSaving ? '儲存中...' : '儲存設定'}
                </button>
              </div>
            </div>
          </div>
        )}
      </PageCard>

      <ParamsModal
        theme={paramsFor?.theme ?? ''}
        themeLabel={paramsFor?.label ?? ''}
        isOpen={paramsFor !== null}
        onClose={() => setParamsFor(null)}
      />
    </AdminLayout>
  )
}
