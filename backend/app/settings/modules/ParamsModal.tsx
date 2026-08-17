'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/Button'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/contexts/ToastContext'
import ImageUploadField from '@/components/ui/ImageUploadField'
import { MACHINE_PARAM_SPECS, defaultParams, type ParamSpec } from './machineParams'

/**
 * 機台參數設定彈窗
 *
 * 滑桿是照 machineParams.ts 的規格長出來的 —— 之後哪個機台要開放
 * 調校，在那份規格加一組就會自己出現，這裡不用改。
 */
export default function ParamsModal({ theme, themeLabel, isOpen, onClose }: {
  theme: string
  themeLabel: string
  isOpen: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const specs: ParamSpec[] = MACHINE_PARAM_SPECS[theme] ?? []
  const [values, setValues] = useState<Record<string, number | boolean | string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || specs.length === 0) return
    setLoading(true)
    fetch(`/api/admin/settings/modules/params?theme=${encodeURIComponent(theme)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setValues({ ...defaultParams(theme), ...(d?.params ?? {}) }))
      .catch(() => setValues(defaultParams(theme)))
      .finally(() => setLoading(false))
  }, [isOpen, theme])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings/modules/params', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ theme, params: values }),
      })
      if (!res.ok) throw new Error()
      toast('已儲存，前台重新進入機台即生效')
      onClose()
    } catch {
      toast('儲存失敗，請重試一次', 'error')
    } finally {
      setSaving(false)
    }
  }

  const groups = [...new Set(specs.map(s => s.group))]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${themeLabel}｜參數設定`} size="lg">
      {specs.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          這個主題目前沒有可調參數。
        </p>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-neutral-400">讀取中…</p>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g}>
              <h3 className="mb-2 border-b border-neutral-100 pb-1.5 text-xs font-semibold tracking-wide text-neutral-500">
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
                            onChange={url => setValues(p => ({ ...p, [s.key]: url }))}
                            folder="products"
                          />
                        </div>
                      ) : s.type === 'toggle' ? (
                        <div className="col-span-2">
                          <Switch
                            checked={Boolean(values[s.key])}
                            onCheckedChange={v => setValues(p => ({ ...p, [s.key]: v }))}
                          />
                        </div>
                      ) : (
                        <>
                          <input
                            type="range"
                            min={s.min} max={s.max} step={s.step}
                            value={Number(values[s.key] ?? s.default)}
                            onChange={e => setValues(p => ({ ...p, [s.key]: Number(e.target.value) }))}
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

          <div className="flex justify-between gap-2 border-t border-neutral-100 pt-4">
            <Button variant="secondary" onClick={() => setValues(defaultParams(theme))}>
              還原預設
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button onClick={save} isLoading={saving}>儲存</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
