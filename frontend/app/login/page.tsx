'use client'

import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import SimplePageHeader from '@/components/ui/SimplePageHeader'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Input } from '@/components/ui'
import Button from '@/components/ui/Button'
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useAlert } from '@/components/ui/AlertDialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { translateAuthError } from '@/lib/authErrors'

/**
 * 登入頁 —— 全站唯一的一頁，沒有「註冊」這個概念
 *
 * 玩家不需要知道自己是在註冊還是登入，系統自己判斷：
 * 信箱有帳號就是登入、沒帳號就自動開戶（signInWithOtp 的原生行為），
 * 兩者都是「填信箱 → 收 6 位驗證碼 → 進站」。LINE 一鍵更短。
 *
 * 被拿掉的東西，都搬到進站之後的個人設定：
 *   密碼   → 變選配。想要的人到「修改密碼」自己設，之後可走密碼登入
 *   邀請碼 → 個人設定的「邀請碼」列（LINE 進站的玩家也才有機會填）
 *   （分享連結 ?invite=XXX 進來的例外：暫存起來，登入完自動填）
 *
 * 密碼登入收在「改用密碼登入」小連結 —— 給設過密碼的老玩家，
 * 新玩家看到密碼欄會以為要設密碼，摩擦感就回來了。
 */

type View = 'main' | 'otp' | 'password'

function AuthContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const { states } = useFeatureFlags()
  const { showAlert } = useAlert()
  const messageParam = searchParams.get('message')
  // 登入完要回哪裡。使用者多半是為了某個動作（按讚、留言）才被導來這裡，
  // 登完丟他回首頁等於要他自己找回原本那一頁。
  // 只收站內路徑 —— 吃外部網址等於開了一個轉址漏洞。
  const nextParam = (() => {
    const raw = searchParams.get('next') ?? ''
    return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  })()
  const errorParam = searchParams.get('error')
  /** 被停用的帳號登入時，AuthContext 會登出並帶 ?disabled=1 回來，這裡負責把話講清楚 */
  const disabledParam = searchParams.get('disabled') === '1'

  useEffect(() => {
    if (!disabledParam) return
    showAlert({
      type: 'error',
      title: '帳號已停用',
      message: '這個帳號目前已被停用，無法登入。如有疑問請聯繫客服。',
    })
    // 把參數吃掉：重新整理或再次登入失敗時才不會疊出第二個視窗
    router.replace('/login')
  }, [disabledParam, router, showAlert])

  const [view, setView] = useState<View>('main')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // 邀請連結（?invite=XXX）進來的：門口沒有邀請碼欄了，
  // 先暫存，登入完成自動幫他填（Email 與 LINE 兩條路都會領）。
  // 必須用 localStorage：LINE app 送人回來常開新分頁，
  // sessionStorage 每個分頁一份，邀請碼會在回程時直接消失（同 line_login_state 的教訓）
  useEffect(() => {
    const invite = searchParams.get('invite')
    if (invite) localStorage.setItem('pending_invite', invite.toUpperCase())
  }, [searchParams])

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // 已登入就不該停在這一頁。手上還握著暫存邀請碼的（＝老用戶點了
  // 朋友的邀請連結；剛在本頁登入完的不會 —— claimPendingInvite 領走了）
  // 帶去個人設定的邀請碼彈窗，碼已填好，按送出就完成（老闆指定動線）
  useEffect(() => {
    if (!user) return
    const pending = localStorage.getItem('pending_invite')
    if (pending) {
      localStorage.removeItem('pending_invite')
      router.replace(`/profile?tab=settings&invite=${encodeURIComponent(pending)}`)
      return
    }
    router.replace(nextParam)
  }, [user, router, nextParam])

  const handleError = (err: unknown) => {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : null
    console.error(err)
    setError(translateAuthError(msg))
    setIsLoading(false)
  }

  /** 領走門口暫存的邀請碼。失敗不擋流程 —— 老帳號或已填過會被後端規則擋，屬正常 */
  const claimPendingInvite = () => {
    const pending = localStorage.getItem('pending_invite')
    if (!pending) return
    localStorage.removeItem('pending_invite')
    void fetch('/api/user/claim-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: pending }),
    }).catch(() => {})
  }

  // --- Actions ---

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('請輸入有效的電子信箱')
      return
    }
    setIsLoading(true)
    const supabase = createClient()
    // shouldCreateUser: 有帳號=寄登入碼、沒帳號=自動開戶 —— 登入與註冊在這裡合而為一。
    // 後台「功能開關」的可註冊設為維護時只關掉自動開戶那一半：
    // 既有帳號照常收驗證碼，沒註冊過的信箱會被 Supabase 擋下（訊息在 authErrors 轉成中文）
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: states?.register !== 'maintenance' },
    })
    if (error) {
      handleError(error)
    } else {
      setIsLoading(false)
      setView('otp')
      setOtp('')
      setCountdown(60)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!otp || otp.length < 6) {
      setError('請輸入 6 位數驗證碼')
      return
    }
    setIsLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
    if (error) {
      handleError(error)
    } else {
      claimPendingInvite()
      router.push(nextParam)
      router.refresh()
    }
  }

  const loginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      handleError(error)
    } else {
      router.push(nextParam)
      router.refresh()
    }
  }

  const getTitle = () => {
    if (view === 'otp') return '輸入驗證碼'
    return '登入'
  }

  const handleBack = () => {
    if (view === 'otp' || view === 'password') {
      setView('main')
      setError(null)
    } else {
      router.push('/')
    }
  }

  // --- Renders ---

  const inputBaseClass = "border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent focus:ring-0 focus:border-primary focus:bg-transparent h-12 text-base placeholder:text-neutral-400"
  const divider = (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-neutral-200 dark:border-neutral-800"></div>
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-white dark:bg-neutral-950 px-4 text-neutral-400">或</span>
      </div>
    </div>
  )

  const renderMain = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <SocialLoginButtons />

      {divider}

      <form onSubmit={sendOtp} className="space-y-5">
        <Input
          name="email"
          type="email"
          placeholder="請輸入電子信箱"
          required
          className={inputBaseClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-5 h-5 text-neutral-400" />}
        />
        <Button variant="solid" fullWidth size="lg" type="submit" isLoading={isLoading}>
          繼續
        </Button>
      </form>

      <p className="mt-3 text-center text-xs text-neutral-400">
        首次登入即註冊
      </p>

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => { setView('password'); setError(null) }}
          className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
        >
          改用密碼登入
        </button>
      </div>
    </div>
  )

  const renderOtp = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-8 mt-4">
        <p className="text-sm text-neutral-500 mb-8 text-center">
          驗證碼已寄至 <br /><span className="font-medium text-neutral-900 dark:text-neutral-200">{email}</span>
        </p>
      </div>

      <form onSubmit={verifyCode}>
        <div className="mb-8">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            className="w-full text-center text-3xl font-bold tracking-[0.5em] h-14 border-b-2 border-neutral-200 focus:border-primary focus:outline-none bg-transparent dark:text-white"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </div>

        <Button variant="solid" fullWidth size="lg" type="submit" isLoading={isLoading}>
          進入 GGB
        </Button>
      </form>

      <div className="mt-6 text-center">
        {countdown > 0 ? (
          <span className="text-neutral-400 text-sm">請稍等 {countdown} 秒重新傳送</span>
        ) : (
          <button
            onClick={() => sendOtp()}
            className="text-neutral-500 hover:text-neutral-900 text-sm font-medium"
            disabled={isLoading}
          >
            重新傳送驗證碼
          </button>
        )}
      </div>
    </div>
  )

  const renderPassword = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <form onSubmit={loginWithPassword}>
        <div className="space-y-4 mb-8">
          <Input
            name="email"
            type="email"
            placeholder="請輸入電子信箱"
            required
            className={inputBaseClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-5 h-5 text-neutral-400" />}
          />
          <Input
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="請輸入密碼"
            required
            className={inputBaseClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="w-5 h-5 text-neutral-400" />}
            rightIcon={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowPassword(!showPassword) }}
                  className="text-neutral-400 hover:text-neutral-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                <div className="w-[1px] h-4 bg-neutral-300 dark:bg-neutral-700"></div>
                <Link
                  href="/forgot-password"
                  className="text-sm text-blue-500 hover:underline whitespace-nowrap"
                >
                  忘記密碼
                </Link>
              </div>
            }
          />
        </div>

        <Button variant="solid" fullWidth size="lg" type="submit" isLoading={isLoading}>
          登入
        </Button>
      </form>

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => { setView('main'); setError(null) }}
          className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
        >
          改用驗證碼登入
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col relative">
      <SimplePageHeader title={getTitle()} onBack={handleBack} darkBg="page" />

      <div className="flex-1 flex flex-col justify-start items-center pt-[calc(88px+env(safe-area-inset-top))] px-6 pb-8 z-10">
        <div className="w-full max-w-sm">
          {(error || messageParam || errorParam) && (
            <div className={cn(
              "mb-6 p-3 rounded-lg text-sm flex items-center justify-center text-center",
              error || errorParam
                ? "bg-red-50 text-red-600 border border-red-100"
                : "bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20"
            )}>
              {error || translateAuthError(errorParam) || messageParam}
            </div>
          )}

          <div className="bg-white dark:bg-neutral-950">
            {view === 'main' && renderMain()}
            {view === 'otp' && renderOtp()}
            {view === 'password' && renderPassword()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex justify-center items-center">Loading...</div>}>
      <AuthContent />
    </Suspense>
  );
}
