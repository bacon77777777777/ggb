'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen'

/**
 * LINE 登入的回程頁
 *
 * LINE 授權完把玩家帶回這裡（帶著 code 與 state）。這一頁做三件事：
 *   1. 比對 state 跟出發前存的一不一樣（擋 CSRF：別人不能拿自己的授權碼
 *      塞進你的瀏覽器，讓你不知不覺登入他的帳號）
 *   2. 把 code 交給後端換 Supabase 的一次性 token
 *   3. verifyOtp 建立正常 session → 回首頁
 */

function LineCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  // React StrictMode 會把 effect 跑兩次，而授權碼只能用一次 ——
  // 第二次會被 LINE 拒絕，看起來像登入失敗。用 ref 擋重入
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const run = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const savedState = sessionStorage.getItem('line_login_state')
      sessionStorage.removeItem('line_login_state')

      // 玩家在 LINE 那頁按了取消
      if (searchParams.get('error')) { router.replace('/login'); return }

      if (!code || !state || state !== savedState) {
        setError('登入逾時或連結失效，請重新登入一次')
        return
      }

      try {
        const res = await fetch('/api/auth/line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirectUri: `${window.location.origin}/auth/line/callback`,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.tokenHash) {
          setError(json.error || '登入失敗，請重試一次')
          return
        }

        const supabase = createClient()
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: json.tokenHash,
          type: 'email',
        })
        if (otpErr) { setError('登入失敗，請重試一次'); return }

        router.replace('/')
      } catch {
        setError('登入失敗，請重試一次')
      }
    }
    run()
  }, [router, searchParams])

  if (error) {
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
