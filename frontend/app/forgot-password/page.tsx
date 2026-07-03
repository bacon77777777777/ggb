'use client'

import { useState, Suspense, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, CheckCircle2, ChevronLeft } from 'lucide-react'
import { Input } from '@/components/ui'
import SolidButton from '@/components/ui/SolidButton'

function ForgotPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClient()

  const backHref = useMemo(() => {
    const from = searchParams.get('from')
    if (!from) return '/login'
    const decoded = (() => {
      try {
        return decodeURIComponent(from)
      } catch {
        return from
      }
    })()
    if (decoded.startsWith('/')) return decoded
    return '/login'
  }, [searchParams])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setError(null)
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      })

      if (error) {
        throw error
      }

      setSubmitted(true)
    } catch (err) {
      console.error('Reset password error:', err)
      setError((err as Error).message || '發送失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  // Common styles consistent with login page
  const inputBaseClass = "border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent focus:ring-0 focus:border-primary focus:bg-transparent h-12 text-base placeholder:text-neutral-400"

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col relative">
      <div className="fixed top-0 left-0 right-0 h-[56px] flex items-center justify-center bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 z-50 px-4">
        <button onClick={() => router.push(backHref)} className="absolute left-4 p-2 -ml-2 text-neutral-900 dark:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-black text-neutral-900 dark:text-white">重置密碼</h1>
      </div>

      <div className="flex-1 flex flex-col justify-start items-center pt-[88px] px-6 pb-8 z-10">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              請輸入您的註冊信箱，我們將寄送重設密碼連結給您
            </p>
          </div>

          {/* Global Error/Message */}
          {error && (
            <div className="mb-6 p-3 rounded-lg text-sm flex items-center justify-center text-center bg-red-50 text-red-600 border border-red-100">
              {error}
            </div>
          )}

          {submitted ? (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300 text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">信件已發送</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  請前往您的信箱 <span className="font-medium text-neutral-900 dark:text-white">{email}</span> 收信，並點擊連結以重設密碼
                </p>
              </div>
              
              <Link href="/login" className="block w-full">
                <SolidButton>
                  返回登入
                </SolidButton>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
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

              <SolidButton
                type="submit"
                isLoading={loading}
              >
                發送重設連結
              </SolidButton>
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
