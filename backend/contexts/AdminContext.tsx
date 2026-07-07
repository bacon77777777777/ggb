'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'

interface AdminUser {
  id: string
  username: string
  nickname: string
  role: string
  permissions: string[]
}

interface AdminContextType {
  user: AdminUser | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AdminContext = createContext<AdminContextType | undefined>(undefined)

export function AdminProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  // 檢查登入是否在當天有效（00:00 前有效）
  const isLoginValid = (): boolean => {
    if (typeof window === 'undefined') return false
    
    const loginDate = localStorage.getItem('adminLoginDate')
    if (!loginDate) return false

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    
    // 如果登入日期不是今天，需要重新登入
    return loginDate === todayStr
  }

  useEffect(() => {
    // 標記為已掛載，確保只在客戶端執行
    setIsMounted(true)
    
    const initAuth = async () => {
      // 檢查是否有保存的登入狀態
      const token = localStorage.getItem('adminToken')
      const adminId = localStorage.getItem('adminId')
      
      // Dev mode: auto-login as superadmin
      if (process.env.NODE_ENV === 'development' && !token) {
        const res = await fetch('/api/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'superadmin', password: 'superadmin123' }),
        })
        if (res.ok) {
          const data = (await res.json()) as { user?: AdminUser }
          if (data?.user) {
            const today = new Date()
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            localStorage.setItem('adminToken', 'dev')
            localStorage.setItem('adminId', data.user.id)
            localStorage.setItem('adminLoginDate', todayStr)
            setUser(data.user)
            setIsAuthenticated(true)
            return
          }
        }
      }

      if (token && adminId && isLoginValid()) {
        try {
          const res = await fetch('/api/admin/auth/me', { method: 'GET', credentials: 'include' })
          if (!res.ok) {
            logout()
            return
          }
          const data = (await res.json()) as { user?: AdminUser | null }
          if (data?.user) {
            setUser(data.user)
            setIsAuthenticated(true)
          } else {
            logout()
          }
        } catch {
          logout()
        }
      } else if (token && !isLoginValid()) {
        // 登入已過期
        logout()
      }
    }
    
    initAuth()
  }, [])

  const login = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return { success: false, error: data?.error || res.statusText || '登入失敗' }
      }

      const payload = (await res.json()) as { user?: AdminUser }
      const u = payload.user
      if (!u) return { success: false, error: '登入失敗' }
      if (!u.permissions) u.permissions = []

      const token = 'admin-token-' + Date.now()
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      
      localStorage.setItem('adminToken', token)
      localStorage.setItem('adminLoginDate', todayStr)
      localStorage.setItem('adminId', u.id)
      
      setUser(u)
      setIsAuthenticated(true)
        
      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: '登入失敗' }
    }
  }

  const logout = () => {
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminLoginDate')
    localStorage.removeItem('adminId')
    setUser(null)
    setIsAuthenticated(false)
    fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
  }

  return (
    <AdminContext.Provider value={{ user, isAuthenticated, login, logout }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const context = useContext(AdminContext)
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider')
  }
  return context
}
