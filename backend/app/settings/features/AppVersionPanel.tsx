'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Switch from '@/components/ui/Switch'
import InfoDot from '@/components/ui/InfoDot'
import { useToast } from '@/contexts/ToastContext'

/**
 * App 版本 —— 功能開關頁的「App 版本」分區。
 *
 * 對應前台 `components/native/AppUpdateGate.tsx` 的兩種更新提示：
 *
 *   網頁版更新（可關的彈窗）—— 推 frontend 就生效，玩家重載 webview 即可，
 *     不必送審。這是絕大多數情況，所以預設開著，也沒有版本號要填。
 *   原生殼更新（不給關的彈窗）—— 只有動到 mobile/ 才需要。填了版本號才啟用；
 *     沒上架前留空就好，填了卻沒有商店網址的話玩家會被鎖在沒有出口的彈窗裡，
 *     所以後端會擋下那種組合。
 */

type State = {
  webCheck: boolean
  minNative: string
  storeIos: string
  storeAndroid: string
}

const EMPTY: State = { webCheck: true, minNative: '', storeIos: '', storeAndroid: '' }

export default function AppVersionPanel() {
  const { toast } = useToast()
  const [form, setForm] = useState<State>(EMPTY)
  const [saved, setSaved] = useState<State>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/app-version', { credentials: 'include', cache: 'no-store' })
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      const next: State = {
        webCheck: json.webCheck !== false,
        minNative: json.minNative ?? '',
        storeIos: json.storeIos ?? '',
        storeAndroid: json.storeAndroid ?? '',
      }
      setForm(next)
      setSaved(next)
    } catch {
      toast('讀取 App 版本設定失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/app-version', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '儲存失敗')
      setSaved(form)
      toast('已更新')
    } catch (e) {
      toast(e instanceof Error ? e.message : '儲存失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="py-10 text-center text-sm text-neutral-500">載入中…</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-medium text-neutral-900">
          網頁版更新提示
          <span className="inline-flex translate-y-px">
            <InfoDot>
              推前台上線後，App 玩家回到前景時會跳「有新版本」，按下去重載 webview 就是新版。
              不需要重新送審，也不用玩家去商店下載 —— 原生殼是直接載入網站的。
              可以按「稍後再說」，同一次啟動不會再問。
            </InfoDot>
          </span>
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          幾乎所有更新都屬於這一種。除非提示造成困擾，否則維持開啟。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Switch
            checked={form.webCheck}
            onCheckedChange={v => setForm(f => ({ ...f, webCheck: v }))}
          />
          <span className="text-sm text-neutral-700">
            {form.webCheck ? '開啟' : '關閉'}
          </span>
        </div>
      </div>

      <div className="border-t border-neutral-100 pt-8">
        <h2 className="flex items-center gap-2 text-xl font-medium text-neutral-900">
          原生 App 強制更新
          <span className="inline-flex translate-y-px">
            <InfoDot>
              只有動到原生殼（`mobile/` 的外掛、原生程式碼、Capacitor 版本）時才需要。
              低於這個版本的 App 會看到一個**不能關閉**的彈窗，只能去商店下載。
              留空＝不啟用。上架前請留空。
            </InfoDot>
          </span>
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          留空代表不啟用。填了版本號就必須至少填一個商店網址，
          否則玩家會被鎖在一個按了沒反應的彈窗裡。
        </p>

        <div className="mt-4 max-w-md space-y-4">
          <div>
            <label className="mb-1 block text-sm text-neutral-700">最低原生版本</label>
            <Input
              value={form.minNative}
              onChange={e => setForm(f => ({ ...f, minNative: e.target.value }))}
              placeholder="例如 1.0.2；留空＝不啟用"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-700">iOS 商店網址</label>
            <Input
              value={form.storeIos}
              onChange={e => setForm(f => ({ ...f, storeIos: e.target.value }))}
              placeholder="https://apps.apple.com/tw/app/..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-700">Android 商店網址</label>
            <Input
              value={form.storeAndroid}
              onChange={e => setForm(f => ({ ...f, storeAndroid: e.target.value }))}
              placeholder="https://play.google.com/store/apps/details?id=tw.com.ggb.app"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-100 pt-6">
        <Button onClick={save} disabled={!dirty} isLoading={isSaving}>儲存</Button>
        {dirty && <span className="text-sm text-neutral-500">有未儲存的變更</span>}
      </div>
    </div>
  )
}
