'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen'

/**
 * LINE 登入的回程頁
 *
 * 兩種落地情境，用「本地有沒有出發前存的 state」分流：
 *
 * 1. **同一個瀏覽器**（桌機、手機瀏覽器直接開站）—— localStorage 裡有
 *    state：比對相符就把 code 換成 session，當場登入。
 * 2. **別的瀏覽器**（玩家從偽 app 出發 → 跳 LINE app 授權 → iOS 把回程
 *    丟進 Safari）—— 這裡的 localStorage 是空的。登入態不能建在這裡，
 *    改請後端把票存進資料庫（偽 app 正在輪詢），然後顯示引導畫面
 *    請玩家切回偽 app。iOS 不允許網頁拉起偽 app，切回去只能靠人。
 */

type Phase = 'working' | 'return-to-app' | 'error'

function LineCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<Phase>('working')
  const [error, setError] = useState('')
  // React StrictMode 會把 effect 跑兩次，而授權碼只能用一次 ——
  // 第二次會被 LINE 拒絕，看起來像登入失敗。用 ref 擋重入
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const run = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const savedState = localStorage.getItem('line_login_state')
      localStorage.removeItem('line_login_state')

      // 玩家在 LINE 那頁按了取消
      if (searchParams.get('error')) { router.replace('/login'); return }

      if (!code || !state) {
        setError('登入逾時或連結失效，請重新登入一次')
        setPhase('error')
        return
      }

      // 本地有 state 但對不上 —— 這不是跨情境，是真的可疑，拒收（CSRF）
      if (savedState && savedState !== state) {
        setError('登入逾時或連結失效，請重新登入一次')
        setPhase('error')
        return
      }

      const crossContext = !savedState

      try {
        const res = await fetch('/api/auth/line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirectUri: `${window.location.origin}/auth/line/callback`,
            ...(crossContext ? { mode: 'ticket', state } : {}),
          }),
        })
        const json = await res.json()

        if (crossContext) {
          if (!res.ok || !json.stored) {
            setError(json.error || '登入失敗，請重試一次')
            setPhase('error')
            return
          }
          // 票已入庫，偽 app 那頭的輪詢會取走。剩下的只有請玩家切回去
          setPhase('return-to-app')
          return
        }

        if (!res.ok || !json.tokenHash) {
          setError(json.error || '登入失敗，請重試一次')
          setPhase('error')
          return
        }

        const supabase = createClient()
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: json.tokenHash,
          type: 'email',
        })
        if (otpErr) { setError('登入失敗，請重試一次'); setPhase('error'); return }

        router.replace('/')
      } catch {
        setError('登入失敗，請重試一次')
        setPhase('error')
      }
    }
    run()
  }, [router, searchParams])

  if (phase === 'return-to-app') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-8 text-center">
        <Image src="/images/logo.png" alt="GGB" width={72} height={72} className="rounded-2xl" unoptimized />
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-neutral-900">登入完成 ✅</h1>
          <p className="text-sm leading-relaxed text-neutral-500">
            請關閉這個視窗，回到 <span className="font-bold text-neutral-800">GGB</span> 繼續
          </p>
        </div>
        <div className="mt-2 rounded-xl bg-neutral-50 px-5 py-3 text-xs leading-relaxed text-neutral-400">
          切回去就是登入狀態了，不用再按一次登入
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-neutral-700 dark:text-neutral-200">{error}</p>
        <Link
          href="/login"
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          回登入頁
        </Link>
      </div>
    )
  }

  return <ProductLoadingScreen />
}

export default function LineCallbackPage() {
  return (
    <Suspense fallback={<ProductLoadingScreen />}>
      <LineCallbackInner />
    </Suspense>
  )
}
