'use client';

import React, { useState, useEffect, useLayoutEffect, Suspense, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Truck, Trophy, Settings, LogOut, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, HelpCircle, Info, FileText, Shield, RefreshCcw, RefreshCw, Wallet, Heart, User, ChevronDown, X, Loader2, CreditCard, Copy, Ticket, Store, History, MessageCircle, Star, UserPlus, Search, Plus, MoreHorizontal } from 'lucide-react';
import { HoldToConfirmButton } from '@/components/ui/HoldToConfirmButton';
import { DeliveryCheckout, type ShippingCoupon, type DeliveryMethod } from '@/components/warehouse/DeliveryCheckout';
import { TW_CITIES, TW_DISTRICTS, splitTwAddress, zip3Of } from '@/lib/twDistricts';
import { AddressInfo } from '@/components/ui/AddressInfo';
import { BottomModal } from '@/components/ui/BottomModal';
import { WheelDatePicker } from '@/components/ui/WheelDatePicker';
import { useHideOnScroll } from '@/lib/useHideOnScroll';
import SimplePageHeader from '@/components/ui/SimplePageHeader';
import PageHeader from '@/components/ui/PageHeader';
import { TopFadeBlur } from '@/components/ui/TopFadeBlur';
import { useStatusBarText } from '@/components/native/StatusBarStyle';
import PrizeShareCard from '@/components/warehouse/PrizeShareCard';
import DeliverySteps from '@/components/warehouse/DeliverySteps';
import { orderStatusConfig, matchesDeliveryTab, DELIVERY_TABS, type DeliveryTabId } from '@/lib/orderStatus';
import { openStoreMap, newStoreMapRequestId } from '@/lib/logistics/openStoreMap';
import { closeInAppBrowser } from '@/lib/native/browser';
import { fetchPrizeShareData, type PrizeShareData } from '@/lib/prizeShare';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { makeListViewMemory } from '@/lib/listViewMemory';
import { restoreScrollTo } from '@/lib/restoreScroll';
import { ProfileSkeleton } from '@/components/Skeletons';
import { WarehouseItemDetailModal } from '@/components/warehouse/WarehouseItemDetailModal';
import WarehouseGridCell from '@/components/warehouse/WarehouseGridCell';
import { isMajorGrade } from '@/lib/grade';
import { GradeBadge } from '@/components/ui/GradeBadge';
import WarehouseSearchPanel from '@/components/warehouse/WarehouseSearchPanel';
import ProductCard from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/ProductCardSkeleton';
import { ProductType } from '@/components/ui/ProductBadge';
import Image from 'next/image';
import { useAlert } from '@/components/ui/AlertDialog';
import { useToast } from '@/components/ui/Toast';
import DeleteAccountSheet from '@/components/profile/DeleteAccountSheet';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { LineBindRow } from '@/components/auth/LineBindRow';
import { EmailBindRow } from '@/components/auth/EmailBindRow';
import { InviteCodeRow } from '@/components/auth/InviteCodeRow';
import { isSyntheticEmail } from '@/lib/syntheticEmail';
import { useSettingsStatus } from '@/components/auth/useSettingsStatus';
import ProfileSectionHeader from '@/components/profile/desktop/ProfileSectionHeader';
import ProfileToolbar from '@/components/profile/desktop/ProfileToolbar';
import ProfileDataTable from '@/components/profile/desktop/ProfileDataTable';
import ProfileStatusBadge from '@/components/profile/desktop/ProfileStatusBadge';
import ProfilePagination from '@/components/profile/desktop/ProfilePagination';
import ProfileSearchField from '@/components/profile/desktop/ProfileSearchField';
/* 1024 以上整頁掛進 cardx 的外殼（老闆 2026-09-05：會員中心要對齊 cardx 版型——頂部導航、左右分欄的樣式／密度／字級） */
import { AppShell } from '@/cardx/components/layout/AppShell';
import { defaultSidebarItems } from '@/cardx/lib/navigation';
import homeStyles from '@/cardx/components/home/HomeClient.module.css';
import { Button3D as CardxButton3D } from '@/cardx/components/ui/Kit';
import { useMinWidth } from '@/lib/useMinWidth';

import { Tabs, TabsContent, TabsContentWrapper, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { normalizePhone, PHONE_PLACEHOLDER, PHONE_ERROR, isValidPhone } from '@/lib/phone';
import { useMediaQuery } from '@/hooks/use-media-query';
import { trackEvent, trackPageView } from '@/lib/trackEvent';
import Button from '@/components/ui/Button';
import ImageCropper from '@/components/ImageCropper';
import { asset } from '@/lib/asset';
import { formatMemberNo } from '@/lib/memberNo';

// --- Interfaces ---
interface MarketListing {
  id: string;
  draw_record_id?: number;
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  created_at: string;
  updated_at: string;
  raw_updated_at?: Date;
  product: {
    name: string;
    image: string;
    grade: string;
    series: string;
    type?: string;
  };
  buyer?: {
    name: string;
  };
  type?: 'buy' | 'sell';
  counterparty?: string;
}

interface DismantledItem {
  id: string;
  name: string;
  series: string;
  grade: string;
  image: string;
  dismantled_at: string;
  raw_dismantled_at?: Date;
  recycleValue: number;
  type?: string;
  supplierName?: string;
}

interface WarehouseItem {
  id: string;
  name: string;
  series: string;
  grade: string;
  status: 'in_warehouse' | 'pending_delivery' | 'shipped' | 'exchanged' | 'listing';
  image: string;
  date: string;
  ticketNo: string;
  recycleValue: number;
  type?: string;
  isPreorder?: boolean;
  preorderAvailableAt?: string | null;
  supplierId?: number | null;
  supplierName?: string;
  prizeTotal?: number;
  /** 品項 id：倉庫格狀把同一品項堆成一格，用它當堆疊鍵 */
  prizeId?: number | null;
  /** 抽籤販售中籤品項：申請寄出時要付的價金。一般商品為 0 */
  salePrice?: number;
  /** 抽籤販售中籤品項的保留到期時間 */
  expiresAt?: string | null;
}

interface DeliveryOrder {
  id: string;
  order_number?: string;
  itemsCount: number;
  items: { grade: string; name: string; productName: string }[];
  status: 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled' | string;
  date: string;
  tracking: string;
  /** 申請時扣的運費，取消時要退回；免運為 0 */
  shippingFee: number;
  method: string;
  arrivalDate?: string;
  recipientName?: string;
  recipientPhone?: string;
  address?: string;
  storeName?: string;
  logisticsType?: string;
  /** 供貨廠商。舊訂單 orders.supplier_id 可能還是 NULL，那時退回從訂單品項推 */
  supplierName?: string;
}

interface DrawHistoryItem {
  id: string;
  productId: number;
  product: string;
  productStatus?: string;
  productRemaining?: number;
  productType?: string;
  date: string;
  tickets: string[];
  cost: number;
  pointsUsed: number;
  items: { grade: string; name: string; ticket_number: string; txid_hash?: string }[];
  rawDate?: string;
}

interface FollowedProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  status: 'selling' | 'soldout' | 'coming_soon' | 'ended';
  remaining?: number;
  total?: number;
  is_hot?: boolean;
  type?: string;
}

// MAJOR_LEVELS／isMajorGrade 搬到 lib/grade.ts（商品頁品項總覽也要用）

/*
 * 賞等的名次（數字小＝大獎）。用於倉庫「賞等 高到低」排序。
 * 最後賞排在最前面 —— 一款商品只有一支，比 A賞 還稀有。
 * 一般版與看不懂的賞等一律丟到最後，不要卡在中間讓大獎往下沉。
 */
const gradeRank = (grade: string | undefined | null): number => {
  if (!grade) return 999;
  const trimmed = grade.trim();
  if (!trimmed) return 999;
  if (trimmed.toUpperCase() === 'LAST ONE' || trimmed === '最後賞') return 0;
  const prizeIndex = trimmed.indexOf('賞');
  const base = (prizeIndex !== -1 ? trimmed.slice(0, prizeIndex) : trimmed).trim().toUpperCase();
  if (base === 'SP') return 1;
  if (base === 'S') return 2;
  if (/^[A-Z]$/.test(base)) return 3 + (base.charCodeAt(0) - 65);
  return 900;
};


const formatDrawId = (id: string | number, dateStr?: string) => {
  if (!dateStr) return `TX${id}`;
  try {
    const d = new Date(dateStr);
    const year = d.getFullYear().toString().slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    // Generate pseudo-random 4 digits from ID (stable)
    const suffix = ((numId * 1367) % 10000).toString().padStart(4, '0');
    return `TX${year}${month}${day}${suffix}`;
  } catch {
    return `TX${id}`;
  }
};

interface Coupon {
  id: string;
  title: string;
  description: string;
  discountType: 'fixed' | 'percentage';
  discountValue: number;
  minSpend: number;
  expiryDate: string;
  status: 'unused' | 'used' | 'expired';
  code?: string;
}

interface TopupHistoryItem {
  id: string;
  order_number: string;
  payment_method: string;
  amount: number;
  tokens: number;
  status: string;
  created_at: string;
}

type TabType =
  | 'warehouse'
  | 'market'
  | 'delivery'
  | 'draw-history'
  | 'topup-history'
  | 'follows'
  | 'coupons'
  | 'settings';

interface DbListing {
  id: number;
  draw_records: {
    id: number;
    product_prizes: { name: string; level: string; image_url: string };
    products: { name: string; type?: string };
  };
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  created_at: string;
  updated_at: string;
  marketplace_transactions: {
    buyer_id: string;
    users: { name: string };
  }[];
}

interface DbOrder {
  id: string;
  order_number?: string;
  created_at: string;
  shipped_at?: string | null;
  tracking_number: string | null;
  status: string;
  logistics_type?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  address?: string | null;
  store_name?: string | null;
  suppliers?: { name: string } | null;
  draw_records: {
    product_prizes: {
      level: string;
      name: string;
    } | null;
    products?: { suppliers?: { name: string } | null } | null;
  }[];
}

interface DbMarketplaceTransaction {
  id: number;
  price: number;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  draw_records: {
    product_prizes: { name: string; image_url: string; level: string } | null;
    products: { name: string; type?: string } | null;
  } | null;
  buyer: { name: string | null } | null;
  seller: { name: string | null } | null;
}

interface DbFollow {
  product_id: string;
  products: {
    id: string;
    name: string;
    price: number;
    image_url: string;
    status: 'selling' | 'soldout' | 'coming_soon' | 'ended';
    remaining: number;
    total_count: number;
    is_hot: boolean;
    type: string;
  };
}

interface DbCoupon {
  id: string;
  status: 'unused' | 'used' | 'expired';
  expiry_date: string;
  coupons: {
    id: string;
    title: string;
    description: string;
    discount_type: 'fixed' | 'percentage';
    discount_value: number;
    min_spend: number;
    code: string;
  };
}

interface DbTopup {
  id: string;
  order_number: string;
  amount: number;
  bonus: number;
  status: string;
  created_at: string;
}

interface GroupedDrawHistoryItem {
  _rawDate: string;
  rawDate?: string;
  id: number;
  productId: number;
  product: string;
  productStatus?: string;
  productRemaining?: number;
  productType?: string;
  date: string;
  tickets: string[];
  cost: number;
  pointsUsed: number;
  items: { grade: string; name: string; ticket_number: string; txid_hash?: string }[];
}

  interface DbDrawRecord {
    id: number;
    product_id: number;
    ticket_number: number;
    created_at: string;
    status: string;
    points_used?: number | null;
    /** 這一抽實際收的 G（促銷/優惠券折抵後；migration 512）。舊資料 null → fallback 單價 */
    tokens_spent?: number | null;
    txid_hash?: string | null;
    prize_level?: string | null;
    prize_name?: string | null;
    /** 抽籤販售中籤品項的保留到期時間 */
    expires_at?: string | null;
    product_prize_id?: number | null;
    product_prizes: {
      level: string;
      name: string;
      image_url: string;
      recycle_value: number;
      total?: number;
      /** 抽籤販售：中籤後寄出應付金額 */
      sale_price?: number;
    } | null;
    admin_recycle_pool: { recycle_value: number; created_at: string }[] | null;
    products: {
      name: string;
      price?: number;
      type?: string;
      /** normal | lottery */
      sale_mode?: string;
      status?: string;
      remaining?: number;
      supplier_id?: number | null;
      suppliers?: { id: number; name: string } | null;
    } | null;
  }

const getArrivalText = (arrivalDate?: string) => {
  if (!arrivalDate) return null;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const arrival = new Date(arrivalDate.replace(/-/g, '/'));
    arrival.setHours(0, 0, 0, 0);

    if (arrival.getTime() === today.getTime()) return '今日送達';
    if (arrival.getTime() === tomorrow.getTime()) return '明日送達';
    if (arrival.getTime() > today.getTime()) {
      const month = arrival.getMonth() + 1;
      const date = arrival.getDate();
      return `${String(month).padStart(2, '0')}月${String(date).padStart(2, '0')}日送達`;
    }
    // 預計日期已過但尚未送達 → 保持友善提示
    return '今日送達';
  } catch (e) {
    console.error('Date parsing error', e);
  }
  return null;
};

// 徽章與步驟條共用 lib/orderStatus —— 原本這裡把 submitted 與 processing 併成
// 「已提交」，展開的步驟條卻已經走到「揀貨中」，同一張訂單兩個說法
const getStatusConfig = (status: string) => orderStatusConfig(status);

const getTopupStatusConfig = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'paid' || s === 'success') {
    return { label: '交易成功', color: 'text-accent-emerald', bg: 'bg-accent-emerald/10', border: 'border-accent-emerald/20' };
  }
  if (s === 'pending') {
    return { label: '待付款', color: 'text-neutral-500', bg: 'bg-neutral-100', border: 'border-neutral-200' };
  }
  if (s === 'failed') {
    return { label: '交易失敗', color: 'text-white', bg: 'bg-red-500', border: 'border-red-500' };
  }
  return { label: status, color: 'text-neutral-500', bg: 'bg-neutral-100', border: 'border-neutral-200' };
};

/*
 * Supabase（PostgREST）單次查詢預設最多回 1000 列，超過的部分**靜默截斷**——
 * 不報錯、不給提示。倉庫破千的玩家因此看到「全選 (1000)」而實際有更多
 * （老闆 2026-08-24 回報）。凡是筆數會隨玩家抽獎量成長的查詢都要走這支分頁撈到底。
 *
 * 用法：把 supabase query 建好、最後接 .range(from, to) 回傳即可。
 * 排序務必帶一個唯一鍵（id）當第二排序，否則同秒建立的資料在分頁邊界會重複或漏掉。
 */
/** 倉庫格狀每次載入的格數：三欄 × 四列，捲一下補一屏 */
const WAREHOUSE_PAGE = 12;
/** 桌機倉庫商品格一批 24 張（一排 5 張約五排），捲到底自動再放 24 */
const DESKTOP_WAREHOUSE_PAGE = 24;

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) return all;
  }
}

