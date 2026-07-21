'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'
import { Lock, Eye, EyeOff } from 'lucide-react'
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

  // Common styles
  const inputBaseClass = "border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent focus:ring-0 focus:border-primary focus:bg-transparent h-12 text-base placeholder:text-neutral-400"
  const buttonBaseClass = "w-full rounded bg-primary hover:bg-primary-dark text-white h-11 text-base font-medium shadow-none"

  if (authLoading) {
     return <div className="min-h-[calc(100vh-64px)] flex justify-center items-center">Loading...</div>
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white dark:bg-neutral-950 flex flex-col relative">
      <div className="flex-1 flex flex-col justify-start items-center pt-8 px-6 pb-8 z-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-2">
              設定新密碼
            </h2>
          </div>

          {/* Global Error/Message */}
          {error && (
            <div className="mb-6 p-3 rounded-lg text-sm flex items-center justify-center text-center bg-red-50 text-red-600 border border-red-100">
              {error}
            </div>
          )}

          {success ? (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl border border-emerald-100">
                <p className="font-bold mb-1">密碼更新成功</p>
                <p className="text-sm">您現在可以使用新密碼登入。</p>
                <p className="text-xs mt-2 text-neutral-500">3秒後自動跳轉至首頁...</p>
              </div>
              <Button
                onClick={() => router.push('/')}
                className={buttonBaseClass}
              >
                立即前往首頁
              </Button>
            </div>
          ) : (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-4 mb-8">
                <Input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="新密碼 (至少 6 碼)"
                  required
                  className={inputBaseClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="w-5 h-5 text-neutral-400" />}
                  rightIcon={showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  onRightIconClick={() => setShowPassword(!showPassword)}
                />
                <Input
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="確認新密碼"
                  required
                  className={inputBaseClass}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  leftIcon={<Lock className="w-5 h-5 text-neutral-400" />}
                />
              </div>

              <Button
                onClick={handleUpdatePassword}
                className={buttonBaseClass}
                isLoading={isLoading}
                disabled={!!error && error.includes('失效')}
              >
                確認修改
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex justify-center items-center">Loading...</div>}>
      <UpdatePasswordContent />
    </Suspense>
  );
}
