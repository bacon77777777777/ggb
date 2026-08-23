'use client'

import { useState, Suspense, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { translateAuthError } from '@/lib/authErrors'
import {
  AuthScreen,
  AuthHeading,
  OtpBoxes,
  PRIMARY_BTN,
  FIELD_ROW,
  FIELD_INPUT,
  SUB_LINK_ROW,
} from '@/components/auth/AuthScreen'

/**
 * 重置密碼 —— 兩步：信箱 → 六位驗證碼，驗過就去設定新密碼
 *
 * 版型跟登入頁同一套（`components/auth/AuthScreen`）：右上角裝飾、浮動返回箭頭、
 * 左對齊大標＋副標、右上角進度、底部同意條款。
 * 先前這一頁自己刻了一份置中小字＋白底頂欄的版面，跟登入頁完全對不起來。
 */

/*
 * 稿上是兩步（Figma 482:3750 / 482:3777），沒有第三步 ——
 * 驗證過了就導去 `/update-password`（設定新密碼），那頁本來就存在、也套了同一套版型。
 *
 * ⚠️ 稿上第二步的副標跟第一步一樣（「請輸入您的註冊信箱…」），
 * 但那個畫面顯示的是六格驗證碼，照抄會變成看不懂的提示。第二步改成講收信這件事。
 */
const STEP_COPY = {
  1: { title: '重置密碼', subtitle: '請輸入您的註冊信箱，我們將寄送6位數驗證碼' },
  2: { title: '重置密碼', subtitle: '驗證碼已寄出，請查收信箱' },
} as const

function ForgotPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(() => {
    const authError = searchParams.get('auth_error')
    if (!authError) return null
    if (authError === 'otp_expired') return '重設連結已過期，請重新申請'
    if (authError === 'access_denied') return '連結無效或已被使用，請重新申請'
    return '連結無效，請重新申請'
  })

  const supabase = createClient()

  const backHref = useMemo(() => {
    const from = searchParams.get('from')
    if (!from) return '/login'
    const decoded = (() => {
      try { return decodeURIComponent(from) } catch { return from }
    })()
    return decoded.startsWith('/') ? decoded : '/login'
  }, [searchParams])

  /*
   * 倒數用 useEffect 而不是在 startCountdown 裡開 setInterval：
   * 原本那支 interval 沒有人在元件卸載時清掉，玩家中途離開頁面會留下一支
   * 每秒對已卸載元件 setState 的計時器。
   */
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const sendOtp = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) setError(translateAuthError(error.message))
    else { setStep(2); setCountdown(60) }
    setLoading(false)
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    await sendOtp()
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp || otp.length < 6) {
      setError('請輸入 6 位數驗證碼')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'recovery' })
    if (error) {
      setError(translateAuthError(error.message))
      setLoading(false)
      return
    }
    // verifyOtp 成功就有 session 了，設定新密碼那頁靠它判斷連結有沒有過期
    router.push('/update-password')
  }

  const copy = STEP_COPY[step]

  return (
    <AuthScreen
      onBack={() => (step === 1 ? router.push(backHref) : (setStep(1), setError(null)))}
      banner={
        error ? (
          <div className="mb-6 flex items-center justify-center rounded-lg border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </div>
        ) : null
      }
    >
      <AuthHeading title={copy.title} subtitle={copy.subtitle} step={{ current: step, total: 2 }} />

      {/* 步驟一：信箱 */}
      {step === 1 && (
        <form onSubmit={handleSendOtp} className="mt-12 animate-in fade-in slide-in-from-right-4 duration-300">
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
          <button type="submit" disabled={loading} className={cn(PRIMARY_BTN, 'mt-6')}>
            {loading ? '傳送中…' : '繼續'}
          </button>
        </form>
      )}

      {/* 步驟二：六格驗證碼 */}
      {step === 2 && (
        <form onSubmit={handleVerifyOtp} className="mt-12 animate-in fade-in slide-in-from-right-4 duration-300">
          <OtpBoxes value={otp} onChange={setOtp} autoFocus />
          <div className={SUB_LINK_ROW}>
            {countdown > 0 ? (
              <span className="text-[#999999]">{countdown} 秒後可重新傳送</span>
            ) : (
              <button type="button" onClick={() => void sendOtp()} disabled={loading} className="text-primary">
                重新傳送驗證碼
              </button>
            )}
          </div>
          <button type="submit" disabled={loading} className={cn(PRIMARY_BTN, 'mt-6')}>
            {loading ? '驗證中…' : '驗證'}
          </button>
        </form>
      )}
    </AuthScreen>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center" />}>
      <ForgotPasswordContent />
    </Suspense>
  )
}
