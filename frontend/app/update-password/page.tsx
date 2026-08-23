'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AuthScreen,
  AuthHeading,
  PRIMARY_BTN,
  FIELD_ROW,
  FIELD_INPUT,
} from '@/components/auth/AuthScreen'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { translateAuthError } from '@/lib/authErrors'

function UpdatePasswordContent() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Redirect if not authenticated (unless it's just loading)
  useEffect(() => {
    if (!authLoading && !user) {
      // If user is not logged in, they might have clicked an expired link or just navigated here.
      // We give it a moment or show a message.
      const timer = setTimeout(() => {
        if (!user) {
            setError('連結已失效或過期，請重新申請重設密碼。')
        }
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [user, authLoading])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      // 8 碼＋至少一個英文字母與一個數字（老闆 2026-08-21 定的規則）
      setError('密碼至少 8 碼，且需同時包含英文與數字')
      setIsLoading(false)
      return
    }

    if (/[一-鿿㐀-䶿]/.test(password)) {
      setError('密碼不得包含中文字元')
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致')
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: password })

    if (error) {
      console.error(error)
      setError(translateAuthError(error.message))
    } else {
      setSuccess(true)
      setTimeout(() => {
        router.push('/')
      }, 3000)
    }
    setIsLoading(false)
  }

  if (authLoading) {
    return <div className="flex min-h-[100dvh] items-center justify-center" />
  }

  return (
    <AuthScreen
      onBack={() => router.push('/')}
      banner={
        error ? (
          <div className="mb-6 flex items-center justify-center rounded-lg border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </div>
        ) : null
      }
    >
      <AuthHeading
        title="設定新密碼"
        subtitle={success ? '密碼已更新，可以用新密碼登入了' : '至少 8 碼，需同時包含英文與數字'}
      />

      {success ? (
        <div className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="rounded-xl border border-accent-emerald/20 bg-accent-emerald/10 p-4 text-center text-accent-emerald">
            <p className="mb-1 font-bold">密碼更新成功</p>
            <p className="text-sm">您現在可以使用新密碼登入。</p>
            <p className="mt-2 text-xs text-neutral-500">3 秒後自動回到首頁…</p>
          </div>
          <button type="button" onClick={() => router.push('/')} className={cn(PRIMARY_BTN, 'mt-6')}>
            立即前往首頁
          </button>
        </div>
      ) : (
        <form onSubmit={handleUpdatePassword} className="mt-12 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className={cn(FIELD_ROW, 'flex items-center')}>
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="輸入新密碼"
              required
              autoFocus
              className={FIELD_INPUT}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              className="shrink-0 px-1 text-neutral-400 transition-colors hover:text-neutral-600"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className={cn(FIELD_ROW, 'mt-4')}>
            <input
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="再輸入一次新密碼"
              required
              className={FIELD_INPUT}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || (!!error && error.includes('失效'))}
            className={cn(PRIMARY_BTN, 'mt-6')}
          >
            {isLoading ? '更新中…' : '確認修改'}
          </button>
        </form>
      )}
    </AuthScreen>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex justify-center items-center">Loading...</div>}>
      <UpdatePasswordContent />
    </Suspense>
  );
}