function ProfileContent({ cardxShell = false, tabletShell = false }: { cardxShell?: boolean; tabletShell?: boolean } = {}) {
  const { user, logout, refreshProfile, isLoading: isAuthLoading } = useAuth();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  // 設定頁「登入密碼」三態用；跟 LINE／邀請碼列共用同一趟請求與快取
  const { data: acctStatus } = useSettingsStatus();
  const toast = {
    success: (message: React.ReactNode) => showToast(message, 'success'),
    error: (message: React.ReactNode) => showToast(message, 'error'),
    info: (message: React.ReactNode) => showToast(message, 'info'),
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { flags, states: featureStates } = useFeatureFlags();
  /*
   * App 裡不可出現 C2C 入口（商城管理／交易所管理／交換管理）：
   * middleware 已把 /sell、/market、/exchange 擋成 404（Apple 5.3 合規，
   * 見 lib/nativeApp.ts），選單留著入口等於帶玩家去撞 404（老闆 2026-08-20）。
   * 用 effect 設值避免 SSR/hydration 不一致。
   */
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor?.isNativePlatform?.() === true,
    );
  }, []);
  // 儲值維護中時，餘額卡的「儲值」不換頁、改跳提示
  const rechargeState = featureStates.recharge;

  const [activeTab, setActiveTab] = useState<TabType>('warehouse');
  const [activeWarehouseTab, setActiveWarehouseTab] = useState<'all' | 'dismantled'>('all');

  const [purchaseCounts, setPurchaseCounts] = useState({ toPay: 0, toShip: 0, toReceive: 0, review: 0 });
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  
  type ProductCategoryId = 'all' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom';
  const [activeWarehouseCategory, setActiveWarehouseCategory] = useState<ProductCategoryId>('all');
  const [activeWarehouseSubCategory, setActiveWarehouseSubCategory] = useState<'all' | 'tradable' | 'small_prize' | 'preorder'>('all');

  const warehouseTabs: { id: ProductCategoryId; label: string }[] = [
    { id: 'all', label: '全部' },
    ...(flags.ichiban ? [{ id: 'ichiban' as const, label: '一番賞' }] : []),
    ...(flags.blindbox ? [{ id: 'blindbox' as const, label: '盒玩' }] : []),
    ...(flags.gacha ? [{ id: 'gacha' as const, label: '轉蛋' }] : []),
    ...(flags.card ? [{ id: 'card' as const, label: '抽卡' }] : []),
    ...(flags.custom ? [{ id: 'custom' as const, label: '自製賞' }] : []),
  ];

  const marketTabs: { id: ProductCategoryId; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'ichiban', label: '一番賞' },
    { id: 'blindbox', label: '盒玩' },
    { id: 'gacha', label: '轉蛋' },
    { id: 'card', label: '抽卡' },
    { id: 'custom', label: '自製賞' },
  ];

  /*
   * 倉庫的篩選（老闆 2026-08-24 第二版：原本是頁籤列右邊的篩選圖標下拉，
   * 改版後跟類別頁籤一起收進搜尋的推薦面板，由 chip 切換）：
   *   latest     ＝ 不篩，依取得時間新到舊（資料本來就是這個順序）
   *   major      ＝ 只看大獎品項（A賞／最後賞那類，用既有的 isMajorGrade 判斷）
   *   delivering ＝ 只看已申請配送、還沒出貨的（status = pending_delivery）
   */
  type WarehouseFilter = 'latest' | 'major' | 'delivering' | 'listed';
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseFilter>('latest');

  /*
   * 排序（老闆 2026-08-24：原本「清除」的位置改放排序圖標）。
   * 這是**排序**不是篩選 —— 篩選在搜尋的推薦面板裡，兩者不要混在同一個選單。
   */
  type WarehouseSort = 'time_desc' | 'time_asc' | 'grade' | 'same_item' | 'expiry';
  const [warehouseSort, setWarehouseSort] = useState<WarehouseSort>('time_desc');
  const [isWarehouseSortOpen, setIsWarehouseSortOpen] = useState(false);
  const WAREHOUSE_SORTS: { id: WarehouseSort; label: string; hint?: string }[] = [
    { id: 'time_desc', label: '時間 新到舊' },
    { id: 'time_asc', label: '時間 舊到新' },
    { id: 'grade', label: '賞等 高到低' },
    { id: 'same_item', label: '同款集中' },
    { id: 'expiry', label: '到期日 近到遠' },
  ];

  /*
   * 倉庫搜尋（老闆 2026-08-24，照 Pokémon GO）：類別不再是頁籤，收進「點搜尋才展開」
   * 的推薦按鈕裡。搜尋框空的時候顯示推薦面板，一開始打字就即時濾下面的格狀清單。
   */
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [isWarehouseSearchOpen, setIsWarehouseSearchOpen] = useState(false);
  /** 廠商篩選：出貨以廠商為單位，所以「我靈感文創的貨有哪些」是常見問題 */
  const [warehouseSupplier, setWarehouseSupplier] = useState<string | null>(null);
  const warehouseSearchInputRef = useRef<HTMLInputElement>(null);

  const warehouseSubTabs = [
    { id: 'all', label: '全部' },
    { id: 'tradable', label: '可上架' },
    { id: 'small_prize', label: '小賞' },
    { id: 'preorder', label: '預購' },
  ] as const;

  const [activeMarketTab, setActiveMarketTab] = useState<'listing' | 'sold_records'>('listing');
  const [activeMarketCategory, setActiveMarketCategory] = useState<ProductCategoryId>('all');
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);

  // Data States
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [dismantledItems, setDismantledItems] = useState<DismantledItem[]>([]);
  const [marketListings, setMarketListings] = useState<MarketListing[]>([]);
  const [soldItems, setSoldItems] = useState<MarketListing[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryOrder[]>([]);
  const [drawHistory, setDrawHistory] = useState<DrawHistoryItem[]>([]);
  const [topupHistory, setTopupHistory] = useState<TopupHistoryItem[]>([]);
  const [followedProducts, setFollowedProducts] = useState<FollowedProduct[]>([]);
  const [activeFollowsTab, setActiveFollowsTab] = useState<'all' | 'selling' | 'soldout'>('all');
  const [activeDeliveryTab, setActiveDeliveryTab] = useState<DeliveryTabId>('all');
  const swipeDeliveryTabs = useSwipeTabs(
    ['all', 'submitted', 'shipping', 'completed', 'cancelled'] as const,
    activeDeliveryTab,
    setActiveDeliveryTab,
  );
  const [desktopDeliverySearch, setDesktopDeliverySearch] = useState('');
  const [desktopDeliveryPage, setDesktopDeliveryPage] = useState(1);
  const [desktopDeliveryPageSize, setDesktopDeliveryPageSize] = useState(10);
  const [desktopDrawSearch, setDesktopDrawSearch] = useState('');
  const [desktopDrawPage, setDesktopDrawPage] = useState(1);
  const [desktopDrawPageSize, setDesktopDrawPageSize] = useState(10);
  const [desktopWarehouseSearch, setDesktopWarehouseSearch] = useState('');
  const [desktopWarehousePage, setDesktopWarehousePage] = useState(1);
  const [desktopWarehousePageSize, setDesktopWarehousePageSize] = useState(10);
  const [desktopDismantledSearch, setDesktopDismantledSearch] = useState('');
  const [desktopDismantledPage, setDesktopDismantledPage] = useState(1);
  const [desktopDismantledPageSize, setDesktopDismantledPageSize] = useState(10);
  const [desktopMarketSearch, setDesktopMarketSearch] = useState('');
  const [desktopMarketPage, setDesktopMarketPage] = useState(1);
  const [desktopMarketPageSize, setDesktopMarketPageSize] = useState(10);
  const [desktopMarketSoldSearch, setDesktopMarketSoldSearch] = useState('');
  const [desktopMarketSoldPage, setDesktopMarketSoldPage] = useState(1);
  const [desktopMarketSoldPageSize, setDesktopMarketSoldPageSize] = useState(10);
  const [desktopTopupSearch, setDesktopTopupSearch] = useState('');
  const [desktopTopupPage, setDesktopTopupPage] = useState(1);
  const [desktopTopupPageSize, setDesktopTopupPageSize] = useState(10);
  const [desktopFollowsSearch, setDesktopFollowsSearch] = useState('');
  const [desktopFollowsPage, setDesktopFollowsPage] = useState(1);
  const [desktopFollowsPageSize, setDesktopFollowsPageSize] = useState(10);
  const [desktopCouponsSearch, setDesktopCouponsSearch] = useState('');
  const [desktopCouponsStatus, setDesktopCouponsStatus] = useState<'all' | 'unused' | 'used' | 'expired'>('all');
  const [desktopCouponsPage, setDesktopCouponsPage] = useState(1);
  const [desktopCouponsPageSize, setDesktopCouponsPageSize] = useState(10);
  const [activeSoldTimeTab, setActiveSoldTimeTab] = useState<'today' | '7days' | '30days'>('today');
  // 手機版儲值紀錄不再有日期 tab，固定顯示近 30 天（老闆 2026-08-20）；
  // 桌機版仍有下拉可切，預設同樣近 30 天
  const [activeTopupTimeTab, setActiveTopupTimeTab] = useState<'today' | '7days' | '30days'>('30days');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [isRedeemingCoupon, setIsRedeemingCoupon] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  // 廣播給全域底部導航（globals.css 靠這個屬性藏它）：分頁視圖與 URL 可能不同步
  //（重設密碼回跳那類旁門是 state-only），所以不能只靠 ?tab= 判斷
  useEffect(() => {
    if (isMobileDetailOpen) document.body.dataset.profileDetail = '1';
    else delete document.body.dataset.profileDetail;
    return () => { delete document.body.dataset.profileDetail; };
  }, [isMobileDetailOpen]);

  /* 動態島文字：手機端主畫面的頂部是橘紅色動態背景（.profile-bubbles，fixed 且
     pointer-events-none），要白字；點進倉庫／出貨那些詳細分頁後頂部換成白色
     sticky 標題列，就要黑字。判斷寫在這裡而不是量測，是因為那層橘底
     pointer-events-none，任何靠命中測試的量測都看不到它。 */
  // 會員中心主畫面是紅底（profile-bubbles），開子分頁（倉庫等）就回白
  useStatusBarText(isMobileDetailOpen ? 'black' : 'white', isMobileDetailOpen ? undefined : '#EE4D2D');

  // UI States
  const [selectedForDelivery, setSelectedForDelivery] = useState<string[]>([]);
  const [selectedMarketItems, setSelectedMarketItems] = useState<string[]>([]);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showDismantleModal, setShowDismantleModal] = useState(false);
  const [dismantleSummary, setDismantleSummary] = useState<{
    count: number;
    totalValue: number;
    /** 這批裡的大賞（SP／S／A／B／C／最後賞）。有的話回收前要先讓玩家看清楚 */
    majors: { name: string; grade: string }[];
  }>({ count: 0, totalValue: 0, majors: [] });
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedDrawId, setExpandedDrawId] = useState<string | null>(null);
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);
  const [isSubmittingDismantle, setIsSubmittingDismantle] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Market Sell Modal State
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellingItem, setSellingItem] = useState<WarehouseItem | null>(null);
  const [viewingItem, setViewingItem] = useState<WarehouseItem | null>(null);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [isSubmittingSell, setIsSubmittingSell] = useState(false);

  // Logistics State
  const [logisticsType, setLogisticsType] = useState<'HOME' | 'CVS'>('HOME');
  const [logisticsSubType, setLogisticsSubType] = useState<'UNIMART' | 'FAMI' | 'HILIFE' | 'OKMART'>('UNIMART');
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [pendingCvsToken, setPendingCvsToken] = useState<string | null>(null);
  /* 這一趟選店要寫回哪裡：配送彈窗（delivery）或個資的常用門市（settings）。
     兩者共用同一支輪詢，寫錯地方玩家會看到「選了門市但沒填進去」 */
  const [cvsTarget, setCvsTarget] = useState<'delivery' | 'settings'>('delivery');
  const cvsPollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Shipping fee settings (from platform_settings)
  const [shippingFeeHome, setShippingFeeHome] = useState(60);
  const [shippingFeeCvs, setShippingFeeCvs] = useState(60);
  const [shippingFeeCvs711, setShippingFeeCvs711] = useState(65);
  const [shippingFeeCvsFamily, setShippingFeeCvsFamily] = useState(65);
  const [shippingFeeCvsHilife, setShippingFeeCvsHilife] = useState(60);
  const [shippingFeeCvsOk, setShippingFeeCvsOk] = useState(60);
  const [shippingFeeHomeLarge, setShippingFeeHomeLarge] = useState(120);
  const [freeThresholdCvs, setFreeThresholdCvs] = useState(7);
  const [freeThresholdHome, setFreeThresholdHome] = useState(15);

  /*
   * 伺服器擋下 FEE_MISMATCH 時回報的正確運費。有值就蓋過前台自己算的，
   * 讓玩家「再按一次」就能出貨，而不是卡在一個永遠算不對的數字上。
   * 任何會影響計價的輸入一變（勾選、物流方式、超商品牌）就清掉，
   * 免得沿用到已經不適用的舊報價。
   */
  const [serverShippingFee, setServerShippingFee] = useState<number | null>(null);
  /* 配送結帳（商城複製版 2026-09-02）：備註＋運費優惠券 */
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryCouponId, setDeliveryCouponId] = useState<string | null>(null);
  const [shippingCoupons, setShippingCoupons] = useState<ShippingCoupon[]>([]);

  // Auto-scroll refs
  const warehouseSubTabsRef = useRef<HTMLDivElement>(null);
  const [mobileWarehouseDisplayCount, setMobileWarehouseDisplayCount] = useState(WAREHOUSE_PAGE);
  const mobileWarehouseSentinelRef = useRef<HTMLDivElement>(null);
  /* 桌機倉庫：捲到底自動載入（老闆 2026-09-05：不要分頁）。用 callback ref 掛 IntersectionObserver，
     哨兵是條件渲染的，用一般 ref＋effect 會抓不到它出現的時機 */
  const [desktopWarehouseDisplayCount, setDesktopWarehouseDisplayCount] = useState(DESKTOP_WAREHOUSE_PAGE);
  const desktopWarehouseIoRef = useRef<IntersectionObserver | null>(null);
  const desktopWarehouseSentinel = React.useCallback((node: HTMLDivElement | null) => {
    desktopWarehouseIoRef.current?.disconnect();
    desktopWarehouseIoRef.current = null;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setDesktopWarehouseDisplayCount((prev) => prev + DESKTOP_WAREHOUSE_PAGE);
      }
    }, { rootMargin: '600px 0px' });
    io.observe(node);
    desktopWarehouseIoRef.current = io;
  }, []);
  const mobileWarehouseScrollRef = useRef<HTMLDivElement>(null);
  // 倉庫下滑收起底部「全選」bar（同首頁）。分頁已改由 window 捲動，直接用預設模式
  const warehouseBarHiddenRaw = useHideOnScroll({
    enabled: activeTab === 'warehouse',
    topThreshold: 40,
  });
  // 有勾選品項＝正在操作，bar 強制展開不收（老闆 2026-09-02）
  const warehouseBarHidden = warehouseBarHiddenRaw && selectedForDelivery.length === 0;
  const [mobileDeliveryDisplayCount, setMobileDeliveryDisplayCount] = useState(10);
  const mobileDeliveryScrollRef = useRef<HTMLDivElement>(null);
  const [mobileDrawDisplayCount, setMobileDrawDisplayCount] = useState(10);
  const mobileDrawScrollRef = useRef<HTMLDivElement>(null);
  const followsScrollRef = useRef<HTMLDivElement>(null);
  /** 還原中要接回去的抽獎紀錄筆數（下面那個「換頁籤收回第一頁」的 effect 掛載時也會跑） */
  const drawRestoreRef = useRef(0);

  // 從商品頁／公平性驗證頁返回：把清單捲回原本看到的位置
  useLayoutEffect(() => {
    const stops: (() => void)[] = [];
    const follows = followsView.read(true);
    if (follows?.y) stops.push(restoreScrollTo(follows.y, 3000));
    const draws = drawView.read(true);
    if (draws?.y) {
      // 筆數要一起接回去，不然清單只剩第一頁那麼高，位置會被夾在那個高度的底部
      if (draws.count && draws.count > 10) {
        drawRestoreRef.current = draws.count;
        setMobileDrawDisplayCount(draws.count);
      }
      stops.push(restoreScrollTo(draws.y, 3000));
    }
    return () => stops.forEach(stop => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
   * 選取中的獎品分屬哪幾家廠商。一張配送訂單只能有一家（migration 612 起 RPC 也會擋），
   * 所以跨廠商的選取只能回收 —— 不擋你選，只是把「這批能做什麼」寫在按鈕上。
   */

  useEffect(() => {
    if (warehouseSubTabsRef.current) {
      const activeTabElement = warehouseSubTabsRef.current.querySelector(`[data-tab-id="${activeWarehouseSubCategory}"]`);
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeWarehouseSubCategory]);

  // Forms
  const [settingsForm, setSettingsForm] = useState({
    nickname: '',
    avatarUrl: '',
    password: '',
    recipientName: '',
    recipientPhone: '',
    recipientAddress: '',
    gender: '',
    birthday: '',
    cvsStoreId: '',
    cvsStoreName: '',
    cvsStoreBranch: '',
    cvsStoreAddress: '',
    cvsRecipientName: '',
    cvsRecipientPhone: ''
  });

  const [showEditGender, setShowEditGender] = useState(false);
  const [showEditBirthday, setShowEditBirthday] = useState(false);
  const [showEditCvs, setShowEditCvs] = useState(false);
  const [addressTab, setAddressTab] = useState<'HOME' | 'CVS'>('HOME');
  // Check if device is mobile
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = typeof window.navigator === "undefined" ? "" : navigator.userAgent;
      const mobile = Boolean(userAgent.match(/Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i));
      setIsMobile(mobile);
    };
    checkMobile();
  }, []);

  useEffect(() => {
    if (activeWarehouseTab === 'dismantled') {
      setActiveWarehouseCategory('all');
      setActiveWarehouseSubCategory('all');
    }
  }, [activeWarehouseTab]);

  const [tempGender, setTempGender] = useState('');
  const [tempBirthday, setTempBirthday] = useState<Date | null>(null);

  const [isPhoneBindModalOpen, setIsPhoneBindModalOpen] = useState(false);
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);

  const normalizePhoneE164 = (raw: string) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('+')) return trimmed.replace(/\s/g, '');
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('886')) return `+${digits}`;
    if (digits.length === 10 && digits.startsWith('0')) return `+886${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith('9')) return `+886${digits}`;
    return `+${digits}`;
  };

  const formatPhoneForDisplay = (e164: string) => {
    const v = (e164 || '').trim();
    if (!v) return '';
    if (v.startsWith('+886')) return `0${v.slice(4)}`;
    return v;
  };

  const maskPhoneForDisplay = (raw: string) => {
    const v = formatPhoneForDisplay(raw);
    if (!v) return '';
    if (v.length <= 6) return v;
    return `${v.slice(0, 4)}****${v.slice(-3)}`;
  };

  // Avatar Upload + Crop
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);

  /*
   * 頭像改成彈窗選（老闆 2026-08-29）
   *
   * 原本點「頭像」那一列直接開檔案選擇器 —— 玩家只有「上傳自己的圖」一條路，
   * 站上那八款預設頭像根本沒有入口，只有註冊時隨機配到。
   * 改成先開彈窗（沿用「設定性別」那個 Modal），一排五個：
   * 第一格是上傳（虛線框＋灰底＋加號），其餘是預設頭像，全部圓形。
   *
   * 上傳那條路不變：加號 → 原生選圖／相機 → 既有的裁切器 → 上傳 R2 → 存檔。
   * 開裁切器時要把彈窗關掉，兩層蓋在一起會看不到裁切畫面。
   */
  /** 30 款（原 8 款，老闆 2026-08-29 補到 30）。改數字要同步 scripts/brand_sync.mjs 與 handle_new_user() */
  const DEFAULT_AVATARS = Array.from({ length: 30 }, (_, i) => `/images/avatar/${String(i + 1).padStart(2, '0')}.webp`);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);

  const openAvatarPicker = () => {
    setTempAvatar(null);
    setShowAvatarPicker(true);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  /** 選預設頭像後存檔（自訂上傳走 handleCropConfirm，那條已經自己存了） */
  const handleSaveDefaultAvatar = async () => {
    if (!tempAvatar) return;
    setIsUploadingAvatar(true);
    try {
      await supabase.auth.updateUser({ data: { avatar_url: tempAvatar } });
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.from('users').update({ avatar_url: tempAvatar }).eq('id', authUser.id);
      }
      toast.success('頭像更新成功');
      setShowAvatarPicker(false);
      setTempAvatar(null);
      await refreshProfile();
    } catch (error) {
      console.error('Avatar update error:', error);
      toast.error('頭像更新失敗');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Step 1: 選完圖片後 → 開 cropper
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setShowAvatarPicker(false);   // 裁切器要蓋在最上層，彈窗留著會擋住
    const reader = new FileReader();
    reader.onload = ev => { if (ev.target?.result) setCropperSrc(ev.target.result as string); };
    reader.readAsDataURL(file);
  };

  // Step 2: 裁切完成後 → 上傳到後台 R2
  const handleCropConfirm = async (blob: Blob) => {
    setCropperSrc(null);
    setIsUploadingAvatar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('請先登入');

      const form = new FormData();
      form.append('file', blob, 'avatar.webp');
      const res = await fetch('https://admin.ggb.com.tw/api/upload/user-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error || '上傳失敗');
      const { publicUrl } = await res.json();

      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', authUser.id);
      }

      toast.success('頭像更新成功');
      await refreshProfile();
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast.error('頭像上傳失敗');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const filteredWarehouseItems = React.useMemo(() => {
    let items = warehouseItems;
    
    // 1. Filter by Primary Category
    if (activeWarehouseCategory !== 'all') {
      items = items.filter(item => item.type === activeWarehouseCategory);
    }

    // 2. Filter by Sub Category (Grade)
    if (activeWarehouseSubCategory === 'preorder') {
      items = items.filter(item => !!item.isPreorder);
    } else if (activeWarehouseSubCategory === 'tradable') {
      items = items.filter(item => isMajorGrade(item.grade));
    } else if (activeWarehouseSubCategory === 'small_prize') {
      items = items.filter(item => !isMajorGrade(item.grade));
    }

    // 3. 篩選圖標（老闆 2026-08-24）：時間＝預設順序、大賞＝只看大獎、配送中＝只看已申請的
    if (warehouseFilter === 'major') {
      items = items.filter(item => isMajorGrade(item.grade));
    } else if (warehouseFilter === 'delivering') {
      items = items.filter(item => item.status === 'pending_delivery');
    } else if (warehouseFilter === 'listed') {
      items = items.filter(item => item.status === 'listing');
    }

    // 4. 廠商
    if (warehouseSupplier) {
      items = items.filter(item => item.supplierName === warehouseSupplier);
    }

    // 5. 關鍵字：品名／系列／賞等／廠商都比對，玩家不必先知道我們怎麼分欄位
    const q = warehouseSearch.trim().toLowerCase();
    if (q) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(q)
        || item.series.toLowerCase().includes(q)
        || item.grade.toLowerCase().includes(q)
        || (item.supplierName ?? '').toLowerCase().includes(q),
      );
    }

    return items;
  }, [warehouseItems, activeWarehouseCategory, activeWarehouseSubCategory, warehouseFilter, warehouseSupplier, warehouseSearch]);

  const sortedWarehouseItems = React.useMemo(() => {
    /*
     * 排序（老闆 2026-08-24）。基準排完之後，下面兩件事一定要在最外層再蓋一次：
     * 鎖定廠商往前、待配送沉底 —— 那是操作性的排序，不該被使用者選的排序推翻。
     *
     * 資料本來就是「取得時間新到舊」，所以 time_desc 不用動。
     */
    let items = filteredWarehouseItems;
    if (warehouseSort !== 'time_desc') {
      const byId = (a: WarehouseItem, b: WarehouseItem) => Number(b.id) - Number(a.id);
      items = [...items].sort((a, b) => {
        switch (warehouseSort) {
          case 'time_asc':
            return Number(a.id) - Number(b.id);
          case 'grade': {
            const d = gradeRank(a.grade) - gradeRank(b.grade);
            return d !== 0 ? d : byId(a, b);
          }
          case 'same_item': {
            // 同款集中：同一個品項的全部排在一起（不合併成一格，只是排在一起，
            // 「留一張、其餘回收」才好操作）。同款之內再依系列與時間
            const ka = `${a.series}\u0000${a.prizeId ?? a.name}`;
            const kb = `${b.series}\u0000${b.prizeId ?? b.name}`;
            return ka === kb ? byId(a, b) : ka.localeCompare(kb, 'zh-Hant');
          }
          case 'expiry': {
            // 沒有到期日的（一般商品）沉到最後，不要卡在有期限的中間
            const ta = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
            const tb = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
            return ta === tb ? byId(a, b) : ta - tb;
          }
          default:
            return 0;
        }
      });
    }

    // 待配送／上架中的沉到最後（不能再操作）—— 但對應篩選下整批都是同狀態，不用再沉
    if (warehouseFilter === 'delivering' || warehouseFilter === 'listed') return items;
    const lockedStatus = (s: string) => s === 'pending_delivery' || s === 'listing';
    const active = items.filter(i => !lockedStatus(i.status));
    const pending = items.filter(i => lockedStatus(i.status));
    return [...active, ...pending];
  }, [filteredWarehouseItems, warehouseFilter, warehouseSort]);

  const selectedForDeliverySet = React.useMemo(
    () => new Set(selectedForDelivery),
    [selectedForDelivery],
  );

  /*
   * 推薦按鈕的內容與數量。數量一律對「整個倉庫」算（不受其他篩選影響）——
   * PoGO 也是絕對數字。互相牽動的話，玩家點掉一個類別之後其他數字全變，
   * 反而看不出自己到底有什麼。
   */
  // warehouseTabs 每次 render 都是新陣列，memo 相依只能追它的內容
  const warehouseTabIds = warehouseTabs.map(t => t.id).join();
  const warehouseChipGroups = React.useMemo(() => {
    const all = warehouseItems;
    const countBy = (fn: (i: WarehouseItem) => boolean) => all.filter(fn).length;

    const categoryChips = warehouseTabs.map(tab => ({
      key: `cat:${tab.id}`,
      label: tab.label,
      count: tab.id === 'all' ? all.length : countBy(i => i.type === tab.id),
      active: activeWarehouseCategory === tab.id,
      onSelect: () => {
        setActiveWarehouseCategory(tab.id);
        setIsWarehouseSearchOpen(false);
      },
    }));

    const gradeChips = [
      {
        key: 'grade:major',
        label: '大賞',
        count: countBy(i => isMajorGrade(i.grade)),
        active: warehouseFilter === 'major',
        onSelect: () => {
          setWarehouseFilter(warehouseFilter === 'major' ? 'latest' : 'major');
          setIsWarehouseSearchOpen(false);
        },
      },
      {
        key: 'grade:small',
        label: '小賞',
        count: countBy(i => !isMajorGrade(i.grade)),
        active: activeWarehouseSubCategory === 'small_prize',
        onSelect: () => {
          setActiveWarehouseSubCategory(activeWarehouseSubCategory === 'small_prize' ? 'all' : 'small_prize');
          setIsWarehouseSearchOpen(false);
        },
      },
    ];

    // 狀態獨立一組（老闆 2026-09-02：「賞等與狀態應該要區分開來」）
    const stateChips = [
      {
        key: 'state:delivering',
        label: '出貨中',
        count: countBy(i => i.status === 'pending_delivery'),
        active: warehouseFilter === 'delivering',
        onSelect: () => {
          setWarehouseFilter(warehouseFilter === 'delivering' ? 'latest' : 'delivering');
          setIsWarehouseSearchOpen(false);
        },
      },
      {
        key: 'state:listed',
        label: '上架中',
        count: countBy(i => i.status === 'listing'),
        active: warehouseFilter === 'listed',
        onSelect: () => {
          setWarehouseFilter(warehouseFilter === 'listed' ? 'latest' : 'listed');
          setIsWarehouseSearchOpen(false);
        },
      },
    ];

    // 廠商是資料裡有什麼就列什麼，不寫死 —— 廠商會增加
    const supplierNames = Array.from(new Set(all.map(i => i.supplierName).filter((n): n is string => !!n)));
    const supplierChips = supplierNames.map(supplierName => ({
      key: `sup:${supplierName}`,
      label: supplierName,
      count: countBy(i => i.supplierName === supplierName),
      active: warehouseSupplier === supplierName,
      onSelect: () => {
        setWarehouseSupplier(warehouseSupplier === supplierName ? null : supplierName);
        setIsWarehouseSearchOpen(false);
      },
    }));

    const groups = [
      { title: '類別', chips: categoryChips },
      { title: '賞等', chips: gradeChips },
      { title: '狀態', chips: stateChips },
    ];
    if (supplierChips.length > 1) groups.push({ title: '廠商', chips: supplierChips });
    return groups;
  // warehouseTabs 每次 render 都是新陣列，放進相依會讓 memo 每次都失效，改追它的內容
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    warehouseItems, activeWarehouseCategory, activeWarehouseSubCategory,
    warehouseFilter, warehouseSupplier, warehouseTabIds,
  ]);

  /** 倉庫裡件數最多的幾個系列，當成現成的關鍵字（省得玩家自己想要打什麼） */
  const warehouseTopSeries = React.useMemo(() => {
    const tally = new Map<string, number>();
    for (const item of warehouseItems) {
      if (!item.series || item.series === '未知系列') continue;
      tally.set(item.series, (tally.get(item.series) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([seriesName]) => seriesName);
  }, [warehouseItems]);

  /** 搜尋膠囊上顯示什麼：有關鍵字就顯示關鍵字，否則列出正在套用的篩選 */
  const warehouseActiveFilterLabels = React.useMemo(() => {
    const labels: string[] = [];
    if (activeWarehouseCategory !== 'all') {
      labels.push(warehouseTabs.find(t => t.id === activeWarehouseCategory)?.label ?? '');
    }
    if (warehouseFilter === 'major') labels.push('大賞');
    if (warehouseFilter === 'delivering') labels.push('出貨中');
    if (warehouseFilter === 'listed') labels.push('上架中');
    if (activeWarehouseSubCategory === 'small_prize') labels.push('小賞');
    if (activeWarehouseSubCategory === 'tradable') labels.push('可上架');
    if (activeWarehouseSubCategory === 'preorder') labels.push('預購');
    if (warehouseSupplier) labels.push(warehouseSupplier);
    return labels.filter(Boolean);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWarehouseCategory, activeWarehouseSubCategory, warehouseFilter, warehouseSupplier]);

  const clearWarehouseFilters = () => {
    setWarehouseSearch('');
    setActiveWarehouseCategory('all');
    setActiveWarehouseSubCategory('all');
    setWarehouseFilter('latest');
    setWarehouseSupplier(null);
  };

  /*
   * 全選 ＝ 選滿「目前清單上看得到的」，不預設任何廠商（老闆 2026-08-24）。
   *
   * 舊版會自動挑第一件的廠商並鎖住，畫面上就變成「全選 靈感文創 (12)」——
   * 玩家沒設任何條件卻被塞了一個他沒選的廠商。現在廠商只有一個來源：
   * 搜尋面板裡的廠商 chip。清單被它濾過了，全選自然就只會選到那一家。
   * 沒設 chip 時全選就是整個倉庫，那種跨廠商的選取只能回收。
   */
  const selectAllTarget = React.useMemo(() => {
    const ids = filteredWarehouseItems
      .filter(i => i.status !== 'pending_delivery' && i.status !== 'listing')
      .map(i => i.id);
    return { ids };
  }, [filteredWarehouseItems]);

  /** 選取中的獎品共跨了幾家廠商 —— 超過一家就不能配送，只能回收 */
  const selectedSupplierNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const item of warehouseItems) {
      if (selectedForDeliverySet.has(item.id)) names.add(item.supplierName ?? '未知廠商');
    }
    return Array.from(names);
  }, [warehouseItems, selectedForDeliverySet]);

  const canDeliverSelection = selectedSupplierNames.length === 1;

  // 抽籤販售的價金：與運費分開算、分開顯示。
  // 這只是給玩家看的，實際扣款由 create_delivery_order 用
  // lottery_purchase_total() 自己重算，前端算錯也不會被少收。
  const lotteryPurchaseTotal = React.useMemo(() => {
    return warehouseItems
      .filter(i => selectedForDelivery.includes(i.id))
      .reduce((sum, i) => sum + (i.salePrice ?? 0), 0);
  }, [warehouseItems, selectedForDelivery]);

  const hasLargePackage = React.useMemo(() => {
    return warehouseItems
      .filter(i => selectedForDelivery.includes(i.id))
      .some(i => (i.type === 'ichiban' || i.type === 'custom') && (i.prizeTotal ?? 999) <= 3);
  }, [warehouseItems, selectedForDelivery]);

  // 結帳彈窗「配送商品」展開列表用（同名同賞等在元件內合併 ×N）
  const deliveryItems = React.useMemo(() => {
    return warehouseItems
      .filter(i => selectedForDelivery.includes(i.id))
      .map(i => ({ name: i.name, image: i.image, grade: i.grade }));
  }, [warehouseItems, selectedForDelivery]);

  React.useEffect(() => {
    if (hasLargePackage) setLogisticsType('HOME');
  }, [hasLargePackage]);

  // 必須與 DB 的 calc_delivery_fee() 完全一致 —— 兩邊算出來不同時，
  // create_delivery_order 會以 FEE_MISMATCH 擋下整筆出貨
  const localShippingFee = React.useMemo(() => {
    // 含大件不適用免運，且走大件價（真實宅配成本遠高於一般件）
    if (hasLargePackage) return shippingFeeHomeLarge;

    const threshold = logisticsType === 'CVS' ? freeThresholdCvs : freeThresholdHome;
    if (selectedForDelivery.length >= threshold) return 0;

    if (logisticsType === 'CVS') {
      switch (logisticsSubType) {
        case 'UNIMART': return shippingFeeCvs711;
        case 'FAMI':    return shippingFeeCvsFamily;
        case 'HILIFE':  return shippingFeeCvsHilife;
        case 'OKMART':  return shippingFeeCvsOk;
        default:        return shippingFeeCvs;
      }
    }
    return shippingFeeHome;
  }, [selectedForDelivery.length, hasLargePackage, shippingFeeHomeLarge, freeThresholdCvs, freeThresholdHome,
      logisticsType, logisticsSubType, shippingFeeHome, shippingFeeCvs, shippingFeeCvs711,
      shippingFeeCvsFamily, shippingFeeCvsHilife, shippingFeeCvsOk]);

  React.useEffect(() => {
    setServerShippingFee(null);
  }, [selectedForDelivery, logisticsType, logisticsSubType]);

  const currentShippingFee = serverShippingFee ?? localShippingFee;

  // 配送彈窗打開時載入可用的運費優惠券（scope=shipping，見 migration 681）
  React.useEffect(() => {
    if (!showDeliveryModal || !user) { return; }
    let dead = false;
    supabase.from('user_coupons')
      .select('id, expiry_date, coupons(title, discount_value, scope, is_active)')
      .eq('user_id', user.id).eq('status', 'unused')
      .then(({ data }) => {
        if (dead) return;
        const rows = (data ?? []).filter((r: any) =>
          r.coupons?.scope === 'shipping' && r.coupons?.is_active
          && (!r.expiry_date || new Date(r.expiry_date) >= new Date()));
        setShippingCoupons(rows.map((r: any) => ({
          id: String(r.id),
          title: String(r.coupons.title || '運費折抵券'),
          discountValue: Number(r.coupons.discount_value) || 0,
          expiryDate: r.expiry_date ?? null,
        })));
      });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeliveryModal, user?.id]);

  const shippingDiscount = React.useMemo(() => {
    const c = shippingCoupons.find(x => x.id === deliveryCouponId);
    return c ? Math.min(c.discountValue, currentShippingFee) : 0;
  }, [shippingCoupons, deliveryCouponId, currentShippingFee]);

  /*
   * 「再加 N 件可免運」用的門檻。原本寫的是舊的單一門檻 freeShippingThreshold（7），
   * 但實際計價走的是分物流門檻（宅配 15、超商 7）—— 玩家在第 6 件看到「再加 1 件可免運」，
   * 加到第 7 件卻照收 60。含大件時不適用免運，回 null 讓提示整行不出現。
   */
  const effectiveFreeThreshold = React.useMemo(() => {
    if (hasLargePackage) return null;
    const t = logisticsType === 'CVS' ? freeThresholdCvs : freeThresholdHome;
    return Number.isFinite(t) ? t : null;
  }, [hasLargePackage, logisticsType, freeThresholdCvs, freeThresholdHome]);


  const filteredDismantledItems = React.useMemo(() => {
    let items = dismantledItems;

    // 固定只看近 30 天（老闆 2026-08-24：今天／近7天／近30天三個頁籤拿掉）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    items = items.filter(item => item.raw_dismantled_at && item.raw_dismantled_at >= thirtyDaysAgo);

    // 1. Filter by Primary Category
    if (activeWarehouseCategory !== 'all') {
      items = items.filter(item => item.type === activeWarehouseCategory);
    }

    // 2. Filter by Sub Category (Grade)
    if (activeWarehouseSubCategory === 'tradable') {
      items = items.filter(item => isMajorGrade(item.grade));
    } else if (activeWarehouseSubCategory === 'small_prize') {
      items = items.filter(item => !isMajorGrade(item.grade));
    }
    
    return items;
  }, [dismantledItems, activeWarehouseCategory, activeWarehouseSubCategory]);

  const filteredSoldItems = React.useMemo(() => {
    let items = soldItems;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (activeSoldTimeTab === 'today') {
      items = items.filter(item => item.raw_updated_at && item.raw_updated_at >= startOfToday);
    } else if (activeSoldTimeTab === '7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      items = items.filter(item => item.raw_updated_at && item.raw_updated_at >= sevenDaysAgo);
    } else if (activeSoldTimeTab === '30days') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      items = items.filter(item => item.raw_updated_at && item.raw_updated_at >= thirtyDaysAgo);
    }
    return items;
  }, [soldItems, activeSoldTimeTab]);

  const filteredMarketListings = React.useMemo(() => {
    let items = marketListings;
    if (activeMarketCategory !== 'all') {
      items = items.filter(item => item.product.type === activeMarketCategory);
    }
    return items;
  }, [marketListings, activeMarketCategory]);

  const filteredDeliveryHistory = React.useMemo(() => {
    if (activeDeliveryTab === 'all') return deliveryHistory;
    
    return deliveryHistory.filter(order => matchesDeliveryTab(activeDeliveryTab, order.status));
  }, [deliveryHistory, activeDeliveryTab]);

  /*
   * 手機分頁 2026-09-02 全面改由 window 捲動（Safari 網址列會收、點狀態列回頂、
   * 手感與首頁一致）。無限載入從各容器的 onScroll 收編成這一個 window 監聽。
   */
  useEffect(() => {
    if (!['warehouse', 'delivery', 'draw-history'].includes(activeTab)) return;
    const onScroll = () => {
      const doc = document.documentElement;
      if (doc.scrollHeight - window.scrollY - window.innerHeight > 300) return;
      if (activeTab === 'warehouse') {
        setMobileWarehouseDisplayCount(prev => Math.min(prev + WAREHOUSE_PAGE, sortedWarehouseItems.length));
      } else if (activeTab === 'delivery') {
        setMobileDeliveryDisplayCount(prev => (prev < filteredDeliveryHistory.length ? prev + 10 : prev));
      } else {
        setMobileDrawDisplayCount(prev => (prev < drawHistory.length ? prev + 10 : prev));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeTab, sortedWarehouseItems.length, filteredDeliveryHistory.length, drawHistory.length]);

  // 切分頁回到頂：原本每個覆蓋層自帶 scrollTop 0，改 window 捲動後自己歸位
  useEffect(() => { window.scrollTo(0, 0); }, [activeTab]);

  useEffect(() => {
    const cleanup = trackPageView('/profile');
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDesktopDeliveryPage(1);
  }, [activeDeliveryTab, desktopDeliverySearch]);

  useEffect(() => {
    setDesktopDrawPage(1);
  }, [desktopDrawSearch]);

  useEffect(() => {
    setDesktopWarehousePage(1);
  }, [activeWarehouseTab, activeWarehouseCategory, activeWarehouseSubCategory, desktopWarehouseSearch]);

  useEffect(() => {
    setDesktopDismantledPage(1);
  }, [desktopDismantledSearch, activeWarehouseCategory, activeWarehouseSubCategory]);

  useEffect(() => {
    setDesktopMarketPage(1);
  }, [activeMarketTab, activeMarketCategory, desktopMarketSearch]);

  useEffect(() => {
    setDesktopMarketSoldPage(1);
  }, [activeMarketTab, activeSoldTimeTab, desktopMarketSoldSearch]);

  useEffect(() => {
    setDesktopTopupPage(1);
  }, [activeTopupTimeTab, desktopTopupSearch]);

  useEffect(() => {
    setDesktopFollowsPage(1);
  }, [activeFollowsTab, desktopFollowsSearch]);

  useEffect(() => {
    setDesktopCouponsPage(1);
  }, [desktopCouponsSearch, desktopCouponsStatus]);

  const filteredTopupHistory = React.useMemo(() => {
    let items = topupHistory;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (activeTopupTimeTab === 'today') {
      items = items.filter(item => {
        const d = new Date(item.created_at);
        return d >= startOfToday;
      });
    } else if (activeTopupTimeTab === '7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      items = items.filter(item => {
        const d = new Date(item.created_at);
        return d >= sevenDaysAgo;
      });
    } else if (activeTopupTimeTab === '30days') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      items = items.filter(item => {
        const d = new Date(item.created_at);
        return d >= thirtyDaysAgo;
      });
    }
    return items;
  }, [topupHistory, activeTopupTimeTab]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setIsMobileDetailOpen(true);
    // 手機驗證是蓋在設定頁上的全屏層。沒在這裡關掉的話，上次開著就離開設定頁，
    // 下次按設定圖標會直接彈回驗證畫面 —— 看起來像設定圖標跳去了手機驗證
    setIsPhoneBindModalOpen(false);
    router.push(`/profile?tab=${tab}`, { scroll: false });
    trackEvent('tab_switch', { path: '/profile', meta: { to_tab: tab } });

    // Reset warehouse state when entering warehouse tab
    if (tab === 'warehouse') {
      setActiveWarehouseTab('all');
      setActiveWarehouseCategory('all');
      setActiveWarehouseSubCategory('all');
    }

    // 查看抽獎紀錄時追蹤任務
    if (tab === 'draw-history') {
      void supabase.rpc('track_mission_event', { p_event_type: 'view_winning_records' });
    }
  };

  // LINE 綁定完成轉址回來（/auth/line/callback）：toast＋清參數。
  // bonus 是 LINE 綁定禮（migration 505/506），有才顯示金額
  useEffect(() => {
    if (!searchParams || searchParams.get('line') !== 'bound') return;
    const bonus = Number(searchParams.get('bonus') || 0);
    toast.success(bonus > 0 ? `LINE 綁定成功，已入帳 ${bonus} 積分` : 'LINE 綁定成功');
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('line');
    newUrl.searchParams.delete('bonus');
    window.history.replaceState({}, '', newUrl.toString());
  }, [searchParams]);

  // Sync with URL on load
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (
      tab &&
      [
        'warehouse',
        ...(flags.market ? (['market'] as const) : []),
        'delivery',
        'draw-history',
        'topup-history',
        'follows',
        'coupons',
        'settings',
      ].includes(tab as any)
    ) {
      setActiveTab(tab as TabType);
      setIsMobileDetailOpen(true);

      // Reset warehouse state if navigating to warehouse tab
      if (tab === 'warehouse') {
        setActiveWarehouseTab('all');
        setActiveWarehouseCategory('all');
        setActiveWarehouseSubCategory('all');
      }
    } else {
      setIsMobileDetailOpen(false);
    }
  }, [flags.market, searchParams]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id || !flags.sell) {
        if (!cancelled) setPurchaseCounts({ toPay: 0, toShip: 0, toReceive: 0, review: 0 });
        return;
      }
      try {
        const { data, error } = await supabase
          .from('sell_orders')
          .select('id, step, cancelled')
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const base = rows.filter((r: any) => !r?.cancelled);
        const toPay = base.filter((r: any) => Number(r?.step || 0) === 1).length;
        const toShip = base.filter((r: any) => {
          const s = Number(r?.step || 0);
          return s === 2 || s === 3;
        }).length;
        const toReceive = base.filter((r: any) => Number(r?.step || 0) === 4).length;
        const review = base.filter((r: any) => Number(r?.step || 0) >= 5).length;
        if (!cancelled) setPurchaseCounts({ toPay, toShip, toReceive, review });
      } catch {
        if (!cancelled) setPurchaseCounts({ toPay: 0, toShip: 0, toReceive: 0, review: 0 });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [flags.sell, supabase, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) {
        if (!cancelled) setUnreadMessageCount(0);
        return;
      }
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
          .in('type', ['exchange_message', 'sell_message']);
        if (error) throw error;
        if (!cancelled) setUnreadMessageCount(count || 0);
      } catch {
        if (!cancelled) setUnreadMessageCount(0);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [supabase, user?.id]);

  // Sync Settings Form with User Data
  useEffect(() => {
    if (user) {
      setSettingsForm(prev => ({
        ...prev,
        nickname: user.name || '',
        avatarUrl: user.avatar_url || '',
        recipientName: user.recipient_name || '',
        recipientPhone: user.recipient_phone || '',
        recipientAddress: user.recipient_address || '',
        gender: user.gender || '',
        birthday: user.birthday || '',
        cvsStoreId: user.cvs_store_id || '',
        cvsStoreName: user.cvs_store_name || '',
        cvsStoreBranch: user.cvs_store_branch || '',
        cvsStoreAddress: user.cvs_store_address || '',
        cvsRecipientName: user.cvs_recipient_name || '',
        cvsRecipientPhone: user.cvs_recipient_phone || ''
      }));
    }
  }, [user]);

  const openPhoneBindModal = () => {
    if (!user) return;
    if (user.is_phone_verified) return;
    setPhoneNumberInput(formatPhoneForDisplay(user.phone_number || ''));
    setPhoneOtp('');
    setPhoneStep('input');
    setIsPhoneBindModalOpen(true);
  };

  const handleSendPhoneOtp = async () => {
    if (!user || isSendingPhoneOtp) return;
    const phoneE164 = normalizePhoneE164(phoneNumberInput);
    if (!phoneE164) {
      toast.error('請輸入手機號碼');
      return;
    }
    setIsSendingPhoneOtp(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: phoneE164 });
      if (error) throw error;
      setPhoneStep('otp');
      toast.success('已發送驗證碼');
    } catch (err) {
      const message = err instanceof Error ? err.message : '發送失敗';
      toast.error(message);
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!user || isVerifyingPhoneOtp) return;
    const phoneE164 = normalizePhoneE164(phoneNumberInput);
    const token = phoneOtp.replace(/\D/g, '');
    if (!phoneE164) {
      toast.error('請輸入手機號碼');
      return;
    }
    if (token.length < 6) {
      toast.error('請輸入 6 位數驗證碼');
      return;
    }
    setIsVerifyingPhoneOtp(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token,
        type: 'phone_change'
      });
      if (error) throw error;

      const { error: updateError } = await supabase
        .from('users')
        .update({ phone_number: phoneE164, is_phone_verified: true })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('手機驗證成功');
      setIsPhoneBindModalOpen(false);
      await refreshProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : '驗證失敗';
      toast.error(message);
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

  const [showEditNickname, setShowEditNickname] = useState(false);
  const [showEditRecipient, setShowEditRecipient] = useState(false);
  // 收件地址改「台灣格式選擇式」（老闆 2026-09-02）：縣市／區用選單、其餘打字。
  // 三段都齊才組回 recipientAddress，儲存鈕的 disabled 沿用原本的空值判斷
  const [addrCity, setAddrCity] = useState('');
  const [addrDist, setAddrDist] = useState('');
  const [addrRest, setAddrRest] = useState('');
  const applyAddr = (city: string, dist: string, rest: string) => {
    setAddrCity(city); setAddrDist(dist); setAddrRest(rest);
  };
  /*
   * 地址簿（user_addresses，migration 683）：最多三筆、單一預設。
   * users.recipient_* 維持「預設地址」鏡像 —— 出貨、後台等既有讀取路徑不用動，
   * 這裡每次增刪改後把預設那筆同步回 users。
   */
  const [addresses, setAddresses] = useState<{ id: string; name: string; phone: string; address: string; isDefault: boolean }[]>([]);
  const [addressMenuId, setAddressMenuId] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editAddrName, setEditAddrName] = useState('');
  const [editAddrPhone, setEditAddrPhone] = useState('');
  const [editAddrDefault, setEditAddrDefault] = useState(false);
  /** 本次配送選用的地址（僅這張單，不動預設）；null＝跟預設 */
  const [deliveryAddrId, setDeliveryAddrId] = useState<string | null>(null);

  const fetchAddresses = React.useCallback(async () => {
    if (!user) return [] as typeof addresses;
    const { data } = await supabase
      .from('user_addresses')
      .select('id, recipient_name, recipient_phone, address, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    const list = ((data ?? []) as any[]).map(r => ({
      id: String(r.id), name: String(r.recipient_name), phone: String(r.recipient_phone),
      address: String(r.address), isDefault: !!r.is_default,
    }));
    setAddresses(list);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  React.useEffect(() => { void fetchAddresses(); }, [fetchAddresses]);

  /** 把預設地址鏡像回 users.recipient_*（沒半筆就清空），設定頁顯示同步更新 */
  const syncDefaultAddress = async (list: typeof addresses) => {
    const d = list.find(a => a.isDefault) ?? list[0] ?? null;
    const updates = { recipient_name: d?.name ?? '', recipient_phone: d?.phone ?? '', address: d?.address ?? '' };
    await supabase.from('users').update(updates).eq('id', user!.id);
    setSettingsForm(f => ({ ...f, recipientName: updates.recipient_name, recipientPhone: updates.recipient_phone, recipientAddress: updates.address }));
  };

  /** 表單呈現方式：結帳裡開＝底部彈窗；我的地址開＝全頁 push（老闆 2026-09-02 兩者並存） */
  const [editRecipientSheet, setEditRecipientSheet] = useState(false);
  const openNewAddress = () => {
    if (addresses.length >= 3) { toast.error('最多儲存三筆地址'); return; }
    setEditRecipientSheet(showDeliveryModal);
    setEditingAddressId(null);
    setEditAddrName(''); setEditAddrPhone('');
    setAddrCity(''); setAddrDist(''); setAddrRest('');
    setEditAddrDefault(addresses.length === 0);
    setShowEditRecipient(true);
  };

  const openEditAddress = (id: string) => {
    const a = addresses.find(x => x.id === id);
    if (!a) return;
    setEditRecipientSheet(false);
    setEditingAddressId(id);
    setEditAddrName(a.name); setEditAddrPhone(a.phone);
    const parts = splitTwAddress(a.address);
    setAddrCity(parts.city); setAddrDist(parts.district); setAddrRest(parts.rest);
    setEditAddrDefault(a.isDefault);
    setAddressMenuId(null);
    setShowEditRecipient(true);
  };

  const saveAddress = async () => {
    const name = editAddrName.trim();
    const phone = editAddrPhone.trim();
    const composed = addrCity && addrDist && addrRest.trim() ? `${addrCity}${addrDist}${addrRest.trim()}` : '';
    if (name.length < 2 || name.length > 10) { toast.error('收件人姓名請填 2～10 個字'); return; }
    if (!/^09\d{8}$/.test(phone)) { toast.error('聯絡電話請填 09 開頭的 10 碼手機號碼'); return; }
    if (composed.length < 8 || composed.length > 60) { toast.error('地址請填完整（含街道與門牌）'); return; }
    setIsUpdatingProfile(true);
    try {
      if (editingAddressId) {
        const { error } = await supabase.from('user_addresses')
          .update({ recipient_name: name, recipient_phone: phone, address: composed, is_default: editAddrDefault, updated_at: new Date().toISOString() })
          .eq('id', editingAddressId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_addresses')
          .insert({ user_id: user!.id, recipient_name: name, recipient_phone: phone, address: composed, is_default: editAddrDefault || addresses.length === 0 });
        if (error) throw error;
      }
      const list = await fetchAddresses();
      await syncDefaultAddress(list);
      toast.success(editingAddressId ? '地址已更新' : '地址已新增');
      setShowEditRecipient(false);
    } catch (e) {
      const msg = (e as { message?: string }).message || '';
      toast.error(msg.includes('MAX_ADDRESSES') ? '最多儲存三筆地址' : '儲存失敗，請再試一次');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const removeAddress = async (id: string) => {
    try {
      const { error } = await supabase.from('user_addresses').delete().eq('id', id);
      if (error) throw error;
      let list = await fetchAddresses();
      // 預設被移掉時，讓最舊的一筆遞補，出貨路徑永遠有預設可用
      if (list.length > 0 && !list.some(a => a.isDefault)) {
        await supabase.from('user_addresses').update({ is_default: true }).eq('id', list[0].id);
        list = list.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
        setAddresses(list);
      }
      await syncDefaultAddress(list);
      if (deliveryAddrId === id) setDeliveryAddrId(null);
      toast.success('地址已移除');
    } catch {
      toast.error('移除失敗，請再試一次');
    } finally {
      setAddressMenuId(null);
    }
  };

  /*
   * 編輯地址的表單內容 —— 全頁版與結帳裡的底部彈窗版共用同一份，
   * 只在外殼與留白上不同（inSheet）。
   */
  const renderAddressForm = (inSheet: boolean) => (
    <>
      <div className={cn('bg-white dark:bg-neutral-900', inSheet ? '' : 'mt-3 px-4')}>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <div className="py-1">
            <input
              value={editAddrName}
              onChange={e => setEditAddrName(e.target.value)}
              maxLength={30}
              placeholder="例：王吉比"
              className="w-full bg-transparent border-none py-3 px-0 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-0"
            />
          </div>
          <div className="py-1">
            <input
              value={editAddrPhone}
              onChange={e => setEditAddrPhone(e.target.value)}
              onBlur={e => setEditAddrPhone(normalizePhone(e.target.value))}
              type="tel"
              inputMode="numeric"
              pattern="^09\d{8}$"
              placeholder={PHONE_PLACEHOLDER}
              className="w-full bg-transparent border-none py-3 px-0 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-0"
            />
          </div>
          {/* 台灣格式：郵遞區號自動帶入（唯讀三碼）｜縣市／區用原生選單（iOS 滾輪），剩下打門牌 */}
          <div className="py-1 flex items-center gap-3">
            <span className={cn(
              'w-10 shrink-0 py-3 text-[15px] tabular-nums',
              zip3Of(addrCity, addrDist) ? 'text-neutral-900 dark:text-white' : 'text-neutral-300 dark:text-neutral-600'
            )}>
              {zip3Of(addrCity, addrDist) || '000'}
            </span>
            <select
              value={addrCity}
              onChange={e => applyAddr(e.target.value, '', addrRest)}
              className={cn(
                'flex-1 bg-transparent border-none py-3 px-0 text-[15px] focus:ring-0 appearance-none',
                addrCity ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'
              )}
            >
              <option value="" disabled>選擇縣市</option>
              {TW_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={addrDist}
              onChange={e => applyAddr(addrCity, e.target.value, addrRest)}
              disabled={!addrCity}
              className={cn(
                'flex-1 bg-transparent border-none py-3 px-0 text-[15px] focus:ring-0 appearance-none disabled:opacity-40',
                addrDist ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'
              )}
            >
              <option value="" disabled>選擇鄉鎮市區</option>
              {(TW_DISTRICTS[addrCity] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="py-1">
            <input
              value={addrRest}
              onChange={e => applyAddr(addrCity, addrDist, e.target.value)}
              className="w-full bg-transparent border-none py-3 px-0 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-0"
              placeholder="街道、巷弄、門牌號碼、樓層"
            />
          </div>
        </div>
      </div>

      {/* 預設開關：預設那筆會鏡像回 users.recipient_*（出貨、後台都讀它） */}
      <button
        type="button"
        onClick={() => setEditAddrDefault(v => !v)}
        className={cn(
          'w-full bg-white dark:bg-neutral-900 flex items-center justify-between',
          inSheet ? 'py-3 border-t border-neutral-100 dark:border-neutral-800' : 'mt-3 px-4 py-3'
        )}
      >
        <span className="text-[15px] text-neutral-900 dark:text-white">設為預設地址</span>
        <div className={cn(
          'w-11 h-6 rounded-full relative transition-colors',
          editAddrDefault ? 'bg-accent-emerald' : 'bg-neutral-200 dark:bg-neutral-700'
        )}>
          <div className={cn(
            'absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all',
            editAddrDefault ? 'right-1' : 'left-1'
          )} />
        </div>
      </button>
    </>
  );

  const addressSaveDisabled = isUpdatingProfile || !editAddrName.trim() || !editAddrPhone.trim() || !addrCity || !addrDist || !addrRest.trim();

  /** 本次配送實際使用的地址（選了用選的，沒選用預設） */
  const deliveryAddress = React.useMemo(() => {
    const chosen = addresses.find(a => a.id === deliveryAddrId)
      ?? addresses.find(a => a.isDefault)
      ?? addresses[0];
    return chosen
      ? { id: chosen.id, name: chosen.name, phone: chosen.phone, address: chosen.address }
      : { id: null as string | null, name: settingsForm.recipientName, phone: settingsForm.recipientPhone, address: settingsForm.recipientAddress };
  }, [addresses, deliveryAddrId, settingsForm.recipientName, settingsForm.recipientPhone, settingsForm.recipientAddress]);
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showTitlePicker, setShowTitlePicker] = useState(false);
  const [userTitles, setUserTitles] = useState<{ id: string; name: string; color_key: string; is_selected: boolean }[]>([]);
  const [selectingTitle, setSelectingTitle] = useState<string | null>(null);

  const fetchUserTitles = React.useCallback(async () => {
    if (!user) return;
    const { data: allTitles } = await supabase.from('titles').select('id, name, color_key, sort_order').order('sort_order');
    const { data: myTitles } = await supabase.from('user_titles').select('title_id, is_selected').eq('user_id', user.id);
    const earnedMap = Object.fromEntries((myTitles || []).map((ut: any) => [ut.title_id, ut.is_selected]));
    setUserTitles(
      (allTitles || [])
        .filter((t: any) => t.id in earnedMap)
        .map((t: any) => ({ id: t.id, name: t.name, color_key: t.color_key, is_selected: earnedMap[t.id] === true }))
    );
  }, [user, supabase]);

  const handleSelectTitle = async (titleId: string, alreadySelected: boolean) => {
    if (!user || selectingTitle) return;
    setSelectingTitle(titleId);
    try {
      if (alreadySelected) {
        await supabase.from('user_titles').update({ is_selected: false }).eq('user_id', user.id).eq('title_id', titleId);
      } else {
        await supabase.from('user_titles').update({ is_selected: false }).eq('user_id', user.id);
        await supabase.from('user_titles').update({ is_selected: true }).eq('user_id', user.id).eq('title_id', titleId);
      }
      await fetchUserTitles();
    } finally {
      setSelectingTitle(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') fetchUserTitles();
  }, [activeTab, fetchUserTitles]);

  useEffect(() => {
    supabase.from('platform_settings').select('key,value').in('key', [
        'shipping_fee_home', 'shipping_fee_cvs',
        'shipping_fee_cvs_711', 'shipping_fee_cvs_family', 'shipping_fee_cvs_hilife', 'shipping_fee_cvs_ok',
        'free_shipping_threshold',
        'free_shipping_threshold_cvs', 'free_shipping_threshold_home', 'shipping_fee_home_large',
      ])
      .then(({ data }) => {
        if (!data) return;
        const map = Object.fromEntries(data.map(r => [r.key, r.value]));

        /*
         * **退位順序必須跟 DB 的 calc_delivery_fee() 一字不差。**
         *
         * 這裡原本是「讀不到就用寫死的預設值」，而那些常數跟 DB 的退位鏈不一樣：
         * DB 查不到 free_shipping_threshold_home 會退回 free_shipping_threshold，
         * 查不到 shipping_fee_home_large 會退回 shipping_fee_home，前台卻自顧自地
         * 用 15 與 120。PROD 因為漏跑 migration 426 的 INSERT 剛好少了這兩列 ——
         * 於是大件宅配每一次都是 DB 算 60、前台送 120，被 FEE_MISMATCH 擋死
         *（老闆 2026-09-01 回報）。設定齊全時兩邊碰巧一致，所以 STG 測不出來。
         *
         * 用 `?? ` 而不是 `if (map.x)`：門檻或運費設成 "0"（全站免運）是合法設定，
         * truthiness 會把它當成沒讀到而悄悄跳回 60。
         */
        const num = (...keys: string[]) => {
          for (const k of keys) {
            if (map[k] != null && map[k] !== '' && Number.isFinite(Number(map[k]))) return Number(map[k]);
          }
          return null;
        };
        // 運費：查不到指定的 key 就退 shipping_fee_home，再查不到退 60（DB 最後那行 COALESCE）
        const fee = (key: string) => num(key, 'shipping_fee_home') ?? 60;
        // 門檻：分物流查不到就退舊的單一門檻；兩個都沒有時 DB 是「不免運」，
        // 用 Infinity 表示，任何件數都達不到
        const thr = (key: string) => num(key, 'free_shipping_threshold') ?? Infinity;

        setShippingFeeHome(fee('shipping_fee_home'));
        setShippingFeeCvs(fee('shipping_fee_cvs'));
        setShippingFeeCvs711(fee('shipping_fee_cvs_711'));
        setShippingFeeCvsFamily(fee('shipping_fee_cvs_family'));
        setShippingFeeCvsHilife(fee('shipping_fee_cvs_hilife'));
        setShippingFeeCvsOk(fee('shipping_fee_cvs_ok'));
        setShippingFeeHomeLarge(fee('shipping_fee_home_large'));
        setFreeThresholdCvs(thr('free_shipping_threshold_cvs'));
        setFreeThresholdHome(thr('free_shipping_threshold_home'));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch Data when Tab Changes
  const fetchUserData = React.useCallback(async () => {
    if (!user) return;
    setIsLoadingData(true);

    try {
      if (activeTab === 'warehouse') {
        if (activeWarehouseTab === 'all') {
          // 倉庫筆數會隨抽獎量無上限成長，必須分頁撈完（見 fetchAllRows）
          const data = await fetchAllRows<DbDrawRecord>((from, to) =>
            supabase
              .from('draw_records')
              .select(`
                id,
                ticket_number,
                created_at,
                status,
                prize_level,
                prize_name,
                expires_at,
                product_prize_id,
                product_prizes ( level, name, image_url, recycle_value, total, sale_price ),
                products ( name, price, type, sale_mode, supplier_id, suppliers ( id, name ) )
              `)
              .eq('user_id', user.id)
              .in('status', ['in_warehouse', 'pending_delivery', 'listing'])
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .range(from, to),
          );

          /*
           * 回收價一律問 DB（migration 616 的 estimate_recycle_value）。
           * 這裡以前是寫死 `recycleValue = 10`，但 DB 對大賞其實給 單價×20%
           * （309 元的一番賞大賞給 61），玩家看到的跟實際入帳的不是同一個數。
           * 預覽與入帳現在共用同一支 calc_recycle_value，不會再各算各的。
           */
          const recycleMap = new Map<number, { value: number; canRecycle: boolean }>();
          if (data.length > 0) {
            const { data: estimates, error: estimateError } = await supabase.rpc('estimate_recycle_value', {
              p_record_ids: data.map((item) => Number(item.id)),
            });
            if (estimateError) {
              // 估價掛掉不該讓整個倉庫開不了；下面會退回 0 並把回收鈕的金額留白
              console.error('estimate_recycle_value failed', estimateError);
            }
            (estimates ?? []).forEach((row: { draw_record_id: number; recycle_value: number; can_recycle: boolean }) => {
              recycleMap.set(Number(row.draw_record_id), {
                value: Number(row.recycle_value) || 0,
                canRecycle: Boolean(row.can_recycle),
              });
            });
          }

          const items = data.map((item) => {
            const estimate = recycleMap.get(Number(item.id));
            const productType = item.products?.type || 'unknown';
            const isPreorder = false;
            const preorderAvailableAt = null;

            /*
             * 舊的抽籤販售模式（sale_mode='lottery'）已移除（老闆 2026-08-31），
             * 全站沒有任何 lottery 商品，這個判斷永遠是 0 —— 直接寫死。
             * 新的登記制抽籤販售不進倉庫（走 lottery_entries），不影響這裡。
             */
            const salePrice = 0;
            const expiresAt = (item as any).expires_at ?? null;

            const rawGrade = item.product_prizes?.level || item.prize_level || '一般版';
            const grade = rawGrade; // 等級 DB 已統一（migration 514），一般版/特別設定照實顯示
            const name = item.product_prizes?.name || item.prize_name || '未知獎品';

            // 收不了的（抽籤中籤品、已申請寄送）顯示 0，不要對玩家開一張兌不了的支票
            const recycleValue = estimate?.canRecycle ? estimate.value : 0;

            return {
              id: item.id.toString(),
              name,
              series: item.products?.name || '未知系列',
              grade,
              status: item.status as WarehouseItem['status'],
              image: item.product_prizes?.image_url || 'https://placehold.co/400',
              date: new Date(item.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
              ticketNo: item.ticket_number?.toString() || '',
              recycleValue,
              type: productType,
              isPreorder,
              preorderAvailableAt,
              supplierId: item.products?.supplier_id ?? null,
              supplierName: item.products?.suppliers?.name ?? '未知廠商',
              prizeTotal: item.product_prizes?.total ?? 999,
              prizeId: item.product_prize_id ?? null,
              salePrice,
              expiresAt,
            };
          });
          setWarehouseItems(items);
        } else if (activeWarehouseTab === 'dismantled') {
          const data = await fetchAllRows<DbDrawRecord>((from, to) =>
            supabase
              .from('draw_records')
              .select(`
                id,
                created_at,
                status,
                prize_level,
                prize_name,
                product_prizes ( level, name, image_url, recycle_value ),
                admin_recycle_pool ( recycle_value, created_at ),
                products ( name, type, suppliers ( id, name ) )
              `)
              .eq('user_id', user.id)
              .eq('status', 'dismantled')
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .range(from, to),
          );

          const items = data.map((item) => {
            const productType = item.products?.type || 'unknown';
            const rawGrade = item.product_prizes?.level || item.prize_level || '一般版';
            const grade = rawGrade; // 等級 DB 已統一（migration 514），一般版/特別設定照實顯示
            const name = item.product_prizes?.name || item.prize_name || '未知獎品';

            return {
              id: item.id.toString(),
              name,
              series: item.products?.name || '未知系列',
              grade,
              image: item.product_prizes?.image_url || 'https://placehold.co/400',
              dismantled_at: new Date(item.admin_recycle_pool?.[0]?.created_at ?? item.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }),
              raw_dismantled_at: new Date(item.admin_recycle_pool?.[0]?.created_at ?? item.created_at),
              recycleValue: item.admin_recycle_pool?.[0]?.recycle_value ?? item.product_prizes?.recycle_value ?? 0,
              type: productType,
              supplierName: (item.products?.suppliers as unknown as { name?: string } | null)?.name ?? '未知廠商',
            };
          });
          items.sort((a, b) => b.raw_dismantled_at.getTime() - a.raw_dismantled_at.getTime());
          setDismantledItems(items);
        }
      } 
      else if (activeTab === 'market') {
        // 1. Fetch active listings (Selling)
        const { data: listingsData, error: listingsError } = await supabase
          .from('marketplace_listings')
          .select(`
            id,
            price,
            status,
            created_at,
            updated_at,
            draw_records (
               id,
               product_prizes ( name, level, image_url ),
               products ( name, type )
            )
          `)
          .eq('seller_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (listingsError) throw listingsError;

        const activeListings = (listingsData as unknown as DbListing[]).map((item) => {
          const listingProductType = item.draw_records?.products?.type || 'unknown';
          const listingRawGrade = item.draw_records?.product_prizes?.level || '?';
          const listingGrade = listingRawGrade === '?' ? '一般版' : listingRawGrade;
          return {
            id: item.id.toString(),
            draw_record_id: item.draw_records?.id,
            price: item.price,
            status: item.status,
            created_at: new Date(item.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            updated_at: new Date(item.updated_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            raw_updated_at: new Date(item.updated_at),
            product: {
              name: item.draw_records?.product_prizes?.name || '未知',
              image: item.draw_records?.product_prizes?.image_url || 'https://placehold.co/400',
              grade: listingGrade,
              series: item.draw_records?.products?.name || '未知',
              type: listingProductType,
            },
            type: 'sell' as const
          };
        });

        setMarketListings(activeListings);

        // 2. Fetch Transaction History (Buy & Sell)
        const { data: txData, error: txError } = await supabase
          .from('marketplace_transactions')
          .select(`
            id,
            price,
            created_at,
            buyer_id,
            seller_id,
            draw_records (
              product_prizes ( name, image_url, level ),
              products ( name, type )
            ),
            buyer:users!buyer_id ( name ),
            seller:users!seller_id ( name )
          `)
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (txError) throw txError;

        const transactions = (txData as unknown as DbMarketplaceTransaction[]).map((tx) => {
            const isSeller = tx.seller_id === user.id;
            const txProductType = tx.draw_records?.products?.type || 'unknown';
            const txRawGrade = tx.draw_records?.product_prizes?.level || '?';
            const txGrade = txRawGrade === '?' ? '一般版' : txRawGrade;
            return {
                id: tx.id.toString(),
                price: tx.price,
                status: 'sold',
                created_at: new Date(tx.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
                updated_at: new Date(tx.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
                raw_updated_at: new Date(tx.created_at),
                product: {
                    name: tx.draw_records?.product_prizes?.name || '未知',
                    image: tx.draw_records?.product_prizes?.image_url || 'https://placehold.co/400',
                    grade: txGrade,
                    series: tx.draw_records?.products?.name || '未知',
                    type: txProductType,
                },
                type: isSeller ? 'sell' : 'buy',
                counterparty: isSeller ? (tx.buyer?.name || '未知買家') : (tx.seller?.name || '未知賣家')
            };
        });

        setSoldItems(transactions as MarketListing[]);
      }
      else if (activeTab === 'delivery') {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            suppliers ( name ),
            draw_records (
              product_prizes ( level, name ),
              products ( name, type, suppliers ( name ) )
            )
          `)
          .eq('user_id', user.id)
          // Filter for delivery orders (those with logistics_type or specific status)
          // Since orders table mixes topup and delivery, we should filter.
          // Delivery orders have status 'submitted', 'processing', 'picked_up', 'shipping', 'delivered', 'cancelled'
          // Topup orders have 'pending', 'paid', 'failed'
          .in('status', ['submitted', 'processing', 'picked_up', 'shipping', 'delivered', 'cancelled', 'completed']) 
          .order('created_at', { ascending: false });

        if (error) throw error;

        const orders = (data as unknown as DbOrder[]).map((order) => {
          // Calculate arrival date based on status and method
          let arrivalDate = '-';
          
          // Determine shipping method
          // RPC inserts into 'logistics_type'
          const method = order.logistics_type || 'HOME';
          const displayMethod = method === 'CVS' ? '超商取貨' : '宅配通';
          
          if (order.status === 'completed' || order.status === 'delivered') {
            arrivalDate = '已送達';
          } else if (order.status === 'submitted' || order.status === 'processing') {
            arrivalDate = '待出貨';
          } else if (['picked_up', 'shipping'].includes(order.status)) {
            // 從實際出貨時間算，沒有則 fallback 到建立時間
            const baseDate = new Date(order.shipped_at || order.created_at);
            baseDate.setDate(baseDate.getDate() + 3);
            const y = baseDate.getFullYear();
            const m = String(baseDate.getMonth() + 1).padStart(2, '0');
            const d = String(baseDate.getDate()).padStart(2, '0');
            arrivalDate = `${y}/${m}/${d}`;
          }
           
           return {
             id: order.id,
             order_number: order.order_number,
             itemsCount: order.draw_records?.length || 0,
             items: (order.draw_records || []).map((dh) => {
               const productType = (dh as any).products?.type || 'unknown';
               const rawGrade = dh.product_prizes?.level || '?';
               const grade = rawGrade; // 等級 DB 已統一（migration 514），一般版/特別設定照實顯示
               return {
                 grade,
                 name: dh.product_prizes?.name || '未知',
                 productName: (dh as any).products?.name || '未知商品',
               };
             }),
             status: order.status,
             date: new Date(order.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Taipei' }).replace(/\//g, '/'),
             tracking: order.tracking_number || '-',
             shippingFee: Number((order as any).shipping_fee ?? 0),
             method: displayMethod,
             arrivalDate: arrivalDate,
             recipientName: order.recipient_name || undefined,
             recipientPhone: order.recipient_phone || undefined,
             address: order.address || undefined,
             storeName: order.store_name || undefined,
             logisticsType: method,
             supplierName: (() => {
               // 正常情況讀 orders.supplier_id（migration 612 起會寫）。
               // 612 之前的訂單如果商品沒設廠商就回填不到，那時從品項往回推；
               // 真的湊不出來才給 '—'，不要瞎猜一個廠商名。
               if (order.suppliers?.name) return order.suppliers.name;
               const fromItems = Array.from(new Set(
                 (order.draw_records || [])
                   .map((dh) => dh.products?.suppliers?.name)
                   .filter((n): n is string => !!n),
               ));
               return fromItems.length > 0 ? fromItems.join('、') : '—';
             })(),
           };
         });
        setDeliveryHistory(orders);
      }
      else if (activeTab === 'draw-history') {
        const data = await fetchAllRows<DbDrawRecord>((from, to) =>
          supabase
            .from('draw_records')
            .select(`
              id,
              product_id,
              ticket_number,
              created_at,
              prize_level,
              prize_name,
              txid_hash,
              points_used,
              tokens_spent,
              product_prizes ( level, name ),
              products ( name, price, status, remaining, type )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to),
        );

        // Group records by created_at (transaction time)
        const groupedHistory: GroupedDrawHistoryItem[] = [];

        const records = data;
        records.forEach((item) => {
          const currentTimestamp = item.created_at;
          const lastGroup = groupedHistory.length > 0 ? groupedHistory[groupedHistory.length - 1] : null;
          const itemProductType = item.products?.type || 'unknown';
          const rawGrade = item.product_prizes?.level || item.prize_level || '一般版';
          const grade = rawGrade; // 等級 DB 已統一（migration 514）
          const name = item.product_prizes?.name || item.prize_name || '未知';

          const itemPointsUsed = item.points_used || 0;
          // 實收金額（優惠券折抵後）；舊資料沒有 tokens_spent 才 fallback 單價。
          // 買五送一（517 起是多送 1 抽）：5 筆收單價＋贈品那筆 0 元，就靠這個
          const itemCost = item.tokens_spent ?? (item.products?.price || 0);
          if (lastGroup && lastGroup._rawDate === currentTimestamp && lastGroup.product === item.products?.name) {
            lastGroup.tickets.push(item.ticket_number?.toString());
            lastGroup.cost += itemCost;
            lastGroup.pointsUsed += itemPointsUsed;
            lastGroup.items.push({ grade, name, ticket_number: item.ticket_number?.toString(), txid_hash: item.txid_hash || undefined });
          } else {
            groupedHistory.push({
              _rawDate: currentTimestamp,
              rawDate: currentTimestamp,
              id: item.id,
              productId: item.product_id,
              product: item.products?.name || '未知',
              productStatus: item.products?.status,
              productRemaining: item.products?.remaining,
              productType: item.products?.type,
              date: new Date(item.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
              tickets: [item.ticket_number?.toString()],
              cost: itemCost,
              pointsUsed: itemPointsUsed,
              items: [{ grade, name, ticket_number: item.ticket_number?.toString(), txid_hash: item.txid_hash || undefined }]
            });
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const history = groupedHistory.map(({ _rawDate, ...rest }) => rest);
        setDrawHistory(history as unknown as DrawHistoryItem[]);
        if (searchParams.get('expand') === 'latest' && groupedHistory.length > 0) {
          setExpandedDrawId(groupedHistory[0].id.toString());
        }
      }
      else if (activeTab === 'topup-history') {
        const data = await fetchAllRows<DbTopup>((from, to) =>
          supabase
            .from('recharge_records')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to),
        );

        // Group records by created_at (transaction time)
        // Although topup is usually single item, we follow DrawHistory structure
        const groupedHistory: TopupHistoryItem[] = [];

        data.forEach((item) => {
          groupedHistory.push({
            id: item.id,
            order_number: item.order_number,
            payment_method: '系統儲值', 
            amount: item.amount,
            tokens: (item.amount || 0) + (item.bonus || 0),
            status: item.status,
            created_at: item.created_at
          });
        });

        setTopupHistory(groupedHistory);
      }
      else if (activeTab === 'follows') {
        const { data, error } = await supabase
          .from('product_follows')
          .select(`
            product_id,
            products ( id, name, price, image_url, status, remaining, total_count, is_hot, type )
          `)
          .eq('user_id', user.id);

        if (error) throw error;

        const follows = (data as unknown as DbFollow[]).map((item) => ({
          id: item.products.id,
          name: item.products.name,
          image: item.products.image_url,
          price: item.products.price,
          status: item.products.status,
          remaining: item.products.remaining,
          total: item.products.total_count,
          is_hot: item.products.is_hot,
          type: item.products.type
        }));
        setFollowedProducts(follows);
      }
      else if (activeTab === 'coupons') {
        const { data, error } = await supabase
          .from('user_coupons')
          .select(`
            id,
            status,
            expiry_date,
            coupons ( id, title, description, discount_type, discount_value, min_spend, code )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const myCoupons = (data as unknown as DbCoupon[]).map((item) => ({
          id: item.id,
          title: item.coupons.title,
          description: item.coupons.description,
          discountType: item.coupons.discount_type,
          discountValue: item.coupons.discount_value,
          minSpend: item.coupons.min_spend,
          expiryDate: item.expiry_date,
          status: item.status,
          code: item.coupons.code
        }));
        setCoupons(myCoupons);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      // toast.error('無法載入資料'); // Suppress error for now as tables might not exist yet
    } finally {
      setIsLoadingData(false);
    }
  }, [user, activeTab, activeWarehouseTab, supabase]);

  const handleRedeemCoupon = async () => {
    if (!user) return;
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      toast.error('請輸入折價券代碼');
      return;
    }

    setIsRedeemingCoupon(true);
    try {
      const { data: coupon, error: couponError } = await supabase
        .from('coupons')
        .select('id, is_active, min_spend')
        .eq('code', code)
        .maybeSingle();

      if (couponError) throw couponError;
      if (!coupon) {
        toast.error('找不到此折價券代碼');
        return;
      }
      if (!coupon.is_active) {
        toast.error('此折價券已停用');
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .from('user_coupons')
        .select('id')
        .eq('user_id', user.id)
        .eq('coupon_id', coupon.id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        toast.error('此折價券您已領取過');
        return;
      }

      const { error: insertError } = await supabase
        .from('user_coupons')
        .insert({
          user_id: user.id,
          coupon_id: coupon.id,
          status: 'unused',
        });

      if (insertError) throw insertError;

      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'coupon',
        title: '折價券領取成功',
        body: '您成功領取一張新的優惠券，可至「我的優惠券」查看詳情。',
        link: '/profile?tab=coupons',
        meta: {
          coupon_id: coupon.id,
          code,
        },
      });

      toast.success('折價券領取成功');
      setCouponCode('');
      await fetchUserData();
    } catch (error) {
      console.error('Redeem coupon error:', error);
      toast.error('折價券領取失敗，請稍後再試');
    } finally {
      setIsRedeemingCoupon(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user, activeTab, activeWarehouseTab, activeMarketTab, fetchUserData]);

  // Handle return from CVS Map Selection
  useEffect(() => {
    if (searchParams) {
      const status = searchParams.get('status');
      if (status === 'success') {
        toast.success('付款成功！');
        // Clean URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('status');
        window.history.replaceState({}, '', newUrl.toString());
      } else if (status === 'waiting_payment') {
        toast.info('訂單已建立，請依指示完成付款');
        // Clean URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('status');
        window.history.replaceState({}, '', newUrl.toString());
      } else if (status === 'failed') {
        toast.error('付款失敗');
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('status');
        window.history.replaceState({}, '', newUrl.toString());
      }

      const action = searchParams.get('action');
      if (action === 'reset_password') {
        setActiveTab('settings');
        toast.info('請設定您的新密碼');
        // Clean URL（順便補上 tab=settings：URL 與畫面同步，底部導航才判斷得準）
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('action');
        newUrl.searchParams.set('tab', 'settings');
        window.history.replaceState({}, '', newUrl.toString());
      }
      if (action === 'update_profile_cvs') {
        const sId = searchParams.get('store_id');
        const sName = searchParams.get('store_name');
        const sAddr = searchParams.get('store_address');
        const lSubType = searchParams.get('logistics_subtype') as 'UNIMART' | 'FAMI' | 'HILIFE' | 'OKMART' | null;

        if (sId) {
          setSettingsForm(prev => ({
            ...prev,
            cvsStoreId: sId,
            cvsStoreName: sName || '',
            cvsStoreAddress: sAddr || ''
          }));
          setShowEditCvs(true);
          
          if (lSubType) setLogisticsSubType(lSubType);

          // Clean URL
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('action');
          newUrl.searchParams.delete('store_id');
          newUrl.searchParams.delete('store_name');
          newUrl.searchParams.delete('store_address');
          newUrl.searchParams.delete('logistics_type');
          newUrl.searchParams.delete('logistics_subtype');
          window.history.replaceState({}, '', newUrl.toString());
        }
      }
      if (action === 'open_delivery_modal') {
        const sId = searchParams.get('store_id');
        const sName = searchParams.get('store_name');
        const sAddr = searchParams.get('store_address');
        const lSubType = searchParams.get('logistics_subtype') as 'UNIMART' | 'FAMI' | 'HILIFE' | 'OKMART' | null;

        // Restore selected items from session storage
        try {
          const storedItems = sessionStorage.getItem('pending_delivery_items');
          if (storedItems) {
            const items = JSON.parse(storedItems);
            if (Array.isArray(items) && items.length > 0) {
              setSelectedForDelivery(items);
            }
            sessionStorage.removeItem('pending_delivery_items');
          }
        } catch (e) {
          console.error('Failed to restore delivery items:', e);
        }

        if (sId) {
          setStoreId(sId);
          setStoreName(sName || '');
          setStoreAddress(sAddr || '');
          if (!hasLargePackage) setLogisticsType('CVS');
          if (lSubType) setLogisticsSubType(lSubType);
          setShowDeliveryModal(true);
          
          // Clean URL
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('action');
          newUrl.searchParams.delete('store_id');
          newUrl.searchParams.delete('store_name');
          newUrl.searchParams.delete('store_address');
          newUrl.searchParams.delete('logistics_type');
          newUrl.searchParams.delete('logistics_subtype');
          window.history.replaceState({}, '', newUrl.toString());
        }
      }
    }
  }, [searchParams]);

  // Apply CVS store data and open delivery modal
  const applyCvsStoreData = React.useCallback((sId: string, sName: string, sAddr: string, lSub?: string) => {
    if (!sId) return;
    setStoreId(sId);
    setStoreName(sName || '');
    setStoreAddress(sAddr || '');
    if (!hasLargePackage) setLogisticsType('CVS');
    // 後端已把綠界的 UNIMARTC2C 還原成品牌代號，這裡再擋一次：
    // 舊的 cvs_pending_selections 可能還留著帶後綴的值，直接塞進 state 會讓超商按鈕全部不亮
    if (lSub) setLogisticsSubType(lSub.replace(/C2C$/i, '') as 'UNIMART' | 'FAMI' | 'HILIFE' | 'OKMART');
    setShowDeliveryModal(true);
    if (cvsPollingRef.current) { clearInterval(cvsPollingRef.current); cvsPollingRef.current = null; }
    setPendingCvsToken(null);
    try {
      const stored = sessionStorage.getItem('pending_delivery_items');
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids) && ids.length > 0) setSelectedForDelivery(ids);
        sessionStorage.removeItem('pending_delivery_items');
      }
    } catch { /* ignore */ }
  }, [hasLargePackage, cvsPollingRef]);

  // CVS store selection: postMessage (desktop/Safari popup) + server-side polling (iOS PWA)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== 'cvs_store_selected') return;
      const { storeId: sId, storeName: sName, storeAddress: sAddr, logisticsSubType: lSub } = e.data;
      applyCvsStoreData(sId, sName, sAddr, lSub);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applyCvsStoreData]);

  // Poll backend for CVS store data (for iOS PWA where postMessage/localStorage don't cross contexts)
  useEffect(() => {
    if (!pendingCvsToken) return;
    let attempts = 0;
    const maxAttempts = 45; // 90 seconds at 2s interval
    cvsPollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(cvsPollingRef.current!);
        cvsPollingRef.current = null;
        setPendingCvsToken(null);
        return;
      }
      try {
        const res = await fetch(`/api/logistics/cvs-pending?token=${encodeURIComponent(pendingCvsToken)}`);
        const data = await res.json();
        if (data.found) {
          /* App 內地圖是開在 in-app browser 裡，拿到門市就主動收掉 ——
             不關的話玩家會停在綠界的回呼頁，以為卡住了（老闆 2026-08-24：不要跳轉出去） */
          void closeInAppBrowser();
          if (cvsTarget === 'settings') {
            if (cvsPollingRef.current) { clearInterval(cvsPollingRef.current); cvsPollingRef.current = null; }
            setPendingCvsToken(null);
            setSettingsForm(prev => ({
              ...prev,
              cvsStoreId: data.storeId,
              cvsStoreName: data.storeName || '',
              cvsStoreAddress: data.storeAddress || '',
            }));
          } else {
            applyCvsStoreData(data.storeId, data.storeName, data.storeAddress, data.logisticsSubType);
          }
        }
      } catch { /* network errors are expected during ECPay redirect, keep polling */ }
    }, 2000);
    return () => { if (cvsPollingRef.current) { clearInterval(cvsPollingRef.current); cvsPollingRef.current = null; } };
  }, [pendingCvsToken, applyCvsStoreData, cvsTarget]);

  // Mobile warehouse lazy load
  // 換排序／換篩選／改關鍵字都要收回第一頁並捲回頂端 —— 不然捲到第 300 格時
  // 換個排序，看到的是新順序的第 300 格，玩家會以為清單壞了
  useEffect(() => {
    setMobileWarehouseDisplayCount(WAREHOUSE_PAGE);
    window.scrollTo({ top: 0 });
  }, [
    activeWarehouseCategory, activeWarehouseSubCategory, activeWarehouseTab,
    warehouseSort, warehouseSearch, warehouseSupplier, warehouseFilter,
  ]);

  // 桌機倉庫：換篩選／關鍵字／分頁時回到第一批
  useEffect(() => {
    setDesktopWarehouseDisplayCount(DESKTOP_WAREHOUSE_PAGE);
  }, [
    activeTab, activeWarehouseCategory, activeWarehouseSubCategory, activeWarehouseTab,
    warehouseSort, warehouseSearch, desktopWarehouseSearch, desktopDismantledSearch, warehouseSupplier, warehouseFilter,
    activeDeliveryTab, desktopDeliverySearch,
  ]);

  // Mobile delivery lazy load reset
  useEffect(() => {
    setMobileDeliveryDisplayCount(10);
  }, [activeDeliveryTab]);

  // Mobile draw-history lazy load reset（還原中先接回原本的筆數）
  useEffect(() => {
    if (drawRestoreRef.current > 10) {
      setMobileDrawDisplayCount(drawRestoreRef.current);
      drawRestoreRef.current = 0;
      return;
    }
    setMobileDrawDisplayCount(10);
  }, [activeTab]);

  useEffect(() => {
    if (sortedWarehouseItems.length === 0) return;
    const t = setTimeout(() => {
      const doc = document.documentElement;
      if (doc.scrollHeight <= window.innerHeight + 50) {
        setMobileWarehouseDisplayCount(prev =>
          Math.min(prev + WAREHOUSE_PAGE, sortedWarehouseItems.length)
        );
      }
    }, 100);
    return () => clearTimeout(t);
  }, [sortedWarehouseItems.length]);

  const toggleDeliverySelection = (id: string) => {
    const item = warehouseItems.find(i => i.id === id);
    if (item?.status === 'pending_delivery') return;

    if (selectedForDelivery.includes(id)) {
      setSelectedForDelivery(prev => prev.filter(i => i !== id));
      return;
    }

    /*
     * 從空的選取點下第一件時，順手把搜尋面板的廠商篩選切到那一家（老闆 2026-08-24）。
     * 出貨本來就以廠商為單位，這樣「你正在配的是這家的貨」就變成畫面上看得到的狀態
     * （搜尋膠囊會寫廠商名、chip 也會亮），而不是靠把別家的格子打灰去暗示。
     * 全選（跨廠商）不會走到這裡 —— 那是刻意要一次回收整個倉庫的路徑。
     */
    if (selectedForDelivery.length === 0 && !warehouseSupplier && item?.supplierName) {
      setWarehouseSupplier(item.supplierName);
    }
    setSelectedForDelivery(prev => [...prev, id]);
  };

  /* 桌機版的勾選：不順手切廠商篩選。手機那條規則會讓整份清單重排、件數也變，
     玩家在桌機上看不出自己勾的那件跑去哪（老闆 2026-09-05）。跨廠商的限制改由底部列的文字說明 */
  const toggleDeliverySelectionDesktop = (id: string) => {
    const item = warehouseItems.find(i => i.id === id);
    if (item?.status === 'pending_delivery') return;
    setSelectedForDelivery(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const handleConfirmDelivery = async () => {
    if (selectedForDelivery.length === 0) return;

    if (logisticsType === 'CVS' && !storeId) {
      toast.error('請選擇取貨門市');
      return;
    }

    // 收件資料格式（migration 606 的 create_delivery_order 也驗同一套；這裡先擋是為了給看得懂的訊息）
    const recipientName = deliveryAddress.name.trim();
    const recipientPhone = deliveryAddress.phone.trim();
    const recipientAddress = deliveryAddress.address.trim();
    if (recipientName.length < 2 || recipientName.length > 10) {
      toast.error('收件人姓名請填 2～10 個字');
      return;
    }
    if (!/^09\d{8}$/.test(recipientPhone)) {
      toast.error('聯絡電話請填 09 開頭的 10 碼手機號碼');
      return;
    }
    if (logisticsType === 'HOME') {
      if (recipientAddress.length < 8 || recipientAddress.length > 60) {
        toast.error('收件地址請填 8～60 個字');
        return;
      }
      if (!/[縣市]/.test(recipientAddress)) {
        toast.error('收件地址請包含縣市（例：台北市…）');
        return;
      }
    }

    setIsSubmittingDelivery(true);

    try {
      // Call RPC to create delivery order with atomic points deduction
      const { data, error } = await supabase.rpc('create_delivery_order', {
        p_user_id: user!.id,
        p_recipient_name: recipientName,
        p_recipient_phone: recipientPhone,
        p_address: logisticsType === 'HOME' ? recipientAddress : storeAddress,
        p_logistics_type: logisticsType,
        p_logistics_subtype: logisticsType === 'CVS' ? logisticsSubType : null,
        p_store_id: logisticsType === 'CVS' ? storeId : null,
              p_store_name: logisticsType === 'CVS' ? storeName : null,
              p_draw_record_ids: selectedForDelivery.map(id => Number(id)),
              p_delivery_fee_points: currentShippingFee - shippingDiscount,
              p_note: deliveryNote.trim() || null,
              p_coupon_id: deliveryCouponId,
            });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      toast.success('配送申請已提交！');
      trackEvent('delivery_success', { path: '/profile', meta: { count: selectedForDelivery.length, logistics_type: logisticsType, fee: currentShippingFee } });
      setShowDeliveryModal(false);
      setSelectedForDelivery([]);
      setDeliveryNote('');
      setDeliveryCouponId(null);
      sessionStorage.removeItem('pending_delivery_items');

      // Refresh data and user points
      fetchUserData();
      await refreshProfile();
      handleTabChange('delivery');
      
    } catch (error) {
      const supaErr = error as { message?: string; code?: string; details?: string; hint?: string };
      console.error('Delivery Error:', supaErr.message || supaErr.code || supaErr.details, JSON.stringify(error));
      const msg = supaErr.message || (error as Error).message || '';
      if (msg.includes('INSUFFICIENT_POINTS')) {
        toast.error('代幣餘額不足，無法支付運費');
      } else if (msg.includes('INVALID_RECIPIENT_NAME')) {
        toast.error('收件人姓名請填 2～10 個字');
      } else if (msg.includes('INVALID_RECIPIENT_PHONE')) {
        toast.error('聯絡電話請填 09 開頭的 10 碼手機號碼');
      } else if (msg.includes('INVALID_ADDRESS')) {
        toast.error('收件地址請填 8～60 個字並包含縣市');
      } else if (msg.includes('MULTIPLE_SUPPLIERS')) {
        toast.error('一次只能寄同一家廠商的獎品，請分批申請');
      } else if (msg.includes('LARGE_ITEM_REQUIRES_HOME_DELIVERY')) {
        toast.error('內含大型獎品，請改用宅配');
      } else if (msg.includes('FEE_MISMATCH')) {
        /*
         * 這是「前台顯示的運費」與「伺服器實收的運費」對不上時的保險 —— 不靜默改價，
         * 擋下來讓玩家重新確認金額。
         *
         * 但原本的文案是「請關閉視窗重新申請」，而重開視窗算出來的還是同一個數字：
         * 只要兩邊的公式真的分岔（PROD 漏了 platform_settings 兩列，見 migration 668），
         * 玩家就是永遠出不了貨（老闆 2026-09-01：「重新操作還是一樣」）。
         *
         * 伺服器的例外訊息本來就帶著正確答案（`FEE_MISMATCH: expected 60, got 120`），
         * 把它讀出來直接更新畫面，玩家再按一次就成功。往後就算又有哪個設定沒同步，
         * 最糟也只是多按一次，不會再卡死。
         */
        const expected = Number(msg.match(/expected\s+(-?\d+)/)?.[1]);
        if (Number.isFinite(expected)) {
          setServerShippingFee(expected);
          toast.error(`運費已更新為 ${expected} 代幣，請再確認一次金額`);
        } else {
          toast.error('運費已更新，請關閉視窗重新申請');
        }
      } else {
        toast.error(`申請失敗：${msg || '請稍後再試'}`);
      }
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  /*
   * 曬獎圖（老闆 2026-08-24）：勾**單一**大獎品項時底部多一顆「曬圖」。
   * 不分賞等，勾單一件就能曬（老闆 2026-08-25）。
   * `get_prize_share_data` 仍會回 `is_major`，只是前台不再拿它當門檻 ——
   * 那個欄位留著，哪天要依賞等換模板或加標記時直接可以用。
   */
  const [shareData, setShareData] = useState<PrizeShareData | null>(null);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const handleShareClick = async () => {
    if (selectedForDelivery.length !== 1) return;
    setIsLoadingShare(true);
    try {
      const d = await fetchPrizeShareData(supabase, selectedForDelivery[0]);
      if (!d) { toast.error('讀不到獎品資料，請稍後再試'); return; }
      setShareData(d);
    } finally {
      setIsLoadingShare(false);
    }
  };

  const handleDismantleClick = () => {
    if (selectedForDelivery.length === 0) return;

    const selectedItems = warehouseItems.filter(item => selectedForDelivery.includes(item.id));

    // 抽籤販售的中籤品項是 0 元抽來的，能回收就等於沒付錢換到 G 幣。
    // DB 那邊已經擋死（dismantle_prizes 直接跳過），這裡先擋是為了給看得懂的訊息 ——
    // 不然玩家會看到「回收 0 件、獲得 0 代幣」而不知道為什麼。
    const lotteryItems = selectedItems.filter(i => (i.salePrice ?? 0) > 0);
    if (lotteryItems.length > 0) {
      showToast('抽籤商品不能回收成 G 幣，只能申請寄送', 'error');
      return;
    }

    const totalValue = selectedItems.reduce((sum, item) => sum + (item.recycleValue || 0), 0);
    const count = selectedItems.length;

    /*
     * 大賞混在裡面時要在確認彈窗裡點名（老闆 2026-08-24）。
     * 全選之後一鍵回收，最怕的就是把 A賞／最後賞跟著一般版一起收掉 ——
     * 回收不可復原，事後補不回來。判定沿用既有的 isMajorGrade
     *（SP／S／A／B／C 賞與最後賞），規則只留一份。
     */
    const majors = selectedItems
      .filter(item => isMajorGrade(item.grade))
      .map(item => ({ name: item.name, grade: item.grade }));

    setDismantleSummary({ count, totalValue, majors });
    setShowDismantleModal(true);
  };

  const handleConfirmDismantle = async () => {
    if (selectedForDelivery.length === 0) return;
    setIsSubmittingDismantle(true);

    try {
      const { data, error } = await supabase.rpc('dismantle_prizes', {
        p_record_ids: selectedForDelivery.map(id => Number(id)),
        p_user_id: user!.id
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const readNumberField = (value: unknown, key: string) => {
        if (!value || typeof value !== 'object') return 0;
        const record = value as Record<string, unknown>;
        const raw = record[key];
        if (typeof raw === 'number') return raw;
        if (typeof raw === 'string') {
          const parsed = Number(raw);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const successCount = readNumberField(row, 'success_count') || readNumberField(row, 'successCount');
      const totalRefund = readNumberField(row, 'total_refund') || readNumberField(row, 'totalRefund');

      if (!successCount || successCount <= 0) {
        toast.error('沒有可回收的獎項，請刷新後重試');
        return;
      }

      toast.success(`成功回收 ${successCount} 件獎項，獲得 ${totalRefund} 代幣！`);
      trackEvent('dismantle', { path: '/profile', meta: { count: successCount, refund_tokens: totalRefund } });
      setShowDismantleModal(false);
      setSelectedForDelivery([]);
      fetchUserData(); // Refresh list and balance
      await refreshProfile();
      
    } catch (error) {
      console.error('Dismantle Error:', error);
      toast.error((error as Error)?.message || '回收失敗，請稍後再試');
    } finally {
      setIsSubmittingDismantle(false);
    }
  };

  const handleUpdateProfile = async (field: string, value: string) => {
    // e.preventDefault();
    setIsUpdatingProfile(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      
      // Update specific fields based on input
      if (field === 'nickname') {
        updates.name = value;
      } else if (field === 'gender') {
        updates.gender = value;
      } else if (field === 'birthday') {
        updates.birthday = value;
      } else if (field === 'recipient') {
        updates.recipient_name = settingsForm.recipientName;
        updates.recipient_phone = settingsForm.recipientPhone;
        updates.address = settingsForm.recipientAddress;
      } else if (field === 'cvs') {
        updates.cvs_store_id = settingsForm.cvsStoreId;
        updates.cvs_store_name = settingsForm.cvsStoreName;
        updates.cvs_store_address = settingsForm.cvsStoreAddress;
        updates.cvs_recipient_name = settingsForm.cvsRecipientName;
        updates.cvs_recipient_phone = settingsForm.cvsRecipientPhone;
      } else if (field === 'all') {
        // Fallback for full update if needed
        updates.name = settingsForm.nickname;
        updates.recipient_name = settingsForm.recipientName;
        updates.recipient_phone = settingsForm.recipientPhone;
        updates.address = settingsForm.recipientAddress;
      }

      // In Supabase Auth, avatar is stored in user metadata, not directly in 'users' table
      // However, we might want to sync it to users table if we added an avatar_url column.
      // Based on error "Could not find the 'avatar_url' column of 'users'", the column doesn't exist.
      // So we should update auth metadata instead for avatar.
      if (settingsForm.avatarUrl) {
         // We handle avatar update separately in handleAvatarChange, 
         // but if we want to support updating it here, we should use updateUser
         // or remove this block if avatar_url is not in users table.
         // For now, let's remove it from 'updates' to avoid the error.
         // If we need to save it, we should use supabase.auth.updateUser()
         
         /* 
         updates.avatar_url = settingsForm.avatarUrl; 
         */
      }

      // Check if updates object is empty
      if (Object.keys(updates).length === 0) {
        setIsUpdatingProfile(false);
        return;
      }

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user!.id);

      if (error) throw error;

      await refreshProfile();
      toast.success('個人資料已更新');
      
      // Close modals
      if (field === 'nickname') setShowEditNickname(false);
      if (field === 'gender') setShowEditGender(false);
      if (field === 'birthday') setShowEditBirthday(false);
      if (field === 'recipient') setShowEditRecipient(false);
      if (field === 'cvs') setShowEditCvs(false);
      
    } catch (error: unknown) {
      console.error('Update Error Object:', error);
      console.error('Update Error JSON:', JSON.stringify(error, null, 2));
      const message = error instanceof Error ? error.message : '更新失敗';
      console.error('Update Error Message:', message);
      toast.error(message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };



  const handleSellClick = (item: WarehouseItem) => {
    setSellingItem(item);
    setSellPrice(0);
    setShowSellModal(true);
  };

  const handleConfirmSell = async () => {
    if (!sellingItem || !sellPrice || sellPrice <= 0) return;
    setIsSubmittingSell(true);

    // Set a timeout to prevent infinite hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('請求逾時，請稍後再試')), 10000);
    });

    try {
      const sellPromise = supabase.rpc('create_listing', {
        p_record_id: Number(sellingItem.id),
        p_price: sellPrice,
        p_user_id: user!.id
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await Promise.race([sellPromise, timeoutPromise]) as { data: { success: boolean; message: string }; error: any };

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      toast.success('上架成功！');
      setShowSellModal(false);
      setSellingItem(null);
      setSelectedForDelivery([]); // Clear selection
      await fetchUserData(); // Refresh list
    } catch (error) {
      console.error('Sell Error:', error);
      toast.error((error as Error).message || '上架失敗，請稍後再試');
    } finally {
      setIsSubmittingSell(false);
    }
  };

  const cancelListing = async (listingId: string) => {
    try {
      const { data, error } = await supabase.rpc('cancel_listing', {
        p_listing_id: Number(listingId),
        p_user_id: user!.id
      });

      if (error) throw error;
      if (data.success) {
        toast.success(data.message);
        fetchUserData();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error('Cancel listing error:', error);
      toast.error((error as Error).message || '取消上架失敗');
    }
  };

  const toggleMarketSelection = (id: string) => {
    setSelectedMarketItems(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleBulkCancelListing = async () => {
    if (selectedMarketItems.length === 0) return;

    const confirm = window.confirm(`確定要取消 ${selectedMarketItems.length} 件商品的上架嗎？`);
    if (!confirm) return;

    try {
      // Use Promise.all to cancel multiple listings
      await Promise.all(selectedMarketItems.map(id => 
        supabase.rpc('cancel_listing', {
          p_listing_id: Number(id),
          p_user_id: user!.id
        })
      ));

      toast.success('已取消所選商品上架');
      setSelectedMarketItems([]);
      fetchUserData();
    } catch (error) {
      console.error('Bulk cancel error:', error);
      toast.error('批量取消失敗');
    }
  };

  /**
   * 取消配送申請（老闆 2026-08-26 確認開放）
   *
   * 只有「已提交且還沒開配送單」能自己取消 —— 一旦託運單開出去，
   * 單子已經在綠界那邊，就得走客服。這個界線在 DB 也擋一次
   * （`cancel_my_delivery_order` 鎖單後再檢查），前端只是提早給提示，
   * 不是唯一的防線：玩家按下取消的同一刻，出貨人員可能正在按開配送單。
   */
  const canCancelDelivery = (order: DeliveryOrder) =>
    order.status === 'submitted' && (!order.tracking || order.tracking === '-');
  // ⚠️ 沒有物流單號時 `tracking` 是字串 '-' 不是空值（見上面的 mapping
  //    `order.tracking_number || '-'`），只寫 `!order.tracking` 永遠是 false，
  //    按鈕會一顆都不出現。

  const handleCancelDelivery = (order: DeliveryOrder) => {
    showAlert({
      title: '取消配送申請',
      type: 'confirm',
      variant: 'danger',
      confirmText: '確定取消',
      cancelText: '先不要',
      message: (
        <span>
          取消後，這批 <b>{order.itemsCount || order.items?.length || 0}</b> 件商品會放回你的倉庫，
          {/* 免運的單沒有運費可退，別寫死「運費會退回」；
              抽籤販售的品項另有價金，所以無運費時也不能斷言「不退錢」——
              實際退了多少由伺服器算完後在 toast 顯示 */}
          {order.shippingFee > 0
            ? <>申請時扣的 <b>{order.shippingFee}</b> 代幣會退回。</>
            : <>申請時扣的代幣會退回。</>}
          之後可以重新申請配送。
        </span>
      ),
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.rpc('cancel_my_delivery_order', {
            p_order_id: Number(order.id),
          });
          if (error) throw error;

          const refunded = Number((data as any)?.refunded ?? 0);
          toast.success(refunded > 0 ? `已取消，退回 ${refunded} 代幣` : '已取消，商品已放回倉庫');
          setExpandedOrderId(null);
          await fetchUserData();
        } catch (e: any) {
          // DB 端的三種擋法要翻成玩家看得懂的話
          const msg = String(e?.message || '');
          if (msg.includes('ALREADY_PROCESSING')) {
            toast.error('這筆訂單已經在出貨流程中，請聯繫客服協助');
          } else if (msg.includes('ORDER_NOT_FOUND')) {
            toast.error('找不到這筆訂單');
          } else {
            toast.error('取消失敗，請稍後再試');
          }
        }
      },
    });
  };

  const handleLogout = () => {
    showAlert({
      title: '登出確認',
      message: '確定要登出您的帳號嗎？',
      type: 'confirm',
      confirmText: '確認登出',
      onConfirm: async () => await logout(),
    });
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4 lg:p-8">
        <ProfileSkeleton />
      </div>
    );
  }

  const isGuest = !user;

  /*
   * 設定頁的必填項（對應各列的「立即設定」）；有任一未完成 → 齒輪顯示紅點。
   *
   * 手機驗證只在功能開著時才算 —— 沒接簡訊供應商的期間，發驗證碼一定失敗，
   * 掛著紅點等於一直催玩家去撞一道打不開的門（老闆 2026-08-20）。
   */
  const phoneVerifyEnabled = flags.phone_verify;
  const settingsIncomplete = !isGuest && !!user && (
    !user.name || (phoneVerifyEnabled && !user.is_phone_verified) || !user.email ||
    !settingsForm.gender || !settingsForm.birthday
  );

  const loginHref = '/login?redirect=%2Fprofile';

  const navItems = [
    { id: 'warehouse', label: '我的倉庫', icon: Box, color: 'text-primary' },
    { id: 'delivery', label: '配送管理', icon: Truck, color: 'text-accent-emerald' },
    { id: 'draw-history', label: '抽獎紀錄', icon: Trophy, color: 'text-accent-yellow' },
    { id: 'topup-history', label: '儲值紀錄', icon: History, color: 'text-blue-500' },
    { id: 'follows', label: '我的關注', icon: Heart, color: 'text-accent-red' },
    { id: 'coupons', label: '我的優惠券', icon: Ticket, color: 'text-pink-500' },
  ];

  const renderTabContent = () => {
    if (!user) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-neutral-50/60 dark:bg-neutral-900/60">
          <div className="mb-4">
            <User className="w-10 h-10 text-neutral-300" />
          </div>
          <p className="text-base font-black text-neutral-600 dark:text-neutral-200 mb-2">登入後可查看會員專屬內容</p>
          <p className="text-sm text-neutral-400 mb-6">倉庫、抽獎紀錄、配送訂單與儲值紀錄等資料僅對已登入會員顯示</p>
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center px-6 h-11 rounded-full bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 active:scale-95 transition-transform"
          >
            前往登入
          </Link>
        </div>
      );
    }
    // Determine if we should show a full page skeleton (e.g., initial load or non-warehouse tabs)
    // For warehouse tab, we want to keep the header visible during sub-tab switches
    if (isLoadingData && activeTab !== 'warehouse') {
      return (
        <div className="p-3 lg:p-8">
          <ProfileSkeleton />
        </div>
      );
    }

    switch (activeTab) {
      case 'warehouse':
        return (
          <>
            {/* Mobile Layout */}
            <div className="md:hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col min-h-[100dvh]">
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
              {/* Top Nav */}
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title={activeWarehouseTab === 'all' ? '我的倉庫' : '回收紀錄'}
                onBack={() => {
                    if (activeWarehouseTab === 'all') {
                      router.push('/profile', { scroll: false });
                    } else {
                      setActiveWarehouseTab('all');
                      setActiveWarehouseCategory('all');
                    }
                  }}
                right={<>{activeWarehouseTab === 'all' && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setActiveWarehouseTab('dismantled');
                        setActiveWarehouseCategory('all');
                      }}
                      className="text-[13px] font-bold text-neutral-500"
                    >
                      回收紀錄
                    </button>
                  </div>
                )}</>}
              />

              {/* Sticky Tabs */}
              {(activeWarehouseTab === 'all' || activeWarehouseTab === 'dismantled') && (
                <div className="relative z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 -mx-0">
                  <div className={cn(
                    "max-w-7xl mx-auto space-y-2 pt-0 pb-0"
                  )}>
                    {activeWarehouseTab === 'all' && (
                      /*
                       * 搜尋列（老闆 2026-08-24，照 Pokémon GO）。
                       *
                       * 類別頁籤原本擺在這裡：一排只塞得下六個，「自製賞」在 iPhone 上
                       * 還被右邊的篩選圖標切掉。現在類別收進「點搜尋才展開」的推薦面板
                       * （WarehouseSearchPanel），這一列只剩搜尋框與清除鍵。
                       *
                       * 沒在搜尋時，膠囊上顯示目前套用的篩選（例：一番賞・大賞），
                       * 玩家才知道自己看到的不是全部。
                       */
                      <div className="flex items-center gap-2 px-3 py-2">
                        {isWarehouseSearchOpen ? (
                          /* 展開狀態沒有返回箭頭（老闆 2026-08-24）：唯一的控制鍵就是框內的叉叉，
                             有東西就清掉、已經是空的就收起搜尋。兩個離開的出口只會讓人猶豫按哪個 */
                          <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-neutral-100 px-3 dark:bg-neutral-800">
                            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                            <input
                              ref={warehouseSearchInputRef}
                              value={warehouseSearch}
                              onChange={(e) => setWarehouseSearch(e.target.value)}
                              placeholder="搜尋獎品、系列、賞等"
                              autoFocus
                              className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-neutral-900 placeholder:font-medium placeholder:text-neutral-400 focus:outline-none dark:text-white"
                            />
                            <button
                              type="button"
                              aria-label={warehouseSearch || warehouseActiveFilterLabels.length > 0 ? '清除搜尋條件' : '關閉搜尋'}
                              onClick={() => {
                                if (warehouseSearch || warehouseActiveFilterLabels.length > 0) clearWarehouseFilters();
                                else setIsWarehouseSearchOpen(false);
                              }}
                              className="-mr-1 shrink-0 p-1 text-neutral-400 active:scale-90"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          /* 清除鍵是叉叉、擺在搜尋框**裡面**的最右邊（老闆 2026-08-24）。
                             外框因此不能是 <button> —— 按鈕不能包按鈕，改成 div 包
                             一顆佔滿的觸發鈕加一顆叉叉 */
                          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-neutral-100 px-3 dark:bg-neutral-800">
                            <button
                              type="button"
                              onClick={() => setIsWarehouseSearchOpen(true)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                              {/* 套用中的篩選畫成膠囊、關鍵字維持單純文字（老闆 2026-08-24）——
                                  一串「大賞・小賞・靈感文創」看起來像玩家自己打的字，
                                  分不出哪些是點出來的條件 */}
                              {warehouseActiveFilterLabels.length > 0 || warehouseSearch ? (
                                <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                                  {warehouseActiveFilterLabels.map(label => (
                                    <span
                                      key={label}
                                      className="shrink-0 rounded-full border border-neutral-200 bg-white px-2 py-[3px] text-[12px] font-black text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                                    >
                                      <span className="cjk-optical-center">{label}</span>
                                    </span>
                                  ))}
                                  {warehouseSearch && (
                                    <span className="truncate text-[14px] font-bold text-neutral-900 dark:text-white">
                                      {warehouseSearch}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="truncate text-[14px] font-medium text-neutral-400">
                                  搜尋獎品、系列、賞等
                                </span>
                              )}
                            </button>
                            {(warehouseSearch || warehouseActiveFilterLabels.length > 0) && (
                              <button
                                type="button"
                                aria-label="清除搜尋條件"
                                onClick={clearWarehouseFilters}
                                className="-mr-1 shrink-0 p-1 text-neutral-400 active:scale-90"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* 排序：老闆 2026-08-24 指定放在原本「清除」的位置。
                            搜尋展開時收起來，那時整條框要留給輸入 */}
                        {!isWarehouseSearchOpen && (
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              aria-label="排序"
                              onClick={() => setIsWarehouseSortOpen(prev => !prev)}
                              /* 圖標與下拉樣式完全照首頁那顆（app/page.tsx 的 isFilterOpen 區塊）：
                                 三橫線 svg、未套用時灰色、套用或展開時主題色底。
                                 全站的排序入口長一樣，玩家不用重新學 */
                              className={cn(
                                'ml-1 mr-1 p-1.5 rounded-full transition-all active:scale-95',
                                warehouseSort === 'time_desc' && !isWarehouseSortOpen
                                  ? 'text-neutral-500 hover:text-primary hover:bg-primary/5'
                                  : 'text-primary bg-primary/5',
                              )}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                className="w-4 h-4"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M4 4h16" />
                                <path d="M6 12h12" />
                                <path d="M10 20h4" />
                              </svg>
                            </button>
                            {isWarehouseSortOpen && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setIsWarehouseSortOpen(false)} />
                                <div className="absolute right-0 z-40 mt-2 w-44 rounded-lg border border-neutral-100 bg-white py-2 shadow-modal dark:border-neutral-800 dark:bg-neutral-900">
                                  {WAREHOUSE_SORTS.map(opt => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => { setWarehouseSort(opt.id); setIsWarehouseSortOpen(false); }}
                                      className={cn(
                                        'w-full px-4 py-2.5 text-left text-[13px] font-black transition-colors',
                                        warehouseSort === opt.id
                                          ? 'bg-primary/5 text-primary'
                                          : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white',
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 出貨說明 */}
              {activeWarehouseTab === 'all' && (
                <div className="bg-neutral-800 dark:bg-neutral-900 px-4 py-1.5 flex-shrink-0">
                  <p className="text-[11px] text-neutral-300 leading-[1.45]">
                    訂單以廠商為單位分批出貨，每次申請限同一廠商品項。含公仔等大尺寸品項因超商包裝規格限制，一律以宅配方式出貨。
                  </p>
                </div>
              )}

              {/* Content List */}
              </div>{/* /sticky */}
              <div
                ref={mobileWarehouseScrollRef}
                data-warehouse-scroll
                className="p-0 pb-24 bg-neutral-50 dark:bg-neutral-950"
              >
                {isLoadingData ? (
                  <div className="grid grid-cols-3 gap-2 p-2">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1.5">
                        <div className="aspect-square w-full rounded-lg bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                        <div className="mt-1.5 h-3 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : activeWarehouseTab === 'all' && isWarehouseSearchOpen && !warehouseSearch.trim() ? (
                  /* 搜尋展開、還沒打字 → 推薦面板（PoGO 的作法）。
                     一開始打字就換回下面的格狀清單，即時濾 —— 不打字也要有東西可點，
                     否則把類別藏進搜尋等於斷掉休閒玩家的瀏覽路徑 */
                  <WarehouseSearchPanel
                    groups={warehouseChipGroups}
                    recentTerms={warehouseTopSeries}
                    onPickTerm={(term) => setWarehouseSearch(term)}
                  />
                ) : activeWarehouseTab === 'all' ? (
                  filteredWarehouseItems.length === 0 ? (
                    <div className="py-20 text-center text-neutral-400">
                      <Box className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="font-black text-sm uppercase tracking-widest">沒有相關獎項</p>
                      {(warehouseSearch || warehouseActiveFilterLabels.length > 0) && (
                        <button
                          type="button"
                          onClick={clearWarehouseFilters}
                          className="mt-4 rounded-full border border-neutral-200 px-4 py-2 text-[13px] font-black text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
                        >
                          清除搜尋條件
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                    {/* 格狀三欄，一支一格（不合併同品項 —— 玩家常要留一張、其餘回收）。
                        一屏從 7 件變 15 格 */}
                    <div className="grid grid-cols-3 gap-2 p-2">
                      {sortedWarehouseItems.slice(0, mobileWarehouseDisplayCount).map((item) => {
                        const isPending = item.status === 'pending_delivery';
                        const isListed = item.status === 'listing';
                        return (
                          <WarehouseGridCell
                            key={item.id}
                            name={item.name}
                            grade={item.grade}
                            image={item.image}
                            selected={selectedForDeliverySet.has(item.id)}
                            major={isMajorGrade(item.grade)}
                            pending={isPending}
                            listed={isListed}
                            onToggle={() => toggleDeliverySelection(item.id)}
                          />
                        );
                      })}
                    </div>
                    <div ref={mobileWarehouseSentinelRef} className="py-4 text-center text-xs text-neutral-400">
                      {mobileWarehouseDisplayCount < sortedWarehouseItems.length ? '載入中...' : '到底了'}
                    </div>
                    </>
                  )
                ) : (
                  // Dismantled List (Mobile)
                  filteredDismantledItems.length === 0 ? (
                    <div className="py-20 text-center text-neutral-400">
                      <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="font-black text-sm uppercase tracking-widest">尚無回收紀錄</p>
                    </div>
                  ) : (
                    <>
                      {/* Time Filter Tabs - Removed duplicate */}
          
                      <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                        {filteredDismantledItems.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-2">
                            <div className="relative w-[56px] h-[56px] rounded-[8px] bg-white overflow-hidden flex-shrink-0 border border-neutral-100 dark:border-neutral-800">
                              <Image
                                src={item.image || asset('/images/item_defaulet.webp')}
                                alt={item.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <div className="flex-1 min-w-0 py-0.5 space-y-0.5">
                              <p className="text-[11px] text-neutral-400 font-medium truncate">{item.supplierName || ''}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-primary font-black bg-primary/8 px-1.5 py-0.5 rounded-xl border border-primary/10 whitespace-nowrap flex-shrink-0">
                                  {item.grade}
                                </span>
                                <h4 className="text-[13px] font-bold text-neutral-900 dark:text-white leading-tight truncate">
                                  {item.name}
                                </h4>
                              </div>
                              <p className="text-[11px] text-neutral-400 font-medium truncate">{item.series}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[13px] font-black text-accent-red">+{item.recycleValue}</span>
                                <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                              </div>
                              <span className="text-[10px] text-neutral-400 font-bold">{item.dismantled_at}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                )}
              </div>

              {/* 「我要賣」懸浮鈕（老闆 2026-09-02）：倉庫畫面右下角、底部「全選」bar 上方，
                  直達交易所的上架表單（?v=sell 直開）。手機版倉庫是 fixed z-[60] 的全螢幕層，
                  按鈕必須放在這一層裡面，放外面會被整層蓋掉。
                  交易所在 App 內是 404（賭博三要件疑慮，見 lib/nativeApp.ts），App 內不顯示 */}
              {activeWarehouseTab === 'all' && flags.market && !inApp && (
                <button
                  type="button"
                  onClick={() => router.push('/market?tab=mine&v=sell')}
                  className="fixed right-4 z-[60] w-14 h-14 text-white text-[14.5px] font-black active:brightness-90 flex items-center justify-center"
                  style={{
                    /* 「全選」bar 收起時跟著坐下去，不然中間空一塊（老闆 2026-09-02） */
                    bottom: warehouseBarHidden
                      ? 'calc(16px + env(safe-area-inset-bottom))'
                      : 'calc(88px + env(safe-area-inset-bottom))',
                    transition: 'bottom .3s ease',
                    textShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
                    /* font-black 已是 900 上限，再粗只能用同色描邊增厚筆畫 */
                    WebkitTextStroke: '0.6px #fff',
                    /* 呼吸動畫佔用 transform，按壓回饋改走 brightness */
                    animation: 'fab-breathe 2.8s ease-in-out infinite',
                    /* 玻璃感紅球（老闆 2026-09-02 給的 Figma 樣式） */
                    borderRadius: 83,
                    border: '2px solid rgba(255, 255, 255, 0.49)',
                    background:
                      'radial-gradient(138.49% 66.88% at 36.14% 16.67%, rgba(255, 115, 115, 0.23) 0%, rgba(94, 46, 46, 0.00) 86.18%), ' +
                      'radial-gradient(83.94% 83.94% at 26.39% 20.83%, rgba(255, 255, 255, 0.41) 0%, rgba(255, 255, 255, 0.00) 69.79%, rgba(255, 255, 255, 0.00) 100%), ' +
                      '#EC0E52',
                    boxShadow: '-3px -4px 7px 0 rgba(255, 255, 255, 0.15) inset, 4px 38px 62px 0 rgba(0, 0, 0, 0.50)',
                  }}
                >
                  我要賣
                </button>
              )}

              {/* Mobile Fixed Bottom Bar (Only for Warehouse Tab)；下滑收起、往回撥出現（同首頁） */}
              {activeWarehouseTab === 'all' && (
                <div
                  className="fixed bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] z-[60] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex items-center px-3 transition-transform duration-300"
                  style={warehouseBarHidden ? { transform: 'translateY(100%)' } : undefined}
                >
                  {selectedForDelivery.length === 0 ? (
                    <button
                      onClick={() => setSelectedForDelivery(selectAllTarget.ids)}
                      disabled={selectAllTarget.ids.length === 0}
                      className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 h-[44px] rounded-xl text-base font-black disabled:opacity-40"
                    >
                      全選 ({selectAllTarget.ids.length})
                    </button>
                  ) : (
                    /* 整排就一層 flex、一個 gap：取消跟右邊那幾顆同高（h-[44px]）、
                       間距也一樣（gap-2）。之前分兩組包起來，組間是 gap-3、組內 gap-2，
                       取消跟曬圖中間就比其他縫大一截（老闆 2026-08-24） */
                    <div className="flex w-full items-center gap-2">
                            <span className="shrink-0 text-sm font-black text-neutral-900 dark:text-white">已選 {selectedForDelivery.length}</span>
                            <button
                              onClick={() => setSelectedForDelivery([])}
                              className="h-[44px] shrink-0 rounded-xl bg-neutral-100 px-4 text-base font-black text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                            >
                              取消
                            </button>
                            {/* 曬圖：勾單一件就能曬，不分賞等（老闆 2026-08-25：曬圖形式無所謂，
                                同一張底圖就好）。原本卡在「只有大獎」，但轉蛋／盒玩根本沒有賞等分級，
                                那兩類 1,193 件永遠曬不了 —— 等於把一半的玩家排除在分享之外 */}
                            {selectedForDelivery.length === 1 && (
                              <button
                                onClick={handleShareClick}
                                disabled={isLoadingShare}
                                className="flex-1 bg-[#6d3bd6] text-white h-[44px] rounded-xl text-base font-black disabled:opacity-60"
                              >
                                {isLoadingShare ? '處理中' : '曬圖'}
                              </button>
                            )}
                            <button onClick={handleDismantleClick} className="flex-1 bg-accent-red text-white h-[44px] rounded-xl text-base font-black">回收</button>
                            {selectedForDelivery.length <= 10 && canDeliverSelection && (
                              <>
                                {/* 倉庫的上架彈窗與交易所的上架表單強碰，老闆 2026-09-02 拍板留交易所那個：
                                倉庫這顆上架入口隱藏，上架一律走 /market「我的上架 → 去上架」 */}
                                <button
                                  onClick={() => { trackEvent('delivery_modal_open', { path: '/profile', meta: { count: selectedForDelivery.length } }); setShowDeliveryModal(true); }}
                                  disabled={Boolean(selectedForDelivery.some(id => {
                                    const itm = warehouseItems.find(i => i.id === id);
                                    return Boolean(itm?.isPreorder && itm?.preorderAvailableAt && new Date(itm.preorderAvailableAt).getTime() > Date.now());
                                  }))}
                                  className="flex-1 bg-primary text-white h-[44px] rounded-xl text-base font-black disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  配送
                                </button>
                              </>
                            )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* 桌機（1024 起、掛在 cardx 外殼裡）——照手機端倉庫（老闆 2026-09-05：「你就不能參照手機端嗎」）：
                標題列右邊「回收紀錄」、一個搜尋框點了展開篩選面板（WarehouseSearchPanel）、最右邊排序圖標、
                全選固定在最下面。狀態全部跟手機共用（warehouseSearch／isWarehouseSearchOpen／warehouseSort…），
                只有商品格的欄數與捲到底自動載入是桌機自己的 */}
            <div className="hidden md:block">
              {(() => {
                const isAll = activeWarehouseTab === 'all';
                const list = sortedWarehouseItems;
                const dlist = filteredDismantledItems;
                const shown = list.slice(0, desktopWarehouseDisplayCount);
                const shownDismantled = dlist.slice(0, desktopWarehouseDisplayCount);
                const hasMore = isAll ? shown.length < list.length : shownDismantled.length < dlist.length;
                /* 132 是量過的：右欄在 1024（平板橫向）約 434 寬排 3 欄、1280 排 4 欄、1440 排 5 欄 */
                const gridStyle: React.CSSProperties = { gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))' };
                const preorderLocked = selectedForDelivery.some((id) => {
                  const itm = warehouseItems.find((i) => i.id === id);
                  return !!(itm?.isPreorder && itm?.preorderAvailableAt && new Date(itm.preorderAvailableAt).getTime() > Date.now());
                });
                const showPanel = isAll && isWarehouseSearchOpen && !warehouseSearch.trim();
                return (
                  <>
                    {/* 標題列：左邊標題＋件數，右邊「回收紀錄」；回收紀錄那頁左邊是返回箭頭 */}
                    <div className="flex h-10 items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-2">
                        {!isAll && (
                          <button
                            type="button"
                            aria-label="回到我的倉庫"
                            onClick={() => { setActiveWarehouseTab('all'); setActiveWarehouseCategory('all'); }}
                            className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
                          >
                            <ChevronLeft className="h-5 w-5 stroke-[2.5]" />
                          </button>
                        )}
                        <h2 className="text-[20px] font-black tracking-tight text-neutral-900">{isAll ? '我的倉庫' : '回收紀錄'}</h2>
                        <span className="text-[13px] font-bold text-neutral-500">{isAll ? `${list.length} 件` : `${dlist.length} 筆`}</span>
                      </div>
                      {isAll && (
                        <button
                          type="button"
                          onClick={() => { setActiveWarehouseTab('dismantled'); setActiveWarehouseCategory('all'); }}
                          className="text-[13px] font-bold text-neutral-500 hover:text-neutral-900"
                        >
                          回收紀錄
                        </button>
                      )}
                    </div>

                    {isAll && (
                      <>
                        {/* 搜尋列（同手機）：收起時是一顆膠囊、套用中的篩選畫成小膠囊；點了展開成輸入框；最右邊排序 */}
                        <div className="mt-3 flex items-center gap-2">
                          {isWarehouseSearchOpen ? (
                            <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-neutral-100 px-3">
                              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                              <input
                                value={warehouseSearch}
                                onChange={(e) => setWarehouseSearch(e.target.value)}
                                placeholder="搜尋獎品、系列、賞等"
                                autoFocus
                                className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-neutral-900 placeholder:font-medium placeholder:text-neutral-400 focus:outline-none"
                              />
                              <button
                                type="button"
                                aria-label={warehouseSearch || warehouseActiveFilterLabels.length > 0 ? '清除搜尋條件' : '關閉搜尋'}
                                onClick={() => {
                                  if (warehouseSearch || warehouseActiveFilterLabels.length > 0) clearWarehouseFilters();
                                  else setIsWarehouseSearchOpen(false);
                                }}
                                className="-mr-1 shrink-0 p-1 text-neutral-400 hover:text-neutral-700"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-neutral-100 px-3">
                              <button type="button" onClick={() => setIsWarehouseSearchOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                                {warehouseActiveFilterLabels.length > 0 || warehouseSearch ? (
                                  <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                                    {warehouseActiveFilterLabels.map((label) => (
                                      <span key={label} className="shrink-0 rounded-full border border-neutral-200 bg-white px-2 py-[3px] text-[12px] font-black text-neutral-700">
                                        <span className="cjk-optical-center">{label}</span>
                                      </span>
                                    ))}
                                    {warehouseSearch && <span className="truncate text-[14px] font-bold text-neutral-900">{warehouseSearch}</span>}
                                  </span>
                                ) : (
                                  <span className="truncate text-[14px] font-medium text-neutral-400">搜尋獎品、系列、賞等</span>
                                )}
                              </button>
                              {(warehouseSearch || warehouseActiveFilterLabels.length > 0) && (
                                <button type="button" aria-label="清除搜尋條件" onClick={clearWarehouseFilters} className="-mr-1 shrink-0 p-1 text-neutral-400 hover:text-neutral-700">
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                          {!isWarehouseSearchOpen && (
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                aria-label="排序"
                                onClick={() => setIsWarehouseSortOpen((prev) => !prev)}
                                className={cn(
                                  'rounded-full p-2 transition-all',
                                  warehouseSort === 'time_desc' && !isWarehouseSortOpen ? 'text-neutral-500 hover:bg-primary/5 hover:text-primary' : 'bg-primary/5 text-primary',
                                )}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 4h16" /><path d="M6 12h12" /><path d="M10 20h4" />
                                </svg>
                              </button>
                              {isWarehouseSortOpen && (
                                <>
                                  <div className="fixed inset-0 z-30" onClick={() => setIsWarehouseSortOpen(false)} />
                                  <div className="absolute right-0 z-40 mt-2 w-44 rounded-lg border border-neutral-100 bg-white py-2 shadow-modal">
                                    {WAREHOUSE_SORTS.map((opt) => (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => { setWarehouseSort(opt.id); setIsWarehouseSortOpen(false); }}
                                        className={cn('w-full px-4 py-2.5 text-left text-[13px] font-black transition-colors', warehouseSort === opt.id ? 'bg-primary/5 text-primary' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900')}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {/* 出貨規則提示（同手機那條） */}
                        <div className="mt-3 rounded-xl bg-neutral-800 px-4 py-2.5 text-[12px] font-medium leading-relaxed text-white/90">
                          訂單以廠商為單位分批出貨，每次申請限同一廠商品項。含公仔等大尺寸品項因超商包裝規格限制，一律以宅配方式出貨。
                        </div>
                      </>
                    )}

                    {/* 內容 */}
                    <div className="mt-4">
                      {isLoadingData ? (
                        <div className="grid gap-3" style={gridStyle}>
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-white ring-1 ring-[#e5e7eb]" />
                          ))}
                        </div>
                      ) : showPanel ? (
                        /* 搜尋展開、還沒打字 → 篩選面板（同手機） */
                        <div className="rounded-[16px] bg-white ring-1 ring-[#e5e7eb]">
                          <WarehouseSearchPanel
                            groups={warehouseChipGroups}
                            recentTerms={warehouseTopSeries}
                            onPickTerm={(term) => setWarehouseSearch(term)}
                          />
                        </div>
                      ) : isAll ? (
                        list.length === 0 ? (
                          <div className="py-20 text-center text-neutral-400">
                            <Box className="mx-auto mb-4 h-12 w-12 opacity-20" />
                            <p className="text-sm font-black">目前沒有符合條件的獎品</p>
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-3" style={gridStyle}>
                              {shown.map((item) => (
                                <WarehouseGridCell
                                  key={item.id}
                                  name={item.name}
                                  grade={item.grade}
                                  image={item.image}
                                  selected={selectedForDeliverySet.has(item.id)}
                                  major={isMajorGrade(item.grade)}
                                  pending={item.status === 'pending_delivery'}
                                  listed={item.status === 'listing'}
                                  onToggle={() => toggleDeliverySelectionDesktop(item.id)}
                                  checkCorner
                                />
                              ))}
                            </div>
                            <div ref={desktopWarehouseSentinel} className="py-5 text-center text-[12px] font-bold text-neutral-400">
                              {hasMore ? '載入中…' : `已顯示全部 ${list.length} 件`}
                            </div>
                          </>
                        )
                      ) : dlist.length === 0 ? (
                        <div className="py-20 text-center text-neutral-400">
                          <Box className="mx-auto mb-4 h-12 w-12 opacity-20" />
                          <p className="text-sm font-black">還沒有回收紀錄</p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {shownDismantled.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 rounded-[14px] bg-white px-4 py-3 ring-1 ring-[#e5e7eb]">
                                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-[#f3f4f6]">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={item.image || asset('/images/item_defaulet.webp')} alt="" className="absolute inset-0 h-full w-full object-contain" />
                                </div>
                                <GradeBadge grade={item.grade} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[14px] font-black text-neutral-900">{item.name}</div>
                                  <div className="truncate text-[12px] font-bold text-neutral-500">{item.series}</div>
                                </div>
                                <div className="whitespace-nowrap text-[12px] font-bold text-neutral-500">{item.dismantled_at}</div>
                                <div className="whitespace-nowrap text-[14px] font-black text-accent-emerald">+{item.recycleValue.toLocaleString()} G</div>
                              </div>
                            ))}
                          </div>
                          <div ref={desktopWarehouseSentinel} className="py-5 text-center text-[12px] font-bold text-neutral-400">
                            {hasMore ? '載入中…' : `已顯示全部 ${dlist.length} 筆`}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 固定在最下面的操作列（同手機底部列）：沒勾東西是「全選」，勾了變成 已選／取消／曬圖／回收／配送 */}
                    {/* 固定在最下面（同手機），但不滿寬——那是手機端做法（老闆 2026-09-05）：左邊文字、右邊一排小顆按鈕 */}
                    {isAll && !showPanel && (
                      <div className="sticky bottom-0 z-30 -mx-1 mt-2 border-t border-neutral-100 bg-[#f9fafb]/95 px-1 pb-4 pt-3 backdrop-blur">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-baseline gap-2">
                            {selectedForDelivery.length === 0 ? (
                              <span className="text-[13px] font-bold text-neutral-500">勾選獎品後可申請配送或回收</span>
                            ) : (
                              <>
                                <span className="text-[14px] font-black text-neutral-900">已選 {selectedForDelivery.length} 件</span>
                                {!canDeliverSelection ? (
                                  <span className="text-[12px] font-bold text-neutral-500">跨廠商的獎品不能一起配送，只能回收</span>
                                ) : selectedForDelivery.length > 10 ? (
                                  <span className="text-[12px] font-bold text-neutral-500">一次最多配送 10 件</span>
                                ) : null}
                              </>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {selectedForDelivery.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => setSelectedForDelivery(selectAllTarget.ids)}
                                disabled={selectAllTarget.ids.length === 0}
                                className="h-10 rounded-xl bg-neutral-900 px-5 text-[14px] font-black text-white disabled:opacity-40"
                              >
                                全選 ({selectAllTarget.ids.length})
                              </button>
                            ) : (
                              <>
                                <button type="button" onClick={() => setSelectedForDelivery([])} className="h-10 rounded-xl bg-neutral-100 px-4 text-[14px] font-black text-neutral-600 hover:bg-neutral-200">
                                  取消
                                </button>
                                {selectedForDelivery.length === 1 && (
                                  <button type="button" onClick={handleShareClick} disabled={isLoadingShare} className="h-10 rounded-xl bg-[#6d3bd6] px-4 text-[14px] font-black text-white disabled:opacity-60">
                                    {isLoadingShare ? '處理中' : '曬圖'}
                                  </button>
                                )}
                                <button type="button" onClick={handleDismantleClick} className="h-10 rounded-xl bg-accent-red px-4 text-[14px] font-black text-white">
                                  回收 ({selectedForDelivery.length})
                                </button>
                                {selectedForDelivery.length <= 10 && canDeliverSelection && (
                                  <button
                                    type="button"
                                    onClick={() => { trackEvent('delivery_modal_open', { path: '/profile', meta: { count: selectedForDelivery.length } }); setShowDeliveryModal(true); }}
                                    disabled={preorderLocked}
                                    className="h-10 rounded-xl bg-primary px-5 text-[14px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    配送 ({selectedForDelivery.length})
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            {/* Delivery Modal */}
            <AnimatePresence>
              {/* 曬獎圖彈窗（Canvas 合成，見 components/warehouse/PrizeShareCard） */}
              {shareData && <PrizeShareCard data={shareData} onClose={() => setShareData(null)} />}

            </AnimatePresence>
            {/* Dismantle Modal */}
            <AnimatePresence>
              {showDismantleModal && (
                <div className={cn("fixed inset-0 z-[100] flex justify-center bg-black/50 backdrop-blur-sm", isDesktop ? "items-center p-4" : "items-end p-0")}>
                  <motion.div 
                    initial={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }}
                    animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
                    exit={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    drag={isDesktop ? false : "y"}
                    dragConstraints={{ top: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_, info) => {
                      if (!isDesktop && info.offset.y > 100) setShowDismantleModal(false);
                    }}
                    className={cn(
                      "bg-white dark:bg-neutral-900 w-full overflow-hidden shadow-2xl flex flex-col",
                      isDesktop ? "rounded-3xl max-w-lg" : "rounded-t-3xl max-w-none max-h-[90vh]"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 shrink-0",
                      isDesktop ? "p-6" : "px-4 py-3"
                    )}>
                      <h3 className={cn("font-black text-neutral-900 dark:text-white", isDesktop ? "text-xl" : "text-base")}>確認回收項目</h3>
                      <button onClick={() => setShowDismantleModal(false)} className="w-8 h-8 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                        <X className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                      </button>
                    </div>
                    <div className={cn("flex-1 overflow-y-auto", isDesktop ? "p-6 space-y-4" : "p-3 space-y-3")}>
                      <div className={cn("bg-neutral-50 dark:bg-neutral-800 rounded-xl space-y-2", isDesktop ? "p-4" : "p-3")}>
                        <div className={cn("flex justify-between", isDesktop ? "text-sm" : "text-[13px]")}>
                          <span className="text-neutral-500 dark:text-neutral-400 font-bold">回收數量</span>
                          <span className="font-black text-neutral-900 dark:text-white">{dismantleSummary.count.toLocaleString()} 件</span>
                        </div>
                        <div className={cn("flex justify-between", isDesktop ? "text-sm" : "text-[13px]")}>
                          <span className="text-neutral-500 dark:text-neutral-400 font-bold">預計獲得代幣</span>
                          <span className="font-black text-accent-red flex items-center gap-1">
                            <RefreshCw className="w-3.5 h-3.5" />
                            {dismantleSummary.totalValue.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {dismantleSummary.majors.length > 0 && (
                        /* 大賞警告擺在數量上面 —— 這是玩家最需要先看到的一件事 */
                        <div className={cn("rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10", isDesktop ? "p-4" : "p-3")}>
                          <div className="flex">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <p className={cn("font-black text-amber-700 dark:text-amber-300", isDesktop ? "text-sm" : "text-[13px]")}>
                                這批裡有 {dismantleSummary.majors.length} 件大賞
                              </p>
                              <ul className="space-y-1">
                                {dismantleSummary.majors.slice(0, 5).map((m, i) => (
                                  /* 膠囊用固定高的 inline-flex 置中；品名也套 cjk-optical-center，
                                     兩邊的中文字才會落在同一條視覺中線 —— 只有膠囊套的話，
                                     品名會比膠囊裡的字高約 1.5px（PingFang 的墨水本來就偏上） */
                                  <li key={i} className="flex items-center gap-1.5">
                                    <span className="inline-flex h-[18px] shrink-0 items-center justify-center rounded bg-primary px-1.5 text-[10px] font-black leading-none text-white">
                                      <span className="cjk-optical-center">{m.grade}</span>
                                    </span>
                                    <span className={cn("cjk-optical-center truncate font-bold text-amber-800 dark:text-amber-200", isDesktop ? "text-[13px]" : "text-[12px]")}>
                                      {m.name}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {dismantleSummary.majors.length > 5 && (
                                <p className={cn("font-bold text-amber-600 dark:text-amber-400", isDesktop ? "text-xs" : "text-[11px]")}>
                                  還有 {dismantleSummary.majors.length - 5} 件
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className={cn("bg-accent-red/5 dark:bg-accent-red/10 rounded-xl border border-accent-red/10 dark:border-accent-red/20", isDesktop ? "p-4" : "p-3")}>
                        <div className="flex">
                          <div className="space-y-1">
                            <p className={cn("font-black text-accent-red", isDesktop ? "text-sm" : "text-[13px]")}>注意：回收後無法復原</p>
                            <p className={cn("text-accent-red/80 font-bold leading-relaxed", isDesktop ? "text-xs" : "text-[11px]")}>
                              確認回收後，獎項將會從倉庫移除並轉換為代幣。代幣可用於再次抽獎或兌換其他商品。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      "border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center gap-3 shrink-0 mt-auto",
                      isDesktop ? "h-24 px-6" : "min-h-16 px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
                    )}>
                      <button 
                        onClick={() => setShowDismantleModal(false)} 
                        className={cn(
                          "flex-1 rounded-xl font-black text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-neutral-50 dark:bg-neutral-800",
                          isDesktop ? "h-[52px] text-lg" : "h-[44px] text-base"
                        )}
                      >
                        取消
                      </button>
                      <button 
                        onClick={handleConfirmDismantle}
                        disabled={isSubmittingDismantle}
                        className={cn(
                          "flex-1 bg-accent-red text-white rounded-xl font-black shadow-lg shadow-accent-red/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2",
                          isDesktop ? "h-[52px] text-lg" : "h-[44px] text-base"
                        )}
                      >
                        {isSubmittingDismantle ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>處理中...</span>
                          </>
                        ) : (
                          <span>{dismantleSummary.majors.length > 0 ? '仍要回收' : '確認回收'}</span>
                        )}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
            {/* Sell Modal */}
            <AnimatePresence>
              {showSellModal && (
                <div 
                  className={cn("fixed inset-0 z-[100] flex justify-center bg-black/50 backdrop-blur-sm", isDesktop ? "items-center p-4" : "items-end p-0")}
                  onClick={(e) => {
                    // Close when clicking backdrop
                    if (e.target === e.currentTarget) setShowSellModal(false);
                  }}
                >
                  <motion.div 
                    initial={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }}
                    animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
                    exit={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className={cn(
                      "bg-white dark:bg-neutral-900 w-full overflow-hidden shadow-2xl flex flex-col relative",
                      isDesktop ? "rounded-3xl max-w-lg" : "rounded-t-3xl max-w-none max-h-[90vh]"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={cn(
                      "flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 shrink-0",
                      isDesktop ? "p-6" : "px-4 py-3"
                    )}>
                      <h3 className={cn("font-black text-neutral-900 dark:text-white", isDesktop ? "text-xl" : "text-base")}>上架市集</h3>
                      <button 
                        onClick={() => setShowSellModal(false)} 
                        type="button"
                        className="w-8 h-8 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors touch-manipulation z-50"
                      >
                        <X className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                      </button>
                    </div>
                    <div className={cn("flex-1 overflow-y-auto", isDesktop ? "p-6 space-y-4" : "p-3 space-y-3")}>
                      {sellingItem && (
                        <div className={cn("bg-neutral-50 dark:bg-neutral-800 rounded-xl flex items-center gap-4", isDesktop ? "p-4" : "p-3")}>
                          <Image 
                            src={sellingItem.image || asset('/images/item_defaulet.webp')} 
                            alt={sellingItem.name} 
                            width={64} 
                            height={64} 
                            className="object-cover rounded-lg bg-white dark:bg-neutral-700" 
                            unoptimized
                          />
                          <div>
                            <span className="px-2 py-0.5 bg-accent-red text-white text-[10px] font-black rounded-xl uppercase">{sellingItem.grade}</span>
                            <h4 className={cn("font-black text-neutral-900 dark:text-white mt-1 line-clamp-1", isDesktop ? "text-sm" : "text-[13px]")}>{sellingItem.name}</h4>
                            <p className="text-xs text-neutral-400 font-bold mt-0.5">{sellingItem.series}</p>
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <label className={cn("font-black text-neutral-500 dark:text-neutral-400", isDesktop ? "text-sm" : "text-[13px]")}>設定價格 (代幣)</label>
                        <div className="relative">
                          <div className={cn("absolute top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none", isDesktop ? "left-4" : "left-3")}>
                             <div className="relative w-5 h-5">
                               <Image
                                 src={asset("/images/gcoin.webp")}
                                 alt="G"
                                 fill
                                 className="object-contain"
                               />
                             </div>
                          </div>
                          <input 
                            type="number" 
                            min="1"
                            value={sellPrice === 0 ? '' : sellPrice} 
                            onBlur={() => {
                              // Fix for iOS keyboard dismiss layout issue
                              window.scrollTo(0, window.scrollY);
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setSellPrice(0);
                                return;
                              }
                              let num = parseInt(val);
                              if (!isNaN(num)) {
                                if (num > 50000) {
                                  num = 50000;
                                }
                                setSellPrice(num);
                                // Remove leading zeros immediately if the input differs from the parsed number
                                if (val !== num.toString()) {
                                  e.target.value = num.toString();
                                }
                              }
                            }}
                            className={cn(
                              "w-full bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 font-black text-neutral-900 dark:text-white text-center flex items-center justify-center",
                              isDesktop ? "h-12 px-12 text-lg" : "h-10 px-10 text-base"
                            )}
                            placeholder="輸入價格"
                          />
                        </div>
                      </div>

                      <div className={cn("bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700", isDesktop ? "p-4" : "p-3")}>
                        <div className="flex gap-3">
                          <Info className="w-5 h-5 text-neutral-400 flex-shrink-0" />
                          <div className="space-y-1 w-full">
                            <p className={cn("font-black text-neutral-900 dark:text-white", isDesktop ? "text-sm" : "text-[13px]")}>上架須知</p>
                            <ul className={cn("text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed list-disc list-inside", isDesktop ? "text-xs" : "text-[11px]")}>
                              <li>交易成功後，平台將收取 5% 手續費</li>
                              <li>實際上架後，獎項將從倉庫中暫時移除</li>
                              <li>成交後獎項將綁定買家，無法再次交易</li>
                            </ul>
                            <div className={cn("pt-2 flex justify-between font-black text-neutral-700 dark:text-neutral-300 border-t border-neutral-200 dark:border-neutral-700 mt-2", isDesktop ? "text-sm" : "text-[13px]")}>
                              <span>預計手續費 (5%)</span>
                              <span>{Math.floor(sellPrice * 0.05).toLocaleString()} 代幣</span>
                            </div>
                            <div className={cn("flex justify-between font-black text-neutral-900 dark:text-white", isDesktop ? "text-sm" : "text-[13px]")}>
                              <span>預計實收</span>
                              <span>{(sellPrice - Math.floor(sellPrice * 0.05)).toLocaleString()} 代幣</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      "border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center gap-3 shrink-0 mt-auto",
                      isDesktop ? "h-24 px-6" : "min-h-16 px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
                    )}>
                      <button 
                        onClick={() => setShowSellModal(false)} 
                        className={cn(
                          "flex-1 rounded-xl font-black text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-neutral-50 dark:bg-neutral-800",
                          isDesktop ? "h-[52px] text-lg" : "h-[44px] text-base"
                        )}
                      >
                        取消
                      </button>
                      <button 
                        onClick={handleConfirmSell}
                        disabled={isSubmittingSell || sellPrice <= 0}
                        type="button"
                        className={cn(
                          "flex-1 bg-accent-yellow text-neutral-800 rounded-xl font-black shadow-lg shadow-accent-yellow/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 touch-manipulation",
                          isDesktop ? "h-[52px] text-lg" : "h-[44px] text-base"
                        )}
                      >
                        {isSubmittingSell ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>處理中...</span>
                          </>
                        ) : (
                          <span>確認上架</span>
                        )}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>



            {/* Warehouse Item Detail Modal */}
            <WarehouseItemDetailModal
              item={viewingItem}
              isOpen={!!viewingItem}
              onClose={() => setViewingItem(null)}
            />
          </>
        );
      case 'market':
        return (
          <>
            {/* Mobile Layout */}
            <div className="md:hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col min-h-[100dvh]">
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title={activeMarketTab === 'listing' ? '交易所管理' : '交易紀錄'}
                onBack={() => activeMarketTab === 'listing' ? router.push('/profile', { scroll: false }) : setActiveMarketTab('listing')}
                right={<>{activeMarketTab === 'listing' && (
                  <button 
                    onClick={() => setActiveMarketTab('sold_records')}
                    className="text-[13px] font-bold text-neutral-500"
                  >
                    交易紀錄
                  </button>
                )}</>}
              />

              <div className="relative shrink-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 -mx-0">
                <div className="max-w-7xl mx-auto space-y-2 pt-0 pb-0">
                  {activeMarketTab === 'listing' && (
                    <Tabs 
                      defaultValue="all"
                      value={activeMarketCategory} 
                      onValueChange={(val) => setActiveMarketCategory(val as ProductCategoryId)}
                      className="w-full"
                    >
                      <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                        {marketTabs.map((tab) => (
                          <TabsTrigger key={tab.id} value={tab.id}>
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  )}
                  {activeMarketTab === 'sold_records' && (
                    <div className="flex items-center gap-1.5 pb-2 px-2 pt-2">
                      <div className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide">
                        <div className="flex items-center gap-1.5">
                          {[
                            { id: 'today', label: '今天' },
                            { id: '7days', label: '近7天' },
                            { id: '30days', label: '近30天' },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveSoldTimeTab(tab.id as 'today' | '7days' | '30days')}
                              className={cn(
                                "px-3 py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors",
                                activeSoldTimeTab === tab.id
                                  ? "bg-primary text-white"
                                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                              )}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

                {/* Market Management Content */}
                </div>{/* /sticky */}
              <div className="p-0 pb-24 bg-neutral-50 dark:bg-neutral-950">
                  {activeMarketTab === 'listing' ? (
                    filteredMarketListings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
                        <Store className="w-12 h-12 mb-4 opacity-20" />
                        <p className="font-black text-sm uppercase tracking-widest">目前沒有上架獎項</p>
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-neutral-800">
                        {filteredMarketListings.map((item) => {
                          const isSelected = selectedMarketItems.includes(item.id);
                          return (
                            <div 
                              key={item.id} 
                              onClick={() => toggleMarketSelection(item.id)}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 active:bg-neutral-50 dark:active:bg-neutral-800/70 transition-all",
                                isSelected && "bg-accent-emerald/5"
                              )}
                            >
                              <div className="flex-shrink-0 w-10 flex justify-center">
                                <span className="text-[10px] font-black uppercase tracking-widest bg-neutral-100 dark:bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 whitespace-nowrap">
                                  {item.product.grade}
                                </span>
                              </div>
                              <div className="relative w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex-shrink-0 border border-neutral-100 dark:border-neutral-800">
                                <Image 
                                  src={item.product.image} 
                                  alt={item.product.name} 
                                  fill 
                                  className="object-cover" 
                                  unoptimized
                                />
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                <h4 className="text-[13px] font-bold text-neutral-900 dark:text-white leading-tight line-clamp-1">{item.product.name}</h4>
                                <p className="text-[10px] text-neutral-400 mt-1">{item.created_at.split(' ')[0]}</p>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                                  <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount tracking-tighter">
                                    {item.price.toLocaleString()}
                                  </span>
                                </div>
                                <div className={cn(
                                  "w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-all bg-white dark:bg-neutral-900 flex-shrink-0",
                                  isSelected
                                    ? "border-accent-emerald bg-accent-emerald"
                                    : "border-neutral-300 dark:border-neutral-700"
                                )}>
                                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    filteredSoldItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
                        <Store className="w-12 h-12 mb-4 opacity-20" />
                        <p className="font-black text-sm uppercase tracking-widest">尚無售出紀錄</p>
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-neutral-800">
                        {filteredSoldItems.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-shrink-0 w-10 flex justify-center">
                              <span className="text-[10px] font-black uppercase tracking-widest bg-neutral-100 dark:bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 whitespace-nowrap">
                                {item.product.grade}
                              </span>
                            </div>
                            <div className="relative w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex-shrink-0 border border-neutral-100 dark:border-neutral-800">
                              <Image 
                                src={item.product.image || asset('/images/item_defaulet.webp')} 
                                alt={item.product.name} 
                                fill 
                                className="object-cover" 
                                unoptimized
                              />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[13px] font-bold text-neutral-900 dark:text-white leading-tight line-clamp-1 flex-1">{item.product.name}</h4>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ml-2",
                                  item.type === 'sell' ? "bg-accent-emerald/15 text-accent-emerald" : "bg-blue-100 text-blue-600"
                                )}>
                                  {item.type === 'sell' ? '售出' : '購入'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-neutral-400">{item.updated_at.split(' ')[0]}</span>
                                <div className="flex items-center gap-1.5">
                                  <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                                  <span className={cn(
                                    "text-[14px] font-black font-amount tracking-tighter",
                                    item.type === 'sell' ? "text-accent-emerald" : "text-red-500"
                                  )}>
                                    {item.type === 'sell' ? '+' : '-'}{Math.floor(item.type === 'sell' ? item.price * 0.95 : item.price).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>

              {/* Mobile Fixed Bottom Bar (Only for Listing Tab) */}
              {activeMarketTab === 'listing' && (
                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 min-h-[64px] pb-[env(safe-area-inset-bottom)] z-[60] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex items-center px-3">
                  {selectedMarketItems.length === 0 ? (
                    <button 
                      onClick={() => setSelectedMarketItems(marketListings.map(i => i.id))}
                      className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 h-[44px] rounded-xl text-base font-black"
                    >
                      全選 ({marketListings.length})
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 w-full">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-neutral-900 dark:text-white">已選 {selectedMarketItems.length}</span>
                            <button onClick={() => setSelectedMarketItems([])} className="text-xs text-neutral-400 font-bold">取消</button>
                        </div>
                        <div className="flex-1 flex gap-2 justify-end">
                            <button onClick={handleBulkCancelListing} className="flex-1 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 h-[44px] rounded-xl text-base font-black">取消上架</button>
                        </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="hidden md:block px-6 py-5">
              {(() => {
                const isListing = activeMarketTab === 'listing'
                const tabBar = (
                  <Tabs
                    value={activeMarketTab}
                    onValueChange={(val) => setActiveMarketTab(val as 'listing' | 'sold_records')}
                    className="w-full"
                  >
                    <TabsList className="mb-0 overflow-x-auto scrollbar-hide border-b border-neutral-100 dark:border-neutral-800 px-0 md:px-0 justify-start">
                      <TabsTrigger value="listing">上架中</TabsTrigger>
                      <TabsTrigger value="sold_records">交易紀錄</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )

                if (isListing) {
                  const q = desktopMarketSearch.trim().toLowerCase()
                  const list = filteredMarketListings.filter((item) => {
                    if (!q) return true
                    const text = `${item.product.grade} ${item.product.name} ${item.product.series} ${item.created_at}`.toLowerCase()
                    return text.includes(q)
                  })

                  const total = list.length
                  const totalPages = Math.max(1, Math.ceil(total / desktopMarketPageSize))
                  const page = Math.min(desktopMarketPage, totalPages)
                  const start = (page - 1) * desktopMarketPageSize
                  const pageRows = list.slice(start, start + desktopMarketPageSize)

                  return (
                    <div className="space-y-4">
                      <ProfileSectionHeader
                        title="交易所管理"

                        actions={
                          selectedMarketItems.length > 0 ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedMarketItems([])}
                                className="h-9 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-black text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                              >
                                重選
                              </button>
                              <button
                                type="button"
                                onClick={handleBulkCancelListing}
                                className="h-9 px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[13px] font-black"
                              >
                                取消上架 ({selectedMarketItems.length})
                              </button>
                            </>
                          ) : null
                        }
                      />

                      {tabBar}

                      <ProfileToolbar
                        left={
                          <>
                            <input
                              value={desktopMarketSearch}
                              onChange={(e) => setDesktopMarketSearch(e.target.value)}
                              placeholder="搜尋賞別 / 獎項"
                              className="h-9 w-[360px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                            />
                            <select
                              value={activeMarketCategory}
                              onChange={(e) => setActiveMarketCategory(e.target.value as ProductCategoryId)}
                              className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                            >
                              {marketTabs.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </>
                        }
                        right={
                          <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                            共 {total} 筆
                          </div>
                        }
                      />

                      <ProfileDataTable
                        columns={[
                          {
                            key: 'select',
                            header: '',
                            className: 'w-[52px]',
                            render: (item) => {
                              const isSelected = selectedMarketItems.includes(item.id)
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleMarketSelection(item.id)
                                  }}
                                  className={cn(
                                    'w-6 h-6 rounded-lg border flex items-center justify-center',
                                    isSelected
                                      ? 'bg-accent-emerald border-accent-emerald'
                                      : 'bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800'
                                  )}
                                >
                                  {isSelected ? <CheckCircle2 className="w-4 h-4 text-white stroke-[3]" /> : null}
                                </button>
                              )
                            },
                          },
                          {
                            key: 'grade',
                            header: '賞別',
                            className: 'w-[110px]',
                            render: (item) => (
                              <span className="inline-flex px-2 py-0.5 rounded-xl bg-primary/10 text-primary border border-primary/10 text-[12px] font-black whitespace-nowrap">
                                {item.product.grade}
                              </span>
                            ),
                          },
                          {
                            key: 'product',
                            header: '獎項資訊',
                            render: (item) => (
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shrink-0">
                                  <Image
                                    src={item.product.image || asset('/images/item_defaulet.webp')}
                                    alt={item.product.name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-black text-neutral-900 dark:text-white truncate">{item.product.name}</div>
                                  <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">{item.product.series}</div>
                                </div>
                              </div>
                            ),
                          },
                          {
                            key: 'price',
                            header: '售價',
                            className: 'w-[140px]',
                            render: (item) => (
                              <div className="flex items-center gap-1.5">
                                <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                                <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount tracking-tighter">
                                  {item.price.toLocaleString()}
                                </span>
                              </div>
                            ),
                          },
                          {
                            key: 'date',
                            header: '上架時間',
                            className: 'w-[170px]',
                            render: (item) => (
                              <div className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
                                {item.created_at}
                              </div>
                            ),
                          },
                          {
                            key: 'action',
                            header: '',
                            className: 'w-[110px]',
                            cellClassName: 'text-right',
                            render: (item) => (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  cancelListing(item.id)
                                }}
                                className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                              >
                                取消上架
                              </button>
                            ),
                          },
                        ]}
                        rows={pageRows}
                        rowKey={(r) => String(r.id)}
                        onRowClick={(item) => toggleMarketSelection(item.id)}
                        empty="目前沒有上架獎項"
                      />

                      <ProfilePagination
                        page={page}
                        pageSize={desktopMarketPageSize}
                        total={total}
                        onPageChange={setDesktopMarketPage}
                        onPageSizeChange={(s) => {
                          setDesktopMarketPageSize(s)
                          setDesktopMarketPage(1)
                        }}
                      />
                    </div>
                  )
                }

                const q = desktopMarketSoldSearch.trim().toLowerCase()
                const list = filteredSoldItems.filter((item) => {
                  if (!q) return true
                  const text = `${item.product.grade} ${item.product.name} ${item.product.series} ${item.created_at} ${item.updated_at} ${item.type} ${item.counterparty || ''}`.toLowerCase()
                  return text.includes(q)
                })

                const total = list.length
                const totalPages = Math.max(1, Math.ceil(total / desktopMarketSoldPageSize))
                const page = Math.min(desktopMarketSoldPage, totalPages)
                const start = (page - 1) * desktopMarketSoldPageSize
                const pageRows = list.slice(start, start + desktopMarketSoldPageSize)

                return (
                  <div className="space-y-4">
                    <ProfileSectionHeader
                      title="交易所管理"

                    />

                    {tabBar}

                    <ProfileToolbar
                      left={
                        <>
                          <input
                            value={desktopMarketSoldSearch}
                            onChange={(e) => setDesktopMarketSoldSearch(e.target.value)}
                            placeholder="搜尋獎項 / 對象"
                            className="h-9 w-[360px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                          />
                          <select
                            value={activeSoldTimeTab}
                            onChange={(e) => setActiveSoldTimeTab(e.target.value as 'today' | '7days' | '30days')}
                            className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                          >
                            <option value="today">今天</option>
                            <option value="7days">近7天</option>
                            <option value="30days">近30天</option>
                          </select>
                        </>
                      }
                      right={
                        <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                          共 {total} 筆
                        </div>
                      }
                    />

                    <ProfileDataTable
                      columns={[
                        {
                          key: 'grade',
                          header: '賞別',
                          className: 'w-[110px]',
                          render: (item) => (
                            <span className="inline-flex px-2 py-0.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 text-[12px] font-black whitespace-nowrap">
                              {item.product.grade}
                            </span>
                          ),
                        },
                        {
                          key: 'product',
                          header: '獎項資訊',
                          render: (item) => (
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shrink-0">
                                <Image
                                  src={item.product.image || asset('/images/item_defaulet.webp')}
                                  alt={item.product.name}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="font-black text-neutral-900 dark:text-white truncate">{item.product.name}</div>
                                <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">{item.product.series}</div>
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: 'type',
                          header: '類型',
                          className: 'w-[110px]',
                          render: (item) => (
                            <span
                              className={cn(
                                'inline-flex px-2 py-0.5 rounded-xl text-[12px] font-black whitespace-nowrap',
                                item.type === 'sell' ? 'bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20' : 'bg-blue-50 text-blue-700 border border-blue-100'
                              )}
                            >
                              {item.type === 'sell' ? '售出' : '購入'}
                            </span>
                          ),
                        },
                        {
                          key: 'counterparty',
                          header: '交易對象',
                          className: 'w-[160px]',
                          render: (item) => (
                            <div className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200 truncate">
                              {item.counterparty || '-'}
                            </div>
                          ),
                        },
                        {
                          key: 'price',
                          header: '成交價',
                          className: 'w-[140px]',
                          render: (item) => (
                            <div className="flex items-center gap-1.5">
                              <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                              <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount tracking-tighter">
                                {item.price.toLocaleString()}
                              </span>
                            </div>
                          ),
                        },
                        {
                          key: 'date',
                          header: '交易時間',
                          className: 'w-[170px]',
                          render: (item) => (
                            <div className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
                              {item.created_at}
                            </div>
                          ),
                        },
                        {
                          key: 'delta',
                          header: '變動',
                          className: 'w-[140px]',
                          render: (item) => {
                            const amount = Math.floor(item.type === 'sell' ? item.price * 0.95 : item.price)
                            const sign = item.type === 'sell' ? '+' : '-'
                            return (
                              <div className="flex items-center gap-1.5">
                                <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                                <span className={cn('text-[14px] font-black font-amount tracking-tighter', item.type === 'sell' ? 'text-accent-emerald' : 'text-red-500')}>
                                  {sign}
                                  {amount.toLocaleString()}
                                </span>
                              </div>
                            )
                          },
                        },
                      ]}
                      rows={pageRows}
                      rowKey={(r) => String(r.id)}
                      empty="尚無買賣紀錄"
                    />

                    <ProfilePagination
                      page={page}
                      pageSize={desktopMarketSoldPageSize}
                      total={total}
                      onPageChange={setDesktopMarketSoldPage}
                      onPageSizeChange={(s) => {
                        setDesktopMarketSoldPageSize(s)
                        setDesktopMarketSoldPage(1)
                      }}
                    />
                  </div>
                )
              })()}
            </div>
          </>
        );
      case 'delivery':
        return (
          <div className="md:pb-0">
            {/* Mobile Header & Tabs */}
            <div className="md:hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col min-h-[100dvh]">
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title="配送訂單"
                onBack={() => router.push('/profile', { scroll: false })}
              />

              {/* Mobile Sticky Tabs (Using Tabs Component style) */}
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
                <div className="max-w-7xl mx-auto space-y-2 pt-0 pb-0">
                    <Tabs 
                      key={activeDeliveryTab} // Force re-render
                      defaultValue={activeDeliveryTab}
                      value={activeDeliveryTab} 
                      onValueChange={(val) => setActiveDeliveryTab(val as DeliveryTabId)}
                      className="w-full"
                    >
                      <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b-0 pb-0 overflow-x-auto no-scrollbar">
                        {DELIVERY_TABS.map((tab) => (
                          <TabsTrigger key={tab.id} value={tab.id} className="whitespace-nowrap">
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                </div>
              </div>

              {/* Mobile List Style (Unified 3-Layer Structure) */}
              </div>{/* /sticky */}
              <div
                ref={mobileDeliveryScrollRef}
                {...swipeDeliveryTabs}
                className="p-0 pb-24 bg-neutral-50 dark:bg-neutral-950"
              >
                {filteredDeliveryHistory.length === 0 ? (
                  <div className="py-20 text-center text-neutral-400">
                    <Truck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">尚無配送訂單</p>
                  </div>
                ) : (
                  <>
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 border-t border-b border-neutral-100 dark:border-neutral-800">
                    {filteredDeliveryHistory.slice(0, mobileDeliveryDisplayCount).map((order) => {
                      const isExpanded = expandedOrderId === order.id;
                      return (
                        <div 
                          key={order.id} 
                          className="bg-white dark:bg-neutral-900"
                        >
                          {/* Collapsed Header */}
                          <div
                            onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                            className={cn(
                              "p-3 space-y-2 transition-colors cursor-pointer",
                              !isExpanded && "bg-white dark:bg-neutral-900 active:bg-neutral-50 dark:active:bg-neutral-800/50",
                              isExpanded && "bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800"
                            )}
                          >
                            {/* Layer 1: ID & Date */}
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono">
                                {order.order_number || `#${String(order.id).slice(0,8)}`}
                              </span>
                              <div className="text-[11px] text-neutral-400 font-bold flex items-center gap-1">
                                {order.date}
                              </div>
                            </div>
                            
                            {/* Layer 2: Content Summary & Arrival Date */}
                            <div className="flex items-center justify-between">
                              <h4 className="text-[13px] font-black text-neutral-900 dark:text-white leading-tight tracking-tight line-clamp-2">
                                 共 {order.items.length} 項
                              </h4>
                              
                              {(() => {
                                 const s = order.status;
                                 if (s === 'delivered' || s === 'completed') {
                                   return <div className="text-[13px] font-black text-accent-emerald">已送達</div>;
                                 }
                                 if (s === 'submitted' || s === 'processing') {
                                   return <div className="text-[13px] font-black text-neutral-400">待出貨</div>;
                                 }
                                 if (['picked_up', 'shipping'].includes(s) && order.arrivalDate && order.arrivalDate !== '-') {
                                   const text = getArrivalText(order.arrivalDate) || `${order.arrivalDate}送達`;
                                   return (
                                     <div className="text-[13px] font-black text-accent-emerald">預計{text}</div>
                                   );
                                 }
                                 return null;
                               })()}
                            </div>

                            {/* Layer 3: Status & Action */}
                            <div className="flex items-center justify-between">
                              {/* Left: Status Badge */}
                              <div>
                                {(() => {
                                  const config = getStatusConfig(order.status);
                                  return (
                                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border", config.color, config.bg, config.border)}>
                                      {config.label}
                                    </span>
                                  );
                                })()}
                              </div>

                              {/* Right: Chevron */}
                              <div className="flex items-center gap-3">
                                <ChevronDown className={cn("w-4 h-4 text-neutral-400 transition-transform duration-200", isExpanded && "rotate-180")} />
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="bg-neutral-50 dark:bg-neutral-950 border-t border-neutral-100 dark:border-neutral-800 overflow-hidden"
                              >
                                <div className="p-3 space-y-3">
                                  {/* 配送進度（照商城訂單彈層那套步驟條，老闆 2026-08-24） */}
                                  <div className="bg-white dark:bg-neutral-900 px-3 pb-2 pt-1 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                    {order.status === 'cancelled'
                                      ? <div className="py-2 text-center text-[12px] font-bold text-neutral-400">這張訂單已取消</div>
                                      : <DeliverySteps status={order.status} />}
                                  </div>
                                  {/* Shipping Info */}
                                  <div className="bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-2">
                                    <div className="flex items-center justify-between pb-2 border-b border-neutral-50 dark:border-neutral-800">
                                      <span className="text-[11px] text-neutral-400 font-bold">配送廠商</span>
                                      <span className="text-[12px] font-black text-neutral-900 dark:text-white">{order.supplierName || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between pb-2 border-b border-neutral-50 dark:border-neutral-800">
                                      <span className="text-[11px] text-neutral-400 font-bold">物流方式</span>
                                      <span className="text-[12px] font-black text-neutral-900 dark:text-white">{order.method}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] text-neutral-400 font-bold">追蹤號碼</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[12px] font-black text-neutral-900 dark:text-white font-mono">{order.tracking || '-'}</span>
                                        {order.tracking && (
                                          <Copy
                                            className="w-3 h-3 text-neutral-400 cursor-pointer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigator.clipboard.writeText(order.tracking);
                                              toast.success('已複製追蹤號碼');
                                            }}
                                          />
                                        )}
                                      </div>
                                    </div>
                                    {order.recipientName && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-neutral-400 font-bold">收件人</span>
                                        <span className="text-[12px] font-black text-neutral-900 dark:text-white">{order.recipientName}</span>
                                      </div>
                                    )}
                                    {order.recipientPhone && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-neutral-400 font-bold">收件人電話</span>
                                        <span className="text-[12px] font-black text-neutral-900 dark:text-white">{order.recipientPhone}</span>
                                      </div>
                                    )}
                                    {order.logisticsType === 'CVS' ? (
                                      order.storeName && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-[11px] text-neutral-400 font-bold">收件門市</span>
                                          <span className="text-[12px] font-black text-neutral-900 dark:text-white">{order.storeName}</span>
                                        </div>
                                      )
                                    ) : (
                                      order.address && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-[11px] text-neutral-400 font-bold">收件地址</span>
                                          <span className="text-[12px] font-black text-neutral-900 dark:text-white text-right max-w-[60%]">{order.address}</span>
                                        </div>
                                      )
                                    )}
                                  </div>

                                  {/* Items grouped by product name */}
                                  {(() => {
                                    const grouped: Record<string, typeof order.items> = {};
                                    const productOrder: string[] = [];
                                    for (const item of order.items) {
                                      const p = item.productName || '未知商品';
                                      if (!grouped[p]) { grouped[p] = []; productOrder.push(p); }
                                      grouped[p].push(item);
                                    }
                                    return (
                                      <div>
                                        <div className="text-[10px] text-neutral-400 font-black uppercase tracking-wider mb-2 px-1">
                                          配送商品 ({order.items.length})
                                        </div>
                                        <div className="space-y-3">
                                          {productOrder.map((productName) => (
                                            <div key={productName}>
                                              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                                                <span className="text-[12px] font-black text-neutral-800 dark:text-neutral-100 truncate">{productName}</span>
                                                <span className="text-[10px] text-neutral-400 font-bold shrink-0">×{grouped[productName].length}</span>
                                              </div>
                                              <div className="space-y-1.5 pl-1">
                                                {grouped[productName].map((item, idx) => (
                                                  <div key={idx} className="flex items-center gap-2.5 bg-white dark:bg-neutral-900 p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                                    <span className="px-1.5 py-0.5 bg-accent-red/10 text-accent-red text-[11px] font-black rounded border border-accent-red/10 uppercase shrink-0">
                                                      {item.grade === '一般版' || item.grade.includes('賞') ? item.grade : `${item.grade}賞`}
                                                    </span>
                                                    <span className="text-[13px] font-black text-neutral-700 dark:text-neutral-300 truncate">
                                                      {item.name}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {canCancelDelivery(order) && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleCancelDelivery(order); }}
                                      className="w-full h-10 rounded-xl border border-red-200 dark:border-red-900/40 text-[13px] font-black text-red-500 bg-white dark:bg-neutral-900 active:bg-red-50 dark:active:bg-red-950/30 transition-colors"
                                    >
                                      取消配送申請
                                    </button>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                  <div className="py-4 text-center text-xs text-neutral-400">
                    {mobileDeliveryDisplayCount < filteredDeliveryHistory.length ? '載入中...' : '到底了'}
                  </div>
                  </>
                )}
              </div>
            </div>

            {/* 桌機（cardx 殼）：零套疊——標題列、狀態膠囊＋搜尋、一筆一列（點列展開明細）、捲到底自動載入（老闆 2026-09-05 重構定案）。
                舊的七欄表格每格都在截斷，訂單內容看不清 */}
            <div className="hidden md:block">
              {(() => {
                const q = desktopDeliverySearch.trim().toLowerCase();
                const list = filteredDeliveryHistory.filter((order) => {
                  if (!q) return true;
                  const orderNo = (order.order_number || String(order.id)).toLowerCase();
                  const tracking = (order.tracking || '').toLowerCase();
                  const method = (order.method || '').toLowerCase();
                  const itemText = (order.items || []).map((i) => `${i.grade} ${i.name}`.toLowerCase()).join(' ');
                  return orderNo.includes(q) || tracking.includes(q) || method.includes(q) || itemText.includes(q);
                });
                const shown = list.slice(0, desktopWarehouseDisplayCount);
                const hasMore = shown.length < list.length;
                const pill = (active: boolean) => cn(
                  'h-9 px-3.5 rounded-full text-[13px] font-black whitespace-nowrap transition-colors',
                  active ? 'bg-primary text-white' : 'bg-white text-neutral-700 ring-1 ring-[#e5e7eb] hover:bg-neutral-50',
                );
                const statusTabs = [
                  ['all', '全部'], ['submitted', '已提交'], ['shipping', '配送中'], ['completed', '已完成'], ['cancelled', '已取消'],
                ] as const;
                const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success('已複製'); };
                return (
                  <>
                    <div className="flex h-10 items-center gap-2">
                      <h2 className="text-[20px] font-black tracking-tight text-neutral-900">配送管理</h2>
                      <span className="text-[13px] font-bold text-neutral-500">{list.length} 筆</span>
                    </div>

                    {/* 搜尋框跟倉庫同一顆共用元件、獨立一行（老闆 2026-09-05：搜尋樣式統一），狀態膠囊在下一行 */}
                    <ProfileSearchField
                      className="mt-3"
                      value={desktopDeliverySearch}
                      onChange={setDesktopDeliverySearch}
                      placeholder="搜尋訂單編號、追蹤號碼、商品"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {statusTabs.map(([id, label]) => (
                        <button key={id} type="button" className={pill(activeDeliveryTab === id)} onClick={() => setActiveDeliveryTab(id)}>
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 space-y-2">
                      {list.length === 0 ? (
                        <div className="py-20 text-center text-neutral-400">
                          <Truck className="mx-auto mb-4 h-12 w-12 opacity-20" />
                          <p className="text-sm font-black">尚無配送訂單</p>
                        </div>
                      ) : shown.map((order) => {
                        const expanded = expandedOrderId === order.id;
                        const st = getStatusConfig(order.status);
                        const itemText = (order.items || []).map((i) => `${i.grade} ${i.name}`).join('、');
                        // 沒有單號的訂單存的是「-」，不當單號印
                        const tracking = order.tracking && order.tracking !== '-' ? order.tracking : '';
                        const logistics = order.logisticsType === 'CVS'
                          ? (order.storeName ? `超商取貨 ${order.storeName}` : '超商取貨')
                          : (order.address ? `宅配 ${order.address}` : (order.method || '宅配'));
                        return (
                          <div key={order.id} className={cn('rounded-[14px] bg-white ring-1 ring-[#e5e7eb] transition-shadow', expanded && 'shadow-[0_10px_40px_-10px_rgba(0,0,0,0.12)]')}>
                            <button
                              type="button"
                              onClick={() => setExpandedOrderId(expanded ? null : order.id)}
                              aria-expanded={expanded}
                              className="flex w-full items-start gap-4 px-5 py-4 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[15px] font-black text-neutral-900">{order.order_number || `#${String(order.id).slice(0, 8)}`}</span>
                                  <span className="text-[13px] font-bold text-neutral-500">{order.date}</span>
                                  <ProfileStatusBadge config={st} />
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-bold text-neutral-500">
                                  {order.items?.length ? (
                                    <span className="max-w-[460px] truncate text-neutral-700">{order.items.length} 件：{itemText}</span>
                                  ) : (
                                    <span className="text-neutral-400">獎品已退回倉庫</span>
                                  )}
                                  {order.supplierName ? <span>{order.supplierName}</span> : null}
                                  <span className="truncate max-w-[320px]">{logistics}</span>
                                  {tracking ? <span className="font-mono">{tracking}</span> : null}
                                  {/* arrivalDate 有時是日期、有時是「待出貨／已送達」這種字，只有日期才冠「到貨」 */}
                                  {order.arrivalDate && order.arrivalDate !== '-' ? (
                                    <span>{/\d/.test(order.arrivalDate) ? `到貨 ${order.arrivalDate}` : order.arrivalDate}</span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 pt-0.5">
                                {order.shippingFee > 0 ? (
                                  <span className="text-[14px] font-black text-neutral-900">運費 {order.shippingFee.toLocaleString()} G</span>
                                ) : (
                                  <span className="text-[13px] font-bold text-accent-emerald">免運</span>
                                )}
                                <ChevronDown className={cn('h-4 w-4 text-neutral-400 transition-transform', expanded && 'rotate-180')} />
                              </div>
                            </button>

                            {expanded && (
                              <div className="border-t border-neutral-100 px-5 py-4">
                                {/* 左：進度（限寬）＋品項一列一列不截字；右：收件資訊收成灰底小塊、標籤與值靠左（老闆 2026-09-05：之前左右拉得太開） */}
                                <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
                                  <div className="min-w-0">
                                    {order.status === 'cancelled' ? (
                                      <div className="text-[14px] font-bold text-neutral-500">此訂單已取消{order.shippingFee > 0 ? `，運費 ${order.shippingFee.toLocaleString()} G 已退回` : ''}，獎品已退回倉庫</div>
                                    ) : (
                                      <div className="max-w-[560px]"><DeliverySteps status={order.status} /></div>
                                    )}
                                    {order.items?.length ? (
                                      <div className={order.status === 'cancelled' ? 'mt-3' : 'mt-5'}>
                                        <div className="text-[13px] font-black text-neutral-500">配送商品 {order.items.length} 件</div>
                                        <div className="mt-1 divide-y divide-neutral-100">
                                          {order.items.map((it, idx) => (
                                            <div key={idx} className="flex items-center gap-3 py-2.5">
                                              <GradeBadge grade={it.grade} size="sm" />
                                              <div className="min-w-0 flex-1">
                                                <div className="text-[14px] font-black text-neutral-900">{it.name}</div>
                                                {it.productName ? <div className="text-[12px] font-bold text-neutral-500">{it.productName}</div> : null}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="self-start rounded-[14px] bg-[#f3f4f6] px-4 py-3">
                                    <div className="text-[13px] font-black text-neutral-500">收件資訊</div>
                                    <dl className="mt-2 space-y-2 text-[14px]">
                                      {[
                                        ['收件人', order.recipientName],
                                        ['電話', order.recipientPhone],
                                        [order.logisticsType === 'CVS' ? '收件門市' : '收件地址', order.logisticsType === 'CVS' ? order.storeName : order.address],
                                        ['配送方式', order.method],
                                      ].filter(([, v]) => !!v).map(([k, v]) => (
                                        <div key={String(k)} className="flex gap-3">
                                          <dt className="w-[64px] shrink-0 font-bold text-neutral-400">{k}</dt>
                                          <dd className="min-w-0 flex-1 break-words font-black text-neutral-900">{v}</dd>
                                        </div>
                                      ))}
                                      {tracking ? (
                                        <div className="flex gap-3">
                                          <dt className="w-[64px] shrink-0 font-bold text-neutral-400">物流單號</dt>
                                          <dd className="min-w-0 flex-1">
                                            <button type="button" onClick={() => copyText(tracking)} className="inline-flex items-center gap-1 font-mono font-black text-neutral-900 hover:text-primary">
                                              {tracking}
                                              <Copy className="h-3.5 w-3.5 text-neutral-400" />
                                            </button>
                                          </dd>
                                        </div>
                                      ) : null}
                                    </dl>
                                    {canCancelDelivery(order) && (
                                      <button
                                        type="button"
                                        onClick={() => handleCancelDelivery(order)}
                                        className="mt-3 h-10 w-full rounded-xl bg-white text-[13px] font-black text-accent-red ring-1 ring-[#e5e7eb] hover:bg-neutral-50"
                                      >
                                        取消配送申請
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {list.length > 0 && (
                      <div ref={desktopWarehouseSentinel} className="py-5 text-center text-[13px] font-bold text-neutral-400">
                        {hasMore ? '載入中…' : `已顯示全部 ${list.length} 筆`}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        );
      case 'draw-history':
        return (
          <div className="md:pb-0">
            {/* Mobile Header & Tabs */}
            <div className="md:hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col min-h-[100dvh]">
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title="抽獎紀錄"
                onBack={() => router.push('/profile', { scroll: false })}
              />

              {/* Mobile List */}
              </div>{/* /sticky */}
              <div
                ref={mobileDrawScrollRef}
                className="p-0 pb-24 bg-neutral-50 dark:bg-neutral-950"
              >
                {drawHistory.length === 0 ? (
                  <div className="py-20 text-center text-neutral-400">
                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">尚無抽獎紀錄</p>
                  </div>
                ) : (
                  <>
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 border-t border-b border-neutral-100 dark:border-neutral-800">
                    {drawHistory.slice(0, mobileDrawDisplayCount).map((item) => {
                      const isExpanded = expandedDrawId === item.id.toString();
                      return (
                        <div 
                          key={item.id} 
                          className="bg-white dark:bg-neutral-900"
                        >
                          {/* Collapsed Header */}
                          <div 
                            onClick={() => setExpandedDrawId(isExpanded ? null : item.id.toString())}
                            className={cn(
                              "p-3 space-y-2 active:bg-neutral-50 dark:active:bg-neutral-800/50 transition-colors cursor-pointer",
                              !isExpanded && "bg-white dark:bg-neutral-900",
                              isExpanded && "bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-100 dark:border-neutral-800"
                            )}
                          >
                            {/* Layer 1: ID & Date */}
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono">
                                {formatDrawId(item.id, item.rawDate)}
                              </span>
                              <div className="text-[11px] text-neutral-400 font-bold flex items-center gap-1">
                                {item.date.replace(/-/g, '/')}
                              </div>
                            </div>
                            
                            {/* Layer 2: Content Summary */}
                            <h4 className="text-[13px] font-black text-neutral-900 dark:text-white leading-tight tracking-tight line-clamp-2">
                              {item.product}
                            </h4>

                            {/* Layer 3: Amount & Action */}
                            <div className="flex items-center justify-between mt-1">
                              <div className="text-[13px] font-black text-neutral-900 dark:text-white">
                                共 {item.tickets.length} 項
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {item.pointsUsed > 0 ? (
                                    <span className="text-[14px] font-black text-indigo-500 dark:text-indigo-400 font-amount tracking-tighter">
                                      {(item.pointsUsed * 4).toLocaleString()} 積分
                                    </span>
                                  ) : (
                                    <>
                                      <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                                      <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount tracking-tighter">
                                        {item.cost.toLocaleString()}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <ChevronDown className={cn("w-4 h-4 text-neutral-400 transition-transform duration-200", isExpanded && "rotate-180")} />
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="bg-neutral-50/50 dark:bg-neutral-800/30 border-t border-neutral-100 dark:border-neutral-800 overflow-hidden"
                              >
                                <div className="p-3 space-y-2">
                                  <div className="text-[10px] text-neutral-400 font-black uppercase tracking-wider mb-2 px-1">
                                    獲得獎項 ({item.items.length})
                                  </div>
                                  {item.items.map((result, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                      <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                                        {!['gacha', 'blindbox'].includes(item.productType || '') && (
                                          <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[11px] font-black rounded-xl border border-neutral-200 dark:border-neutral-700 font-sans shrink-0">
                                            {result.ticket_number}
                                          </span>
                                        )}
                                        <span className="px-2 py-0.5 bg-accent-red/10 text-accent-red text-[11px] font-black rounded-xl border border-accent-red/10 uppercase shrink-0">
                                          {result.grade}
                                        </span>
                                        <span className="text-[13px] font-black text-neutral-700 dark:text-neutral-300 truncate">
                                          {result.name}
                                        </span>
                                      </div>

                                      {result.txid_hash && item.productType === 'ichiban' && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                        const isEndedOrSoldOut = item.productStatus === 'ended' || item.productStatus === 'soldout' || (item.productRemaining !== undefined && item.productRemaining <= 0);
                                          if (!isEndedOrSoldOut) {
                                            toast.error('該商品完抽後可驗證');
                                            return;
                                          }
                                          router.push(`/fairness/${item.productId}?nonce=${encodeURIComponent(result.ticket_number)}&txid_hash=${encodeURIComponent(result.txid_hash!)}`);
                                        }}
                                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 text-[10px] font-black text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                                      >
                                        驗證
                                      </button>
                                    )}
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                  <div className="py-4 text-center text-xs text-neutral-400">
                    {mobileDrawDisplayCount < drawHistory.length ? '載入中...' : '到底了'}
                  </div>
                  </>
                )}
              </div>
            </div>

            <div className="hidden md:block px-6 py-5">
              {(() => {
                const q = desktopDrawSearch.trim().toLowerCase();
                const toTime = (s?: string) => {
                  if (!s) return 0;
                  const d = new Date(s.replace(/-/g, '/'));
                  const t = d.getTime();
                  return Number.isFinite(t) ? t : 0;
                };

                const list = [...drawHistory]
                  .sort((a, b) => toTime(b.rawDate || b.date) - toTime(a.rawDate || a.date))
                  .filter((item) => {
                    if (!q) return true;
                    const base = `${item.product} ${item.date} ${formatDrawId(item.id, item.rawDate)}`
                      .toLowerCase();
                    const tickets = (item.tickets || []).join(' ').toLowerCase();
                    const prizes = (item.items || []).map((r) => `${r.grade} ${r.name} ${r.ticket_number}`).join(' ').toLowerCase();
                    return base.includes(q) || tickets.includes(q) || prizes.includes(q);
                  });

                const total = list.length;
                const totalPages = Math.max(1, Math.ceil(total / desktopDrawPageSize));
                const page = Math.min(desktopDrawPage, totalPages);
                const start = (page - 1) * desktopDrawPageSize;
                const pageRows = list.slice(start, start + desktopDrawPageSize);

                return (
                  <div className="space-y-4">
                    <ProfileSectionHeader
                      title="抽獎紀錄"

                    />

                    <ProfileToolbar
                      left={
                        <input
                          value={desktopDrawSearch}
                          onChange={(e) => setDesktopDrawSearch(e.target.value)}
                          placeholder="搜尋商品 / 籤號 / 獎項"
                          className="h-9 w-[360px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                        />
                      }
                      right={
                        <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                          共 {total} 筆
                        </div>
                      }
                    />

                    <ProfileDataTable
                      columns={[
                        {
                          key: 'id',
                          header: '編號',
                          className: 'w-[140px]',
                          render: (item) => (
                            <span className="inline-flex px-2 py-0.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-[12px] font-black text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 font-mono">
                              {formatDrawId(item.id, item.rawDate)}
                            </span>
                          ),
                        },
                        {
                          key: 'product',
                          header: '商品 / 時間',
                          render: (item) => (
                            <div className="min-w-0">
                              <div className="font-black text-neutral-900 dark:text-white truncate">{item.product}</div>
                              <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">{item.date}</div>
                            </div>
                          ),
                        },
                        {
                          key: 'count',
                          header: '抽數',
                          className: 'w-[90px]',
                          render: (item) => (
                            <div className="text-[13px] font-black text-neutral-900 dark:text-white">
                              {item.tickets.length}
                            </div>
                          ),
                        },
                        {
                          key: 'major',
                          header: '大賞',
                          className: 'w-[90px]',
                          render: (item) => {
                            const major = (item.items || []).filter((r) => isMajorGrade(r.grade)).length;
                            return (
                              <div className={cn('text-[13px] font-black', major > 0 ? 'text-accent-red' : 'text-neutral-700 dark:text-neutral-200')}>
                                {major}
                              </div>
                            );
                          },
                        },
                        {
                          key: 'cost',
                          header: '消耗(G)',
                          className: 'w-[140px]',
                          render: (item) => (
                            <div className="flex items-center gap-1.5">
                              <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                              <span className="text-[14px] font-black text-accent-red font-amount tracking-tighter">
                                {item.cost.toLocaleString()}
                              </span>
                            </div>
                          ),
                        },
                        {
                          key: 'action',
                          header: '',
                          className: 'w-[90px]',
                          cellClassName: 'text-right',
                          render: (item) => {
                            const expanded = expandedDrawId === item.id.toString();
                            return (
                              <button
                                type="button"
                                onClick={() => setExpandedDrawId(expanded ? null : item.id.toString())}
                                className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                              >
                                {expanded ? '收合' : '查看'}
                              </button>
                            );
                          },
                        },
                      ]}
                      rows={pageRows}
                      rowKey={(r) => String(r.id)}
                      isRowExpanded={(r) => expandedDrawId === r.id.toString()}
                      renderExpanded={(item) => (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[12px] font-black text-neutral-600 dark:text-neutral-300">
                              獲得獎項（{item.items.length}）
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {item.items.map((result, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-3 bg-white dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800 px-2 py-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {!['gacha', 'blindbox'].includes(item.productType || '') && (
                                    <span className="px-2 py-0.5 rounded-xl text-[11px] font-black bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 whitespace-nowrap">
                                      {result.ticket_number}
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 rounded-xl text-[11px] font-black bg-primary/10 text-primary border border-primary/10 whitespace-nowrap">
                                    {result.grade}
                                  </span>
                                  <div className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100 truncate">
                                    {result.name}
                                  </div>
                                </div>
                                {result.txid_hash && item.productType === 'ichiban' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const isEndedOrSoldOut =
                                        item.productStatus === 'ended' ||
                                        item.productStatus === 'soldout' ||
                                        (item.productRemaining !== undefined && item.productRemaining <= 0);
                                      if (!isEndedOrSoldOut) {
                                        toast.error('該商品完抽後可驗證');
                                        return;
                                      }
                                      drawView.remember({
                                        tab: '',
                                        y: window.scrollY,
                                        count: mobileDrawDisplayCount,
                                        from: `/fairness/${item.productId}`,
                                      });
                                      router.push(
                                        `/fairness/${item.productId}?nonce=${encodeURIComponent(result.ticket_number)}&txid_hash=${encodeURIComponent(result.txid_hash!)}`
                                      );
                                    }}
                                    className="shrink-0 h-8 px-3 rounded-lg bg-primary/5 text-[12px] font-black text-primary hover:bg-primary/10 transition-colors"
                                  >
                                    驗證
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      empty="尚無抽獎紀錄"
                    />

                    <ProfilePagination
                      page={page}
                      pageSize={desktopDrawPageSize}
                      total={total}
                      onPageChange={setDesktopDrawPage}
                      onPageSizeChange={(s) => {
                        setDesktopDrawPageSize(s);
                        setDesktopDrawPage(1);
                      }}
                    />
                  </div>
                );
              })()}
            </div>
            
          </div>
        );
      case 'topup-history':
        return (
          <div className="md:pb-0">
            {/* Mobile Header & Tabs */}
            <div className="md:hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col min-h-[100dvh]">
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title="儲值紀錄"
                onBack={() => router.push('/profile')}
              />

              {/* 日期 tab 已移除（老闆 2026-08-20）：固定顯示近 30 天 */}

              {/* Mobile List Style (Unified 3-Layer Structure) */}
              </div>{/* /sticky */}
              <div className="p-0 pb-24 bg-neutral-50 dark:bg-neutral-950">
                {filteredTopupHistory.length === 0 ? (
                  <div className="py-20 text-center text-neutral-400">
                    <Wallet className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">
                      {activeTopupTimeTab === 'today' ? '今天無儲值紀錄' : activeTopupTimeTab === '7days' ? '近7天無儲值紀錄' : '近30天無儲值紀錄'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 border-t border-b border-neutral-100 dark:border-neutral-800">
                    {filteredTopupHistory.map((item) => {
                      return (
                        <div 
                          key={item.id} 
                          className="bg-white dark:bg-neutral-900"
                        >
                          {/* Item Content (Unified 3-Layer Structure) */}
                          <div className="p-3 space-y-2 bg-white dark:bg-neutral-900">
                            {/* Layer 1: ID & Date */}
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                                {item.order_number}
                              </span>
                              <div className="text-[11px] text-neutral-400 font-bold flex items-center gap-1">
                                {new Date(item.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Taipei' }).replace(/\//g, '/')}
                              </div>
                            </div>
                            
                            {/* Layer 2: Content Summary */}
                            <div className="flex items-center gap-2">
                                <div className="text-[14px] font-black text-neutral-900 dark:text-white leading-tight flex items-center gap-1.5">
                                  儲值 
                                  <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                                  <span className="font-amount tracking-tighter">{item.tokens.toLocaleString()}</span>
                                </div>
                            </div>
                            
                            {/* Layer 3: Status & Amount */}
                            <div className="flex items-center justify-between">
                              <div className="">
                                {(() => {
                                  const config = getTopupStatusConfig(item.status);
                                  return (
                                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border", config.color, config.bg, config.border)}>
                                      {config.label}
                                    </span>
                                  );
                                })()}
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount">NT$ {item.amount.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden md:block px-6 py-5">
              {(() => {
                const q = desktopTopupSearch.trim().toLowerCase()
                const list = filteredTopupHistory.filter((item) => {
                  if (!q) return true
                  const text = `${item.order_number} ${item.payment_method} ${item.status} ${item.tokens} ${item.amount} ${item.created_at}`.toLowerCase()
                  return text.includes(q)
                })

                const total = list.length
                const totalPages = Math.max(1, Math.ceil(total / desktopTopupPageSize))
                const page = Math.min(desktopTopupPage, totalPages)
                const start = (page - 1) * desktopTopupPageSize
                const pageRows = list.slice(start, start + desktopTopupPageSize)

                const emptyText =
                  activeTopupTimeTab === 'today'
                    ? '今天無儲值紀錄'
                    : activeTopupTimeTab === '7days'
                      ? '近7天無儲值紀錄'
                      : '近30天無儲值紀錄'

                return (
                  <div className="space-y-4">
                    <ProfileSectionHeader title="儲值紀錄" />

                    <ProfileToolbar
                      left={
                        <>
                          <input
                            value={desktopTopupSearch}
                            onChange={(e) => setDesktopTopupSearch(e.target.value)}
                            placeholder="搜尋訂單 / 付款方式 / 狀態"
                            className="h-9 w-[360px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                          />
                          <select
                            value={activeTopupTimeTab}
                            onChange={(e) => setActiveTopupTimeTab(e.target.value as 'today' | '7days' | '30days')}
                            className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                          >
                            <option value="today">今天</option>
                            <option value="7days">近7天</option>
                            <option value="30days">近30天</option>
                          </select>
                        </>
                      }
                      right={
                        <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                          共 {total} 筆
                        </div>
                      }
                    />

                    <ProfileDataTable
                      columns={[
                        {
                          key: 'date',
                          header: '交易日期 / 訂單',
                          className: 'w-[240px]',
                          render: (item) => (
                            <div className="min-w-0">
                              <div className="font-black text-neutral-900 dark:text-white whitespace-nowrap">
                                {new Date(item.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                              </div>
                              <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                                {item.order_number}
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: 'plan',
                          header: '儲值方案',
                          className: 'w-[180px]',
                          render: (item) => (
                            <div className="flex items-center gap-1.5">
                              <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                              <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount tracking-tighter">
                                {item.tokens.toLocaleString()}
                              </span>
                            </div>
                          ),
                        },
                        {
                          key: 'payment',
                          header: '付款方式',
                          className: 'w-[160px]',
                          render: (item) => (
                            <div className="flex items-center gap-2 text-[13px] font-bold text-neutral-700 dark:text-neutral-200">
                              {item.payment_method === 'credit_card' ? <Wallet className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                              {item.payment_method === 'credit_card' ? '信用卡支付' : item.payment_method}
                            </div>
                          ),
                        },
                        {
                          key: 'amount',
                          header: '交易金額',
                          className: 'w-[160px]',
                          render: (item) => (
                            <div className="text-[14px] font-black text-neutral-900 dark:text-white font-amount whitespace-nowrap">
                              NT$ {item.amount.toLocaleString()}
                            </div>
                          ),
                        },
                        {
                          key: 'status',
                          header: '狀態',
                          className: 'w-[120px]',
                          render: (item) => <ProfileStatusBadge config={getTopupStatusConfig(item.status)} />,
                        },
                      ]}
                      rows={pageRows}
                      rowKey={(r) => String(r.id)}
                      empty={emptyText}
                    />

                    <ProfilePagination
                      page={page}
                      pageSize={desktopTopupPageSize}
                      total={total}
                      onPageChange={setDesktopTopupPage}
                      onPageSizeChange={(s) => {
                        setDesktopTopupPageSize(s)
                        setDesktopTopupPage(1)
                      }}
                    />
                  </div>
                )
              })()}
            </div>
          </div>
        );
      case 'follows': {
        const filteredFollowedProducts = followedProducts.filter(product => {
          if (activeFollowsTab === 'all') return true;
          
          const isSoldOut = 
            product.status === 'soldout' || 
            product.status === 'ended' || 
            (typeof product.remaining === 'number' && product.remaining <= 0);

          if (activeFollowsTab === 'soldout') return isSoldOut;
          if (activeFollowsTab === 'selling') return !isSoldOut && product.status === 'selling';
          
          return true;
        });

        return (
          <>
            {/* Mobile Layout */}
            <div className="md:hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col min-h-[100dvh]">
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title="我的關注"
                onBack={() => router.push('/profile', { scroll: false })}
              />

              <div className="relative shrink-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 -mx-0">
                <div className="max-w-7xl mx-auto space-y-2 pt-0 pb-0">
                  <Tabs 
                    value={activeFollowsTab} 
                    onValueChange={(val) => setActiveFollowsTab(val as 'all' | 'selling' | 'soldout')}
                    className="w-full"
                  >
                    <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                      {[
                        { id: 'all', label: '全部' },
                        { id: 'selling', label: '販售中' },
                        { id: 'soldout', label: '已完抽' }
                      ].map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id}>
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              </div>{/* /sticky */}
              <div
                ref={followsScrollRef}
                className="px-2 pt-2 pb-24 bg-neutral-50 dark:bg-neutral-950"
                /* 點商品卡前先記下位置（商品卡自己就是連結，逐張補 onClick 會漏） */
                onClickCapture={() => followsView.remember({
                  tab: activeFollowsTab, y: window.scrollY, count: 0, from: '',
                })}
              >
                {isLoadingData ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-[280px]">
                        <ProductCardSkeleton />
                      </div>
                    ))}
                  </div>
                ) : filteredFollowedProducts.length === 0 ? (
                  <div className="py-20 text-center text-neutral-400">
                    <Heart className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">
                      {activeFollowsTab === 'all' ? '尚無關注商品' : '沒有相關商品'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                    {filteredFollowedProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        id={product.id}
                        name={product.name}
                        image={product.image}
                        price={product.price}
                        remaining={product.remaining || 0}
                        total={product.total || 0}
                        isHot={product.is_hot || false}
                        type={product.type as ProductType || undefined}
                        status={product.status}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden md:block px-6 py-5">
              {(() => {
                const getStatusConfig = (product: FollowedProduct) => {
                  const remaining = typeof product.remaining === 'number' ? product.remaining : 0
                  const isSoldOut =
                    product.status === 'soldout' ||
                    product.status === 'ended' ||
                    remaining <= 0
                  if (isSoldOut) {
                    return {
                      label: '已完抽',
                      color: 'text-neutral-600 dark:text-neutral-300',
                      bg: 'bg-neutral-100 dark:bg-neutral-900',
                      border: 'border-neutral-200 dark:border-neutral-800',
                    }
                  }
                  if (product.status === 'selling') {
                    return {
                      label: '販售中',
                      color: 'text-accent-emerald dark:text-accent-emerald',
                      bg: 'bg-accent-emerald/10 dark:bg-accent-emerald/10',
                      border: 'border-accent-emerald/20 dark:border-accent-emerald/20',
                    }
                  }
                  return {
                    label: product.status || '未知',
                    color: 'text-neutral-600 dark:text-neutral-300',
                    bg: 'bg-neutral-100 dark:bg-neutral-900',
                    border: 'border-neutral-200 dark:border-neutral-800',
                  }
                }

                const getHref = (product: FollowedProduct) => {
                  const type = String(product.type || '').toLowerCase()
                  if (type === 'blindbox') return `/blindbox/${product.id}`
                  if (type === 'gacha') return `/gacha/${product.id}`
                  if (type === 'card') return `/card/${product.id}`
                  return `/item/${product.id}`
                }

                const q = desktopFollowsSearch.trim().toLowerCase()
                const list = filteredFollowedProducts.filter((p) => {
                  if (!q) return true
                  const text = `${p.name} ${p.type} ${p.status}`.toLowerCase()
                  return text.includes(q)
                })

                const total = list.length
                const totalPages = Math.max(1, Math.ceil(total / desktopFollowsPageSize))
                const page = Math.min(desktopFollowsPage, totalPages)
                const start = (page - 1) * desktopFollowsPageSize
                const pageRows = list.slice(start, start + desktopFollowsPageSize)

                return (
                  <div className="space-y-4">
                    <ProfileSectionHeader
                      title="我的關注"

                    />

                    <ProfileToolbar
                      left={
                        <>
                          <input
                            value={desktopFollowsSearch}
                            onChange={(e) => setDesktopFollowsSearch(e.target.value)}
                            placeholder="搜尋商品"
                            className="h-9 w-[320px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                          />
                          <select
                            value={activeFollowsTab}
                            onChange={(e) => setActiveFollowsTab(e.target.value as 'all' | 'selling' | 'soldout')}
                            className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                          >
                            <option value="all">全部</option>
                            <option value="selling">販售中</option>
                            <option value="soldout">已完抽</option>
                          </select>
                        </>
                      }
                      right={
                        <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                          共 {total} 筆
                        </div>
                      }
                    />

                    <ProfileDataTable
                      columns={[
                        {
                          key: 'product',
                          header: '商品',
                          render: (p: FollowedProduct) => (
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shrink-0">
                                <Image
                                  src={p.image || asset('/images/item_defaulet.webp')}
                                  alt={p.name}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="font-black text-neutral-900 dark:text-white truncate">{p.name}</div>
                                <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">
                                  {p.type || '-'}
                                </div>
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: 'status',
                          header: '狀態',
                          className: 'w-[120px]',
                          render: (p: FollowedProduct) => <ProfileStatusBadge config={getStatusConfig(p)} />,
                        },
                        {
                          key: 'remaining',
                          header: '剩餘',
                          className: 'w-[120px]',
                          render: (p: FollowedProduct) => (
                            <div className="text-[13px] font-black text-neutral-900 dark:text-white font-amount whitespace-nowrap">
                              {(p.remaining || 0).toLocaleString()} / {(p.total || 0).toLocaleString()}
                            </div>
                          ),
                        },
                        {
                          key: 'price',
                          header: '單價(G)',
                          className: 'w-[140px]',
                          render: (p: FollowedProduct) => (
                            <div className="flex items-center gap-1.5">
                              <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="object-contain" />
                              <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount tracking-tighter">
                                {(p.price || 0).toLocaleString()}
                              </span>
                            </div>
                          ),
                        },
                        {
                          key: 'action',
                          header: '',
                          className: 'w-[90px]',
                          cellClassName: 'text-right',
                          render: (p: FollowedProduct) => (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(getHref(p))
                              }}
                              className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                            >
                              查看
                            </button>
                          ),
                        },
                      ]}
                      rows={pageRows}
                      rowKey={(r: FollowedProduct) => String(r.id)}
                      onRowClick={(p: FollowedProduct) => router.push(getHref(p))}
                      empty={activeFollowsTab === 'all' ? '尚無關注商品' : '沒有相關商品'}
                    />

                    <ProfilePagination
                      page={page}
                      pageSize={desktopFollowsPageSize}
                      total={total}
                      onPageChange={setDesktopFollowsPage}
                      onPageSizeChange={(s) => {
                        setDesktopFollowsPageSize(s)
                        setDesktopFollowsPage(1)
                      }}
                    />
                  </div>
                )
              })()}
            </div>
          </>
        );
      }
      case 'coupons':
        return (
          <div className="md:pb-0">
            {/* Mobile Header */}
            <div className="md:hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col min-h-[100dvh]">
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title="我的優惠券"
                onBack={() => router.push('/profile', { scroll: false })}
                right={<><button 
                  onClick={() => setIsCouponModalOpen(true)}
                  className="text-[13px] font-black text-primary px-3 py-1.5 bg-primary/5 rounded-lg border border-primary/10"
                >
                  輸入優惠代碼
                </button></>}
              />

              {/* Mobile List */}
              </div>{/* /sticky */}
              <div className="bg-neutral-50 dark:bg-neutral-950 pb-24">
                {coupons.length === 0 ? (
                  <div className="py-20 text-center text-neutral-400">
                    <Ticket className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">目前沒有可用的優惠券</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 border-t border-b border-neutral-100 dark:border-neutral-800">
                    {coupons.map((coupon) => (
                      <div key={coupon.id} className="flex items-center gap-3 pl-3 pr-4 py-3 active:bg-neutral-50 dark:active:bg-neutral-800/70 transition-all">
                        <div className="flex-shrink-0 w-14 h-14 bg-pink-50 dark:bg-pink-900/20 rounded-xl flex flex-col items-center justify-center border border-pink-100 dark:border-pink-900/30">
                           <span className="text-[15px] font-black text-pink-500 font-amount leading-none mb-0.5">
                             {coupon.discountType === 'fixed' ? `$${coupon.discountValue}` : `${coupon.discountValue}%`}
                           </span>
                           <span className="text-[9px] font-bold text-pink-400 uppercase leading-none">OFF</span>
                        </div>
                        
                        <div className="flex-1 min-w-0 space-y-1">
                           <div className="flex items-center justify-between">
                              <h4 className="text-[14px] font-bold text-neutral-900 dark:text-white truncate pr-2">{coupon.title}</h4>
                           </div>
                           <p className="text-[11px] text-neutral-400 line-clamp-1">{coupon.description}</p>
                           <p className="text-[10px] text-neutral-400 font-medium">
                              {coupon.expiryDate ? `期限：${new Date(coupon.expiryDate).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}` : '無使用期限'}
                           </p>
                        </div>

                        <div className="flex-shrink-0 self-center">
                           <span className={cn(
                             "px-2 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider border",
                             coupon.status === 'unused' 
                               ? "bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20" 
                               : "bg-neutral-50 text-neutral-400 border-neutral-100"
                           )}>
                             {coupon.status === 'unused' ? '使用' : coupon.status === 'used' ? '已用' : '過期'}
                           </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coupon Code Modal */}
              <AnimatePresence>
                {isCouponModalOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsCouponModalOpen(false)}
                      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]"
                    />
                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: "spring", damping: 25, stiffness: 300 }}
                      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 rounded-t-[32px] z-[80] overflow-hidden"
                    >
                      <div className="p-6 pb-safe space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xl font-black text-neutral-900 dark:text-white">輸入優惠代碼</h3>
                          <button onClick={() => setIsCouponModalOpen(false)} className="p-2 -mr-2 text-neutral-400 hover:text-neutral-600">
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-black text-neutral-500 uppercase tracking-wider">優惠代碼</label>
                            <input
                              type="text"
                              value={couponCode}
                              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                              placeholder="請輸入優惠代碼"
                              className="w-full bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl px-4 py-3.5 font-black text-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-2 focus:ring-primary/20 transition-all uppercase"
                              autoFocus
                            />
                          </div>
                          
                          <button
                            onClick={() => {
                              handleRedeemCoupon();
                            }}
                            disabled={isRedeemingCoupon || !couponCode.trim()}
                            className="w-full bg-primary text-white py-4 rounded-xl text-base font-black shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRedeemingCoupon ? '兌換中...' : '確認兌換'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="hidden md:block px-6 py-5">
              {(() => {
                const getStatusConfig = (coupon: Coupon) => {
                  if (coupon.status === 'unused') {
                    return {
                      label: '可使用',
                      color: 'text-accent-emerald dark:text-accent-emerald',
                      bg: 'bg-accent-emerald/10 dark:bg-accent-emerald/10',
                      border: 'border-accent-emerald/20 dark:border-accent-emerald/20',
                    }
                  }
                  if (coupon.status === 'used') {
                    return {
                      label: '已使用',
                      color: 'text-neutral-600 dark:text-neutral-300',
                      bg: 'bg-neutral-100 dark:bg-neutral-900',
                      border: 'border-neutral-200 dark:border-neutral-800',
                    }
                  }
                  return {
                    label: '已過期',
                    color: 'text-neutral-600 dark:text-neutral-300',
                    bg: 'bg-neutral-100 dark:bg-neutral-900',
                    border: 'border-neutral-200 dark:border-neutral-800',
                  }
                }

                const q = desktopCouponsSearch.trim().toLowerCase()
                const list = coupons
                  .filter((c) => (desktopCouponsStatus === 'all' ? true : c.status === desktopCouponsStatus))
                  .filter((c) => {
                    if (!q) return true
                    const text = `${c.title} ${c.description} ${c.discountType} ${c.discountValue}`.toLowerCase()
                    return text.includes(q)
                  })

                const total = list.length
                const totalPages = Math.max(1, Math.ceil(total / desktopCouponsPageSize))
                const page = Math.min(desktopCouponsPage, totalPages)
                const start = (page - 1) * desktopCouponsPageSize
                const pageRows = list.slice(start, start + desktopCouponsPageSize)

                return (
                  <div className="space-y-4">
                    <ProfileSectionHeader
                      title="我的優惠券"

                      actions={
                        <button
                          type="button"
                          onClick={() => setIsCouponModalOpen(true)}
                          className="h-9 px-3 rounded-lg bg-primary text-white text-[13px] font-black"
                        >
                          輸入優惠代碼
                        </button>
                      }
                    />

                    <ProfileToolbar
                      left={
                        <>
                          <input
                            value={desktopCouponsSearch}
                            onChange={(e) => setDesktopCouponsSearch(e.target.value)}
                            placeholder="搜尋優惠券"
                            className="h-9 w-[320px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                          />
                          <select
                            value={desktopCouponsStatus}
                            onChange={(e) => setDesktopCouponsStatus(e.target.value as 'all' | 'unused' | 'used' | 'expired')}
                            className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                          >
                            <option value="all">全部</option>
                            <option value="unused">可使用</option>
                            <option value="used">已使用</option>
                            <option value="expired">已過期</option>
                          </select>
                        </>
                      }
                      right={
                        <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                          共 {total} 筆
                        </div>
                      }
                    />

                    <ProfileDataTable
                      columns={[
                        {
                          key: 'coupon',
                          header: '優惠券',
                          render: (c: Coupon) => (
                            <div className="min-w-0">
                              <div className="font-black text-neutral-900 dark:text-white truncate">{c.title}</div>
                              <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">
                                {c.description || '-'}
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: 'discount',
                          header: '折扣',
                          className: 'w-[140px]',
                          render: (c: Coupon) => (
                            <div className="text-[14px] font-black text-pink-600 dark:text-pink-400 font-amount whitespace-nowrap">
                              {c.discountType === 'fixed' ? `$${c.discountValue}` : `${c.discountValue}%`}
                            </div>
                          ),
                        },
                        {
                          key: 'expiry',
                          header: '期限',
                          className: 'w-[160px]',
                          render: (c: Coupon) => (
                            <div className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
                              {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '無期限'}
                            </div>
                          ),
                        },
                        {
                          key: 'status',
                          header: '狀態',
                          className: 'w-[120px]',
                          render: (c: Coupon) => <ProfileStatusBadge config={getStatusConfig(c)} />,
                        },
                      ]}
                      rows={pageRows}
                      rowKey={(r: Coupon) => String(r.id)}
                      empty="目前沒有可用的優惠券"
                    />

                    <ProfilePagination
                      page={page}
                      pageSize={desktopCouponsPageSize}
                      total={total}
                      onPageChange={setDesktopCouponsPage}
                      onPageSizeChange={(s) => {
                        setDesktopCouponsPageSize(s)
                        setDesktopCouponsPage(1)
                      }}
                    />
                  </div>
                )
              })()}
            </div>

            <AnimatePresence>
              {isCouponModalOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsCouponModalOpen(false)}
                    className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="hidden md:block fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[520px] max-w-[calc(100vw-32px)] bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden"
                  >
                    <div className="p-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[18px] font-black text-neutral-900 dark:text-white">輸入優惠代碼</h3>
                        <button onClick={() => setIsCouponModalOpen(false)} className="p-2 -mr-2 text-neutral-400 hover:text-neutral-600">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[12px] font-black text-neutral-500 uppercase tracking-wider">優惠代碼</label>
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder="請輸入優惠代碼"
                          className="w-full h-11 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl px-4 font-black text-[16px] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-2 focus:ring-primary/20 transition-all uppercase"
                          autoFocus
                        />
                      </div>

                      <button
                        onClick={() => {
                          handleRedeemCoupon();
                        }}
                        disabled={isRedeemingCoupon || !couponCode.trim()}
                        className="w-full h-11 bg-primary text-white rounded-xl text-[14px] font-black shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRedeemingCoupon ? '兌換中...' : '確認兌換'}
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        );
      case 'settings':
        return (
          <div className={cn('md:pb-0', cardxShell ? 'bg-transparent' : 'bg-neutral-100 dark:bg-neutral-950')}>
            {/* Mobile Header。子頁推入時本頁往左滑出 28%（iOS push），不是死板被蓋住 */}
            <div
              className="md:hidden bg-neutral-100 dark:bg-neutral-950 flex flex-col min-h-[100dvh]"
              style={{
                transform: (showAddressBook || showEditRecipient) ? 'translateX(-28%)' : 'translateX(0)',
                transition: 'transform .35s cubic-bezier(.32,.72,0,1)',
              }}
            >
              {/* 頭部吸頂（window 捲動版）*/}
              <div className="sticky top-0 z-30 bg-inherit">
                            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
              <PageHeader
                title="設定"
                onBack={() => router.push('/profile', { scroll: false })}
              />

              {/* overscroll-y-none：內容塞得下時 iOS 仍會給橡皮筋彈跳，
                  滾動條就無中生有地現形（實機回報）。關掉過捲，
                  內容真的超出時照常捲動，只是不再彈跳 */}
              </div>{/* /sticky */}
              <div className="pb-24">
                <div className="space-y-3 p-3">
                  {/* Info Group 1 */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
                    <div 
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={openAvatarPicker}
                    >
                      <label className="text-[15px] text-neutral-800 dark:text-neutral-200">頭像</label>
                      <div className="flex items-center gap-2">
                         <div className="w-10 h-10 rounded-full overflow-hidden relative bg-neutral-100 border border-neutral-100 dark:border-neutral-800">
                           {isUploadingAvatar ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                                <Loader2 className="w-4 h-4 text-white animate-spin" />
                              </div>
                           ) : (
                              <Image 
                                src={user?.avatar_url || asset('/images/avatar.webp')} 
                                alt="Avatar" 
                                fill 
                                className="object-cover" 
                                unoptimized
                              />
                           )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleAvatarChange} 
                          accept="image/*" 
                          hidden 
                        />
                      </div>
                    </div>
                    <div
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={() => setShowEditNickname(true)}
                    >
                      <label className="text-[15px] text-neutral-800 dark:text-neutral-200">暱稱</label>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[14px]", user?.name ? "text-neutral-900 dark:text-white font-medium" : "text-primary")}>
                          {user?.name || '立即設定'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                      </div>
                    </div>
                    <div
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={() => { fetchUserTitles(); setShowTitlePicker(true); }}
                    >
                      <label className="text-[15px] text-neutral-800 dark:text-neutral-200">稱號</label>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const sel = userTitles.find(t => t.is_selected);
                          return sel ? (
                            <span className="text-[14px] font-medium text-neutral-900 dark:text-white">{sel.name}</span>
                          ) : (
                            <span className="text-[14px] text-neutral-400">未選擇</span>
                          );
                        })()}
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                      </div>
                    </div>
                    <div 
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={() => setShowEditGender(true)}
                    >
                      <label className="text-[15px] text-neutral-800 dark:text-neutral-200 flex items-center gap-1">
                        性別 <HelpCircle className="w-3 h-3 text-neutral-300" />
                      </label>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[14px]", settingsForm.gender ? "text-neutral-900 dark:text-white" : "text-accent-red")}>
                          {settingsForm.gender === 'male' ? '男' : settingsForm.gender === 'female' ? '女' : settingsForm.gender === 'other' ? '其他' : '立即設定'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                      </div>
                    </div>
                    <div 
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={() => {
                        if (settingsForm.birthday) return;
                        if (!tempBirthday) setTempBirthday(new Date(2000, 0, 1));
                        if (!tempBirthday) setTempBirthday(new Date(2000, 0, 1));
                      setShowEditBirthday(true);
                      }}
                    >
                      <label className="text-[15px] text-neutral-800 dark:text-neutral-200 flex items-center gap-1">
                        生日 <HelpCircle className="w-3 h-3 text-neutral-300" />
                      </label>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[14px]", settingsForm.birthday ? "text-neutral-900 dark:text-white" : "text-accent-red")}>
                          {settingsForm.birthday || '立即設定'}
                        </span>
                        {!settingsForm.birthday && <ChevronRight className="w-4 h-4 text-neutral-300" />}
                      </div>
                    </div>
                  </div>

                  {/* 帳號與安全：綁定類在前（信箱、LINE），再手機；
                      密碼只給有真信箱的帳號 —— 純 LINE 帳號沒有密碼這回事，
                      點進去只會看到一頁掛著合成信箱的表單（實機回報過） */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
                    <EmailBindRow email={user?.email} />
                    <LineBindRow />
                    {/* 手機驗證關閉時整列不顯示 —— 留一個點不動的入口只會吊人胃口。
                        已經驗過的老帳號仍然看得到自己的號碼 */}
                    {(phoneVerifyEnabled || user?.is_phone_verified) && (
                    <div 
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={() => {
                        if (user?.is_phone_verified) return;
                        openPhoneBindModal();
                      }}
                    >
                      <label className="text-[15px] text-neutral-800 dark:text-neutral-200">手機號碼</label>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[14px]", user?.is_phone_verified ? "text-neutral-900 dark:text-white font-medium" : "text-accent-red")}>
                          {user?.is_phone_verified ? maskPhoneForDisplay(user.phone_number || '') : '立即設定'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                      </div>
                    </div>
                    )}
                    {user?.email && !isSyntheticEmail(user.email) && (
                      <div 
                        className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                        onClick={() => {
                          const emailParam = `&email=${encodeURIComponent(user.email)}`;
                          router.push(`/forgot-password?from=${encodeURIComponent('/profile?tab=settings')}${emailParam}`);
                        }}
                      >
                        <label className="text-[15px] text-neutral-800 dark:text-neutral-200">登入密碼</label>
                        <div className="flex items-center gap-2">
                          {acctStatus?.password === undefined ? (
                            <span className="h-3.5 w-10 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                          ) : acctStatus.password.set ? (
                            <span className="text-[14px] text-neutral-400">修改</span>
                          ) : (
                            <span className="text-[14px] text-accent-red">立即設定</span>
                          )}
                          <ChevronRight className="w-4 h-4 text-neutral-300" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 邀請碼（選填，跟帳號安全分開） */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden">
                    <InviteCodeRow />
                  </div>

                {/* Address Section */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden mt-3">
                    <div 
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={() => setShowAddressBook(true)}
                    >
                      <label className="text-[15px] text-neutral-800 dark:text-neutral-200">收件地址</label>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] text-neutral-400">管理地址</span>
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                      </div>
                    </div>
                  </div>

                  {/* Logout Button */}
                  <div className="mt-6">
                    <button 
                      type="button" 
                      onClick={handleLogout}
                      className="w-full bg-white dark:bg-neutral-800 text-neutral-500 h-11 rounded-lg border border-neutral-200 dark:border-neutral-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-[15px]"
                    >
                      登出
                    </button>
                  </div>

                  {/* 刪除帳號（Apple 5.1.1(v) 要求 App 內要有入口） */}
                  <div className="mt-3 mb-2 text-center">
                    <button
                      type="button"
                      onClick={() => setShowDeleteAccount(true)}
                      className="text-[13px] text-neutral-400 dark:text-neutral-500 underline underline-offset-2 py-2 px-3"
                    >
                      刪除帳號
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop View */}
            {/* 桌機（1024 起、掛在 cardx 外殼裡）：不再 max-w-2xl 置中——右邊留一大片空白（老闆 2026-09-05），
                改成「設定」標題＋左右兩欄：個人資料｜帳號安全／其他／登出，卡片照 cardx 的 16 圓角＋1px 描邊 */}
            <div className="hidden md:block">
              <ProfileSectionHeader title="設定" description="個人資料、帳號安全與收件地址" />
              <div className="mt-5 grid grid-cols-1 gap-5 items-start lg:grid-cols-2">
              <div className="space-y-4">
                <div className="text-[14px] font-black text-neutral-900">個人資料</div>
                {/* Info Group 1 */}
                <div className="space-y-2">
                  <div 
                    className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={openAvatarPicker}
                  >
                    <label className="text-[14px] font-bold text-neutral-700">頭像</label>
                    <div className="flex items-center gap-2">
                       <div className="w-10 h-10 rounded-full overflow-hidden relative bg-neutral-100 border border-neutral-100 dark:border-neutral-800">
                         {isUploadingAvatar ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                            </div>
                         ) : (
                            <Image 
                              src={user?.avatar_url || asset('/images/avatar.webp')} 
                              alt="Avatar" 
                              fill 
                              className="object-cover" 
                              unoptimized
                            />
                         )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleAvatarChange} 
                        accept="image/*" 
                        hidden 
                      />
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => setShowEditNickname(true)}
                  >
                    <label className="text-[14px] font-bold text-neutral-700">暱稱</label>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[14px]", user?.name ? "text-neutral-900 dark:text-white font-medium" : "text-primary")}>
                        {user?.name || '立即設定'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => { fetchUserTitles(); setShowTitlePicker(true); }}
                  >
                    <label className="text-[14px] font-bold text-neutral-700">稱號</label>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const sel = userTitles.find(t => t.is_selected);
                        return sel ? (
                          <span className="text-[14px] font-medium text-neutral-900 dark:text-white">{sel.name}</span>
                        ) : (
                          <span className="text-[14px] text-neutral-400">未選擇</span>
                        );
                      })()}
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
                  <div 
                    className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => {
                      if (settingsForm.gender) return;
                      setTempGender('');
                      setShowEditGender(true);
                    }}
                  >
                    <label className="text-[14px] font-bold text-neutral-700 flex items-center gap-1">
                      性別 <HelpCircle className="w-3 h-3 text-neutral-300" />
                    </label>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[14px]", settingsForm.gender ? "text-neutral-900 dark:text-white" : "text-accent-red")}>
                        {settingsForm.gender === 'male' ? '男' : settingsForm.gender === 'female' ? '女' : settingsForm.gender === 'other' ? '其他' : '立即設定'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
                  <div 
                    className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => {
                      if (settingsForm.birthday) return;
                      if (!tempBirthday) setTempBirthday(new Date(2000, 0, 1));
                      setShowEditBirthday(true);
                    }}
                  >
                    <label className="text-[14px] font-bold text-neutral-700 flex items-center gap-1">
                      生日 <HelpCircle className="w-3 h-3 text-neutral-300" />
                    </label>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[14px]", settingsForm.birthday ? "text-neutral-900 dark:text-white" : "text-accent-red")}>
                        {settingsForm.birthday || '立即設定'}
                      </span>
                      {!settingsForm.birthday && <ChevronRight className="w-4 h-4 text-neutral-300" />}
                    </div>
                  </div>
                </div>

              </div>

              <div className="space-y-4">
                <div className="text-[14px] font-black text-neutral-900">帳號</div>
                {/* 帳號與安全：同手機版的順序與規則 */}
                <div className="space-y-2">
                  <div className="h-16 overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e5e7eb] transition-colors hover:bg-neutral-50 [&>*]:h-full [&>*]:w-full [&>*]:!py-0 [&>*]:!px-5"><EmailBindRow email={user?.email} /></div>
                  <div className="h-16 overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e5e7eb] transition-colors hover:bg-neutral-50 [&>*]:h-full [&>*]:w-full [&>*]:!py-0 [&>*]:!px-5"><LineBindRow /></div>
                  {/* 同上：功能關閉時整列不顯示 */}
                  {(phoneVerifyEnabled || user?.is_phone_verified) && (
                  <div 
                    className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => {
                      if (user?.is_phone_verified) return;
                      openPhoneBindModal();
                    }}
                  >
                    <label className="text-[14px] font-bold text-neutral-700">手機號碼</label>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[14px]", user?.is_phone_verified ? "text-neutral-900 dark:text-white font-medium" : "text-accent-red")}>
                        {user?.is_phone_verified ? maskPhoneForDisplay(user.phone_number || '') : '立即設定'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
                  )}
                  {user?.email && !isSyntheticEmail(user.email) && (
                    <div 
                      className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                      onClick={() => router.push('/update-password')}
                    >
                      <label className="text-[14px] font-bold text-neutral-700">登入密碼</label>
                      <div className="flex items-center gap-2">
                        {acctStatus?.password === undefined ? (
                            <span className="h-3.5 w-10 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                          ) : acctStatus.password.set ? (
                            <span className="text-[14px] text-neutral-400">修改</span>
                          ) : (
                            <span className="text-[14px] text-accent-red">立即設定</span>
                          )}
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                      </div>
                    </div>
                  )}

                {/* 邀請碼（選填）與收件地址併在帳號這一組，左右各五列才對稱。
                    ⚠️ 要跟上面三列同一個 space-y-2 容器：分成三個區塊會吃到欄的 space-y-4，位置就比左欄低（老闆 2026-09-05） */}
                  <div className="h-16 overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e5e7eb] transition-colors hover:bg-neutral-50 [&>*]:h-full [&>*]:w-full [&>*]:!py-0 [&>*]:!px-5"><InviteCodeRow /></div>

                {/* Address Section */}
                  <div 
                    className="flex items-center justify-between px-5 h-16 bg-white rounded-[14px] ring-1 ring-[#e5e7eb] hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => setShowAddressBook(true)}
                  >
                    <label className="text-[14px] font-bold text-neutral-700">收件地址</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-neutral-400">管理地址</span>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
                </div>

              </div>
              </div>

              <div className="mx-auto mt-6 w-full max-w-[420px]">
                {/* Logout Button */}
                <div>
                  <button 
                    type="button" 
                    onClick={handleLogout}
                    className="w-full h-11 rounded-[12px] bg-[#f3f4f6] text-neutral-700 text-[14px] font-black hover:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-2"
                  >
                    登出
                  </button>
                </div>

                {/* 刪除帳號（Apple 5.1.1(v) 要求 App 內要有入口） */}
                <div className="mt-1 text-center">
                  <button
                    type="button"
                    onClick={() => setShowDeleteAccount(true)}
                    className="text-[13px] text-neutral-400 dark:text-neutral-500 underline underline-offset-2 py-2 px-3"
                  >
                    刪除帳號
                  </button>
                </div>
              </div>
            </div>

            <DeleteAccountSheet
              isOpen={showDeleteAccount}
              onClose={() => setShowDeleteAccount(false)}
              onDeleted={async () => {
                setShowDeleteAccount(false);
                toast.success('帳號已刪除');
                await logout();
                router.replace('/');
              }}
            />

            {isPhoneBindModalOpen && (
              <div className="fixed inset-0 z-[90] bg-white dark:bg-neutral-950">
                <SimplePageHeader
                  title="手機驗證"
                  onBack={() => setIsPhoneBindModalOpen(false)}
                  darkBg="page"
                  className="z-[95]"
                />

                <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col relative">
                  <div className="flex-1 flex flex-col justify-start items-center pt-[calc(88px+env(safe-area-inset-top))] px-6 pb-8">
                    <div className="w-full max-w-sm">
                      {phoneStep === 'input' ? (
                        <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="mb-8">
                            <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-2">手機門號</label>
                            <input
                              name="phone"
                              type="tel"
                              inputMode="numeric"
                              placeholder={PHONE_PLACEHOLDER}
                              pattern="^09\d{8}$"
                              className="border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent focus:outline-none focus:ring-0 focus:border-primary focus:bg-transparent h-12 text-base placeholder:text-neutral-400 w-full font-black text-neutral-900 dark:text-white"
                              value={phoneNumberInput}
                              onChange={(e) => setPhoneNumberInput(e.target.value)}
                              onBlur={(e) => setPhoneNumberInput(normalizePhone(e.target.value))}
                              autoFocus
                            />
                          </div>

                          <Button
                            variant="solid" fullWidth size="lg"
                            onClick={handleSendPhoneOtp}
                            isLoading={isSendingPhoneOtp}
                            disabled={isSendingPhoneOtp || !phoneNumberInput.trim()}
                          >
                            下一步
                          </Button>
                        </div>
                      ) : (
                        <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="text-center mb-8">
                            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                              驗證碼已發送至 <span className="font-medium text-neutral-900 dark:text-neutral-200">{formatPhoneForDisplay(normalizePhoneE164(phoneNumberInput))}</span>
                            </p>
                          </div>

                          <div className="mb-8">
                            <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-2">驗證碼</label>
                            <input
                              type="text"
                              maxLength={6}
                              className="w-full text-center text-3xl font-bold tracking-[0.5em] h-14 border-b-2 border-neutral-200 focus:border-primary focus:outline-none bg-transparent text-neutral-900 dark:text-white"
                              placeholder="000000"
                              value={phoneOtp}
                              onChange={(e) => setPhoneOtp(e.target.value.replace(/[^0-9]/g, ''))}
                              autoFocus
                            />
                          </div>

                          <Button
                            variant="solid" fullWidth size="lg"
                            onClick={handleVerifyPhoneOtp}
                            isLoading={isVerifyingPhoneOtp}
                            disabled={isVerifyingPhoneOtp || phoneOtp.replace(/\D/g, '').length < 6}
                          >
                            確認驗證
                          </Button>

                          <div className="mt-6 flex items-center justify-between text-sm">
                            <button
                              type="button"
                              onClick={() => setPhoneStep('input')}
                              className="font-black text-neutral-500 hover:text-neutral-700 transition-colors"
                            >
                              更換號碼
                            </button>
                            <button
                              type="button"
                              onClick={handleSendPhoneOtp}
                              disabled={isSendingPhoneOtp}
                              className="font-black text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                            >
                              重新發送
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return (
          <div className="p-8 text-center text-neutral-400 font-black uppercase tracking-widest">
            頁面開發中...
          </div>
        );
    }
  };

  /* cardx 外殼裡的卡片：18 圓角、1px 描邊＋淡投影（同 cardx Kit 的 SurfaceCard），密度照 cardx 會員中心 */
  const cardxCardStyle: React.CSSProperties | undefined = cardxShell
    ? { boxShadow: '0 0 0 1px #e5e7eb, 0 10px 40px -10px rgba(0,0,0,0.08)' }
    : undefined;
  /* 已重構成「零套疊」的分頁：右欄不再包外層白卡，內容直接鋪在頁面底色上（老闆 2026-09-05） */
  const flatTab = cardxShell && (activeTab === 'warehouse' || activeTab === 'settings' || activeTab === 'delivery');
  const sideCardCls = cardxShell
    ? 'bg-white rounded-[18px] p-[14px]'
    : 'bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3';
  /* 左欄選單列：cardx 版 46 高、15px／900、選中主題色淡底（老闆 2026-09-05：active 要接主題色，不是 cardx 原型的藍） */
  const sideNavCls = (active: boolean) => cardxShell
    ? cn('w-full flex items-center gap-3 px-3 h-[46px] rounded-xl text-[15px] font-black transition-colors group text-left',
        active ? 'text-primary' : 'text-[#374151] hover:bg-[#f3f4f6]')
    : cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group text-left',
        active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white');
  const sideNavStyle = (active: boolean): React.CSSProperties | undefined =>
    cardxShell && active ? { background: 'rgb(var(--primary) / 0.12)' } : undefined;
  const sideNavIcon = (Icon: React.ComponentType<{ className?: string }>, active: boolean, idleCls: string) => cardxShell ? (
    <span
      className="w-[30px] h-[30px] rounded-[10px] grid place-items-center flex-shrink-0"
      style={{ background: active ? 'rgb(var(--primary) / 0.16)' : '#f3f4f6', color: active ? 'rgb(var(--primary))' : '#374151' }}
      aria-hidden="true"
    >
      <Icon className="w-[19px] h-[19px] stroke-[2.25]" />
    </span>
  ) : (
    <Icon className={cn('w-5 h-5 stroke-[2.5]', active ? 'text-white' : idleCls)} />
  );

  /* 左欄選單（cardx 殼裡併進個人卡；舊殼維持獨立一張卡） */
  const sideNavList = (
    <div className="space-y-1">
                {navItems.filter(item => item.id !== 'settings' && item.id !== 'market').map((item) => (
                  <button 
                    key={item.id} 
                    onClick={() => {
                      if (isGuest) {
                        router.push(loginHref);
                        return;
                      }
                      handleTabChange(item.id as TabType);
                    }} 
                    className={sideNavCls(activeTab === item.id)}
                    style={sideNavStyle(activeTab === item.id)}
                  >
                    {sideNavIcon(item.icon, activeTab === item.id, 'text-neutral-300 group-hover:text-primary transition-colors')}
                    <span className="truncate">{item.label}</span>
                    <ChevronRight className={cn('ml-auto w-4 h-4 transition-transform hidden sm:block', cardxShell ? (activeTab === item.id ? 'text-primary/50' : 'text-[#d1d5db]') : activeTab === item.id ? 'text-white/50' : 'text-neutral-200 group-hover:text-neutral-400')} />
                  </button>
                ))}
                {/* 邀請好友：獨立頁面不是 tab，樣式跟上面同一家（老闆指定放優惠券下方） */}
                <button
                  type="button"
                  onClick={() => {
                    if (isGuest) {
                      router.push(loginHref);
                      return;
                    }
                    router.push('/invite');
                  }}
                  className={sideNavCls(false)}
                >
                  {sideNavIcon(UserPlus, false, 'text-violet-500 group-hover:text-primary transition-colors')}
                  <span className="truncate">邀請好友</span>
                  <span className={cn('ml-auto inline-flex items-center rounded-full bg-accent-red px-2 font-bold leading-none text-white', cardxShell ? 'h-[21px] text-[12px]' : 'h-[19px] text-[11px]')}>
                    <span className="cjk-optical-center">無限拿積分</span>
                  </span>
                  <ChevronRight className={cn('w-4 h-4 hidden sm:block', cardxShell ? 'text-[#d1d5db]' : 'text-neutral-200 group-hover:text-neutral-400')} />
                </button>
                {/* 設定：cardx 殼裡是左側欄的一個分頁（老闆 2026-09-05），取代個人卡右上角的齒輪 */}
                {cardxShell && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isGuest) { router.push(loginHref); return; }
                      handleTabChange('settings');
                    }}
                    className={sideNavCls(activeTab === 'settings')}
                    style={sideNavStyle(activeTab === 'settings')}
                  >
                    {sideNavIcon(Settings, activeTab === 'settings', 'text-neutral-300 group-hover:text-primary transition-colors')}
                    <span className="truncate">設定</span>
                    <ChevronRight className={cn('ml-auto w-4 h-4 transition-transform hidden sm:block', activeTab === 'settings' ? 'text-primary/50' : 'text-[#d1d5db]')} />
                  </button>
                )}
    </div>
  );

  /* 平板（768～1023）：頂部一條橫條＋一排橫捲的分頁膠囊，取代左欄那張直的卡 */
  const tabletTabs: { id: TabType | 'invite'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    ...navItems.filter(item => item.id !== 'settings' && item.id !== 'market').map(item => ({ id: item.id as TabType, label: item.label, icon: item.icon })),
    { id: 'invite', label: '邀請好友', icon: UserPlus }, // 獨立頁，不是 tab（老闆 2026-09-05）
    { id: 'settings', label: '設定', icon: Settings },
  ];
  const tabletProfileBar = tabletShell ? (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-[16px] bg-white px-4 py-3" style={cardxCardStyle}>
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-neutral-50 bg-white p-0.5">
          {isGuest ? (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-neutral-200"><User className="h-5 w-5 text-neutral-500" /></div>
          ) : (
            <Image src={user.avatar_url || 'https://github.com/shadcn.png'} alt={user.name || 'User'} fill className="rounded-full object-cover" unoptimized />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {isGuest ? (
            <Link href={loginHref} className="text-[15px] font-black text-primary underline decoration-dotted underline-offset-2">登入後顯示</Link>
          ) : (
            <>
              <div className="truncate text-[16px] font-black text-neutral-900">{user.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-black text-neutral-400">
                <span>邀請碼</span>
                <span className="font-mono text-[#111827]">{formatMemberNo(user.invite_code) || '-'}</span>
              </div>
            </>
          )}
        </div>
        {!isGuest && (
          <div className="flex items-center gap-2">
            <Image src={asset("/images/gcoin.webp")} alt="G" width={20} height={20} className="object-contain" />
            <span className="text-[20px] font-black tabular-nums tracking-tight text-[#111827]">{user.tokens?.toLocaleString() || 0}</span>
          </div>
        )}
        <CardxButton3D color="red" href={isGuest ? loginHref : '/topup'} style={{ height: 36, borderRadius: 10, width: 68 }}>儲值</CardxButton3D>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {tabletTabs.map(t => {
          const active = t.id !== 'invite' && activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { if (isGuest) { router.push(loginHref); return; } if (t.id === 'invite') { router.push('/invite'); return; } handleTabChange(t.id); }}
              className={cn('flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-black whitespace-nowrap transition-colors', active ? 'bg-primary text-white' : 'bg-white text-neutral-700 ring-1 ring-[#e5e7eb] hover:bg-neutral-50')}
            >
              <t.icon className="h-4 w-4 stroke-[2.25]" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className={cn(
      cardxShell ? 'w-full' : 'min-h-screen bg-neutral-50 dark:bg-neutral-950 transition-colors',
      /* 手機分頁打開時整頁就是分頁本體（min-h-100dvh），底 padding 會多出一段可捲的空白底 */
      cardxShell ? 'pb-0' : isMobileDetailOpen ? 'pb-0 md:pb-20' : 'pb-20',
    )}>
      <div className={cn(
        cardxShell ? 'w-full p-0' : 'max-w-7xl mx-auto w-full',
        !cardxShell && (activeTab === 'settings' ? "p-0" : "px-0 sm:px-6 lg:px-8 pt-0 sm:pt-6")
      )}>
        <div className={cardxShell ? 'grid grid-cols-1 items-start relative gap-4' : 'grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-8 items-start relative'}>
          {tabletProfileBar}
          
          {/* 1. Mobile Menu View (Only shown on mobile when no tab is active) */}
          <div className={cn("md:hidden col-span-1", isMobileDetailOpen && "hidden")}>
            {/* 動態島底下的漸層毛玻璃（老闆 2026-08-22）。掛在 data-ptr-content 外面，
                下拉更新不會拖到它。
                tint="light"（老闆 2026-08-28）：原本 none 只糊不帶色，動態島後面就是
                一整塊實心主題色，時間與電量壓在上面很硬。帶一層白霧才化得開。 */}
            <TopFadeBlur tint="light" />
            {/* 橘色動態背景：**fixed**，不跟著捲動、也不被下拉更新拖走
                （老闆 2026-08-21：「往下捲動時橘色動態背景不要跟著被捲動，跟排行榜一樣」）。
                排行榜的流體背景就是 fixed 當純背景、內容在上面捲，這裡照做，只鋪頭圖
                那一段高度：安全區 + 頭圖（375:195 → 52vw）**再多 160px**。
                多的那段是給下拉更新用的：內容被拖時最多往下走 78px 再加一個安全區的
                抬升（約 137px），橘底只鋪到頭圖下緣的話，拖到底頭圖下半截就坐在灰底上
                （老闆 2026-08-22：「下拉會看到橘色背景只有局部」）。
                沒在拖的時候那 160px 被底下不透明的灰色選單區蓋住，看不到。
                ⚠️ fixed 要成立，祖先就不能有 transform —— 所以底下那層內容掛
                `data-ptr-content`，讓下拉更新只拖內容、不拖整個 <main>
                （有 transform 的祖先會讓 position:fixed 退化成相對定位）。*/}
            <div
              className="profile-bubbles z-0 pointer-events-none"
              /* position/inset 走行內樣式：.profile-bubbles 自己就寫了
                 `position:absolute; inset:0`，用 tailwind 的 .fixed 蓋它要賭
                 樣式表順序，行內樣式才一定贏 */
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'auto',
                       height: 'calc(env(safe-area-inset-top) + 52vw + 160px)' }}
              aria-hidden
            >
              <span className="bubble bubble-dark" />
              <span className="bubble bubble-light" />
            </div>
            {/* 下拉更新拖這一塊（橘背景留在外面不動）。data-ptr-strip="none"：
                空隙不鋪灰底，讓後面的橘色露出來，轉蛋球就浮在橘色上（老闆指定）。
                詳細頁開著時整塊是 hidden，量不到尺寸，這時不要掛標記 —— 讓下拉
                更新退回預設的拖 <main>。*/}
            <div
              {...(isMobileDetailOpen ? {} : { 'data-ptr-content': '', 'data-ptr-strip': 'none' })}
            >
            {/* Mobile Header - RankingTop Style
                全出血：外層 pt-[env] 把 aspect 頭圖整塊壓到動態島下（內容不被島裁、
                也不會單獨推頭像撞到代幣卡）。橘底改成上面那層 fixed 的，這裡只留
                aspect 頭圖（透明去背 PNG），疊在橘底上。*/}
            <div className="relative pt-[env(safe-area-inset-top)]">
            <div className="relative z-[1] w-full aspect-[375/195] select-none">
              {/* 疊層：原本的去背底圖（深色卡＋星盾＋波紋，透明 PNG），蓋在動態橘底上，
                  頭像/代幣內容再疊在它上面 —— 還原原始外觀、只是底色改成會動的（老闆 2026-08-21）*/}
              <Image
                src={asset("/images/profile/topbg.png")}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 375px"
                className="object-cover pointer-events-none select-none"
                priority
                unoptimized
                aria-hidden
              />

              {/* Profile Info Section */}
              <div className="absolute top-[8%] left-0 w-full px-[4.2%] flex items-center justify-between">
                <div className="flex-1 flex items-center gap-[2.1%] min-w-0">
                  {/* Avatar */}
                  <div className="relative shrink-0 w-[16%] aspect-square">
                    {/* relative 不能少：next/image 的 fill 錨的是最近的 positioned 祖先，
                        少了它圖片會錨到外層方形容器、逃出這層圓形遮罩的裁切 —— 頭貼就變方的 */}
                    <div className="relative w-full h-full rounded-full overflow-hidden border-2 border-white/20">
                      {isGuest ? (
                        <div className="w-full h-full bg-neutral-200 flex items-center justify-center">
                          <User className="w-1/2 h-1/2 text-neutral-400" />
                        </div>
                      ) : (
                        <Image
                          src={user.avatar_url || asset('/images/avatar.webp')}
                          alt={user.name || 'User'}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                    {/* 已認證：手機驗證通過才顯示。掛在頭像外層，避免被圓形裁切吃掉 */}
                    {!isGuest && user.is_phone_verified && (
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-[34%] aspect-square rounded-full bg-[#22c55e] border-2 border-white flex items-center justify-center shadow"
                        title="已認證"
                      >
                        <svg viewBox="0 0 24 24" className="w-3/5 h-3/5" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Name & Badge & Code */}
                  <div className="flex-1 flex flex-col gap-[2px] items-start min-w-0 justify-center">
                    {/* Name Row */}
                    <div className="flex items-center gap-[2px] w-full">
                      {isGuest ? (
                        <Link 
                          href={loginHref}
                          className="text-[16px] font-medium text-white text-shadow-sm truncate leading-[1.4] max-w-[80%] underline decoration-dotted underline-offset-4 decoration-white/50"
                        >
                          登入後顯示
                        </Link>
                      ) : (
                        <div className="text-[16px] font-medium text-white text-shadow-sm truncate leading-[1.4] max-w-[80%]">
                          {user.name}
                        </div>
                      )}
                      {!isGuest && user.is_phone_verified && (
                        <CheckCircle2 className="w-[18px] h-[18px] text-accent-emerald drop-shadow-sm shrink-0" />
                      )}
                      {/* Badge Image */}
                      {!isGuest && user.is_phone_verified && (
                        <div className="relative shrink-0 w-[24px] h-[24px]">
                          <Image src={asset("/images/profile/badge.png")} alt="Badge" fill className="object-contain" unoptimized />
                        </div>
                      )}
                    </div>

                    {/* Recommendation Code */}
                    {!isGuest && (
                      <div 
                        className="bg-black/15 flex items-center px-[8px] rounded-full h-[24px] gap-[4px] cursor-pointer active:scale-95 transition-transform"
                        onClick={() => {
                          if (!user.invite_code) return;
                          const text = user.invite_code;
                          
                          // Fallback function for older browsers or non-secure contexts
                          const fallbackCopy = (text: string) => {
                            const textArea = document.createElement("textarea");
                            textArea.value = text;
                            textArea.style.position = "fixed";
                            textArea.style.left = "-9999px";
                            textArea.style.top = "0";
                            document.body.appendChild(textArea);
                            textArea.focus();
                            textArea.select();
                            try {
                              document.execCommand('copy');
                              toast.success('邀請碼已複製');
                            } catch (err) {
                              console.error('Fallback copy failed', err);
                              toast.error('複製失敗');
                            }
                            document.body.removeChild(textArea);
                          };

                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(text)
                              .then(() => toast.success('邀請碼已複製'))
                              .catch(() => fallbackCopy(text));
                          } else {
                            fallbackCopy(text);
                          }
                        }}
                      >
                        <span className="text-[12px] text-white/90">推薦碼</span>
                        <span className="text-[14px] font-bold text-[#ffe600]">{formatMemberNo(user.invite_code) || '-'}</span>
                        <Copy className="w-3 h-3 text-white/70" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <button
                        onClick={() => {
                          if (isGuest) {
                            router.push(loginHref);
                            return;
                          }
                          handleTabChange('settings');
                        }}
                        className="w-[32px] h-[32px] bg-black/10 rounded-full flex items-center justify-center backdrop-blur-sm active:bg-black/20 transition-colors relative"
                      >
                        <Settings className="w-5 h-5 text-white" />
                        {/* 黃點而不是紅點（老闆 2026-08-29）：紅點壓在主題色的頭圖上
                            幾乎看不出來，而且紅色在站上是「錯誤／扣款」的語意，
                            這裡只是「還有資料沒填」 */}
                        {settingsIncomplete && (
                          <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-accent-yellow border-2 border-white/20 rounded-full" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

                {/* Wallet Section */}
                <div className="absolute left-[6.4%] right-[6.4%] bottom-[14%]">
                  <div className="flex flex-col w-full">
                    {/* Top Row: Label (Left) and History (Right) */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="relative w-4 h-4">
                          <Image src={asset("/images/gcoin.webp")} alt="Token" fill className="object-contain" unoptimized />
                        </div>
                        <span className="text-xs text-white/90 font-medium">代幣餘額</span>
                      </div>
                      
                      <button 
                        onClick={() => {
                          if (isGuest) {
                            router.push(loginHref);
                            return;
                          }
                          handleTabChange('topup-history');
                        }}
                        /* 深色半透明，不用 backdrop-blur：原本是 bg-white/10 + 毛玻璃，
                           等於把底下的盾牌插圖與卡片橘色漸層「照亮」再抹開，
                           藥丸看起來像一塊有雜訊的髒斑（老闆 2026-08-23 截圖）。
                           改成壓暗，底圖被蓋住、白字也更讀得出來。 */
                        className="h-7 px-2 rounded-full bg-black/30 border border-white/25 flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <span className="cjk-optical-center text-xs text-white font-bold">儲值紀錄</span>
                        <ChevronRight className="w-3 h-3 text-white/70" />
                      </button>
                    </div>
                    
                    {/* Bottom Row: Amount (Left) and Topup (Right) */}
                    <div className="flex justify-between items-end">
                      {/* 字距回到 tracking-tight：字級從 36 拉到 40 那次順手放寬成 0.05em，數字被拉開變得像分開的（老闆 2026-08-24）。站上其他金額用的也是負字距。 */}
                      <div className="text-[40px] leading-none tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-[#ffa800] to-white drop-shadow-sm font-amount" style={{ fontWeight: 800 }}>
                        {isGuest ? '0' : (user.tokens?.toLocaleString() || '0')}
                      </div>
                      
                      {/* 儲值維護中：按鈕留著但不換頁，改跳提示（同 Navbar 的「立即儲值」） */}
                      <Link
                        href={isGuest ? loginHref : '/topup'}
                        onClick={e => {
                          if (!isGuest && rechargeState === 'maintenance') {
                            e.preventDefault();
                            toast.info('儲值維護中，敬請見諒');
                          }
                        }}
                        className="h-8 px-4 bg-[#ffd900] rounded-full flex items-center justify-center text-[#282828] text-sm font-black shadow-lg shadow-yellow-500/20 active:scale-95 transition-transform"
                      >
                        儲值
                      </Link>
                    </div>
                  </div>
                </div>
            </div>
            </div>

            {/* 頭圖以下整段是**不透明的灰底、而且疊在橘底之上**（relative z-[1]）。
                橘底是 fixed 的 positioned 元素（z-0），會畫在任何「沒定位」的兄弟節點
                上面 —— 之前選單卡片沒定位，往下捲時頭圖（z-[1]）捲到頂、底下的
                「我的倉庫／配送管理」整排被橘底蓋掉，看起來像餘額卡跟選單分家、
                灰背景沒跟著上來（老闆 2026-08-22 截圖）。
                間距（space-y-2.5 + pt-2.5）搬到這層，跟原本的版面一樣。*/}
            <div className="relative z-[1] bg-neutral-50 dark:bg-neutral-950 pt-2.5 space-y-2.5">
            {/*
              這裡原本有「購買清單」區塊（待付款/待出貨/待收貨/評價 → /purchases）。
              2026-08-14 老闆指定隱藏：商城訂單的唯一入口是商城的「我的訂單」
              （/sell/orders 的 OrderSheet 彈層），這裡的捷徑跟 /purchases 都是舊的重複 UI。
            */}

            {/* Main Menu List */}
            <div className="mx-2 bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-50 dark:divide-neutral-800">
              {[
                {
                  id: 'warehouse',
                  label: '我的倉庫',
                  icon: Box,
                  color: 'text-primary',
                  onClick: () => handleTabChange('warehouse'),
                },
                {
                  id: 'delivery',
                  label: '配送管理',
                  icon: Truck,
                  color: 'text-accent-emerald',
                  onClick: () => handleTabChange('delivery'),
                },
                // 商城管理入口已移除（老闆 2026-08-20）：首頁懸浮選單已有商城入口
                // 交易所管理入口已移除（老闆 2026-09-02）：上架走倉庫「我要賣」、
                // 紀錄在交易所自己的分頁，這裡不用再放一個門
                ...(flags.exchange && !inApp
                  ? ([
                      {
                        id: 'exchange-manage',
                        label: '交換管理',
                        icon: RefreshCw,
                        color: 'text-neutral-700',
                        onClick: () => router.push('/exchange/manage'),
                      },
                    ] as any[])
                  : []),
                {
                  id: 'draw-history',
                  label: '抽獎紀錄',
                  icon: Trophy,
                  color: 'text-accent-yellow',
                  onClick: () => handleTabChange('draw-history'),
                },
                {
                  id: 'follows',
                  label: '我的關注',
                  icon: Heart,
                  color: 'text-accent-red',
                  onClick: () => handleTabChange('follows'),
                },
                {
                  id: 'coupons',
                  label: '我的優惠券',
                  icon: Ticket,
                  color: 'text-pink-500',
                  onClick: () => handleTabChange('coupons'),
                },
                {
                  // 邀請好友是獨立頁面不是 tab（老闆指定放優惠券下方）
                  id: 'invite',
                  label: '邀請好友',
                  icon: UserPlus,
                  color: 'text-violet-500',
                  badge: '無限拿積分',
                  onClick: () => router.push('/invite'),
                },
              ].map((item: { id: string; label: string; icon: typeof UserPlus; color: string; badge?: string; onClick: () => void }) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isGuest) {
                      router.push(loginHref);
                      return;
                    }
                    item.onClick();
                  }}
                  className="w-full flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-xl bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center group-hover:scale-110 transition-transform',
                        item.color
                      )}
                    >
                      <item.icon className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <span className="text-[14px] font-black text-neutral-700 dark:text-neutral-200">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.badge && (
                      <span className="inline-flex h-[19px] items-center rounded-full bg-accent-red px-2 text-[11px] font-bold leading-none text-white">
                        <span className="cjk-optical-center">{item.badge}</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              ))}
            </div>

            {/* Info Menu List */}
            <div className="mx-2 bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-50 dark:divide-neutral-800">
              {[
                { id: 'faq', label: '常見問題', icon: HelpCircle, color: 'text-neutral-400', href: '/faq' },
                { id: 'about', label: '關於我們', icon: Info, color: 'text-neutral-400', href: '/about' },
                { id: 'terms', label: '會員條款', icon: FileText, color: 'text-neutral-400', href: '/terms' },
                { id: 'privacy', label: '隱私權政策', icon: Shield, color: 'text-neutral-400', href: '/privacy' },
                { id: 'return-policy', label: '退換貨資訊', icon: RefreshCcw, color: 'text-neutral-400', href: '/return-policy' },
              ].map((item) => (
                <Link key={item.id} href={item.href} className="w-full flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("w-7 h-7 rounded-lg bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center group-hover:scale-110 transition-transform", item.color)}>
                      <item.icon className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span className="text-[13px] font-bold text-neutral-500">{item.label}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-200" />
                </Link>
              ))}
            </div>

            {/* Logout Button */}
            {!isGuest && (
              <div className="mx-0 hidden">
                <button 
                  onClick={handleLogout} 
                  className="w-full flex items-center justify-between p-2.5 bg-white dark:bg-neutral-900 rounded-2xl hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group border border-neutral-100 dark:border-neutral-800 shadow-card"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center group-hover:scale-110 transition-transform text-neutral-400">
                      <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span className="text-[13px] font-bold text-neutral-500">登出</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-200" />
                </button>
              </div>
            )}

            {/* Mobile Footer Copyright */}
            <div className="py-6 text-center">
              <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">
                © 2025 吉吉比. All Rights Reserved
              </p>
            </div>
            </div>
            </div>
          </div>

          {/* 2. Mobile Detail View (Only shown on mobile when a tab is active) */}
          <div className={cn("md:hidden col-span-1", !isMobileDetailOpen && "hidden")}>
          {/* ⚠️ 這層不能 overflow-hidden：分頁改 window 捲動後，頭部吸頂靠 position:sticky，
              祖先只要有 overflow 非 visible 就整個失效（2026-09-02） */}
          <div className="bg-white dark:bg-neutral-900 min-h-[500px]">
              {renderTabContent()}
            </div>
          </div>

          {/* 3. Desktop View (Hidden on mobile) */}
          {/* cardx 殼：左欄固定 260、右欄彈性（平板橫向 1024 也放得下）；用 inline style 不靠 Tailwind 任意值 */}
          <div
            className={cardxShell ? 'hidden md:grid gap-6 w-full items-start' : 'hidden md:grid md:col-span-12 grid-cols-12 gap-4 lg:gap-6 w-full items-start'}
            style={cardxShell ? { gridTemplateColumns: tabletShell ? 'minmax(0, 1fr)' : '288px minmax(0, 1fr)' } : undefined}
          >
            {/* 平板：左欄那張卡不畫（上面的橫條取代） */}
            {tabletShell ? null : (
            <div className={cardxShell ? 'space-y-3 sticky' : 'md:col-span-3 lg:col-span-3 space-y-3 sticky top-24'} style={cardxShell ? { top: 'calc(var(--header-height) + 24px)' } : undefined}>
            {/* cardx 殼：左欄那張卡滿高（視窗 − 頂欄 − 上下各 24 留白），跟側欄一樣貼到底（老闆 2026-09-05） */}
            <div className={sideCardCls} style={cardxShell ? { ...cardxCardStyle, minHeight: 'calc(100dvh - var(--header-height) - 48px)' } : cardxCardStyle}>
              <div className="flex flex-col gap-2.5">
                  {/* cardx 殼：頭像（72）／暱稱／邀請碼上下置中排，齒輪釘在卡片右上角（老闆 2026-09-05） */}
                  <div className={cardxShell ? 'relative flex flex-col items-center gap-3 pt-5 pb-3 text-center' : 'flex items-center gap-2.5'}>
                    <div className="relative flex-shrink-0">
                      {isGuest ? (
                        <div className={cn('rounded-xl border-2 border-neutral-50 dark:border-neutral-800 shadow-soft bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center', cardxShell ? 'w-[72px] h-[72px]' : 'w-9 h-9 lg:w-10 lg:h-10')}>
                          <User className={cn('text-neutral-500 dark:text-neutral-400', cardxShell ? 'w-8 h-8' : 'w-5 h-5')} />
                        </div>
                      ) : (
                        <div className={cn('relative rounded-full overflow-hidden border-2 border-neutral-50 dark:border-neutral-800 shadow-soft p-0.5 bg-white dark:bg-neutral-800', cardxShell ? 'w-[72px] h-[72px]' : 'w-9 h-9 lg:w-10 lg:h-10')}>
                          <Image 
                            src={user.avatar_url || 'https://github.com/shadcn.png'} 
                            alt={user.name || 'User'} 
                            fill 
                            className="rounded-full object-cover" 
                            unoptimized
                          />
                        </div>
                      )}
                      {!isGuest && (
                        <div className={cn('absolute bg-accent-emerald border-2 border-white dark:border-neutral-900 rounded-full shadow-sm', cardxShell ? 'bottom-1 right-1 w-3.5 h-3.5' : '-bottom-1 -right-1 w-2.5 h-2.5')} />
                      )}
                    </div>
                    <div className={cardxShell ? 'w-full min-w-0 flex flex-col items-center' : 'flex-1 min-w-0'}>
                      <div className={cn('flex items-center gap-1.5 min-w-0', cardxShell && 'justify-center')}>
                        {isGuest ? (
                          <Link
                            href={loginHref}
                            className="text-sm lg:text-base font-black text-primary truncate tracking-tight underline decoration-dotted underline-offset-2"
                          >
                            登入後顯示
                          </Link>
                        ) : (
                          <>
                            <h2 className={cn('font-black text-neutral-900 dark:text-white truncate tracking-tight', cardxShell ? 'text-[24px]' : 'text-sm lg:text-base')}>
                              {user.name}
                            </h2>
                            {user.is_phone_verified && (
                              <CheckCircle2 className="w-3 h-3 text-accent-emerald flex-shrink-0" />
                            )}
                          </>
                        )}
                      </div>
                      {!isGuest && (
                        <div className={cn('flex items-center gap-2', cardxShell ? 'justify-center mt-2' : 'mt-0.5')}>
                          <div
                            className="flex items-center gap-1.5 cursor-pointer group/invite"
                            onClick={() => {
                              // 這顆只複製碼本身 —— 旁邊顯示的就是碼，
                              // 複製整段訊息違反預期。要分享的走「邀請好友」頁
                              if (user.invite_code) {
                                navigator.clipboard.writeText(user.invite_code);
                                toast.success('邀請碼已複製');
                              }
                            }}
                          >
                            <span className={cn('font-black text-neutral-400 uppercase tracking-wider whitespace-nowrap', cardxShell ? 'text-[14px]' : 'text-[13px]')}>邀請碼</span>
                            <span className={cn('font-mono font-black transition-colors whitespace-nowrap', cardxShell ? 'text-[14px] text-[#111827]' : 'text-[13px] text-primary group-hover/invite:text-primary/80')}>
                              {formatMemberNo(user.invite_code) || '-'}
                            </span>
                            <Copy className="w-3.5 h-3.5 text-neutral-300 group-hover/invite:text-primary transition-colors" />
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Settings Icon（cardx 殼裡不放：設定改成左側欄的分頁，老闆 2026-09-05） */}
                    {!cardxShell && (
                    <button
                      onClick={() => handleTabChange('settings')}
                      className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 rounded-full transition-all"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    )}
                  </div>
                  
                  <div className={cn('flex items-center justify-between', cardxShell ? 'bg-[#f3f4f6] p-3 rounded-[14px]' : 'bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded-lg border border-neutral-100 dark:border-neutral-800')}>
                    <div className="flex items-center gap-1.5">
                      <Image src={asset("/images/gcoin.webp")} alt="G" width={cardxShell ? 22 : 24} height={cardxShell ? 22 : 24} className="object-contain" />
                      {isGuest ? (
                        <Link
                          href={loginHref}
                          className="text-[13px] font-black text-primary underline decoration-dotted underline-offset-2"
                        >
                          登入後顯示
                        </Link>
                      ) : (
                        <div className="flex flex-col">
                          <span className={cn('font-black leading-none', cardxShell ? 'text-[22px] text-[#111827] tabular-nums tracking-tight' : 'text-lg text-accent-red font-amount tracking-tighter')}>
                            {user.tokens?.toLocaleString() || 0}
                          </span>
                        </div>
                      )}
                    </div>
                    {cardxShell ? (
                      /* cardx 外殼：紅色立體鈕，跟頂欄暱稱展開那張卡的「儲值」同一顆（老闆 2026-09-05）；`.cardx-root a { color: inherit }` 會把下面那顆的主題色吃掉 */
                      <CardxButton3D color="red" href={isGuest ? loginHref : '/topup'} style={{ height: 36, borderRadius: 10, width: 68 }}>
                        儲值
                      </CardxButton3D>
                    ) : (
                    <Link
                      href={isGuest ? loginHref : '/topup'}
                      className="text-[13px] font-black text-primary hover:text-primary/80 transition-colors uppercase tracking-widest bg-white dark:bg-neutral-800 px-2 py-1 rounded border border-primary/10 shadow-sm self-start"
                    >
                      儲值
                    </Link>
                    )}
                  </div>
                </div>
              {cardxShell ? (
                <>
                  <div className="my-3 h-px bg-[#e5e7eb]" aria-hidden="true" />
                  {sideNavList}
                </>
              ) : null}
              </div>

              {/* 商城管理入口已移除（老闆 2026-08-20）：首頁懸浮選單已有商城入口 */}

              {!cardxShell && (
              <div className={cn(sideCardCls, 'overflow-hidden')} style={cardxCardStyle}>
              {sideNavList}
            </div>
              )}

              {/* 交換管理那張卡：cardx 外殼裡沒開交換就整張不畫，不然會留一張空卡 */}
              {(!cardxShell || (flags.exchange && !inApp)) && (
              <div className={cn(sideCardCls, 'overflow-hidden')} style={cardxCardStyle}>
                <div className="space-y-1">
                  {/* 交易所管理入口已移除（老闆 2026-09-02） */}

                  {flags.exchange && !inApp && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isGuest) {
                          router.push(loginHref);
                          return;
                        }
                        router.push('/exchange/manage');
                      }}
                      className={sideNavCls(false)}
                    >
                      {sideNavIcon(RefreshCw, false, 'text-neutral-300 group-hover:text-primary transition-colors')}
                      <span className="truncate">交換管理</span>
                      <ChevronRight className={cn('ml-auto w-4 h-4 transition-transform hidden sm:block', cardxShell ? 'text-[#d1d5db]' : 'text-neutral-200 group-hover:text-neutral-400')} />
                    </button>
                  )}
                </div>
              </div>
              )}
          </div>
          )}
          <div className={cardxShell ? 'min-w-0' : 'md:col-span-9 lg:col-span-9 w-full'}>
              {flatTab ? (
                <div className="min-w-0">{renderTabContent()}</div>
              ) : (
              <div
                className={cn('overflow-hidden', cardxShell ? 'bg-white rounded-[18px] min-h-[640px]' : 'bg-white dark:bg-neutral-900 rounded-2xl lg:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 min-h-[600px] lg:min-h-[700px]')}
                style={cardxCardStyle}
              >
                {renderTabContent()}
              </div>
              )}
            </div>
          </div>

        </div>
      </div>
      {/* Edit Nickname Modal (Alert Style) */}
      <BottomModal
        open={showEditNickname}
        onClose={() => setShowEditNickname(false)}
        title="編輯暱稱"
      >
        <div className="mb-2">
          <input
            value={settingsForm.nickname}
            onChange={e => setSettingsForm({...settingsForm, nickname: e.target.value})}
            maxLength={10}
            minLength={2}
            placeholder="例：王吉比"
            className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            autoFocus
          />
        </div>
        <p className="text-xs text-neutral-400 mb-6">暱稱長度限制 1-10 個字元</p>

        <button
          onClick={() => handleUpdateProfile('nickname', settingsForm.nickname)}
          disabled={isUpdatingProfile || !settingsForm.nickname}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
        </button>
      </BottomModal>

      {/* Title Picker Modal */}
      <BottomModal
        open={showTitlePicker}
        onClose={() => setShowTitlePicker(false)}
        title="選擇稱號"
      >
        {userTitles.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-4">尚未獲得任何稱號，完成成就即可解鎖！</p>
        ) : (
          <div className="space-y-2 mb-4">
            {userTitles.map(title => (
              <button
                key={title.id}
                onClick={() => handleSelectTitle(title.id, title.is_selected)}
                disabled={!!selectingTitle}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border transition-all",
                  title.is_selected
                    ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                    : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                )}
              >
                <span className="font-medium">{title.name}</span>
                {title.is_selected && <CheckCircle2 className="w-5 h-5" />}
              </button>
            ))}
          </div>
        )}
      </BottomModal>

      {/* 頭像選擇彈窗（老闆 2026-08-29）—— 一排五個、全部圓形，第一格是上傳 */}
      <BottomModal
        open={showAvatarPicker}
        onClose={() => { setTempAvatar(null); setShowAvatarPicker(false); }}
        title="設定頭像"
      >
        {/*
          * 只露 4.5 排（老闆 2026-08-29）
          *
          * 高度**用 CSS 從自身寬度推導**，不用 JS 量：
          * 五欄、間距 12px，格子邊長 = (W - 4×12) / 5，
          * 4.5 排的高度 = 4×格子 + 4×間距 + 半格 ≈ 0.917W，也就是寬高比 12:11。
          * 實測 288px 寬 → 264px 高，第 5 排剛好露一半。
          *
          * 第一版是用 ResizeObserver 量第一格再設 maxHeight —— 那要賭「量的時候
          * 版面已經定案」，量到 0 或量早了就整個失效，而且很難重現。
          * 改成純 CSS 之後沒有時序問題。
          *
          * `content-start`：grid 的 align-content 預設是 stretch，容器一旦有固定
          * 高度就可能把每排撐開或壓扁；固定成 start，每排維持自然高度。
          */}
        <div className="aspect-[12/11] mb-4 overflow-y-auto overscroll-contain scrollbar-hide">
        <div
          className="grid grid-cols-5 gap-3 content-start"
        >
          {/* 上傳格：虛線外框 + 灰底 + 加號，點下去開原生的「照片／相機」選單 */}
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={isUploadingAvatar}
            aria-label="上傳自己的頭像"
            className="aspect-square rounded-full border-2 border-dashed border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 active:scale-95 transition-transform disabled:opacity-50"
          >
            <Plus className="w-6 h-6" />
          </button>

          {DEFAULT_AVATARS.map((src) => {
            const selected = (tempAvatar ?? user?.avatar_url) === src;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setTempAvatar(src)}
                disabled={isUploadingAvatar}
                aria-label="選擇預設頭像"
                className={cn(
                  "aspect-square rounded-full overflow-hidden relative border-2 active:scale-95 transition-transform disabled:opacity-50",
                  selected ? "border-primary" : "border-transparent",
                )}
              >
                <Image src={asset(src)} alt="" fill className="object-cover" unoptimized />
                {selected && (
                  <span className="absolute inset-0 flex items-center justify-center bg-primary/25">
                    <CheckCircle2 className="w-5 h-5 text-white drop-shadow" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </div>

        <button
          onClick={handleSaveDefaultAvatar}
          disabled={isUploadingAvatar || !tempAvatar}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUploadingAvatar ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
        </button>
      </BottomModal>

      {/* Edit Gender Modal */}
      <BottomModal
        open={showEditGender}
        onClose={() => {
          // Reset temp gender when closing without saving
          setTempGender('');
          setShowEditGender(false);
        }}
        title="設定性別"
      >
        <div className="space-y-2 mb-4">
          {['male', 'female', 'other'].map((option) => (
            <button
              key={option}
              onClick={() => setTempGender(option)}
              disabled={isUpdatingProfile}
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-lg border transition-all",
                (tempGender || settingsForm.gender) === option 
                  ? "border-primary bg-primary/5 text-primary" 
                  : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              )}
            >
              <span className="font-medium">{option === 'male' ? '男性' : option === 'female' ? '女性' : '其他'}</span>
              {(tempGender || settingsForm.gender) === option && <CheckCircle2 className="w-5 h-5" />}
            </button>
          ))}
        </div>
        
        <button
          onClick={() => {
            if (tempGender) {
              handleUpdateProfile('gender', tempGender);
            }
          }}
          disabled={isUpdatingProfile || !tempGender}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
        </button>
      </BottomModal>

      {/* Edit Birthday Modal */}
      <BottomModal
        open={showEditBirthday}
        onClose={() => {
          setTempBirthday(null);
          setShowEditBirthday(false);
        }}
        title="設定生日"
      >
        <div className="mb-4">
          <p className="text-sm text-neutral-500 mb-3">生日設定後將無法修改，請確認輸入正確。</p>
          {/* 三滾輪（年／月／日），老闆指定不要日曆 */}
          <WheelDatePicker
            value={tempBirthday
              ? { y: tempBirthday.getFullYear(), m: tempBirthday.getMonth() + 1, d: tempBirthday.getDate() }
              : { y: 2000, m: 1, d: 1 }}
            maxYear={new Date().getFullYear()}
            onChange={({ y, m, d }) => {
              const picked = new Date(y, m - 1, d);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              setTempBirthday(picked > today ? today : picked);
            }}
          />
        </div>
        <button
          onClick={() => {
            const bd = tempBirthday ?? new Date(2000, 0, 1);
            const dateString = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`;
            handleUpdateProfile('birthday', dateString);
          }}
          disabled={isUpdatingProfile}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '確認設定'}
        </button>
      </BottomModal>

      {/* Address Book Modal (Slide-in) */}
      <AnimatePresence>
        {showAddressBook && cardxShell && (
          /* 電腦端改彈窗（老闆 2026-09-05：「電腦端有些就是要改成彈窗啊」）；手機維持滿版滑入 */
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddressBook(false)}>
            <div role="dialog" aria-modal="true" aria-label="我的地址" onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_20px_70px_-15px_rgba(0,0,0,0.25)]">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-100 px-5">
                <div className="text-[16px] font-black text-neutral-900">我的地址</div>
                <button type="button" aria-label="關閉" onClick={() => setShowAddressBook(false)} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-50">
            {/* Address List */}
            <div className="flex-1 overflow-y-auto overscroll-y-none px-4 pb-4 pt-3">
              
              {/* 地址簿：最多三筆（migration 683），列尾動作收進點點點 */}
                {addresses.length > 0 ? addresses.map(a => (
                  <div key={a.id} className="bg-white dark:bg-neutral-900 mb-3">
                    <div className="p-4 flex gap-3">
                      <AddressInfo className="flex-1" name={a.name} phone={a.phone} address={a.address} isDefault={a.isDefault} />
                      <button
                        onClick={() => setAddressMenuId(a.id)}
                        className="self-start shrink-0 ml-2 p-1 -mr-1 text-neutral-400 active:text-neutral-600"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 mx-4" />
                  </div>
                )) : (
                  <div className="p-8 text-center text-neutral-400 text-sm">
                    尚未設定收件地址
                  </div>
                )}

              {/* 新增地址：跟在最後一筆下面、灰色；滿三筆隱藏 */}
              {addresses.length < 3 && (
                <div className="px-4">
                  <button
                    onClick={openNewAddress}
                    className="w-full h-[44px] border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 rounded-[4px] flex items-center justify-center gap-2 text-[15px] font-medium active:bg-neutral-50 dark:active:bg-neutral-800 transition-colors"
                  >
                    <div className="w-4 h-4 rounded-full border border-neutral-400 flex items-center justify-center">
                      <span className="text-sm leading-none -mt-0.5">+</span>
                    </div>
                    新增地址
                  </button>
                </div>
              )}
            </div>
              </div>
            </div>
          </div>
        )}
        {showAddressBook && !cardxShell && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: showEditRecipient ? '-28%' : 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col"
          >
            {/* Header */}
            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
            <PageHeader title="我的地址" onBack={() => setShowAddressBook(false)} />

            <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4 hidden">
              <div className="flex">
                <button
                  onClick={() => setAddressTab('HOME')}
                  className={cn(
                    "flex-1 py-3 text-[15px] font-medium relative",
                    addressTab === 'HOME' ? "text-primary" : "text-neutral-500"
                  )}
                >
                  宅配到府
                  {addressTab === 'HOME' && (
                    <motion.div 
                      layoutId="activeAddressTab"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" 
                    />
                  )}
                </button>
                <button
                  onClick={() => setAddressTab('CVS')}
                  className={cn(
                    "flex-1 py-3 text-[15px] font-medium relative",
                    addressTab === 'CVS' ? "text-primary" : "text-neutral-500"
                  )}
                >
                  超商取貨
                  {addressTab === 'CVS' && (
                    <motion.div 
                      layoutId="activeAddressTab"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" 
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Address List */}
            <div className="flex-1 overflow-y-auto overscroll-y-none pt-3">
              
              {/* 地址簿：最多三筆（migration 683），列尾動作收進點點點 */}
                {addresses.length > 0 ? addresses.map(a => (
                  <div key={a.id} className="bg-white dark:bg-neutral-900 mb-3">
                    <div className="p-4 flex gap-3">
                      <AddressInfo className="flex-1" name={a.name} phone={a.phone} address={a.address} isDefault={a.isDefault} />
                      <button
                        onClick={() => setAddressMenuId(a.id)}
                        className="self-start shrink-0 ml-2 p-1 -mr-1 text-neutral-400 active:text-neutral-600"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 mx-4" />
                  </div>
                )) : (
                  <div className="p-8 text-center text-neutral-400 text-sm">
                    尚未設定收件地址
                  </div>
                )}

              {/* 新增地址：跟在最後一筆下面、灰色；滿三筆隱藏 */}
              {addresses.length < 3 && (
                <div className="px-4">
                  <button
                    onClick={openNewAddress}
                    className="w-full h-[44px] border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 rounded-[4px] flex items-center justify-center gap-2 text-[15px] font-medium active:bg-neutral-50 dark:active:bg-neutral-800 transition-colors"
                  >
                    <div className="w-4 h-4 rounded-full border border-neutral-400 flex items-center justify-center">
                      <span className="text-sm leading-none -mt-0.5">+</span>
                    </div>
                    新增地址
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit CVS Modal */}
      <BottomModal
        open={showEditCvs}
        onClose={() => setShowEditCvs(false)}
        title="設定超商取貨"
      >
        <div className="space-y-3 mb-2 max-h-[60vh] overflow-y-auto px-1">
          {/* Store Selection */}
          <div className="space-y-2">
             <label className="text-xs font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">選擇超商體系</label>
             <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'UNIMART', label: '7-11' },
                  { id: 'FAMI', label: '全家' },
                  { id: 'HILIFE', label: '萊爾富' },
                  // OK超商已停止店到店服務（同上面出貨彈窗那份）
                ].map((store) => (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => setLogisticsSubType(store.id as 'UNIMART' | 'FAMI' | 'HILIFE' | 'OKMART')}
                    className={cn(
                      "py-2 px-3 rounded-lg border font-bold text-xs transition-all",
                      logisticsSubType === store.id
                        ? "border-primary bg-primary text-white"
                        : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:border-primary/50"
                    )}
                  >
                    {store.label}
                  </button>
                ))}
             </div>
             
             <div className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700">
                {settingsForm.cvsStoreId ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">已選擇門市</span>
                      <button
                        type="button"
                        onClick={() => {
                          const rid = newStoreMapRequestId();
                          setPendingCvsToken(rid);
                          setCvsTarget('settings');
                          // 常用門市也走同一支：App 內用 in-app browser，選完由輪詢寫回表單
                          void openStoreMap({ logisticsSubType, requestId: rid });
                        }}
                        className="text-[11px] font-black text-neutral-400 hover:text-primary transition-colors"
                      >
                        重選門市
                      </button>
                    </div>
                    <div className="font-bold text-sm text-neutral-900 dark:text-white">{settingsForm.cvsStoreName} ({settingsForm.cvsStoreId})</div>
                    <div className="text-xs text-neutral-500">{settingsForm.cvsStoreAddress}</div>
                  </div>
                ) : (
                  <div className="text-center py-1">
                     <button 
                        type="button" 
                        onClick={() => {
                          const rid = newStoreMapRequestId();
                          setPendingCvsToken(rid);
                          setCvsTarget('settings');
                          // 常用門市也走同一支：App 內用 in-app browser，選完由輪詢寫回表單
                          void openStoreMap({ logisticsSubType, requestId: rid });
                        }}
                        className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-2.5 rounded-lg font-black text-sm shadow-lg hover:scale-[1.02] transition-all"
                     >
                        選擇取貨門市
                     </button>
                     <p className="text-[10px] text-neutral-400 mt-2">將跳轉至電子地圖選擇門市</p>
                  </div>
                )}
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="col-span-1">
               <label className="text-xs text-neutral-500 mb-1 block">門市代號</label>
               <input
                 value={settingsForm.cvsStoreId}
                 onChange={(e) => setSettingsForm({ ...settingsForm, cvsStoreId: e.target.value })}
                 className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                 placeholder="輸入代號"
                 readOnly
               />
            </div>
            <div className="col-span-1">
               <label className="text-xs text-neutral-500 mb-1 block">門市名稱</label>
               <input
                 value={settingsForm.cvsStoreName}
                 onChange={(e) => setSettingsForm({ ...settingsForm, cvsStoreName: e.target.value })}
                 className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                 placeholder="例如：7-11 某某門市"
                 readOnly
               />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">門市地址</label>
            <input
              value={settingsForm.cvsStoreAddress}
              onChange={(e) => setSettingsForm({ ...settingsForm, cvsStoreAddress: e.target.value })}
              className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="輸入門市地址"
              readOnly
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">取貨人姓名</label>
            <input
              value={settingsForm.cvsRecipientName}
              onChange={(e) => setSettingsForm({ ...settingsForm, cvsRecipientName: e.target.value })}
              maxLength={30}
              placeholder="例：王吉比"
              className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">取貨人電話</label>
            <input
              value={settingsForm.cvsRecipientPhone}
              onChange={(e) => setSettingsForm({ ...settingsForm, cvsRecipientPhone: e.target.value })}
              onBlur={(e) => setSettingsForm({ ...settingsForm, cvsRecipientPhone: normalizePhone(e.target.value) })}
              type="tel"
              inputMode="numeric"
              pattern="^09\d{8}$"
              placeholder={PHONE_PLACEHOLDER}
              className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
        </div>
        <button
          onClick={() => handleUpdateProfile('cvs', '')}
          disabled={isUpdatingProfile || !settingsForm.cvsStoreName || !settingsForm.cvsRecipientName || !settingsForm.cvsRecipientPhone}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
        >
          {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存設定'}
        </button>
      </BottomModal>

      {/* Edit Recipient Modal —— 兩種殼共用同一份表單：
          我的地址進來＝全頁 push；結帳裡開＝底部彈窗（老闆 2026-09-02） */}
      <AnimatePresence>
        {showEditRecipient && !editRecipientSheet && cardxShell && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowEditRecipient(false)}>
            <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_20px_70px_-15px_rgba(0,0,0,0.25)]">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-100 px-5">
                <div className="text-[16px] font-black text-neutral-900">{editingAddressId ? '編輯地址' : '新增地址'}</div>
                <button type="button" aria-label="關閉" onClick={() => setShowEditRecipient(false)} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50">{renderAddressForm(false)}</div>
              <div className="shrink-0 border-t border-neutral-100 bg-white px-5 py-3">
                <button
                  onClick={() => void saveAddress()}
                  disabled={addressSaveDisabled}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-red text-[15px] font-black text-white transition-all disabled:opacity-50"
                >
                  {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
                </button>
              </div>
            </div>
          </div>
        )}
        {showEditRecipient && !editRecipientSheet && !cardxShell && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col"
          >
            {/* 統一頁頭：樣式在 components/ui/PageHeader.tsx，改那裡全站同步 */}
            <PageHeader title={editingAddressId ? '編輯地址' : '新增地址'} onBack={() => setShowEditRecipient(false)} />

            <div className="flex-1 overflow-y-auto">
              {renderAddressForm(false)}
            </div>

            {/* Footer —— 同購買確認的主鈕；App 無瀏海列，安全區高度要自己留 */}
            <div className="bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
              <button
                onClick={() => void saveAddress()}
                disabled={addressSaveDisabled}
                className="w-full rounded-xl font-black shadow-xl transition-all h-[44px] text-base bg-accent-red text-white shadow-accent-red/20 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 結帳裡開的版本：底部彈窗（BottomModal，跟其他小彈窗同一套殼） */}
      <BottomModal
        open={showEditRecipient && editRecipientSheet}
        onClose={() => setShowEditRecipient(false)}
        title={editingAddressId ? '編輯地址' : '新增地址'}
      >
        {renderAddressForm(true)}
        <button
          onClick={() => void saveAddress()}
          disabled={addressSaveDisabled}
          className="mt-4 w-full rounded-xl font-black shadow-xl transition-all h-[44px] text-base bg-accent-red text-white shadow-accent-red/20 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
        >
          {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
        </button>
      </BottomModal>

      {/* 地址列的點點點：黑遮罩＋底部兩個選項（老闆 2026-09-02） */}
      <AnimatePresence>
        {addressMenuId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAddressMenuId(null)}
              className="fixed inset-0 bg-black/60 z-[110]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-[111] bg-white dark:bg-neutral-900 rounded-t-2xl overflow-hidden pb-[calc(env(safe-area-inset-bottom)+8px)]"
            >
              <button
                onClick={() => openEditAddress(addressMenuId)}
                className="w-full py-4 text-center text-[17px] text-neutral-900 dark:text-white border-b border-neutral-100 dark:border-neutral-800 active:bg-neutral-50 dark:active:bg-neutral-800"
              >
                編輯
              </button>
              <button
                onClick={() => void removeAddress(addressMenuId)}
                className="w-full py-4 text-center text-[17px] text-accent-red active:bg-neutral-50 dark:active:bg-neutral-800"
              >
                移除
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 配送結帳（商城結帳複製版，老闆 2026-09-02）。資料源：user_addresses 地址簿 */}
      <DeliveryCheckout
        open={showDeliveryModal}
        onClose={() => { if (!isSubmittingDelivery) setShowDeliveryModal(false); }}
        items={deliveryItems}
        itemCount={selectedForDelivery.length}
        freeHint={
          currentShippingFee > 0 && effectiveFreeThreshold !== null
            ? `再加 ${effectiveFreeThreshold - selectedForDelivery.length} 件可免運`
            : null
        }
        method={{ type: logisticsType, subtype: logisticsType === 'CVS' ? logisticsSubType : null }}
        methodLabel={
          logisticsType === 'HOME'
            ? (hasLargePackage ? '宅配到府（大件）' : '宅配到府')
            : ({ UNIMART: '7-11 交貨便', FAMI: '全家店到店', HILIFE: '萊爾富店到店', OKMART: 'OK 超商店到店' } as const)[logisticsSubType]
        }
        feeOf={(m: DeliveryMethod) => {
          if (hasLargePackage) return shippingFeeHomeLarge;
          const th = m.type === 'CVS' ? freeThresholdCvs : freeThresholdHome;
          if (selectedForDelivery.length >= th) return 0;
          if (m.type === 'HOME') return shippingFeeHome;
          switch (m.subtype) {
            case 'UNIMART': return shippingFeeCvs711;
            case 'FAMI': return shippingFeeCvsFamily;
            case 'HILIFE': return shippingFeeCvsHilife;
            case 'OKMART': return shippingFeeCvsOk;
            default: return shippingFeeCvs711;
          }
        }}
        grossFee={currentShippingFee}
        discount={shippingDiscount}
        lotteryTotal={lotteryPurchaseTotal}
        payable={currentShippingFee - shippingDiscount + lotteryPurchaseTotal}
        address={{ name: deliveryAddress.name, phone: deliveryAddress.phone, address: deliveryAddress.address }}
        addressOptions={addresses}
        addressId={deliveryAddress.id}
        onPickAddress={setDeliveryAddrId}
        canAddAddress={addresses.length < 3}
        store={storeId ? { id: storeId, name: storeName, address: storeAddress } : null}
        note={deliveryNote}
        onNoteChange={setDeliveryNote}
        coupons={shippingCoupons}
        couponId={deliveryCouponId}
        onCouponSelect={setDeliveryCouponId}
        submitting={isSubmittingDelivery}
        onPickMethod={(m: DeliveryMethod) => {
          if (hasLargePackage && m.type === 'CVS') { toast.error('內含大型獎品，僅能宅配'); return; }
          setLogisticsType(m.type);
          if (m.type === 'CVS' && m.subtype) {
            const brandChanged = logisticsSubType !== m.subtype;
            setLogisticsSubType(m.subtype);
            if (!storeId || brandChanged) {
              const rid = newStoreMapRequestId();
              setPendingCvsToken(rid);
              setCvsTarget('delivery');
              void openStoreMap({ logisticsSubType: m.subtype, requestId: rid });
            }
          }
        }}
        onEditAddress={openNewAddress}
        onChangeStore={() => {
          const rid = newStoreMapRequestId();
          setPendingCvsToken(rid);
          setCvsTarget('delivery');
          void openStoreMap({ logisticsSubType, requestId: rid });
        }}
        onSubmit={handleConfirmDelivery}
        onAbort={() => toast.error('請按住直到光條走完')}
      />

      {/* 頭像裁切器 */}
      {cropperSrc && (
        <ImageCropper
          src={cropperSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropperSrc(null)}
        />
      )}
    </div>
  );
}

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from  "react-datepicker";
import { zhTW } from 'date-fns/locale/zh-TW';
import { useSwipeTabs } from '@/lib/useSwipeTabs';

registerLocale('zh-TW', zhTW);

// Custom styles for DatePicker
const datePickerStyles = `
  .react-datepicker-wrapper {
    width: 100%;
  }
  .react-datepicker__input-container input {
    width: 100%;
    height: 48px; /* Taller input for mobile */
    border-radius: 0.375rem;
    border: 1px solid #e5e5e5;
    padding: 0.625rem 0.75rem;
    font-size: 15px;
    font-weight: 500;
    color: #171717;
    background-color: white;
    outline: none;
    transition: all 0.2s;
  }
  .dark .react-datepicker__input-container input {
    background-color: #171717;
    border-color: #404040;
    color: white;
  }
  .react-datepicker__input-container input:focus {
    border-color: #ef4444;
    box-shadow: 0 0 0 1px #ef4444;
  }
  .react-datepicker {
    font-family: inherit;
    border-color: #e5e5e5;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }
  .dark .react-datepicker {
    background-color: #171717;
    border-color: #404040;
    color: white;
  }
  .react-datepicker__header {
    background-color: #f5f5f5;
    border-bottom: 1px solid #e5e5e5;
    border-top-left-radius: 0.5rem;
    border-top-right-radius: 0.5rem;
    padding-top: 10px;
  }
  .dark .react-datepicker__header {
    background-color: #262626;
    border-color: #404040;
  }
  .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker-year-header {
    color: #171717;
    font-weight: 600;
  }
  .dark .react-datepicker__current-month {
    color: white;
  }
  .react-datepicker__day-name {
    color: #737373;
  }
  .dark .react-datepicker__day-name {
    color: #a3a3a3;
  }
  .react-datepicker__day {
    color: #171717;
  }
  .dark .react-datepicker__day {
    color: white;
  }
  .react-datepicker__day:hover {
    background-color: #f5f5f5;
  }
  .dark .react-datepicker__day:hover {
    background-color: #404040;
  }
  .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected {
    background-color: #ef4444 !important;
    color: white !important;
  }
  .react-datepicker__triangle {
    display: none;
  }
  .react-datepicker__navigation-icon::before {
    border-color: #737373;
  }
  .dark .react-datepicker__navigation-icon::before {
    border-color: #a3a3a3;
  }
`;

/*
 * 返回時捲回原位（老闆 2026-08-30）
 *
 * 這頁的清單各自捲在自己的 overflow 容器裡、不是整頁在捲，所以記的是容器的
 * scrollTop 而不是 window.scrollY。只有真的會離開這頁的兩條動線需要記：
 * 「我的關注」點商品卡、以及抽獎紀錄的「驗證」按鈕（去公平性驗證頁）。
 */
const followsView = makeListViewMemory('ggb:profile:follows');
const drawView = makeListViewMemory('ggb:profile:draws');

export default function ProfilePage() {
  /* 1024 以上整頁掛進 cardx 的 AppShell（頂欄＋側欄＋頁尾），跟其他桌機頁同一個殼；
     null＝還不知道視窗寬度，先不畫，兩套殼才不會疊在一起（老闆 2026-09-05） */
  const cardxShell = useMinWidth(768);
  /* 768～1023（平板）：殼一樣是 cardx，但會員中心不左右分欄——頂部橫條＋橫捲分頁膠囊、內容滿寬（老闆 2026-09-05） */
  const wideShell = useMinWidth(1024);
  if (cardxShell === null || wideShell === null) return null;
  return (
    <Suspense fallback={null}>
      {cardxShell ? (
        <div className="cardx-root" data-cardx-page="profile">
          <AppShell sidebarItems={defaultSidebarItems}>
            <div className={homeStyles.main2}>
              <div className={homeStyles.main}>
                <div className={homeStyles.sectionLobby}>
                  {/* 「會員中心」頁頭不放（老闆 2026-09-05） */}
                  <ProfileContent cardxShell tabletShell={!wideShell} />
                </div>
              </div>
            </div>
          </AppShell>
        </div>
      ) : (
        <ProfileContent />
      )}
    </Suspense>
  );
}
