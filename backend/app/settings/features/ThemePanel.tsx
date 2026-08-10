'use client'

import { useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import InfoDot from '@/components/ui/InfoDot'
import Button from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'
import { DEFAULT_PALETTE, derivePalette, hexToRgb, contrastWithWhite, type ThemePalette } from '@/lib/theme'

/**
 * 前台主題色 —— 功能開關頁的「主題色」分區（原獨立頁 /settings/theme，
 * 老闆 2026-08-09 指定併入，放 GB哥通知下方）。
 *
 * 只讓人挑一個主色，另外三階（hover 的深色、深底上用的淺色、襯底的極淺色）
 * 由系統推導 —— 讓人分別挑四個顏色的結果通常是四個湊不成一組的顏色。
 *
 * 預覽用的是真的元件樣式（按鈕、標籤、連結、選中狀態），不是四個色塊：
 * 色塊看起來都好看，實際套上去才會發現白字在淺色按鈕上讀不出來。
 */

const PRESETS: { hex: string; label: string }[] = [
  { hex: '#EE4D2D', label: '吉吉比橘（預設）' },
  { hex: '#E53935', label: '正紅' },
  { hex: '#F4511E', label: '暖橘' },
  { hex: '#FB8C00', label: '琥珀' },
  { hex: '#43A047', label: '森綠' },
  { hex: '#00897B', label: '青碧' },
  { hex: '#1E88E5', label: '天藍' },
  { hex: '#3949AB', label: '靛藍' },
  { hex: '#8E24AA', label: '紫' },
  { hex: '#D81B60', label: '桃紅' },
  { hex: '#546E7A', label: '石墨' },
]

const SHADE_LABELS: { key: keyof ThemePalette; label: string; hint: string }[] = [
  { key: 'primary', label: '主色',   hint: '按鈕、連結、選中狀態' },
  { key: 'dark',    label: '深一階', hint: '滑過與按下時' },
  { key: 'light',   label: '淺一階', hint: '深色底上要讀得出來的地方' },
  { key: 'soft',    label: '襯底',   hint: '標籤與區塊的極淺背景' },
]

export default function ThemePanel() {
  const { toast } = useToast()
  const [saved, setSaved] = useState<ThemePalette | null>(null)
  const [isDefault, setIsDefault] = useState(true)
  const [base, setBase] = useState(DEFAULT_PALETTE.primary)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [confirming, setConfirming] = useState<'save' | 'reset' | null>(null)

  // 畫面上的預覽一律從 base 現算，不是存檔後才更新 —— 挑色時就要看得到結果
  const preview = useMemo(() => derivePalette(base), [base])
  const isValid = Boolean(hexToRgb(base))
  const dirty = isValid && preview.primary.toLowerCase() !== (saved?.primary ?? '').toLowerCase()
  const contrast = contrastWithWhite(preview.primary)

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/theme', { credentials: 'include', cache: 'no-store' })
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      setSaved(json.palette)
      setIsDefault(Boolean(json.isDefault))
      setBase(json.palette?.primary ?? DEFAULT_PALETTE.primary)
    } catch {
      toast('讀取主題色失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const submit = async (payload: Record<string, unknown>) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '儲存失敗')
      setSaved(json.palette)
      setIsDefault(Boolean(json.isDefault))
      setBase(json.palette.primary)
      toast('已更新，前台最多一分鐘內生效')
    } catch (e) {
      toast(e instanceof Error ? e.message : '儲存失敗', 'error')
      load()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-medium text-neutral-900">
          前台主題色
          <span className="inline-flex translate-y-px">
            <InfoDot>
              只影響前台玩家看到的畫面，後台維持原本的配色。
              存檔後最多一分鐘內全站生效，不需要重新部署。
              獎項紅、代幣金、成功綠這些有固定意義的顏色不受影響。
            </InfoDot>
          </span>
        </h2>
        {!isDefault && (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-500">
            已自訂
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-neutral-400">讀取中…</div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* ── 左：挑色 ── */}
          <div>
            <div className="text-sm text-neutral-900">挑一個主色</div>
            <p className="mt-1 text-sm text-neutral-400">
              其他三階由系統推導，明暗關係固定，不會出現深色階比主色還亮的情況。
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {PRESETS.map(p => {
                const active = p.hex.toLowerCase() === base.toLowerCase()
                return (
                  <button
                    key={p.hex}
                    type="button"
                    title={p.label}
                    onClick={() => setBase(p.hex)}
                    style={{ backgroundColor: p.hex }}
                    className={`h-9 w-9 rounded-lg border-2 transition-transform ${
                      active ? 'border-neutral-900 scale-110' : 'border-transparent hover:scale-105'
                    }`}
                  >
                    <span className="sr-only">{p.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <input
                type="color"
                value={isValid ? preview.primary : DEFAULT_PALETTE.primary}
                onChange={e => setBase(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-neutral-200 bg-white p-1"
                aria-label="自訂顏色"
              />
              <input
                type="text"
                value={base}
                onChange={e => setBase(e.target.value)}
                placeholder="#EE4D2D"
                spellCheck={false}
                className={`h-10 w-32 rounded-lg border px-3 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  isValid ? 'border-neutral-200' : 'border-red-300 bg-red-50'
                }`}
              />
              {!isValid && <span className="text-sm text-red-500">格式要像 #EE4D2D</span>}
            </div>

            {/* 主色最常見的用途就是白字按鈕。挑到太淺的顏色時字會看不見，
                這件事不提醒的話要等玩家反映才會發現 */}
            {isValid && contrast < 3 && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                這個顏色偏淺，白色文字壓上去會不容易閱讀。按鈕與標籤上的字都是白色的，建議挑深一點。
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() => setConfirming('save')}
                disabled={!isValid || !dirty || isSaving}
                isLoading={isSaving}
              >
                套用到前台
              </Button>
              {dirty && (
                <Button variant="secondary" onClick={() => setBase(saved?.primary ?? DEFAULT_PALETTE.primary)} disabled={isSaving}>
                  取消變更
                </Button>
              )}
              {!isDefault && !dirty && (
                <Button variant="secondary" onClick={() => setConfirming('reset')} disabled={isSaving}>
                  還原成預設色
                </Button>
              )}
            </div>
          </div>

          {/* ── 右：預覽。用真的元件樣式，不是四個色塊 ── */}
          <div>
            <div className="text-sm text-neutral-900">前台會長這樣</div>
            <p className="mt-1 text-sm text-neutral-400">
              這裡即時反映左邊挑的顏色，還沒套用到前台。
            </p>

            <div className="mt-4 space-y-3 rounded-xl border border-neutral-200 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-bold text-white"
                  style={{ backgroundColor: preview.primary }}
                >
                  立即抽獎
                </span>
                <span
                  className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-bold text-white"
                  style={{ backgroundColor: preview.dark }}
                >
                  按下時
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-full px-3 py-1 text-xs font-black"
                  style={{ backgroundColor: preview.soft, color: preview.primary }}
                >
                  熱門
                </span>
                <span className="text-sm font-bold underline underline-offset-2" style={{ color: preview.primary }}>
                  看完整對照表
                </span>
                <span className="text-sm font-black" style={{ color: preview.primary }}>
                  NT$ 150
                </span>
              </div>

              {/* 深底上的表現要另外看：主色壓在深色上通常會偏濁，
                  站上有幾處（例如跑馬燈）就是為此改用淺一階 */}
              <div className="rounded-lg bg-neutral-900 px-4 py-3">
                <span className="text-sm font-bold" style={{ color: preview.light }}>
                  深色底上的文字
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SHADE_LABELS.map(s => (
                <div key={s.key} className="rounded-lg border border-neutral-200 p-2.5" title={s.hint}>
                  <div className="h-8 w-full rounded" style={{ backgroundColor: preview[s.key] }} />
                  <div className="mt-1.5 text-xs font-bold text-neutral-700">{s.label}</div>
                  <div className="font-mono text-[11px] uppercase text-neutral-400">{preview[s.key]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming === 'reset') submit({ reset: true })
          else submit({ primary: preview.primary })
          setConfirming(null)
        }}
        title={confirming === 'reset' ? '還原成預設色？' : '套用到前台？'}
        message={
          confirming === 'reset'
            ? '前台會回到吉吉比橘。最多一分鐘內全站生效。'
            : '所有玩家看到的按鈕、連結與標籤都會換成這個顏色，最多一分鐘內全站生效。隨時可以改回來。'
        }
        confirmText={confirming === 'reset' ? '還原' : '套用'}
        type={confirming === 'reset' ? 'info' : 'warning'}
      />
    </>
  )
}
