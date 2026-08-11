'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 六位數字代碼鎖
 *
 * 「其他設定」底下是殺率、AI 用量、爬取工具這類不該隨手點進去的東西，
 * 所以不管從左側欄還是直接貼網址進來，都先問代碼。
 *
 * 驗證走後端 API（代碼存在 env，不落在前端 bundle 裡）。
 * 通過後記在 sessionStorage —— 關掉分頁就失效，不會一次解鎖用一整天。
 */
const STORAGE_KEY = 'ggb_other_settings_unlocked'

export default function CodeGate({ onPass }: { onPass: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') onPass()
    else inputs.current[0]?.focus()
  }, [onPass])

  const submit = async (code: string) => {
    setChecking(true)
    setError('')
    try {
      const res = await fetch('/api/admin/settings/other/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        sessionStorage.setItem(STORAGE_KEY, '1')
        onPass()
        return
      }
      setError('代碼不正確')
      setDigits(Array(6).fill(''))
      inputs.current[0]?.focus()
    } catch {
      setError('驗證失敗，請重試')
    } finally {
      setChecking(false)
    }
  }

  const setAt = (i: number, v: string) => {
    const next = [...digits]
    next[i] = v
    setDigits(next)
    if (next.every(d => d !== '')) void submit(next.join(''))
  }

  const handleChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '')
    if (!v) { setAt(i, ''); return }
    // 一次貼上六碼：整串填進去
    if (v.length > 1) {
      const chars = v.slice(0, 6 - i).split('')
      const next = [...digits]
      chars.forEach((c, k) => { next[i + k] = c })
      setDigits(next)
      const last = Math.min(i + chars.length, 5)
      inputs.current[last]?.focus()
      if (next.every(d => d !== '')) void submit(next.join(''))
      return
    }
    setAt(i, v)
    if (i < 5) inputs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // 空格按退格 → 跳回上一格再刪，跟手機驗證碼的手感一致
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      inputs.current[i - 1]?.focus()
      setAt(i - 1, '')
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">請輸入代碼</h2>
        <p className="mt-1 text-sm text-neutral-500">這一區需要六位數字代碼才能進入</p>

        <div className="mt-6 flex justify-center gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el }}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              disabled={checking}
              className="h-12 w-11 rounded-lg border border-neutral-300 text-center text-xl font-semibold text-neutral-900 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        {checking && <p className="mt-4 text-sm text-neutral-400">驗證中…</p>}
      </div>
    </div>
  )
}
