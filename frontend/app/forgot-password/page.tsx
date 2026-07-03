'use client'

import { useState, Suspense, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, ChevronLeft } from 'lucide-react'
import { Input } from '@/components/ui'
import SolidButton from '@/components/ui/SolidButton'
import { translateAuthError } from '@/lib/authErrors'

function ForgotPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
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
    if (decoded.startsWith('/')) return decoded
    return '/login'
  }, [searchParams])

  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timer); return 0 }
        return c - 1
      })
    }, 1000)
  }

  // Step 1: send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email)

    if (error) {
      setError(translateAuthError(error.message))
    } else {
      setStep(2)
      startCountdown()
    }
    setLoading(false)
  }

  // Step 2: verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp || otp.length < 6) {
      setError('請輸入 6 位數驗證碼')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'recovery',
    })

    if (error) {
      setError(translateAuthError(error.message))
    } else {
      setStep(3)
    }
    setLoading(false)
  }

  // Step 3: set new password
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('密碼長度至少需 6 個字元')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(translateAuthError(error.message))
    } else {
      router.push('/?message=密碼已更新，請重新登入')
    }
    setLoading(false)
  }

  const inputBaseClass = "border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent focus:ring-0 focus:border-primary focus:bg-transparent h-12 text-base placeholder:text-neutral-400"

  const titles = { 1: '重置密碼', 2: '輸入驗證碼', 3: '設定新密碼' }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col relative">
      <div className="fixed top-0 left-0 right-0 h-[56px] flex items-center justify-center bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 z-50 px-4">
        <button
          onClick={() => step === 1 ? router.push(backHref) : setStep(s => (s - 1) as 1 | 2 | 3)}
          className="absolute left-4 p-2 -ml-2 text-neutral-900 dark:text-white"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-black text-neutral-900 dark:text-white">{titles[step]}</h1>
      </div>

      <div className="flex-1 flex flex-col justify-start items-center pt-[88px] px-6 pb-8 z-10">
        <div className="w-full max-w-sm">
          {error && (
            <div className="mb-6 p-3 rounded-lg text-sm flex items-center justify-center text-center bg-red-50 text-red-600 border border-red-100">
              {error}
            </div>
          )}

          {/* Step 1: email */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8">
                請輸入您的註冊信箱，我們將寄送 6 位數驗證碼
              </p>
              <div className="mb-8">
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
              </div>
              <SolidButton type="submit" isLoading={loading}>發送驗證碼</SolidButton>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8">
                驗證碼已寄至<br />
                <span className="font-medium text-neutral-900 dark:text-neutral-200">{email}</span>
              </p>
              <div className="mb-8">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full text-center text-3xl font-bold tracking-[0.5em] h-14 border-b-2 border-neutral-200 focus:border-primary focus:outline-none bg-transparent dark:text-white"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              <SolidButton type="submit" isLoading={loading}>下一步</SolidButton>
              <div className="mt-6 text-center">
                {countdown > 0 ? (
                  <span className="text-neutral-400 text-sm">請稍等 {countdown} 秒重新傳送</span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      setLoading(true)
                      await supabase.auth.resetPasswordForEmail(email)
                      startCountdown()
                      setLoading(false)
                    }}
                    className="text-neutral-500 hover:text-neutral-900 text-sm font-medium"
                    disabled={loading}
                  >
                    重新傳送驗證碼
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Step 3: new password */}
          {step === 3 && (
            <form onSubmit={handleSetPassword} className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8">
                驗證成功！請設定您的新密碼
              </p>
              <div className="mb-8">
                <Input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="新密碼 (至少 6 位元)"
                  required
                  className={inputBaseClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="w-5 h-5 text-neutral-400" />}
                  rightIcon={showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  onRightIconClick={() => setShowPassword(!showPassword)}
                />
              </div>
              <SolidButton type="submit" isLoading={loading}>確認修改</SolidButton>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex justify-center items-center">Loading...</div>}>
      <ForgotPasswordContent />
    </Suspense>
  )
}
