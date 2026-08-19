'use client'

import { AdminLayout, PageCard } from '@/components'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { useState, useEffect } from 'react'
import SelectField from '@/components/ui/SelectField'
import { SettingsShell, SettingsNav, SectionHead, SettingsRow } from '@/components/settings/SettingsSection'
import ParamsPanel from './ParamsPanel'

/**
 * 抽獎模組設定
 *
 * 版型與功能開關頁一致（左邊類別、右邊內容），由 SettingsShell / SettingsNav 提供。
 *
 * 這一頁有兩種列，別混在一起（老闆 2026-08-19 指出原本「功能都亂放」）：
 *
 *   預設模組（kind: 'default'）
 *     這個類別的商品沒有個別指定時，開包演出用哪一款。存進 module_settings。
 *
 *   商品頁展示（kind: 'params'）
 *     商品頁上半部的展示元件，跟開包演出無關，所以**沒有「預設模組」可選**，
 *     只有參數。先前它的參數掛在「蓄力開卡包」底下，於是在單抽模式關掉自動旋轉，
 *     連卡包模式的商品頁都跟著停 —— migration 591 拆成獨立的 card_showcase。
 */

type Theme = { value: string; label: string; desc: string }

type Row =
  | { kind: 'default'; productType: string; title: string; desc: string; themes: Theme[] }
  | { kind: 'params'; theme: string; title: string; desc: string; paramLabel: string }

const CARD_MODULES: Theme[] = [
  { value: 'card_peel',  label: '撕開封口',   desc: '拖曳封口把手撕開卡包，卡牌一一揭曉' },
  { value: 'card_pack',  label: '蓄力開卡包', desc: '按住蓄力撕開卡包，卡牌一一揭曉' },
  { value: 'card_video', label: '過場影片',   desc: '播放開卡影片，播完回商品頁彈出恭喜獲得' },
]

const CATEGORIES: { key: string; label: string; info: string; rows: Row[] }[] = [
  {
    key: 'ichiban',
    label: '一番賞',
    info: '沒有個別指定模組的一番賞商品，開獎時用哪一款演出。',
    rows: [{
      kind: 'default', productType: 'ichiban', title: '預設開獎演出',
      desc: '商品頁沒有另外指定時套用這一款',
      themes: [
        { value: 'ichiban_grid', label: '經典列表', desc: '票券網格排列，各自拖拉撕開' },
        { value: 'ichiban_tear', label: '沉浸式撕紙', desc: '全畫面場景，撕開揭曉最大賞，再進開獎列表' },
      ],
    }],
  },
  {
    key: 'blindbox',
    label: '盒玩',
    info: '沒有個別指定模組的盒玩商品，開盒時用哪一款演出。',
    rows: [{
      kind: 'default', productType: 'blindbox', title: '預設開盒演出',
      desc: '商品頁沒有另外指定時套用這一款',
      themes: [
        { value: 'blindbox_classic', label: '原始經典', desc: '過場華麗動畫' },
        { value: 'blindbox_mode2', label: '販賣機・兔子', desc: '可愛兔子貨架，盒子飛入取物口' },
        { value: 'blindbox_mode3', label: '販賣機・叢林', desc: '叢林主題貨架，盒子飛入取物口' },
        { value: 'blindbox_mode4', label: '販賣機・賽璐璐', desc: '賽璐璐動畫風貨架' },
        { value: 'blindbox_mode5', label: '販賣機・立體物理', desc: '3D 盒子推出翻落' },
      ],
    }],
  },
  {
    key: 'gacha',
    label: '轉蛋',
    info: '沒有個別指定模組的轉蛋商品，轉蛋時用哪一台機器。',
    rows: [{
      kind: 'default', productType: 'gacha', title: '預設轉蛋機台',
      desc: '商品頁沒有另外指定時套用這一款',
      themes: [
        { value: 'gacha_classic', label: '原始經典', desc: '物理蛋球掉落轉蛋機' },
        { value: 'gacha_mode2', label: '新款機台', desc: '旋鈕式轉蛋機，蛋口出蛋設計' },
        { value: 'gacha_mode3', label: '金光閃閃機台', desc: '旋鈕式轉蛋機，金光閃閃特效版' },
        { value: 'gacha_mode4', label: '狗狗蛋箱', desc: '蛋箱風格轉蛋機，無旋鈕設計' },
        { value: 'gacha_mode5', label: '紫金旋鈕機台', desc: '旋鈕式轉蛋機，操作鈕在頁面底部' },
      ],
    }],
  },
  {
    key: 'card',
    label: '抽卡',
    info: '抽卡有兩種開卡模式，各自可以指定演出。上方的「商品頁卡包展示」是商品頁上半部那個會轉的卡包，兩種模式共用。',
    rows: [
      {
        kind: 'params', theme: 'card_showcase', paramLabel: '商品頁卡包展示',
        title: '商品頁卡包展示',
        desc: '商品頁上半部會轉的那個卡包。與開包演出無關，單抽與卡包模式共用同一組設定',
      },
      {
        kind: 'default', productType: 'card', title: '單抽模式・開包演出',
        desc: '一抽一張。不可使用「撕開封口」——那是整包的演出',
        themes: CARD_MODULES.filter(t => t.value !== 'card_peel'),
      },
      {
        kind: 'default', productType: 'card_pack_mode', title: '卡包模式・開包演出',
        desc: '一抽一整包。三款都可以用',
        themes: CARD_MODULES,
      },
    ],
  },
  {
    key: 'custom',
    label: '自製賞',
    info: '沒有個別指定模組的自製賞商品，開獎時用哪一款演出。',
    rows: [{
      kind: 'default', productType: 'custom', title: '預設開獎演出',
      desc: '商品頁沒有另外指定時套用這一款',
      themes: [{ value: 'custom_combo', label: '影片互動 Combo', desc: '全畫面影片播放，互動點擊揭曉最大賞' }],
    }],
  },
]

