'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  SocialLoginButtons,
  LOGIN_BUTTON_BASE,
} from '@/components/auth/SocialLoginButtons'
import { asset } from '@/lib/asset'
import {
  AuthScreen,
  AuthHeading,
  OtpBoxes,
  PRIMARY_BTN,
  FIELD_ROW,
  FIELD_INPUT,
  SUB_LINK_ROW,
} from '@/components/auth/AuthScreen'
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

/**
 * main     社群登入＋兩個入口（Figma 480:3532）
 * email    「驗證碼登入」按下去才出現的信箱輸入
 * otp      收到的 6 位數
 * password 老玩家的帳號密碼登入
 */
type View = 'main' | 'email' | 'otp' | 'password'

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

  const handleBack = () => {
    // otp 退回信箱輸入那一步，不是一路退回主畫面 —— 打錯信箱時才改得動
    if (view === 'otp') { setView('email'); setError(null); return }
    if (view === 'email' || view === 'password') { setView('main'); setError(null); return }
    router.push('/')
  }

  // --- Renders ---


  /**
   * 主畫面（Figma 480:3532）。
   *
   * 跟其他 view 不同，它**不走 SimplePageHeader** —— 稿上右上角的裝飾要出血到
   * 螢幕頂邊、蓋到狀態列底下，套一條白底頂欄就把它切掉了。返回鍵改用全站共用的
   * `PageHeaderBack`（老闆 2026-08-23：跟商品頁同一顆），標題留空只出箭頭。
   *
   * 信箱欄不再放在門口：稿上第一層只有四顆按鈕，Email 收進「驗證碼登入」。
   * 新玩家看到輸入框會以為要填一堆東西，四顆按鈕的心理成本低得多。
   */
  const renderMain = () => (
    <div className="flex w-full flex-1 flex-col animate-in fade-in duration-300">
      <div className="flex justify-center pt-2">
        <Image
          src={asset('/images/logo-stacked.png')}
          alt="吉吉比"
          width={125}
          height={97}
          priority
          className="h-[97px] w-auto"
        />
      </div>

      <div className="mt-20 flex flex-col gap-4">
        <SocialLoginButtons />

        {/*
          驗證碼登入＝Email OTP，站上原本的主要路徑（有帳號就登入、沒帳號自動開戶）。
          底色與字色走主題 token（--primary-soft / --primary），不寫死稿上的
          #FFF1EF／#FF3E00 —— 後台換主題色時這顆才會跟著走，跟頁尾的連結一致。
        */}
        <button
          type="button"
          onClick={() => { setView('email'); setError(null) }}
          className={cn(LOGIN_BUTTON_BASE, 'bg-primary-soft text-primary dark:bg-primary/10')}
        >
          驗證碼登入
        </button>
      </div>

      <button
        type="button"
        onClick={() => { setView('password'); setError(null) }}
        className="mt-8 text-center text-[14px] text-[#A2A2A2] transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        帳號密碼登入
      </button>

    </div>
  )

  /** 驗證碼登入 1/2：輸入信箱（Figma 480:3577） */
  const renderEmail = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <AuthHeading title="驗證碼登入" subtitle="請輸入電子郵件及驗證碼" step={{ current: 1, total: 2 }} />
      <form onSubmit={sendOtp} className="mt-12">
        <div className={FIELD_ROW}>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="輸入電子郵件"
            required
            autoFocus
            className={FIELD_INPUT}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit" disabled={isLoading} className={cn(PRIMARY_BTN, 'mt-6')}>
          {isLoading ? '傳送中…' : '繼續'}
        </button>
      </form>
    </div>
  )

  /**
   * 驗證碼登入 2/2：六格驗證碼（Figma 480:3626）。
   *
   * 六個獨立輸入格而不是一個長輸入框：手機鍵盤上看得出還要打幾位，
   * 而且填錯時能單獨改一格。真正的值仍然是同一個 `otp` 字串，
   * 送出的邏輯（verifyCode）完全沒動。
   */
  const renderOtp = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <AuthHeading title="驗證碼登入" subtitle="請輸入Email及驗證碼" step={{ current: 2, total: 2 }} />

      <form onSubmit={verifyCode} className="mt-12">
        <OtpBoxes value={otp} onChange={setOtp} autoFocus />

        {/* 稿上這行永遠在，倒數中就把它換成剩幾秒（不然玩家會一直按沒反應的字） */}
        <div className={SUB_LINK_ROW}>
          {countdown > 0 ? (
            <span className="text-[#999999]">{countdown} 秒後可重新傳送</span>
          ) : (
            <button type="button" onClick={() => sendOtp()} disabled={isLoading} className="text-primary">
              重新傳送驗證碼
            </button>
          )}
        </div>

        <button type="submit" disabled={isLoading} className={cn(PRIMARY_BTN, 'mt-6')}>
          {isLoading ? '驗證中…' : '驗證'}
        </button>
      </form>
    </div>
  )

  /** 帳號密碼登入（Figma 480:3602）—— 給設過密碼的老玩家 */
  const renderPassword = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <AuthHeading title="帳號密碼登入" subtitle="請輸入電子郵件及密碼" />

      <form onSubmit={loginWithPassword} className="mt-12">
        <div className={FIELD_ROW}>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="輸入電子郵件"
            required
            className={FIELD_INPUT}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={cn(FIELD_ROW, 'mt-4 flex items-center')}>
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="輸入密碼"
            required
            className={FIELD_INPUT}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* 稿上沒有這顆，但沒有它就只能盲打；放在列尾不影響版面 */}
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
            className="shrink-0 px-1 text-neutral-400 transition-colors hover:text-neutral-600"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        <div className={SUB_LINK_ROW}>
          <Link href="/forgot-password" className="text-primary">忘記密碼</Link>
        </div>

        <button type="submit" disabled={isLoading} className={cn(PRIMARY_BTN, 'mt-6')}>
          {isLoading ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  )

  return (
    <AuthScreen
      onBack={handleBack}
      banner={
        (error || messageParam || errorParam) ? (
          <div className={cn(
            "mb-6 p-3 rounded-lg text-sm flex items-center justify-center text-center",
            error || errorParam
              ? "bg-red-50 text-red-600 border border-red-100"
              : "bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20"
          )}>
            {error || translateAuthError(errorParam) || messageParam}
          </div>
        ) : null
      }
    >
      {view === 'main' && renderMain()}
      {view === 'email' && renderEmail()}
      {view === 'otp' && renderOtp()}
      {view === 'password' && renderPassword()}
    </AuthScreen>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex justify-center items-center">Loading...</div>}>
      <AuthContent />
    </Suspense>
  );
}
