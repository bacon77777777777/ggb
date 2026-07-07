'use client'

import { useAdmin } from '@/contexts/AdminContext'
import { useRouter } from 'next/navigation'

export default function NoAccessPage() {
  const { user, logout } = useAdmin()
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-10 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V9m0 0V7m0 2h2m-2 0H10M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">沒有可訪問的頁面</h1>
          <p className="text-sm text-neutral-500 mt-2">
            帳號 <span className="font-medium text-neutral-700">{user?.nickname || user?.username}</span> 目前沒有任何頁面權限。
          </p>
          <p className="text-sm text-neutral-400 mt-1">請聯繫超級管理員開通權限。</p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            返回
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm hover:bg-neutral-700 transition-colors"
          >
            登出
          </button>
        </div>
      </div>
    </div>
  )
}
