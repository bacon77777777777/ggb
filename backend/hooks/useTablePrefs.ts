'use client'

import { useState, useEffect } from 'react'
import { useAdmin } from '@/contexts/AdminContext'

type Density = 'compact' | 'normal' | 'comfortable'

interface TablePrefs<C extends Record<string, boolean>> {
  tableDensity: Density
  setTableDensity: (d: Density) => void
  visibleColumns: C
  setVisibleColumns: (c: C | ((prev: C) => C)) => void
}

export function useTablePrefs<C extends Record<string, boolean>>(
  pageKey: string,
  defaultDensity: Density,
  defaultColumns: C
): TablePrefs<C> {
  const { user } = useAdmin()
  const storageKey = user?.username ? `tablePrefs_${user.username}_${pageKey}` : null

  const [tableDensity, setTableDensityState] = useState<Density>(() => {
    if (typeof window === 'undefined' || !storageKey) return defaultDensity
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return defaultDensity
      const parsed = JSON.parse(saved)
      return (parsed.density as Density) ?? defaultDensity
    } catch { return defaultDensity }
  })

  const [visibleColumns, setVisibleColumnsState] = useState<C>(() => {
    if (typeof window === 'undefined' || !storageKey) return defaultColumns
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return defaultColumns
      const parsed = JSON.parse(saved)
      // Merge saved with defaults so new columns added later still show
      return parsed.columns ? { ...defaultColumns, ...parsed.columns } as C : defaultColumns
    } catch { return defaultColumns }
  })

  // Re-load when user changes (e.g., after login)
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (parsed.density) setTableDensityState(parsed.density)
      if (parsed.columns) setVisibleColumnsState(prev => ({ ...prev, ...parsed.columns } as C))
    } catch {
      // 存壞了就照預設值走 —— 表格偏好壞掉不該讓整頁掛掉
    }
  }, [storageKey])

  const save = (density: Density, columns: C) => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ density, columns }))
    } catch {
      // 無痕模式／配額滿了會丟例外，記不起來就算了，不影響當下操作
    }
  }

  const setTableDensity = (d: Density) => {
    setTableDensityState(d)
    save(d, visibleColumns)
  }

  const setVisibleColumns = (c: C | ((prev: C) => C)) => {
    setVisibleColumnsState(prev => {
      const next = typeof c === 'function' ? c(prev) : c
      save(tableDensity, next)
      return next
    })
  }

  return { tableDensity, setTableDensity, visibleColumns, setVisibleColumns }
}
