'use client'

import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, Gift } from 'lucide-react'
import SimplePageHeader from '@/components/ui/SimplePageHeader'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Input } from '@/components/ui'
import Button from '@/components/ui/Button'
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { translateAuthError } from '@/lib/authErrors'

function AuthContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const messageParam = searchParams.get('message')
  const errorParam = searchParams.get('error')
  
  // State Machine
  const [view, setView] = useState<'login' | 'register'>('login')
  const [step, setStep] = useState<1 | 2 | 3>(1) // For register flow
  
  // Form Data
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  
  // UI State
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // Initialize view based on URL or defaults
  useEffect(() => {
    if (searchParams.get('view') === 'register') {
      setView('register')
    }
    const invite = searchParams.get('invite')
    if (invite) setInviteCode(invite)
  }, [searchParams])

  // Timer for OTP
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      // OTP 驗證完成後 AuthContext 先設 tempUser（step 仍為 2），
      // 不可在此時 redirect，否則 step 3 設密碼的機會會被跳走
      if (view === 'register' && step >= 2) return

      router.replace('/')
    }
  }, [user, router, view, step])

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

  // --- Actions ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      handleError(error)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleRegisterStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Basic email validation
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('請輸入有效的電子信箱')
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        ...(inviteCode.trim() ? { data: { invite_code: inviteCode.trim() } } : {}),
      },
    })

    if (error) {
      handleError(error)
    } else {
      setIsLoading(false)
      setStep(2)
      setCountdown(60)
    }
  }

  const handleRegisterStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!otp || otp.length < 6) {
      setError('請輸入 6 位數驗證碼')
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email'
    })

    if (error) {
      handleError(error)
    } else {
      // Success! User is now logged in (session created).
      // Move to Step 3 to set password.
      setIsLoading(false)
      setStep(3)
    }
  }

  const handleRegisterStep3 = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (password.length < 6) {
      setError('密碼長度至少需 6 個字元')
      setIsLoading(false)
      return
    }
    if (/[一-鿿㐀-䶿]/.test(password)) {
      setError('密碼不得包含中文字元')
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    const { data: updateData, error } = await supabase.auth.updateUser({
      password
    })

    if (error) {
      handleError(error)
    } else {
      // 計入邀請人任務進度（若有邀請碼）；失敗不阻擋流程
      const uid = updateData?.user?.id
      if (uid) {
        supabase.rpc('complete_registration_referral', { p_user_id: uid }).then(undefined, () => {})
      }
      router.push('/?message=註冊成功')
      router.refresh()
    }
  }

  const handleResendOtp = async () => {
    if (countdown > 0) return
    setIsLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    })
    if (error) {
      handleError(error)
    } else {
      setIsLoading(false)
      setCountdown(60)
      setError(null)
    }
  }

  const getTitle = () => {
    if (view === 'login') return '登入'
    if (step === 1) return '註冊'
    if (step === 2) return '輸入驗證碼'
    if (step === 3) return '設定密碼'
    return '註冊'
  }

  const handleBack = () => {
    if (view === 'register') {
      if (step === 1) setView('login')
      else if (step === 2) setStep(1)
      else if (step === 3) router.push('/')
    } else {
      router.push('/')
    }
  }

  // --- Renders ---

  // Common styles
  const inputBaseClass = "border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent focus:ring-0 focus:border-primary focus:bg-transparent h-12 text-base placeholder:text-neutral-400"
  const divider = (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-neutral-200 dark:border-neutral-800"></div>
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-white dark:bg-neutral-950 px-4 text-neutral-400">
          或
        </span>
      </div>
    </div>
  )

  const renderLogin = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
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
        
        <div>
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
                  onClick={(e) => {
                    e.preventDefault();
                    setShowPassword(!showPassword);
                  }}
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
      </div>

      <Button variant="solid" fullWidth size="lg"
        onClick={handleLogin}
        isLoading={isLoading}
      >
        登入
      </Button>

      {divider}
      <SocialLoginButtons />
      
      {/* Fixed bottom registration link - placeholder for layout spacing */}
      <div className="h-[60px]" />
    </div>
  )

  const renderRegisterStep1 = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
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
          name="invite_code"
          type="text"
          placeholder="邀請碼（選填）"
          className={inputBaseClass}
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          leftIcon={<Gift className="w-5 h-5 text-neutral-400" />}
        />
      </div>

      <Button variant="solid" fullWidth size="lg"
        onClick={handleRegisterStep1}
        isLoading={isLoading}
      >
        下一步
      </Button>

      {divider}
      <SocialLoginButtons />
    </div>
  )

  const renderRegisterStep2 = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-8 mt-4">
        <p className="text-sm text-neutral-500 mb-8 text-center">
          驗證碼已寄至 <br/><span className="font-medium text-neutral-900 dark:text-neutral-200">{email}</span>
        </p>
      </div>

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

      <Button variant="solid" fullWidth size="lg"
        onClick={handleRegisterStep2}
        isLoading={isLoading}
      >
        下一步
      </Button>

      <div className="mt-6 text-center">
        {countdown > 0 ? (
          <span className="text-neutral-400 text-sm">請稍等 {countdown} 秒重新傳送</span>
        ) : (
          <button
            onClick={handleResendOtp}
            className="text-neutral-500 hover:text-neutral-900 text-sm font-medium"
            disabled={isLoading}
          >
            重新傳送驗證碼
          </button>
        )}
      </div>
    </div>
  )

  const renderRegisterStep3 = () => (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-8 mt-4">
        <p className="text-sm text-neutral-500 text-center">
          為了您的帳號安全，請設定一組高強度密碼
        </p>
      </div>

      <div className="mb-8">
        <Input
          name="password"
          type={showPassword ? 'text' : 'password'}
          placeholder="設定密碼 (至少 6 位元)"
          required
          className={inputBaseClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="w-5 h-5 text-neutral-400" />}
          rightIcon={showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          onRightIconClick={() => setShowPassword(!showPassword)}
        />
      </div>

      <Button variant="solid" fullWidth size="lg"
        onClick={handleRegisterStep3}
        isLoading={isLoading}
      >
        完成註冊
      </Button>
    </div>
  )

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col relative">
      <SimplePageHeader title={getTitle()} onBack={handleBack} darkBg="page" />

      <div className="flex-1 flex flex-col justify-start items-center pt-[88px] px-6 pb-8 z-10">
        <div className="w-full max-w-sm">
          {/* Global Error/Message */}
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

          {/* View Content */}
          <div className="bg-white dark:bg-neutral-950">
            {view === 'login' && renderLogin()}
            {view === 'register' && step === 1 && renderRegisterStep1()}
            {view === 'register' && step === 2 && renderRegisterStep2()}
            {view === 'register' && step === 3 && renderRegisterStep3()}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Link */}
      {(view === 'login' || (view === 'register' && step === 1)) && (
        <div className="fixed bottom-6 left-0 right-0 text-center pb-safe z-50 pointer-events-auto">
          <span className="text-neutral-500 text-sm">
            {view === 'login' ? '還沒有帳號嗎？ ' : '已經有帳號了嗎？ '}
          </span>
          <button 
            onClick={() => {
              if (view === 'login') {
                setView('register')
                setStep(1)
              } else {
                setView('login')
              }
              setError(null)
            }}
            className="text-primary text-sm font-medium hover:underline pointer-events-auto"
          >
            {view === 'login' ? '註冊' : '登入'}
          </button>
        </div>
      )}
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
