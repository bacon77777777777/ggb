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
      { value: 'classic_machine', label: '原始經典', desc: '物理蛋球掉落轉蛋機' },
      { value: 'modern_machine', label: '現代膠囊機', desc: '格列膠囊展示，側邊把手風格' },
      { value: 'retro_machine', label: '復古街頭機', desc: '紅色機身圓形球倉，日式扭蛋街機風格' },
    ],
  },
  // 其他類別模組切換開發中，暫時隱藏
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
          <div className="py-12 text-center text-sm text-gray-500">載入中...</div>
        ) : (
          <div className="space-y-4">
            {PRODUCT_TYPES.map(({ type, label, note, themes }) => (
              <div key={type} className="p-4 border border-gray-200 rounded-lg bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-20 shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                      {label}
                    </span>
                  </div>
                  <div className="flex-1">
                    <select
                      value={settings[type] || themes[0].value}
                      onChange={e => handleChange(type, e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {themes.map(({ value, label: themeLabel, desc }) => (
                        <option key={value} value={value}>
                          {themeLabel}（{desc}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-32 shrink-0 text-xs text-gray-400 text-right">
                    {themes.find(t => t.value === (settings[type] || themes[0].value))?.label}
                  </div>
                </div>
                {note && (
                  <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">{note}</p>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                ※ 各類別未自訂的商品會套用此設定；已在商品頁個別設定的不受影響
              </p>
              <div className="flex items-center gap-3">
                {saved && <span className="text-sm text-green-600 font-medium">已儲存</span>}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
