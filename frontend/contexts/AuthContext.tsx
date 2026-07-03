'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { User as SupabaseUser } from '@supabase/supabase-js';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

// Unified user object combining Supabase auth and profiles table
interface Profile {
  id: string;
  name: string; // Mapped from full_name for compatibility
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  tokens?: number; // Added tokens for marketplace
  tickets?: number; // Added tickets for gacha
  email: string;
  phone_number?: string | null;
  is_phone_verified?: boolean | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  recipient_address?: string | null;
  role?: string;
  invite_code?: string | null;
  gender?: string | null;
  birthday?: string | null;
  cvs_store_id?: string | null;
  cvs_store_name?: string | null;
  cvs_store_branch?: string | null;
  cvs_store_address?: string | null;
  cvs_recipient_name?: string | null;
  cvs_recipient_phone?: string | null;
}

interface AuthContextType {
  user: Profile | null;
  supabaseUser: SupabaseUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const fetchProfile = async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // If profile不存在，很可能是資料被清空，強制登出回登入頁
          await supabase.auth.signOut();
          setSupabaseUser(null);
          setUser(null);
          setIsLoading(false);
          router.refresh();
          router.push('/login');
          return null;
        }

        console.error('Error fetching profile:', error);
        return null;
      }

      if (data) {
        return {
          id: data.id,
          name: data.name || email.split('@')[0], // Fallback to email prefix
          full_name: data.name,
          avatar_url: data.avatar_url || '/images/avatar/01.png',
          points: data.points || 0,
          tokens: data.tokens || 0,
          tickets: data.tickets || 0,
          email: email,
          phone_number: data.phone_number ?? null,
          is_phone_verified: data.is_phone_verified ?? false,
          recipient_name: data.recipient_name,
          recipient_phone: data.recipient_phone,
          recipient_address: data.address,
          role: data.role || 'user',
          invite_code: data.invite_code,
          gender: data.gender || null,
          birthday: data.birthday || null,
          cvs_store_name: data.cvs_store_name || null,
          cvs_store_branch: data.cvs_store_branch || null,
          cvs_store_address: data.cvs_store_address || null,
          cvs_recipient_name: data.cvs_recipient_name || null,
          cvs_recipient_phone: data.cvs_recipient_phone || null,
        } as Profile;
      }
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    }
    return null;
  };

  useEffect(() => {
    const TIMEOUT_MS = 30000;

    const initAuth = async () => {
      console.log('[AuthContext] Initializing auth...');
      console.log('[AuthContext] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20) + '...');
      const startTime = Date.now();

      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.warn('[AuthContext] Missing Supabase env vars; falling back to guest mode');
        setSupabaseUser(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          TIMEOUT_MS,
          'Auth getSession timeout'
        );
        
        console.log(`[AuthContext] Get session took ${Date.now() - startTime}ms`);

        if (session?.user) {
          setSupabaseUser(session.user);

          const email = session.user.email || '';
          setUser({
            id: session.user.id,
            email,
            name: email ? email.split('@')[0] : 'User',
            full_name: null,
            avatar_url: '/images/avatar/01.png',
            points: 0,
            tokens: 0,
            tickets: 0,
          });

          withTimeout(fetchProfile(session.user.id, email), TIMEOUT_MS, 'Auth fetchProfile timeout')
            .then((profile) => {
              if (profile) setUser(profile);
            })
            .catch((profileErr) => {
              console.warn('[AuthContext] Profile fetch timed out/failed:', profileErr);
            });
        } else {
          console.log('[AuthContext] No session found');
          setSupabaseUser(null);
          setUser(null);
        }
      } catch (error) {
        console.warn(`[AuthContext] Auth initialization failed or timed out after ${Date.now() - startTime}ms:`, error);
        // On error/timeout, assume guest mode
        setSupabaseUser(null);
        setUser(null);
      } finally {
        console.log('[AuthContext] Setting isLoading to false');
        setIsLoading(false);
      }
    };

    initAuth();
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log(`[AuthContext] Auth state changed: ${_event}`);
      if (session?.user) {
        setSupabaseUser(session.user);
        const email = session.user.email || '';
        setUser({
          id: session.user.id,
          email,
          name: email ? email.split('@')[0] : 'User',
          full_name: null,
          avatar_url: '/images/avatar/01.png',
          points: 0,
          tokens: 0,
          tickets: 0,
        });

        withTimeout(fetchProfile(session.user.id, email), TIMEOUT_MS, 'Auth fetchProfile timeout')
          .then((profile) => {
            if (profile) setUser(profile);
          })
          .catch((profileErr) => {
            console.warn('[AuthContext] Profile fetch timed out/failed:', profileErr);
          });

        // 登入時追蹤任務 + 檢查成就 + 寫操作 log（fire-and-forget）
        if (_event === 'SIGNED_IN') {
          Promise.allSettled([
            supabase.rpc('track_mission_event', { p_event_type: 'login' }),
            supabase.rpc('check_achievements', { p_user_id: session.user.id }),
            fetch('/api/user/log-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event_type: 'login' }),
            }),
          ]).catch(() => {});
        }
      } else {
        setSupabaseUser(null);
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]); 

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
    router.refresh();
    router.push('/login');
  };

  const refreshProfile = async () => {
    if (supabaseUser) {
      const profile = await fetchProfile(supabaseUser.id, supabaseUser.email!);
      setUser(profile);
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      supabaseUser, 
      isLoading, 
      logout, 
      refreshProfile,
      isAuthenticated: !!supabaseUser 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
