'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

interface AdminUser {
  id: string
  username: string
  email: string
  role: string
}

interface AdminContextType {
  user: AdminUser | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AdminContext = createContext<AdminContextType | undefined>(undefined)

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user: authUser, logout: authLogout } = useAuth()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [supabase] = useState(() => createClient())
  const router = useRouter()

  useEffect(() => {
    if (authUser) {
      if (authUser.role === 'admin' || authUser.role === 'super_admin') {
        setUser({
          id: authUser.id,
          username: authUser.name || authUser.email.split('@')[0],
          email: authUser.email,
          role: authUser.role
        })
        setIsAuthenticated(true)
      } else {
        // If user is logged in but not admin, they shouldn't be here if this is admin context
        // But maybe we just set isAuthenticated false
        setUser(null)
        setIsAuthenticated(false)
      }
    } else {
      setUser(null)
      setIsAuthenticated(false)
    }
  }, [authUser])

  const login = async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      console.error('Login failed:', error)
      return false
    }

    // Check role
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()

    if (profile?.role === 'admin' || profile?.role === 'super_admin') {
      return true
    } else {
      await supabase.auth.signOut()
      return false
    }
  }

  const logout = async () => {
    await authLogout()
    setUser(null)
    setIsAuthenticated(false)
    router.push('/login')
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
