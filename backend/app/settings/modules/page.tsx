'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect } from 'react'

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
      { value: 'gacha_modern', label: '現代膠囊機', desc: '格列膠囊展示，側邊把手風格' },
      { value: 'gacha_retro', label: '復古街頭機', desc: '紅色機身圓形球倉，日式扭蛋街機風格' },
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
  {
    type: 'card',
    label: '抽卡',
    themes: [
      { value: 'card_pack', label: '蓄力開卡包', desc: '按住蓄力撕開卡包，卡牌一一揭曉（預設）' },
      { value: 'card_flip', label: '直接翻牌', desc: '略過開包動畫，直接進入卡牌翻面選單' },
    ],
  },
  {
    type: 'custom',
    label: '自製賞',
    themes: [
      { value: 'custom_grid', label: '經典列表', desc: '票券網格排列，各自拖拉撕開（預設）' },
      { value: 'custom_tear', label: '沉浸式撕紙', desc: '全畫面場景，撕開揭曉最大賞' },
    ],
  },
  {
    type: 'blindbox',
    label: '盒玩',
    themes: [
      { value: 'blindbox_classic', label: '原始經典', desc: '物理蛋球掉落轉蛋機（預設）' },
      { value: 'blindbox_claw', label: '夾娃娃機', desc: '夾娃娃機風格揭曉' },
    ],
  },
]

type Setting = { product_type: string; machine_theme: string }

export default function ModuleSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
          <div className="py-12 text-center text-sm text-neutral-500">載入中...</div>
        ) : (
          <div className="space-y-4">
            {PRODUCT_TYPES.map(({ type, label, themes }) => (
              <div key={type} className="p-4 border border-neutral-200 rounded-lg bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-20 shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700">
                      {label}
                    </span>
                  </div>
                  <div className="flex-1">
                    <select
                      value={settings[type] || themes[0].value}
                      onChange={e => handleChange(type, e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {themes.map(({ value, label: themeLabel, desc }) => (
                        <option key={value} value={value}>
                          {themeLabel}（{desc}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-32 shrink-0 text-xs text-neutral-400 text-right">
                    {themes.find(t => t.value === (settings[type] || themes[0].value))?.label}
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
    </AdminLayout>
  )
}
