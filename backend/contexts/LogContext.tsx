'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useAdmin } from './AdminContext'

export interface LogEntry {
  id: number
  timestamp: string
  user: string
  role: string
  action: string
  target: string
  details: string
  ip: string
  status: 'success' | 'failed'
}

interface LogContextType {
  addLog: (action: string, target: string, details: string, status?: 'success' | 'failed') => Promise<void>
}

const LogContext = createContext<LogContextType | undefined>(undefined)

export function LogProvider({ children }: { children: ReactNode }) {
  const { user } = useAdmin()

  // 獲取用戶 IP（模擬）
  const getUserIP = (): string => {
    // 實際應用中應該從請求中獲取真實 IP
    return '192.168.1.' + Math.floor(Math.random() * 255)
  }

  // 獲取角色名稱
  const getRoleName = (role: string | undefined): string => {
    const roleMap: { [key: string]: string } = {
      'super_admin': '超級管理員',
      'warehouse_staff': '貨物專員',
      'operation_staff': '營運專員',
      'marketing_staff': '行銷專員',
      'admin': '管理員',
    }
    return roleMap[role || ''] || '管理員'
  }

  // 添加操作記錄
  const addLog = async (
    action: string,
    target: string,
    details: string,
    status: 'success' | 'failed' = 'success'
  ) => {
    // 安全檢查：確保只在已登入時才記錄
    try {
      if (!user) {
        return
      }

      const res = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: user.username,
          role: getRoleName(user.role),
          action,
          target,
          details,
          ip: getUserIP(),
          status,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Failed to add log:', data?.error || res.statusText)
      }
    } catch (error) {
      console.warn('Failed to add log:', error)
    }
  }

  return (
    <LogContext.Provider value={{ addLog }}>
      {children}
    </LogContext.Provider>
  )
}

export function useLog() {
  const context = useContext(LogContext)
  if (context === undefined) {
    throw new Error('useLog must be used within a LogProvider')
  }
  return context
}
