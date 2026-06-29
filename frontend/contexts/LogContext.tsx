'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
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
  logs: LogEntry[]
  addLog: (action: string, target: string, details: string, status?: 'success' | 'failed') => void
  clearLogs: () => void
}

const LogContext = createContext<LogContextType | undefined>(undefined)

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isMounted, setIsMounted] = useState(false)
  const { user } = useAdmin()

  // 確保只在客戶端載入
  useEffect(() => {
    setIsMounted(true)
    const savedLogs = localStorage.getItem('operationLogs')
    if (savedLogs) {
      try {
        const parsedLogs = JSON.parse(savedLogs)
        setLogs(parsedLogs)
      } catch (e) {
        console.error('Failed to parse saved logs:', e)
      }
    }
  }, [])

  // 保存記錄到 localStorage
  useEffect(() => {
    if (logs.length > 0) {
      localStorage.setItem('operationLogs', JSON.stringify(logs))
    }
  }, [logs])

  // 獲取會員 IP（模擬）
  const getUserIP = (): string => {
    // 實際應用中應該從請求中獲取真實 IP
    return '127.0.0.1'
  }

  // 獲取角色名稱
  const getRoleName = (role: string | undefined): string => {
    const roleMap: { [key: string]: string } = {
      'super_admin': '超級管理員',
      'warehouse_staff': '貨物專員',
      'operation_staff': '營運專員',
      'marketing_staff': '行銷專員',
      'admin': '管理員',
      'user': '會員'
    }
    return roleMap[role || ''] || '管理員'
  }

  // 格式化時間戳（確保一致性）
  const formatTimestamp = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    const second = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  // 添加操作記錄
  const addLog = (
    action: string,
    target: string,
    details: string,
    status: 'success' | 'failed' = 'success'
  ) => {
    // 安全檢查：確保只在已登入且已掛載時才記錄
    try {
      if (!user || !isMounted) {
        // 靜默返回，不記錄也不報錯
        return
      }

      const newLog: LogEntry = {
        id: Date.now(),
        timestamp: formatTimestamp(new Date()),
        user: user.username,
        role: getRoleName(user.role),
        action,
        target,
        details,
        ip: getUserIP(),
        status
      }

      setLogs(prev => [newLog, ...prev])
    } catch (error) {
      console.error('Failed to add log:', error)
    }
  }

  const clearLogs = () => {
    setLogs([])
    localStorage.removeItem('operationLogs')
  }

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs }}>
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
