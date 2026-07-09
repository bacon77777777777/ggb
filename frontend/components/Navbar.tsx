'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Search, MessageCircle, LogOut, User as UserIcon, ChevronDown, ChevronLeft, X, History, Flame, Heart, CheckCircle2, Share2, Copy, MoreVertical, Flag } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import NavbarLayout from './NavbarLayout';

export default function Navbar() {
  return (
    <Suspense fallback={<div className="h-[57px] bg-white border-b border-neutral-100 sticky top-0 z-50" />}>
      <NavbarInner />
    </Suspense>
  );
}

function NavbarInner() {
  const searchParams = useSearchParams();
  const { user, logout, isLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMessagesMoreOpen, setIsMessagesMoreOpen] = useState(false);
  const [productName, setProductName] = useState<string | null>(null);
  const [isProductFollowed, setIsProductFollowed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesMoreRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  
  const [supabase] = useState(() => createClient());

  // Check if we just logged in
  const isLoginRedirect = searchParams.get('login_success') === 'true';
  const [isForcingLoading, setIsForcingLoading] = useState(false);

  useEffect(() => {
    if (isLoginRedirect && !user) {
      setIsForcingLoading(true);
      // Fallback timeout in case user never loads (e.g. error)
      const timer = setTimeout(() => setIsForcingLoading(false), 8000);
      return () => clearTimeout(timer);
    } else if (user) {
      setIsForcingLoading(false);
    }
  }, [isLoginRedirect, user]);
  
  const activeTab = searchParams.get('tab');
  
  // Define page types
  const isHomePage = pathname === '/';
  const isMainTab =
    pathname === '/' ||
    pathname === '/exchange' ||
    pathname === '/news' ||
    pathname === '/ranking' ||
    pathname === '/check-in' ||
    (pathname === '/profile' && !activeTab);
  const isInnerPage = !isHomePage && !isMainTab;
  const isSellDetailPage = /^\/sell\/[^/]+$/.test(pathname) && pathname !== '/sell/new';
  const isProductDetailPage = /^\/(?:item|blindbox|gacha|card)\/[^/]+$/.test(pathname) || isSellDetailPage;
  const isNewsDetailPage = /^\/news\/[^/]+$/.test(pathname);
  const isFairnessPage = pathname.startsWith('/fairness');
  const isExchangeDetailPage =
    pathname !== '/exchange/new' && pathname !== '/exchange/manage' && /^\/exchange\/[^/]+$/.test(pathname);
  const isMessagesListPage = pathname === '/messages';
  const isMessagesDetailPage = /^\/messages\/[^/]+$/.test(pathname);
  const isExchangeOrderFlowPage = pathname.startsWith('/exchange-orders/');

  const isTicketSelectionPage = pathname.endsWith('/select');

  const [exchangeOrderThreadId, setExchangeOrderThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!isExchangeOrderFlowPage) {
      setExchangeOrderThreadId(null);
      return;
    }
    const match = pathname.match(/^\/exchange-orders\/([^/]+)$/);
    const orderId = match?.[1] || '';
    if (!orderId) return;
    if (!user?.id) {
      setExchangeOrderThreadId(null);
      return;
    }
    const run = async () => {
      const { data, error } = await supabase
        .from('exchange_orders')
        .select('offer_id, owner_id, initiator_id')
        .eq('id', orderId)
        .maybeSingle();
      if (error || !data?.offer_id) {
        setExchangeOrderThreadId(null);
        return;
      }
      const ownerId = String((data as any).owner_id || '');
      const initiatorId = String((data as any).initiator_id || '');
      const otherId = ownerId === user.id ? initiatorId : ownerId;
      if (!otherId) {
        setExchangeOrderThreadId(null);
        return;
      }
      setExchangeOrderThreadId(`${String((data as any).offer_id)}--${otherId}`);
    };
    run();
  }, [isExchangeOrderFlowPage, pathname, supabase, user?.id]);

  useEffect(() => {
    if (isProductDetailPage) {
      const match = pathname.match(/^\/(?:item|blindbox|gacha|card)\/([^/]+)$/);
      const sellMatch = pathname.match(/^\/sell\/([^/]+)$/);
      const productId = match?.[1] || '';
      const sellId = sellMatch?.[1] || '';

      const fetchTitle = async () => {
        if (isSellDetailPage) {
          if (!/^\d+$/.test(sellId)) return;
          const { data } = await supabase.from('sell_listings').select('title').eq('id', sellId).maybeSingle();
          const rawTitle = String((data as any)?.title || '').trim();
          if (rawTitle) setProductName(rawTitle);
          return;
        }

        if (!productId) return;
        if (!/^\d+$/.test(productId)) return;
        const { data } = await supabase.from('products').select('name').eq('id', productId).single();
        if (data) setProductName(data.name);
      };

      void fetchTitle();

      if (!isSellDetailPage && productId && user) {
        const checkFollow = async () => {
          const { count } = await supabase
            .from('product_follows')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('product_id', productId);

          setIsProductFollowed(!!count);
        };
        void checkFollow();
      }
    } else if (isNewsDetailPage) {
      // Extract UUID from path
      const match = pathname.match(/^\/news\/([^/]+)$/);
      if (match) {
        const newsId = match[1];
        const fetchNews = async () => {
          const { data } = await supabase
            .from('news')
            .select('title')
            .eq('id', newsId)
            .single();
          
          if (data) {
            setProductName(data.title);
          }
        };
        fetchNews();
      }
    } else {
      setProductName(null);
      setIsProductFollowed(false);
    }
  }, [pathname, user, isProductDetailPage, isSellDetailPage, isNewsDetailPage, supabase]);

  const handleFollowToggle = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    
    const match = pathname.match(/^\/(?:item|blindbox|gacha|card)\/(\d+)$/);
    if (!match) return;
    const productId = match[1];

    if (isProductFollowed) {
      const { error } = await supabase.from('product_follows').delete().eq('user_id', user.id).eq('product_id', productId);
      if (!error) setIsProductFollowed(false);
    } else {
      const { error } = await supabase.from('product_follows').insert({ user_id: user.id, product_id: parseInt(productId) });
      if (!error) setIsProductFollowed(true);
    }
  };
  
  // Control visibility based on page type
  const showBackButton = isInnerPage || (pathname as string) === '/topup';
  const showLogo = isHomePage;

  // 獲取頁面名稱
  const [exchangeTitle, setExchangeTitle] = useState<string>('交換詳情');
  const [messagesTitle, setMessagesTitle] = useState<string>('私訊');

  useEffect(() => {
    if (!isExchangeDetailPage) return;
    const match = pathname.match(/^\/exchange\/([^/]+)$/);
    const offerId = match?.[1] || '';
    const fallbackById: Record<string, string> = {
      'ex-1': '@pikachu_trader',
      'ex-2': '@cardx_ash',
      'ex-3': '@mewtwo_lab',
      'ex-4': '@poke_trade_tw',
    };
    const fromStorage =
      typeof window !== 'undefined' && offerId
        ? sessionStorage.getItem(`exchange:title:${offerId}`) || ''
        : '';
    const raw = fromStorage || fallbackById[offerId] || '交換詳情';
    setExchangeTitle(raw.replace(/\s*提出交換\s*$/g, '').trim());
  }, [isExchangeDetailPage, pathname]);

  useEffect(() => {
    if (!isMessagesDetailPage) return;
    const match = pathname.match(/^\/messages\/([^/]+)$/);
    const threadId = match?.[1] || '';
    const fromStorage =
      typeof window !== 'undefined' && threadId
        ? sessionStorage.getItem(`messages:title:${threadId}`) || ''
        : '';
    setMessagesTitle(fromStorage || '私訊');
  }, [isMessagesDetailPage, pathname]);

  const getPageTitle = () => {
    if (pathname === '/') return '首頁';
    if (pathname === '/messages') return '私訊';
    if (pathname === '/exchange/new') return '創建交換';
    if (pathname === '/sell/new') return '上架商品';
    if (pathname === '/sell/new/specs') return '新增規格';
    if (pathname === '/sell/manage') return '販售管理';
    if (pathname === '/purchases') return '購買清單';
    if (pathname.startsWith('/sell-orders/')) return '訂單詳情';
    if (pathname === '/exchange/manage') return exchangeManageView === 'orders' ? '交換紀錄' : '交換管理';
    if (pathname.startsWith('/exchange-orders/')) {
      const orderId = pathname.split('/')[2] || '';
      if (!orderId) return '交換單';
      const legacy = orderId.startsWith('xo_') || orderId.includes('_') || orderId.includes('-');
      if (!legacy) return orderId;
      const digits = '0123456789';
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      let h = 0;
      for (let i = 0; i < orderId.length; i += 1) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
      const d = (n: number) => digits[n % digits.length];
      const l = (n: number) => letters[n % letters.length];
      const pretty = `${d(h)}${d(h >>> 4)}${l(h >>> 8)}${l(h >>> 12)}${l(h >>> 16)}${d(h >>> 20)}${d(h >>> 24)}${d(h >>> 28)}`;
      return pretty;
    }
    if (pathname === '/login') return '登入';
    if (pathname === '/register') return '註冊';
    if (pathname === '/forgot-password') return '忘記密碼';
    if (pathname === '/update-password') return '重置密碼';
    if (pathname === '/exchange') return '交換';
    if (pathname === '/market') return '交換';
    if (pathname === '/ranking') return '排行榜';
    if (pathname.startsWith('/fairness')) return '公平性驗證';
    if (pathname === '/check-in') return '每日簽到';
    if (pathname.endsWith('/select')) return '選擇籤號';
    if (pathname.endsWith('/confirm')) return '確認購買';
    if (isSellDetailPage) return productName || '販售';
    if (pathname.startsWith('/item/') || pathname.startsWith('/blindbox/') || pathname.startsWith('/gacha/') || pathname.startsWith('/card/')) return productName || '商品詳情';
    if (isNewsDetailPage) return '';
    if (pathname === '/topup') return '儲值代幣';
    if (pathname === '/faq') return '常見問題';
    if (pathname === '/about') return '關於我們';
    if (pathname === '/terms') return '會員條款';
    if (pathname === '/privacy') return '隱私權政策';
    if (pathname === '/return-policy') return '退換貨資訊';
    if (pathname === '/news') return '最新情報';
    if (isExchangeDetailPage) return exchangeTitle;
    if (isMessagesDetailPage) return messagesTitle;
    
    if (pathname === '/profile') {
      const tab = activeTab;
      if (tab === 'warehouse') return '我的倉庫';
      if (tab === 'exchange-orders') return '交換訂單';
      if (tab === 'delivery') return '配送訂單';
      if (tab === 'draw-history') return '抽獎紀錄';
      if (tab === 'topup-history') return '儲值紀錄';
      if (tab === 'follows') return '我的關注';
      if (tab === 'settings') return '設定';
      if (tab === 'market') return '交易所管理';
      if (tab === 'check-in') return '每日簽到';
      return '個人中心';
    }
    return '';
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    try {
      const nav = navigator as unknown as { share?: (data: { url: string }) => Promise<void> };
      if (typeof nav.share === 'function') {
        await nav.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('連結已複製', 'success');
    } catch {
      showToast('分享已取消', 'info');
    }
  };

  type NotificationItem = {
    id: number
    type: string
    title: string
    body: string | null
    link: string | null
    is_read: boolean
    created_at: string | null
  }

  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const unreadCount = notifications.filter(n => !n.is_read).length

  useEffect(() => {
    // Click outside handler
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (messagesMoreRef.current && !messagesMoreRef.current.contains(event.target as Node)) {
        setIsMessagesMoreOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([])
      return
    }

    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, link, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!error && data) {
        const mapped: NotificationItem[] = data.map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          link: item.link,
          is_read: item.is_read,
          created_at: item.created_at,
        }))
        setNotifications(mapped)
      }
    }

    loadNotifications()
  }, [user, supabase])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        payload => {
          const n = payload.new as {
            id: number
            type: string
            title: string
            body: string | null
            link: string | null
            is_read: boolean
            created_at: string | null
          } | null
          if (!n) return

          setNotifications(prev => {
            if (prev.some(item => item.id === n.id)) return prev

            const next = [
              {
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                link: n.link,
                is_read: n.is_read,
                created_at: n.created_at,
              },
              ...prev,
            ]

            return next.slice(0, 20)
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user])

  const handleNotificationClick = async (n: {
    id: number
    type: string
    title: string
    body: string | null
    link: string | null
    is_read: boolean
    created_at: string | null
  }) => {
    if (!n.is_read) {
      setNotifications(prev =>
        prev.map(item =>
          item.id === n.id ? { ...item, is_read: true } : item
        )
      )

      await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', n.id)
    }

    if (n.link) {
      router.push(n.link)
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    if (unreadCount === 0) return

    setNotifications(prev =>
      prev.map(item =>
        item.is_read ? item : { ...item, is_read: true }
      )
    )

    await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('is_read', false)
  }

  const isSearchPage = pathname === '/search';
  const isExchangeManagePage = pathname === '/exchange/manage';
  const exchangeManageView = searchParams.get('view') || '';

  // Hide Navbar on Mission page and Auth pages (Login, Register, Forgot Password)
  // Auth pages have their own custom top navigation
  if (pathname === '/mission' || pathname === '/login' || pathname === '/register' || pathname === '/forgot-password') return null;

  const handleBack = () => {
    // 1. Handle special paths
    if (pathname === '/topup/success') {
      router.replace('/profile?tab=topup-history');
      return;
    }
    if (pathname === '/exchange/manage') {
      if (exchangeManageView === 'orders') {
        router.push('/exchange/manage');
      } else {
        router.push('/profile');
      }
      return;
    }
    
    // 2. Product detail pages: return to saved origin (search/home), otherwise go Home
    if (isProductDetailPage) {
      try {
        const raw = typeof window !== 'undefined' ? sessionStorage.getItem('gachago:return_to') : null;
        if (raw) {
          const parsed = JSON.parse(raw) as { url?: string; timestamp?: number };
          const url = typeof parsed.url === 'string' ? parsed.url : '';
          const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
          const now = Date.now();
          if (url.startsWith('/') && now - ts <= 30 * 60 * 1000) {
            sessionStorage.removeItem('gachago:return_to');
            router.push(url);
            return;
          }
        }
      } catch {}
      router.push('/');
      return;
    }

    // 3. Check referrer for internal navigation
    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const isInternal = referrer && referrer.includes(currentOrigin);
    const cameFromSelection = /\/(item|blindbox|gacha|card)\/[^/]+\/select/.test(referrer || '');

    // 4. Smart back logic with selection bounce prevention
    if (isInternal && window.history.length > 1 && !cameFromSelection) {
      router.back();
    } else {
      if (pathname === '/profile' && activeTab === 'settings') {
        router.push('/profile');
      } else if (pathname?.startsWith('/profile') && activeTab) {
        router.push('/profile');
      } else if (pathname === '/search') {
        router.push('/');
      } else {
        router.push('/');
      }
    }
  };

  return (
    <>
      <NavbarLayout
        className={cn(
          isProductDetailPage && "fixed left-0 right-0 md:sticky top-0",
          (
            (pathname === '/profile' && (!activeTab || ['warehouse', 'delivery', 'draw-history', 'topup-history', 'follows', 'market', 'check-in'].includes(activeTab as string))) ||
            isTicketSelectionPage ||
            isSearchPage ||
            isExchangeManagePage ||
            pathname === '/exchange' ||
            pathname === '/ranking'
          ) && "hidden md:block"
        )}
        isSticky={!isProductDetailPage}
        leftClassName="flex-1 md:flex-none md:w-auto"
        left={
          <>
            <div className="flex items-center md:hidden overflow-hidden shrink-0">
              {showBackButton && (
                <button 
                  onClick={handleBack}
                  className="pl-2.5 pr-0 py-2 -ml-2 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl transition-colors flex items-center gap-0 md:hidden shrink-0"
                >
                  <ChevronLeft className="w-7 h-7 stroke-[2.5]" />
                </button>
              )}
            </div>

            {/* Mobile Page Title */}
            {!isHomePage && (
              <div className="md:hidden flex items-center min-w-0 flex-1">
                <div className="text-[18px] font-black text-neutral-900 dark:text-white truncate">
                  {getPageTitle()}
                </div>
              </div>
            )}
            
            <Link href="/" className={cn("flex items-center group md:relative", !showLogo && "hidden md:flex")}>
              <div className="flex items-center gap-1.5 transition-transform group-hover:scale-105">
                <Image
                  src="/images/20260629/logo.svg"
                  alt="GACHA ONLINE"
                  width={112}
                  height={28}
                  className="h-10 md:h-11 w-auto"
                  priority
                />
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-3 lg:gap-5">
              <Link
                href="/"
                className={cn(
                  "relative flex items-center h-9 text-[15px] lg:text-[16px] font-black transition-colors",
                  pathname === '/'
                    ? "text-primary"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-primary"
                )}
              >
                <span>回首頁</span>
                {pathname === '/' && (
                  <span className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-primary" />
                )}
              </Link>
              <Link
                href="/ranking"
                className={cn(
                  "relative flex items-center h-9 text-[15px] lg:text-[16px] font-black transition-colors md:hidden",
                  pathname === '/ranking'
                    ? "text-primary"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-primary"
                )}
              >
                <span>排行榜</span>
                {pathname === '/ranking' && (
                  <span className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-primary" />
                )}
              </Link>
            </div>
          </>
        }
        center={null}
        right={
          <>
            {pathname === '/topup' && user && (
              <div className="flex items-center gap-1 mr-1">
                <div className="w-5 h-5 relative">
                  <Image src="/images/gcoin.png" alt="G" fill className="object-contain" unoptimized />
                </div>
                <span className="text-lg font-black text-accent-red font-amount leading-none tracking-tight">
                  {(user.tokens || 0).toLocaleString()}
                </span>
              </div>
            )}

            {(isMessagesDetailPage || isMessagesListPage) && (
              <div className="relative" ref={messagesMoreRef}>
                <button
                  type="button"
                  onClick={() => setIsMessagesMoreOpen((v) => !v)}
                  className={cn(
                    'p-2 rounded-xl text-neutral-600 dark:text-neutral-400 active:scale-95 transition-transform',
                    isMessagesMoreOpen && 'text-primary'
                  )}
                  aria-label="更多"
                >
                  <MoreVertical className="w-5 h-5 stroke-[2]" />
                </button>
                {isMessagesMoreOpen && (
                  <div className="absolute right-0 mt-2 w-40 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden z-50">
                    {isMessagesDetailPage && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMessagesMoreOpen(false);
                          showToast('已送出檢舉（示意）', 'success');
                        }}
                        className="w-full px-3.5 py-3 flex items-center gap-2 text-left text-[13px] font-black text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <Flag className="w-4 h-4" />
                        檢舉
                      </button>
                    )}
                    {isMessagesListPage && (
                      <button
                        type="button"
                        onClick={async () => {
                          setIsMessagesMoreOpen(false);
                          try {
                            await supabase
                              .from('notifications')
                              .update({ is_read: true, read_at: new Date().toISOString() })
                              .in('type', ['exchange_message', 'sell_message'])
                              .eq('is_read', false);
                          } catch {}
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('messages:markAllRead'));
                          }
                        }}
                        className="w-full px-3.5 py-3 flex items-center justify-between text-left text-[13px] font-black text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      >
                        全部已讀
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {isExchangeDetailPage && (
              <button
                type="button"
                onClick={handleShare}
                className="md:hidden p-2 rounded-xl text-neutral-600 dark:text-neutral-400 active:scale-95 transition-transform"
                aria-label="分享"
              >
                <Share2 className="w-5 h-5 stroke-[2]" />
              </button>
            )}

            {/* Product Page Mobile Actions */}
            {isProductDetailPage && (
              <div className="flex items-center gap-0.5 md:hidden">
                <button onClick={handleShare} className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-neutral-600 dark:text-neutral-400 transition-colors active:scale-95">
                  <Share2 className="w-5 h-5 stroke-[2]" />
                </button>
                <button 
                  onClick={handleFollowToggle}
                  className={cn("p-1.5 rounded-xl transition-colors", isProductFollowed ? "text-accent-red" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800")}
                >
                  <Heart className={cn("w-5 h-5 stroke-[2]", isProductFollowed && "fill-current")} />
                </button>
              </div>
            )}

            {isAuthenticated && isHomePage && (
              <Link
                href="/search"
                className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 active:scale-90 transition-transform"
                aria-label="搜尋"
              >
                <Search className="w-5 h-5 stroke-[2]" />
              </Link>
            )}


            {isLoading || isForcingLoading || (isAuthenticated && !user) ? (
              <div className="relative ml-1 hidden md:flex items-center gap-2 pl-1 pr-1.5 py-1">
                <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
              </div>
            ) : user ? (
              <div className="relative ml-1 hidden md:block" ref={menuRef}>
                <button 
                  className={cn(
                    "flex items-center gap-2 pl-1 pr-1.5 py-1 hover:bg-neutral-100 rounded-xl transition-all",
                    isMenuOpen && "bg-neutral-100"
                  )}
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl border-2 border-neutral-100 p-0.5 transition-all overflow-hidden relative",
                    isMenuOpen ? "border-primary/20" : "hover:border-primary/20"
                  )}>
                    <Image
                      src={user.avatar_url || 'https://github.com/shadcn.png'}
                      alt={user.name}
                      fill
                      className="rounded-[10px] object-cover"
                      unoptimized
                    />
                  </div>
                  <ChevronDown className={cn(
                    "w-3.5 h-3.5 text-neutral-300 transition-transform duration-300",
                    isMenuOpen && "rotate-180"
                  )} />
                </button>

                {/* Dropdown */}
                <div className={cn(
                  "absolute right-0 mt-3 w-64 bg-white dark:bg-neutral-900 rounded-3xl shadow-modal border border-neutral-100 dark:border-neutral-800 p-2.5 transition-all duration-300 transform origin-top-right z-50",
                  isMenuOpen ? "opacity-100 visible scale-100" : "opacity-0 invisible scale-95"
                )}>
                  {/* User Profile Summary */}
                  <div className="px-3.5 py-2.5 mb-2 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-700 relative">
                      <Image
                        src={user.avatar_url || '/images/avatar.png'}
                        alt={user.name || 'User'}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-black text-neutral-900 dark:text-white leading-tight">{user.name}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-accent-emerald" />
                      </div>
                      {/* Invite Code Display */}
                      <div 
                        className="flex items-center gap-1.5 mt-1.5 bg-neutral-50 dark:bg-neutral-800 px-2 py-0.5 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors group/invite w-fit"
                        onClick={(e) => {
                          e.preventDefault();
                          if (user.invite_code) {
                            navigator.clipboard.writeText(user.invite_code);
                            showToast('邀請碼已複製', 'success');
                          }
                        }}
                      >
                        <span className="text-[13px] font-black text-neutral-400">邀請碼：</span>
                        <span className="text-[13px] font-mono font-black text-primary group-hover/invite:text-primary/80 transition-colors">{user.invite_code || '-'}</span>
                        <Copy className="w-3.5 h-3.5 text-neutral-300 group-hover/invite:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>

                  {/* Balance Display */}
                  <div className="bg-neutral-50 dark:bg-neutral-800 rounded-2xl p-3.5 mb-2 border border-neutral-100/50 dark:border-neutral-700/50">
                    <div className="text-[13px] font-black text-neutral-400 uppercase tracking-widest mb-1 leading-none">可用代幣</div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 relative">
                        <Image src="/images/gcoin.png" alt="G" fill className="object-contain" unoptimized />
                      </div>
                      <span className="text-xl font-black text-accent-red font-amount leading-none tracking-tight">
                        {(user.tokens || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <Link href="/topup" onClick={() => setIsMenuOpen(false)} className="w-full bg-primary text-white text-[14px] font-black py-2.5 rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mb-1.5">
                      立即儲值
                    </Link>
                    
                    <Link href="/profile" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px] font-black text-neutral-600 dark:text-neutral-300 hover:text-primary dark:hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 rounded-xl transition-all">
                      <UserIcon className="w-4 h-4" />
                      會員中心
                    </Link>

                    <Link href="/profile?tab=follows" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px] font-black text-neutral-600 dark:text-neutral-300 hover:text-primary dark:hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 rounded-xl transition-all">
                      <Heart className="w-4 h-4" />
                      我的關注
                    </Link>
                    
                    <div className="h-px bg-neutral-50 dark:bg-neutral-800 mx-2 my-1"></div>
                    
                    <button
                      onClick={() => { setIsMenuOpen(false); logout(); }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[14px] font-black text-neutral-400 hover:text-accent-red hover:bg-accent-red/5 rounded-xl transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      登出
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              !['/login', '/register', '/forgot-password', '/update-password'].includes(pathname) && !isProductDetailPage && !isExchangeDetailPage && !isMessagesDetailPage && (
                <>
                  {/* Mobile login button: 細膠囊線框 */}
                  <Link
                    href="/login"
                    className="md:hidden px-3 h-8 flex items-center rounded-full border border-primary text-[12px] font-black text-primary active:scale-95 transition-transform whitespace-nowrap"
                  >
                    登入
                  </Link>
                  {/* Desktop login button */}
                  <Link
                    href="/login"
                    className={cn(
                      "hidden md:flex bg-primary text-white px-5 h-9 items-center rounded-full hover:bg-primary/90 transition-colors text-[13px] font-black whitespace-nowrap",
                      isProductDetailPage && "hidden md:flex"
                    )}
                  >
                    登入
                  </Link>
                </>
              )
            )}
          </>
        }
      />
    </>
  );
}