/** 存檔要送出的所有預設模組列（params 列沒有預設模組，不參與） */
const DEFAULT_ROWS = CATEGORIES.flatMap(c => c.rows).filter(
  (r): r is Extract<Row, { kind: 'default' }> => r.kind === 'default',
)

export default function ModulesSettingsPage() {
  const [section, setSection] = useState<string>(CATEGORIES[0].key)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  /* 展開中的參數面板（老闆：參數設定移出來、不要彈窗）。同時只開一個，
     免得整頁被滑桿塞滿看不到模組本身 */
  const [openParams, setOpenParams] = useState<string | null>(null)
  /* 參數值由這裡保管，跟預設模組共用同一顆「儲存設定」——
     面板自己再放一顆儲存會變成兩顆，使用者分不出按哪顆存到什麼（老闆 2026-08-19） */
  const [paramValues, setParamValues] = useState<Record<string, Record<string, number | boolean | string>>>({})
  const [dirtyThemes, setDirtyThemes] = useState<string[]>([])

  const handleParamsChange = (theme: string, next: Record<string, number | boolean | string>) => {
    setParamValues(prev => {
      // 第一次載入（prev 沒有這個 theme）不算改動，否則沒動過的參數也會被寫回去
      if (prev[theme] !== undefined) {
        setDirtyThemes(d => (d.includes(theme) ? d : [...d, theme]))
        setSaved(false)
      }
      return { ...prev, [theme]: next }
    })
  }

  useEffect(() => {
    fetch('/api/admin/settings/modules')
      .then(r => r.json())
      .then((rows: { product_type: string; machine_theme: string }[]) => {
        const map: Record<string, string> = {}
        ;(Array.isArray(rows) ? rows : []).forEach(r => { map[r.product_type] = r.machine_theme })
        setSettings(map)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleChange = (productType: string, value: string) => {
    setSettings(prev => ({ ...prev, [productType]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaved(false)
    try {
      const body = DEFAULT_ROWS.map(r => ({
        product_type: r.productType,
        machine_theme: settings[r.productType] || r.themes[0].value,
      }))
      const res = await fetch('/api/admin/settings/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // 有動過的參數一起存。逐個送是因為 API 就是一次一個 theme
      await Promise.all(dirtyThemes.map(theme =>
        fetch('/api/admin/settings/modules/params', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ theme, params: paramValues[theme] ?? {} }),
        })))
      if (res.ok) { setSaved(true); setDirtyThemes([]) }
    } finally {
      setIsSaving(false)
    }
  }

  const current = CATEGORIES.find(c => c.key === section) ?? CATEGORIES[0]

  return (
    <AdminLayout>
      <PageCard title="抽獎模組設定">
        {isLoading ? (
          <CardSkeleton rows={3} />
        ) : (
          <SettingsShell nav={<SettingsNav sections={CATEGORIES} value={section} onChange={setSection} />}>
            <div className="space-y-3">
              <SectionHead title={current.label} info={current.info} />

              {current.rows.map(row => {
                if (row.kind === 'params') {
                  const open = openParams === row.theme
                  return (
                    <div key={row.theme} className="space-y-2">
                      <SettingsRow title={row.title} desc={row.desc}>
                        <button
                          onClick={() => setOpenParams(open ? null : row.theme)}
                          className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors whitespace-nowrap"
                        >
                          {open ? '收起參數' : '參數設定'}
                        </button>
                      </SettingsRow>
                      {open && <ParamsPanel theme={row.theme} values={paramValues[row.theme]} onChange={handleParamsChange} onClose={() => setOpenParams(null)} />}
                    </div>
                  )
                }
                const cur = settings[row.productType] || row.themes[0].value
                const curTheme = row.themes.find(t => t.value === cur)
                const key = `${row.productType}:${cur}`
                const open = openParams === key
                return (
                  <div key={row.productType} className="space-y-2">
                    <SettingsRow title={row.title} desc={row.desc}>
                      <div className="flex items-center gap-2">
                        <SelectField
                          value={cur}
                          onChange={e => { handleChange(row.productType, e.target.value); setOpenParams(null) }}
                          className="min-w-[15rem] border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {row.themes.map(({ value, label, desc }) => (
                            <option key={value} value={value}>{label}（{desc}）</option>
                          ))}
                        </SelectField>
                        <button
                          onClick={() => setOpenParams(open ? null : key)}
                          className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors whitespace-nowrap"
                        >
                          {open ? '收起參數' : '參數設定'}
                        </button>
                      </div>
                    </SettingsRow>
                    {open && (
                      <>
                        <p className="px-1 text-xs text-neutral-400">
                          以下是「{curTheme?.label ?? cur}」的參數，換模組時會跟著換
                        </p>
                        <ParamsPanel theme={cur} values={paramValues[cur]} onChange={handleParamsChange} onClose={() => setOpenParams(null)} />
                      </>
                    )}
                  </div>
                )
              })}

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-neutral-100">
                <p className="text-xs text-neutral-400">
                  ※ 各類別未自訂的商品會套用此設定；已在商品頁個別設定的不受影響
                </p>
                <div className="flex items-center gap-3">
                  {saved && <span className="text-sm text-green-600 font-medium">已儲存</span>}
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isSaving ? '儲存中...' : dirtyThemes.length > 0 ? '儲存設定與參數' : '儲存設定'}
                  </button>
                </div>
              </div>
            </div>
          </SettingsShell>
        )}
      </PageCard>

    </AdminLayout>
  )
}
