'use client'

import { useEffect } from 'react'
import Button from '@/components/ui/Button'
import Switch from '@/components/ui/Switch'
import ImageUploadField from '@/components/ui/ImageUploadField'
import { MACHINE_PARAM_SPECS, defaultParams, type ParamSpec } from './machineParams'

/**
 * 機台參數面板（直接畫在頁面上，不是彈窗）
 *
 * 這個元件**不自己存檔**：值由上層 page.tsx 保管，跟「預設模組」共用同一顆儲存鍵。
 * 原本面板自己有一顆「儲存參數」，加上頁面底下的「儲存設定」變成兩顆
 * （老闆 2026-08-19：「兩個儲存？」）—— 使用者根本分不出按哪顆存到什麼。
 *
 * 滑桿照 machineParams.ts 的規格長出來 —— 之後哪個機台要開放調校，
 * 在那份規格加一組就會自己出現，這裡不用改。
 */
export default function ParamsPanel({
  theme, values, onChange, onClose,
}: {
  theme: string
  values: Record<string, number | boolean | string> | undefined
  onChange: (theme: string, next: Record<string, number | boolean | string>) => void
  onClose?: () => void
}) {
  const specs: ParamSpec[] = MACHINE_PARAM_SPECS[theme] ?? []

  // 第一次展開才去讀；讀回來的值交給上層保管
  useEffect(() => {
    if (specs.length === 0 || values !== undefined) return
    let dead = false
    fetch(`/api/admin/settings/modules/params?theme=${encodeURIComponent(theme)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!dead) onChange(theme, { ...defaultParams(theme), ...(d?.params ?? {}) }) })
      .catch(() => { if (!dead) onChange(theme, defaultParams(theme)) })
    return () => { dead = true }
    // 相依只放 theme/values：onChange 每次 render 都是新函式，放進來會無限重載
  }, [theme, values])

  if (specs.length === 0) {
    return (
      <p className="rounded-lg bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-400">
        這個模組目前沒有可調參數。
      </p>
    )
  }
  if (values === undefined) {
    return <p className="rounded-lg bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-400">讀取中…</p>
  }

  const set = (k: string, v: number | boolean | string) => onChange(theme, { ...values, [k]: v })
  const groups = [...new Set(specs.map(s => s.group))]

  return (
    <div className="space-y-5 rounded-lg border border-neutral-100 bg-neutral-50/60 p-4">
      {groups.map(g => (
        <div key={g}>
          <h3 className="mb-2 border-b border-neutral-200 pb-1.5 text-xs font-semibold tracking-wide text-neutral-500">
            {g}
          </h3>
          <div className="space-y-3">
            {specs.filter(s => s.group === g).map(s => (
              <div key={s.key}>
                <div className="grid grid-cols-[92px_1fr_58px] items-center gap-3">
                  <label className="text-sm text-neutral-700">{s.label}</label>
                  {s.type === 'image' ? (
                    <div className="col-span-2">
                      <ImageUploadField
                        value={String(values[s.key] ?? '')}
                        onChange={url => set(s.key, url)}
                        folder="products"
                      />
                    </div>
                  ) : s.type === 'toggle' ? (
                    <div className="col-span-2">
                      <Switch checked={Boolean(values[s.key])} onCheckedChange={v => set(s.key, v)} />
                    </div>
                  ) : (
                    <>
                      <input
                        type="range"
                        min={s.min} max={s.max} step={s.step}
                        value={Number(values[s.key] ?? s.default)}
                        onChange={e => set(s.key, Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <output className="text-right text-xs tabular-nums text-neutral-500">
                        {Number(values[s.key] ?? s.default)}{s.unit ?? ''}
                      </output>
                    </>
                  )}
                </div>
                {s.hint && <p className="mt-1 pl-[104px] text-xs text-neutral-400">{s.hint}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 border-t border-neutral-200 pt-4">
        <Button variant="secondary" onClick={() => onChange(theme, defaultParams(theme))}>還原預設</Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">改完按下方「儲存設定」一起存</span>
          {onClose && <Button variant="secondary" onClick={onClose}>收起</Button>}
        </div>
      </div>
    </div>
  )
}
