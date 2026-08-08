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
 *
 * 登入與「綁定 LINE」共用這一頁。綁定的 state 帶 bind. 前綴
 *（跨情境時 Safari 端只有 state 可看，意圖必須寫在裡面）；
 * 同情境則看出發前存的 line_login_intent。
 */

type Phase = 'working' | 'return-to-app' | 'error'

function LineCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<Phase>('working')
  const [error, setError] = useState('')
  const [isBind, setIsBind] = useState(false)
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
      const savedIntent = localStorage.getItem('line_login_intent')
      localStorage.removeItem('line_login_intent')
      // 跨情境時本地什麼都沒有，意圖只能寫在 state 裡帶過來
      const bind = crossContext ? state.startsWith('bind.') : savedIntent === 'bind'
      if (bind) setIsBind(true)

      try {
        if (bind && !crossContext) {
          // 同情境綁定：session 就在 cookie 裡，直接綁到目前登入的帳號
          const res = await fetch('/api/auth/line/bind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              redirectUri: `${window.location.origin}/auth/line/callback`,
            }),
          })
          const json = await res.json()
          if (!res.ok || !json.bound) {
            setError(json.error || '綁定失敗，請重試一次')
            setPhase('error')
            return
          }
          // bonus 帶去會員中心 toast（LINE 綁定禮 300 積分）
          router.replace(
            (json.bonus ?? 0) > 0 ? `/profile?line=bound&bonus=${json.bonus}` : '/profile?line=bound',
          )
          return
        }

        const res = await fetch('/api/auth/line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirectUri: `${window.location.origin}/auth/line/callback`,
            ...(crossContext ? { mode: 'ticket', state, ...(bind ? { intent: 'bind' } : {}) } : {}),
          }),
        })
        const json = await res.json()

        if (crossContext) {
          if (!res.ok || !json.stored) {
            setError(json.error || (bind ? '綁定失敗，請重試一次' : '登入失敗，請重試一次'))
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

        // 邀請連結進來的（/login?invite= 存的暫存碼）：登入完成順手領。
        // Email OTP 與偽 app 取票路徑都會領，唯獨這條整頁跳轉路先前漏了
        // —— 好友點連結用 LINE 登入是最大宗，漏這條等於邀請全不算數
        const pending = sessionStorage.getItem('pending_invite')
        if (pending) {
          sessionStorage.removeItem('pending_invite')
          try {
            await fetch('/api/user/claim-invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: pending }),
            })
          } catch { /* 失敗不擋登入；好友之後可在會員中心手動填 */ }
        }

        // 登入完成帶去會員中心 —— 玩家該看到「已登入的自己」，
        // 首頁看不出登入前後的差別
        router.replace('/profile')
      } catch {
        setError(bind ? '綁定失敗，請重試一次' : '登入失敗，請重試一次')
        setPhase('error')
      }
    }
    run()
  }, [router, searchParams])

  if (phase === 'return-to-app') {
    /*
     * 版型照維護頁（app/maintenance/page.tsx）：整頁覆蓋蓋掉 Navbar 與
     * 底部導航（這一頁待在 Safari，站上的導航點了也只是把人留在錯的地方）、
     * logo 在頂、主訊息吃掉中間置中、次要說明沉底。
     */
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center overflow-y-auto bg-white px-6 py-10 text-center dark:bg-neutral-950">
        <Image
          src="/images/20260629/logo.svg"
          alt="吉吉比"
          width={132}
          height={44}
          priority
          className="h-auto w-[132px] shrink-0 object-contain"
        />

        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-primary" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="mt-4 text-2xl font-black text-neutral-900 dark:text-neutral-50">
            {isBind ? 'LINE 綁定成功' : '登入完成'}
          </h1>

          <div className="mt-5 rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary">
            回到 GGB 繼續
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-neutral-700 dark:text-neutral-200">{error}</p>
        <Link
          href={isBind ? '/profile' : '/login'}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          {isBind ? '回會員中心' : '回登入頁'}
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
