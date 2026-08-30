'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PageHeaderBack } from '@/components/ui/PageHeader';
import { createClient } from '@/lib/supabase/client';
import { Search, Bell, MessageCircle, LogOut, User as UserIcon, ChevronDown, ChevronLeft, X, History, Flame, Heart, CheckCircle2, Share2, Copy, MoreVertical, Flag, BookOpen } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { categoryState } from '@/lib/categoryFlags';
import NavbarLayout from './NavbarLayout';
import { countUnread } from '@/lib/announcementRead';
import { startKeyboardRelay } from '@/lib/keyboardRelay';
import { asset } from '@/lib/asset';
import { cameFromAnnouncementsList } from '@/lib/announcementsView';

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
  // 儲值維護中時「立即儲值」不換頁、改跳提示
  const { states: featureStates, isLoading: isFlagsLoading } = useFeatureFlags();
  const rechargeState = featureStates.recharge;
  /* 機台關閉時整個「挑戰」入口要消失 —— 功能開關頁的說明就是這樣寫的
     （「關閉後挑戰入口與機台頁都會消失」）。首頁的懸浮入口與 /challenge
     頁本身都有擋，只有這裡的頂部導航漏了，桌機關掉還看得到。
     維護中照常顯示：那是暫時停一下，點進去頁面會說明。

     flag 未載入時是「還不知道」，不能當成「開著」—— 否則刷新時挑戰會先
     閃出來、flag 一到再收起（看起來像壞掉）。所以只有「確定 slot 開著」
     才顯示：載入中先不畫，寧可晚淡入、不要先亮再消失。 */
  const slotOn = !isFlagsLoading && categoryState('slot', featureStates, false) !== 'off';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMessagesMoreOpen, setIsMessagesMoreOpen] = useState(false);
  const [productName, setProductName] = useState<string | null>(null);
  const [productType, setProductType] = useState<string | null>(null);
  const [isProductFollowed, setIsProductFollowed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesMoreRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  
  const [supabase] = useState(() => createClient());
  const [bellUnread, setBellUnread] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        // 個人通知（綁定禮入帳、邀請獎勵可領…）也要點亮鈴鐺，
        // 不然玩家拿到獎勵完全沒感覺 —— 私訊類歸「訊息」頁管，不算
        if (user) {
          const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('is_read', false)
            .not('type', 'in', '(exchange_message,sell_message)');
          if ((count ?? 0) > 0) { setBellUnread(true); return; }
        }

        const res = await fetch('/api/announcements?limit=30');
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return;
        // 逐則判定：列表已改成單則已讀，鈴鐺不能再只看「最後檢視時間」
        setBellUnread(countUnread(data as { id: string; published_at: string }[]) > 0);
      } catch {}
    };
    check();
    // 已讀狀態變動時重新計算（可能只讀了一則，仍有其他未讀）
    const handler = () => { void check(); };
    window.addEventListener('ggb:announcementsRead', handler);
    return () => window.removeEventListener('ggb:announcementsRead', handler);
  }, [user, supabase]);

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
    (pathname === '/profile' && !activeTab);
  const isInnerPage = !isHomePage && !isMainTab;
  const isSellDetailPage = /^\/sell\/[^/]+$/.test(pathname) && pathname !== '/sell/new';
  const isProductDetailPage = /^\/(?:item|blindbox|gacha|card|challenge)\/[^/]+$/.test(pathname) || isSellDetailPage;
  const rulesPageMatch = pathname.match(/^\/(gacha|blindbox|card)\/[^/]+$/);
  const isItemPage = /^\/item\/[^/]+$/.test(pathname);
  const rulesPath = rulesPageMatch
    ? `/${rulesPageMatch[1]}/rules`
    : isItemPage && productType
    ? `/${productType}/rules`
    : null;
  const isNewsDetailPage = /^\/news\/[^/]+$/.test(pathname);
  const isAnnouncementDetailPage = /^\/announcements\/[^/]+$/.test(pathname);
  /* 個人通知內頁（/announcements/n/<bigint>）—— 版面跟公告內頁一樣，
     只是右上角不給分享（那是只有本人看得到的回條，分享出去別人也開不了） */
  const isNotificationDetailPage = /^\/announcements\/n\/[^/]+$/.test(pathname);
  const isAnnouncementInnerPage = isAnnouncementDetailPage || isNotificationDetailPage;
  /* 通知列表與內頁：右上角不放搜尋（老闆 2026-08-20）。
     通知是「平台要講的話」，看通知的人不是來找商品的，
     擺一顆放大鏡只是把注意力帶走 */
  const isAnnouncementsArea = pathname === '/announcements' || isAnnouncementInnerPage;
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
        const { data } = await supabase.from('products').select('name, type').eq('id', productId).single();
        if (data) {
          setProductName(data.name);
          setProductType((data as any).type || null);
        }
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
    } else if (isFairnessPage) {
      // /fairness/[id] 的 id 就是商品 id：導航列直接顯示商品名，
      // 頁面本身才不需要再放一次標題（原本兩層標題重複）
      const fairnessId = pathname.match(/^\/fairness\/([^/]+)$/)?.[1] || '';
      if (/^\d+$/.test(fairnessId)) {
        const fetchFairnessTitle = async () => {
          const { data } = await supabase.from('products').select('name').eq('id', fairnessId).maybeSingle();
          if (data) setProductName((data as any).name);
        };
        void fetchFairnessTitle();
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
      setProductType(null);
      setIsProductFollowed(false);
    }
  }, [pathname, user, isProductDetailPage, isSellDetailPage, isNewsDetailPage, isFairnessPage, supabase]);

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
  const showBackButton = (isInnerPage || (pathname as string) === '/topup') && !isNewsDetailPage;
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
    if (pathname === '/sell/manage') return '商城管理';
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
    // 商品名撈到前先留空，不要先顯示「公平性驗證」再跳成商品名
    if (pathname.startsWith('/fairness')) return productName || '';
    if (pathname.endsWith('/select')) return '選擇籤號';
    if (pathname.endsWith('/confirm')) return '確認購買';
    if (isSellDetailPage) return productName || '商城';
    if (pathname.startsWith('/item/') || pathname.startsWith('/blindbox/') || pathname.startsWith('/gacha/') || pathname.startsWith('/card/')) return productName || '商品詳情';
    if (isNewsDetailPage) return '';
    if (pathname === '/topup') return '儲值代幣';
    if (pathname === '/challenge') return '挑戰';
    if (pathname === '/faq') return '常見問題';
    if (pathname === '/about') return '關於我們';
    if (pathname === '/terms') return '會員條款';
    if (pathname === '/privacy') return '隱私權政策';
    if (pathname === '/return-policy') return '退換貨資訊';
    if (pathname === '/news') return '最新情報';
    if (pathname === '/announcements') return '通知';
    if (pathname.startsWith('/announcements/')) return '通知詳情';
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
      return '個人中心';
    }
    return '';
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    const isMobileUA = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent);
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches && isMobileUA;
    try {
      const nav = navigator as unknown as { share?: (data: { url: string }) => Promise<void> };
      if (typeof nav.share === 'function' && isTouchDevice) {
        await nav.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('連結已複製', 'success');
    } catch {
      // 使用者取消，不處理
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

  /* 任務頁與帳號流程各頁都有自己的頂部導航，隱藏全域 Navbar。
     ⚠️ `/update-password` 先前漏在這裡：它會拿到一條白底頂欄（標題「重置密碼」），
     疊在頁面自己的浮動返回箭頭上，變成兩個返回鍵（老闆 2026-08-23 截圖）。 */
  if (
    pathname === '/mission' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/update-password'
  ) return null;
  if (pathname.startsWith('/events/')) return null;
  // 機台內頁改用頁內浮動導航（返回 + 音效），隱藏全域 Navbar
  if (/^\/challenge\/[^/]+$/.test(pathname)) return null;
  // 邀請頁用文章內頁式浮動導航（返回＋分享蓋在 hero 上），隱藏全域 Navbar
  if (pathname === '/invite') return null;
  /*
   * 商城整區自成一個 app（老闆指定：「把商城當作新的頁面」）——
   * 自帶橘色 header 與四格底部導航，照原型移植。
   * 疊上全域 Navbar 會變成兩個搜尋入口、兩排導航。
   * 每一頁都有自己的返回鍵（.hdr.plain），所以整區都不需要全域 Navbar。
   */
  if (pathname === '/sell' || pathname.startsWith('/sell/') || pathname.startsWith('/official/'))
    return null;

  const handleBack = () => {
    // 1. Handle special paths
    if (pathname.startsWith('/challenge/')) {
      router.push('/challenge');
      return;
    }
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
    
    /*
     * 通知內頁（公告 /announcements/<uuid>、個人通知 /announcements/n/<id>）
     * 一律回通知列表 —— 列表會依 sessionStorage 還原分頁籤與捲動位置（老闆 2026-08-28）。
     *
     * 不能落到下面的 referrer 判斷：從 LINE、推播或重新整理進到內頁時
     * document.referrer 是空的，會被當成外部來源而把人彈回首頁。
     */
    if (isAnnouncementInnerPage) {
      // 真的是從列表點進來的才 back()（保留原本的歷史，不會愈疊愈深）；
      // 直接開網址進來的就 push 回列表
      if (cameFromAnnouncementsList(pathname) && window.history.length > 1) {
        router.back();
      } else {
        router.push('/announcements');
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

  const isRulesPage = /^\/[^/]+\/rules$/.test(pathname);
  // 情報列表／文章內頁／規則頁：手機端這些頁自繪頂部，Navbar 收起；
  // 但桌機要留著 Navbar —— 很多用戶從文章進站，讀完要能導回商城
  //（老闆 2026-08-21）。所以不是整條 return null，而是桌機才顯示。
  const desktopOnlyNav = pathname === '/news' || isNewsDetailPage || isRulesPage;

  return (
    <>
      <NavbarLayout
        /* 手機端首頁：整條導航列吃主題色（老闆 2026-08-28）。桌機維持白底 ——
           桌機那條同時放著分類連結與會員選單，整片染色會蓋掉那些元素的層次。
           `md:` 變體在 tailwind 產出的 CSS 裡排在基礎工具類後面，桌機必定覆蓋。 */
        surfaceClassName={isHomePage
          ? "bg-primary border-transparent md:bg-white md:dark:bg-neutral-900 md:border-neutral-100 md:dark:border-neutral-800"
          : undefined}
        innerClassName={(isProductDetailPage || isAnnouncementInnerPage) ? "max-w-[960px] !px-4" : undefined}
        className={cn(
          desktopOnlyNav && "hidden md:block",
          isProductDetailPage && "fixed left-0 right-0",
          (
            (pathname === '/profile' && (!activeTab || ['warehouse', 'delivery', 'draw-history', 'topup-history', 'follows', 'market'].includes(activeTab as string))) ||
            isTicketSelectionPage ||
            isSearchPage ||
            isExchangeManagePage ||
            pathname === '/exchange' ||
            pathname === '/ranking'
            /* /challenge 原本也在這裡（手機隱藏頂部導航，因為底部導航有「挑戰」那格）。
               挑戰改成首頁懸浮入口、不再是底部頁籤之後，手機端就必須有頂部導航，
               否則進到挑戰頁沒有任何返回路徑 */
          ) && "hidden md:block"
        )}
        isSticky={!isProductDetailPage}
        leftClassName={(isProductDetailPage || isAnnouncementInnerPage) ? "flex-1" : "flex-1 md:flex-none md:w-auto"}
        left={
          <>
            {(isProductDetailPage || isAnnouncementInnerPage) ? (
              showBackButton && (
                /* 統一元件：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */
                <PageHeaderBack title={getPageTitle()} onBack={handleBack} className="flex-1" />
              )
            ) : showBackButton && !isHomePage ? (
              /* 統一元件（老闆 2026-08-20：全站同一顆，按文字也能返回）：
                 樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */
              <PageHeaderBack title={getPageTitle()} onBack={handleBack} className="flex-1 md:hidden" />
            ) : (
              <>
                {showBackButton && (
                  <button
                    onClick={handleBack}
                    className="pl-2.5 pr-0 py-2 -ml-2 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl transition-colors flex items-center gap-0 shrink-0 md:hidden"
                  >
                    <ChevronLeft className="w-7 h-7 stroke-[2.5]" />
                  </button>
                )}

                {/* Mobile Page Title（沒有返回鈕的頁面才是純文字） */}
                {!isHomePage && (
                  <div className="flex items-center min-w-0 flex-1 md:hidden">
                    <div className="text-[18px] font-black text-neutral-900 dark:text-white truncate">
                      {getPageTitle()}
                    </div>
                  </div>
                )}
              </>
            )}
            
            <Link href="/" className={cn("flex items-center group md:relative", (isProductDetailPage || isAnnouncementInnerPage) ? "hidden" : (!showLogo && "hidden md:flex"))}>
              <div className="flex items-center gap-1.5 transition-transform group-hover:scale-105">
                <Image
                  src={asset("/images/logo.png")}
                  alt="GACHA ONLINE"
                  width={112}
                  height={36}
                  className="h-10 md:h-11 w-auto"
                  priority
                />
              </div>
            </Link>

            <div className={cn("hidden", !(isProductDetailPage || isAnnouncementInnerPage) && "md:flex items-center gap-3 lg:gap-5")}>
              <Link
                href="/"
                className={cn(
                  "relative flex items-center h-9 text-[15px] lg:text-[16px] font-black transition-colors",
                  pathname === '/'
                    ? "text-primary"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-primary"
                )}
              >
                <span>首頁</span>
                {pathname === '/' && (
                  <span className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-primary" />
                )}
              </Link>
              <Link
                href="/news"
                className={cn(
                  "relative flex items-center h-9 text-[15px] lg:text-[16px] font-black transition-colors",
                  pathname === '/news' || isNewsDetailPage
                    ? "text-primary"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-primary"
                )}
              >
                <span>情報</span>
                {(pathname === '/news' || isNewsDetailPage) && (
                  <span className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-primary" />
                )}
              </Link>
              {slotOn && (
                <Link
                  href="/challenge"
                  className={cn(
                    "relative flex items-center h-9 text-[15px] lg:text-[16px] font-black transition-colors",
                    pathname === '/challenge' || pathname.startsWith('/challenge/')
                      ? "text-primary"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-primary"
                  )}
                >
                  <span>挑戰</span>
                  {(pathname === '/challenge' || pathname.startsWith('/challenge/')) && (
                    <span className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-primary" />
                  )}
                </Link>
              )}
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
                  <Image src={asset("/images/gcoin.webp")} alt="G" fill className="object-contain" unoptimized />
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

            {/* news detail page 的返回/分享由文章頁自身的 fixed nav 處理，Navbar 不重複顯示 */}

            {/* Announcement Detail Share */}
            {isAnnouncementDetailPage && (
              <button
                onClick={handleShare}
                className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors active:scale-95"
                aria-label="分享"
              >
                <Share2 className="w-5 h-5 stroke-[2]" />
              </button>
            )}

            {/* Product Page Actions */}
            {isProductDetailPage && (
              <div className="flex items-center gap-0.5">
                {rulesPath && (
                  <Link
                    href={rulesPath}
                    className="p-1.5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors active:scale-95"
                    aria-label="規則"
                  >
                    <BookOpen className="w-5 h-5 stroke-[2]" />
                  </Link>
                )}
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

            {/*
              首頁的搜尋圖標。老闆指定與鈴鐺互換位置，所以排在通知（鈴鐺）前面。

              未登入時維持只在手機顯示（`md:hidden`）—— 桌機未登入的搜尋入口
              本來就不在這裡，把它放出來等於多長一顆。
              未登入在**非首頁**的搜尋圖標另外放在登入鈕旁邊（見下方 auth 區塊），
              那顆的條件不同（排除商品內頁等），不要跟這顆合併。
            */}
            {isHomePage && (
              <Link
                href="/search?focus=1"
                onClick={startKeyboardRelay}
                className={cn(
                  // 手機端壓在主題色上 → 白色；桌機那條仍是白底，維持深灰
                  "p-2 rounded-xl text-white md:text-neutral-600 md:dark:text-neutral-400 active:scale-90 transition-transform",
                  !isAuthenticated && "md:hidden",
                )}
                aria-label="搜尋"
              >
                <Search className="w-5 h-5 stroke-[2]" />
              </Link>
            )}

            {/* 通知（鈴鐺）：手機僅首頁顯示；桌機取代原本的文字連結，固定在搜尋圖標右邊 */}
            {!isProductDetailPage && !isAnnouncementInnerPage && (
              <Link
                href="/announcements"
                className={cn(
                  "relative p-2 rounded-xl active:scale-90 transition-transform md:flex md:items-center",
                  pathname === '/announcements' || pathname.startsWith('/announcements/')
                    ? "text-primary"
                    // 手機端只在首頁出現（見下一行的 hidden），所以白色只會壓在主題色上
                    : "text-white md:text-neutral-600 md:dark:text-neutral-400 md:hover:text-primary",
                  !isHomePage && "hidden"
                )}
                aria-label="通知"
              >
                <Bell className="w-5 h-5 stroke-[2]" />
                {/* 尺寸/位置對齊會員頁的設定齒輪。手機端首頁壓在主題色上，紅點會糊進底色
                    → 改成**亮黃點**（老闆 2026-08-29，先前是白點），不描邊：
                    描邊會讓它看起來像個圈。桌機那條是白底，維持紅點＋白邊 */}
                {bellUnread && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-accent-yellow md:bg-accent-red md:border-2 md:border-white md:dark:border-neutral-950" />
                )}
              </Link>
            )}

            {pathname === '/announcements' && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('ggb:markAllAnnouncementsRead'))}
                className="px-2.5 py-1 text-[12px] font-black text-neutral-600 dark:text-neutral-300 hover:text-primary transition-colors whitespace-nowrap"
              >
                全部已讀
              </button>
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
                    "w-8 h-8 rounded-full border-2 border-neutral-100 p-0.5 transition-all overflow-hidden relative",
                    isMenuOpen ? "border-primary/20" : "hover:border-primary/20"
                  )}>
                    <Image
                      src={user.avatar_url || 'https://github.com/shadcn.png'}
                      alt={user.name}
                      fill
                      className="rounded-full object-cover"
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
                        src={user.avatar_url || asset('/images/avatar.webp')}
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
                        className="flex items-center gap-1.5 mt-1.5 bg-neutral-50 dark:bg-neutral-800 px-2 py-0.5 rounded-xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors group/invite w-fit"
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
                        <Image src={asset("/images/gcoin.webp")} alt="G" fill className="object-contain" unoptimized />
                      </div>
                      <span className="text-xl font-black text-accent-red font-amount leading-none tracking-tight">
                        {(user.tokens || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    {/* 儲值維護中：按鈕留著但不換頁，改跳提示。
                        /topup 本身也有維護說明，這裡是讓玩家按之前就知道 */}
                    <Link
                      href="/topup"
                      onClick={e => {
                        if (rechargeState === 'maintenance') {
                          e.preventDefault();
                          showToast('儲值維護中，敬請見諒', 'info');
                          return;
                        }
                        setIsMenuOpen(false);
                      }}
                      className="w-full bg-primary text-white text-[14px] font-black py-2.5 rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mb-1.5"
                    >
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
              !['/login', '/register', '/forgot-password', '/update-password'].includes(pathname) && !isProductDetailPage && !isExchangeDetailPage && !isMessagesDetailPage && !isNewsDetailPage && (
                <>
                  {/* 未登入時搜尋圖標只放首頁（見上方 isHomePage 那顆）。
                      常見問題／關於我們／條款／隱私／退換貨這些頁跟搜尋無關，
                      未登入不放搜尋鈕（老闆 2026-08-21：其他頁面不相關不需放）。 */}
                  {/* Mobile login button: 細膠囊線框 */}
                  <Link
                    href="/login"
                    className={cn(
                      "md:hidden px-3 h-8 flex items-center rounded-full border text-[12px] font-black active:scale-95 transition-transform whitespace-nowrap",
                      // 首頁那條是主題色底，紅字紅框會糊掉
                      isHomePage ? "border-white text-white" : "border-primary text-primary",
                    )}
                  >
                    登入拿積分
                  </Link>
                  {/* Desktop login button */}
                  <Link
                    href="/login"
                    className={cn(
                      "hidden md:flex bg-primary text-white px-5 h-9 items-center rounded-full hover:bg-primary/90 transition-colors text-[13px] font-black whitespace-nowrap",
                      isProductDetailPage && "hidden md:flex"
                    )}
                  >
                    登入拿積分
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
