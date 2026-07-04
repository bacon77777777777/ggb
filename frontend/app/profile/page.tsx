'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Box, 
  Truck, 
  Trophy, 
  Settings, 
  LogOut, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Info,
  FileText,
  Shield,
  RefreshCcw,
  RefreshCw,
  Wallet,
  Heart,
  User,
  ChevronDown,
  X,
  Loader2,
  CreditCard,
  Copy,
  Ticket,
  Store,
  History,
  MessageCircle,
  Star
} from 'lucide-react';
import { AlertModal } from '@/components/ui/AlertModal';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { ProfileSkeleton } from '@/components/Skeletons';
import { WarehouseItemDetailModal } from '@/components/warehouse/WarehouseItemDetailModal';
import ProductCard from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/ProductCardSkeleton';
import { ProductType } from '@/components/ui/ProductBadge';
import Image from 'next/image';
import { useAlert } from '@/components/ui/AlertDialog';
import { useToast } from '@/components/ui/Toast';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

import DailyCheckInTab from '@/components/profile/DailyCheckInTab';
import ProfileSectionHeader from '@/components/profile/desktop/ProfileSectionHeader';
import ProfileToolbar from '@/components/profile/desktop/ProfileToolbar';
import ProfileDataTable from '@/components/profile/desktop/ProfileDataTable';
import ProfileStatusBadge from '@/components/profile/desktop/ProfileStatusBadge';
import ProfilePagination from '@/components/profile/desktop/ProfilePagination';

import { Tabs, TabsContent, TabsContentWrapper, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useMediaQuery } from '@/hooks/use-media-query';
import { compressImage } from '@/lib/image-utils';
import SolidButton from '@/components/ui/SolidButton';

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
}

interface WarehouseItem {
  id: string;
  name: string;
  series: string;
  grade: string;
  status: 'in_warehouse' | 'pending_delivery' | 'shipped' | 'exchanged';
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
}

interface DeliveryOrder {
  id: string;
  order_number?: string;
  itemsCount: number;
  items: { grade: string; name: string; productName: string }[];
  status: 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled' | string;
  date: string;
  tracking: string;
  method: string;
  arrivalDate?: string;
  recipientName?: string;
  recipientPhone?: string;
  address?: string;
  storeName?: string;
  logisticsType?: string;
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

const MAJOR_LEVELS = ['SP賞', 'S賞', 'A賞', 'B賞', 'C賞', 'SP', 'S', 'A', 'B', 'C', 'LAST ONE', '最後賞'];

const isMajorGrade = (grade: string | undefined | null) => {
  if (!grade) return false;
  const trimmed = grade.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (upper === 'LAST ONE' || trimmed === '最後賞') return true;
  if (MAJOR_LEVELS.includes(trimmed) || MAJOR_LEVELS.includes(upper)) return true;
  let base = trimmed;
  const prizeIndex = base.indexOf('賞');
  if (prizeIndex !== -1) {
    base = base.slice(0, prizeIndex);
  }
  if (base.includes(' ')) {
    base = base.split(' ')[0];
  }
  const baseUpper = base.toUpperCase();
  return MAJOR_LEVELS.includes(baseUpper);
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
  | 'check-in'
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
  draw_records: {
    product_prizes: {
      level: string;
      name: string;
    } | null;
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
  items: { grade: string; name: string; ticket_number: string; txid_hash?: string }[];
}

  interface DbDrawRecord {
    id: number;
    product_id: number;
    ticket_number: number;
    created_at: string;
    status: string;
    txid_hash?: string | null;
    prize_level?: string | null;
    prize_name?: string | null;
    product_prizes: {
      level: string;
      name: string;
      image_url: string;
      recycle_value: number;
      total?: number;
    } | null;
    admin_recycle_pool: { recycle_value: number; created_at: string }[] | null;
    products: {
      name: string;
      price?: number;
      type?: string;
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

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'submitted':
    case 'processing':
      return { label: '已提交', color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-100' };
    case 'picked_up':
      return { label: '已出貨', color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-100' };
    case 'shipping':
      return { label: '配送中', color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-100' };
    case 'delivered':
    case 'completed':
      return { label: '已送達', color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-100' };
    case 'cancelled':
      return { label: '已取消', color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100' };
    default:
      return { label: '未知狀態', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-100' };
  }
};

const getTopupStatusConfig = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'paid' || s === 'success') {
    return { label: '交易成功', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' };
  }
  if (s === 'pending') {
    return { label: '待付款', color: 'text-neutral-500', bg: 'bg-neutral-100', border: 'border-neutral-200' };
  }
  if (s === 'failed') {
    return { label: '交易失敗', color: 'text-white', bg: 'bg-red-500', border: 'border-red-500' };
  }
  return { label: status, color: 'text-neutral-500', bg: 'bg-neutral-100', border: 'border-neutral-200' };
};

function ProfileContent() {
  const { user, logout, refreshProfile, isLoading: isAuthLoading } = useAuth();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const toast = {
    success: (message: React.ReactNode) => showToast(message, 'success'),
    error: (message: React.ReactNode) => showToast(message, 'error'),
    info: (message: React.ReactNode) => showToast(message, 'info'),
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { flags } = useFeatureFlags();

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
  // const [activeDrawTab, setActiveDrawTab] = useState<'all'>('all'); // unused
  const [activeDeliveryTab, setActiveDeliveryTab] = useState<'all' | 'submitted' | 'shipping' | 'completed' | 'cancelled'>('all');
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
  const [activeDismantleTimeTab, setActiveDismantleTimeTab] = useState<'today' | '7days' | '30days'>('today');
  const [activeSoldTimeTab, setActiveSoldTimeTab] = useState<'today' | '7days' | '30days'>('today');
  const [activeTopupTimeTab, setActiveTopupTimeTab] = useState<'today' | '7days' | '30days'>('today');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [isRedeemingCoupon, setIsRedeemingCoupon] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  // UI States
  const [selectedForDelivery, setSelectedForDelivery] = useState<string[]>([]);
  const [selectedMarketItems, setSelectedMarketItems] = useState<string[]>([]);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showDismantleModal, setShowDismantleModal] = useState(false);
  const [dismantleSummary, setDismantleSummary] = useState({ count: 0, totalValue: 0 });
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

  // Auto-scroll refs
  const warehouseSubTabsRef = useRef<HTMLDivElement>(null);
  const dismantleTimeTabsRef = useRef<HTMLDivElement>(null);
  const [mobileWarehouseDisplayCount, setMobileWarehouseDisplayCount] = useState(10);
  const mobileWarehouseSentinelRef = useRef<HTMLDivElement>(null);
  const mobileWarehouseScrollRef = useRef<HTMLDivElement>(null);
  const [lockedSupplierName, setLockedSupplierName] = useState<string | null>(null);

  useEffect(() => {
    if (warehouseSubTabsRef.current) {
      const activeTabElement = warehouseSubTabsRef.current.querySelector(`[data-tab-id="${activeWarehouseSubCategory}"]`);
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeWarehouseSubCategory]);

  useEffect(() => {
    if (dismantleTimeTabsRef.current) {
      const activeTabElement = dismantleTimeTabsRef.current.querySelector(`[data-tab-id="${activeDismantleTimeTab}"]`);
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeDismantleTimeTab]);

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

  // Avatar Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      // Compress image if larger than 1MB or dimensions too large
      // Max size: 2MB limit by backend/storage policy, but let's aim for <1MB for speed
      console.log('Original file size:', file.size / 1024 / 1024, 'MB');
      
      // Attempt compression
      try {
        const compressed = await compressImage(file, 800, 800, 0.8, 1);
        console.log('Compressed file size:', compressed.size / 1024 / 1024, 'MB');
        file = compressed;
      } catch (compError) {
        console.warn('Image compression failed, using original file:', compError);
        // Continue with original file if compression fails
      }

      if (file.size > 2 * 1024 * 1024) {
        toast.error('圖片壓縮後仍超過 2MB，請選擇較小的圖片');
        setIsUploadingAvatar(false);
        return;
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      // Add timestamp to filename to avoid Supabase storage cache
      const timestamp = new Date().getTime();
      const fileName = `${user!.id}-${timestamp}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type // Ensure correct content type
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Add a query param to bust browser cache just in case
      const publicUrlWithTimestamp = `${publicUrl}?t=${timestamp}`;

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrlWithTimestamp }
      });
      if (updateError) throw updateError;

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.from('users').update({ avatar_url: publicUrlWithTimestamp }).eq('id', authUser.id);
      }

      toast.success('頭像更新成功');
      await refreshProfile();
      // Force a hard reload if needed, but refreshProfile should update the context
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

    return items;
  }, [warehouseItems, activeWarehouseCategory, activeWarehouseSubCategory]);

  const sortedWarehouseItems = React.useMemo(() => {
    if (!lockedSupplierName) return filteredWarehouseItems;
    const same = filteredWarehouseItems.filter(i => i.supplierName === lockedSupplierName);
    const others = filteredWarehouseItems.filter(i => i.supplierName !== lockedSupplierName);
    return [...same, ...others];
  }, [filteredWarehouseItems, lockedSupplierName]);

  const hasLargePackage = React.useMemo(() => {
    return warehouseItems
      .filter(i => selectedForDelivery.includes(i.id))
      .some(i => (i.type === 'ichiban' || i.type === 'custom') && (i.prizeTotal ?? 999) <= 3);
  }, [warehouseItems, selectedForDelivery]);

  React.useEffect(() => {
    if (hasLargePackage) setLogisticsType('HOME');
  }, [hasLargePackage]);


  const filteredDismantledItems = React.useMemo(() => {
    let items = dismantledItems;

    // Time Filtering
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (activeDismantleTimeTab === 'today') {
      items = items.filter(item => item.raw_dismantled_at && item.raw_dismantled_at >= startOfToday);
    } else if (activeDismantleTimeTab === '7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      items = items.filter(item => item.raw_dismantled_at && item.raw_dismantled_at >= sevenDaysAgo);
    } else if (activeDismantleTimeTab === '30days') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      items = items.filter(item => item.raw_dismantled_at && item.raw_dismantled_at >= thirtyDaysAgo);
    }

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
  }, [dismantledItems, activeWarehouseCategory, activeWarehouseSubCategory, activeDismantleTimeTab]);

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
    
    return deliveryHistory.filter(order => {
      if (activeDeliveryTab === 'submitted') {
        return ['submitted', 'processing', 'picked_up'].includes(order.status);
      }
      if (activeDeliveryTab === 'shipping') {
        return order.status === 'shipping';
      }
      if (activeDeliveryTab === 'completed') {
        return order.status === 'delivered';
      }
      if (activeDeliveryTab === 'cancelled') {
        return order.status === 'cancelled';
      }
      return true;
    });
  }, [deliveryHistory, activeDeliveryTab]);

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
  }, [activeDismantleTimeTab, desktopDismantledSearch, activeWarehouseCategory, activeWarehouseSubCategory]);

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
    if (tab === 'check-in') {
      showAlert({
        title: '開發中',
        message: '頁面開發中',
        type: 'info',
      });
      return;
    }
    setActiveTab(tab);
    setIsMobileDetailOpen(true);
    router.push(`/profile?tab=${tab}`, { scroll: false });

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

  // Sync with URL on load
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (
      tab &&
      [
        'check-in',
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
  const [showAddressBook, setShowAddressBook] = useState(false);
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

  // Fetch Data when Tab Changes
  const fetchUserData = React.useCallback(async () => {
    if (!user) return;
    setIsLoadingData(true);

    try {
      if (activeTab === 'warehouse') {
        if (activeWarehouseTab === 'all') {
          const { data, error } = await supabase
            .from('draw_records')
            .select(`
              id,
              ticket_number,
              created_at,
              status,
              prize_level,
              prize_name,
              product_prizes ( level, name, image_url, recycle_value, total ),
              products ( name, price, type, supplier_id, suppliers ( id, name ) )
            `)
            .eq('user_id', user.id)
            .in('status', ['in_warehouse', 'pending_delivery'])
            .order('created_at', { ascending: false });

          if (error) throw error;

          const items = (data as unknown as DbDrawRecord[]).map((item) => {
            let recycleValue = item.product_prizes?.recycle_value || 0;
            const price = item.products?.price || 0;
            const quantity = item.product_prizes?.total || 0;
            const productType = item.products?.type || 'unknown';
            const isPreorder = false;
            const preorderAvailableAt = null;

            const grade = item.product_prizes?.level || item.prize_level || '?';
            const name = item.product_prizes?.name || item.prize_name || '未知獎品';

            recycleValue = 10;

            return {
              id: item.id.toString(),
              name,
              series: item.products?.name || '未知系列',
              grade,
              status: item.status as WarehouseItem['status'],
              image: item.product_prizes?.image_url || 'https://placehold.co/400',
              date: new Date(item.created_at).toLocaleString('zh-TW'),
              ticketNo: item.ticket_number?.toString() || '',
              recycleValue,
              type: productType,
              isPreorder,
              preorderAvailableAt,
              supplierId: item.products?.supplier_id ?? null,
              supplierName: item.products?.suppliers?.name ?? '未知廠商',
              prizeTotal: item.product_prizes?.total ?? 999,
            };
          });
          setWarehouseItems(items);
        } else if (activeWarehouseTab === 'dismantled') {
           const { data, error } = await supabase
            .from('draw_records')
            .select(`
              id,
              created_at,
              status,
              prize_level,
              prize_name,
              product_prizes ( level, name, image_url, recycle_value ),
              admin_recycle_pool ( recycle_value, created_at ),
              products ( name, type )
            `)
            .eq('user_id', user.id)
            .eq('status', 'dismantled')
            .order('created_at', { ascending: false });
            
          if (error) throw error;

          const items = (data as unknown as DbDrawRecord[]).map((item) => {
            const grade = item.product_prizes?.level || item.prize_level || '?';
            const name = item.product_prizes?.name || item.prize_name || '未知獎品';
            const productType = item.products?.type || 'unknown';

            return {
              id: item.id.toString(),
              name,
              series: item.products?.name || '未知系列',
              grade,
              image: item.product_prizes?.image_url || 'https://placehold.co/400',
              dismantled_at: new Date(item.admin_recycle_pool?.[0]?.created_at ?? item.created_at).toLocaleDateString('zh-TW'),
              raw_dismantled_at: new Date(item.admin_recycle_pool?.[0]?.created_at ?? item.created_at),
              recycleValue: item.admin_recycle_pool?.[0]?.recycle_value ?? item.product_prizes?.recycle_value ?? 0,
              type: productType
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

        const activeListings = (listingsData as unknown as DbListing[]).map((item) => ({
          id: item.id.toString(),
          draw_record_id: item.draw_records?.id,
          price: item.price,
          status: item.status,
          created_at: new Date(item.created_at).toLocaleString('zh-TW'),
          updated_at: new Date(item.updated_at).toLocaleString('zh-TW'),
          raw_updated_at: new Date(item.updated_at),
          product: {
            name: item.draw_records?.product_prizes?.name || '未知',
            image: item.draw_records?.product_prizes?.image_url || 'https://placehold.co/400',
            grade: item.draw_records?.product_prizes?.level || '?',
            series: item.draw_records?.products?.name || '未知',
            type: item.draw_records?.products?.type || 'unknown'
          },
          type: 'sell' as const
        }));

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
            return {
                id: tx.id.toString(),
                price: tx.price,
                status: 'sold',
                created_at: new Date(tx.created_at).toLocaleString('zh-TW'),
                updated_at: new Date(tx.created_at).toLocaleString('zh-TW'),
                raw_updated_at: new Date(tx.created_at),
                product: {
                    name: tx.draw_records?.product_prizes?.name || '未知',
                    image: tx.draw_records?.product_prizes?.image_url || 'https://placehold.co/400',
                    grade: tx.draw_records?.product_prizes?.level || '?',
                    series: tx.draw_records?.products?.name || '未知',
                    type: tx.draw_records?.products?.type || 'unknown'
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
            draw_records (
              product_prizes ( level, name ),
              products ( name )
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
             items: (order.draw_records || []).map((dh) => ({
               grade: dh.product_prizes?.level || '?',
               name: dh.product_prizes?.name || '未知',
               productName: (dh as any).products?.name || '未知商品',
             })),
             status: order.status,
             date: new Date(order.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '/'),
             tracking: order.tracking_number || '-',
             method: displayMethod,
             arrivalDate: arrivalDate,
             recipientName: order.recipient_name || undefined,
             recipientPhone: order.recipient_phone || undefined,
             address: order.address || undefined,
             storeName: order.store_name || undefined,
             logisticsType: method,
           };
         });
        setDeliveryHistory(orders);
      }
      else if (activeTab === 'draw-history') {
        const { data, error } = await supabase
          .from('draw_records')
          .select(`
            id,
            product_id,
            ticket_number,
            created_at,
            prize_level,
            prize_name,
            txid_hash,
            product_prizes ( level, name ),
            products ( name, price, status, remaining, type )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        
        // Group records by created_at (transaction time)
        const groupedHistory: GroupedDrawHistoryItem[] = [];
        
        const records = data as unknown as DbDrawRecord[];
        records.forEach((item) => {
          const currentTimestamp = item.created_at;
          const lastGroup = groupedHistory.length > 0 ? groupedHistory[groupedHistory.length - 1] : null;
          
          const grade = item.product_prizes?.level || item.prize_level || '?';
          const name = item.product_prizes?.name || item.prize_name || '未知';

          if (lastGroup && lastGroup._rawDate === currentTimestamp && lastGroup.product === item.products?.name) {
            lastGroup.tickets.push(item.ticket_number?.toString());
            lastGroup.cost += (item.products?.price || 0);
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
              date: new Date(item.created_at).toLocaleString('zh-TW'),
              tickets: [item.ticket_number?.toString()],
              cost: item.products?.price || 0,
              items: [{ grade, name, ticket_number: item.ticket_number?.toString(), txid_hash: item.txid_hash || undefined }]
            });
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const history = groupedHistory.map(({ _rawDate, ...rest }) => rest);
        setDrawHistory(history as unknown as DrawHistoryItem[]);
      }
      else if (activeTab === 'topup-history') {
        const { data, error } = await supabase
          .from('recharge_records')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Group records by created_at (transaction time)
        // Although topup is usually single item, we follow DrawHistory structure
        const groupedHistory: TopupHistoryItem[] = [];
        
        (data as unknown as DbTopup[]).forEach((item) => {
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
        // Clean URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('action');
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

  // Mobile warehouse lazy load
  useEffect(() => {
    setMobileWarehouseDisplayCount(10);
  }, [activeWarehouseCategory, activeWarehouseSubCategory, activeWarehouseTab]);

  useEffect(() => {
    if (isDesktop) return;
    const container = mobileWarehouseScrollRef.current;
    if (!container) return;
    const tryLoadMore = () => {
      if (sortedWarehouseItems.length <= mobileWarehouseDisplayCount) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 120) {
        setMobileWarehouseDisplayCount(prev => prev + 10);
      }
    };
    tryLoadMore();
    container.addEventListener('scroll', tryLoadMore, { passive: true });
    return () => container.removeEventListener('scroll', tryLoadMore);
  }, [isDesktop, mobileWarehouseDisplayCount, sortedWarehouseItems.length]);

  const toggleDeliverySelection = (id: string) => {
    const item = warehouseItems.find(i => i.id === id);
    if (item?.status === 'pending_delivery') return;
    if (lockedSupplierName !== null && item?.supplierName !== lockedSupplierName) return;

    const isCurrentlySelected = selectedForDelivery.includes(id);
    if (isCurrentlySelected) {
      const newSelected = selectedForDelivery.filter(i => i !== id);
      setSelectedForDelivery(newSelected);
      if (newSelected.length === 0) setLockedSupplierName(null);
    } else {
      if (selectedForDelivery.length === 0) {
        setLockedSupplierName(item?.supplierName ?? null);
      }
      setSelectedForDelivery(prev => [...prev, id]);
    }
  };

  const handleConfirmDelivery = async () => {
    if (selectedForDelivery.length === 0) return;

    if (logisticsType === 'CVS' && !storeId) {
      toast.error('請選擇取貨門市');
      return;
    }

    setIsSubmittingDelivery(true);

    try {
      // Call RPC to create delivery order with atomic points deduction
      const { data, error } = await supabase.rpc('create_delivery_order', {
        p_user_id: user!.id,
        p_recipient_name: settingsForm.recipientName,
        p_recipient_phone: settingsForm.recipientPhone,
        p_address: logisticsType === 'HOME' ? settingsForm.recipientAddress : storeAddress,
        p_logistics_type: logisticsType,
        p_logistics_subtype: logisticsType === 'CVS' ? logisticsSubType : null,
        p_store_id: logisticsType === 'CVS' ? storeId : null,
              p_store_name: logisticsType === 'CVS' ? storeName : null,
              p_draw_record_ids: selectedForDelivery.map(id => Number(id)),
              p_delivery_fee_points: 0 // Currently free shipping
            });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      toast.success('配送申請已提交！');
      setShowDeliveryModal(false);
      setSelectedForDelivery([]);
      sessionStorage.removeItem('pending_delivery_items');
      
      // Refresh data and user points
      fetchUserData(); 
      await refreshProfile();
      
    } catch (error) {
      console.error('Delivery Error:', error);
      toast.error((error as Error).message || '申請失敗，請稍後再試');
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  const handleDismantleClick = () => {
    if (selectedForDelivery.length === 0) return;
    
    const selectedItems = warehouseItems.filter(item => selectedForDelivery.includes(item.id));
    const totalValue = selectedItems.reduce((sum, item) => sum + (item.recycleValue || 0), 0);
    const count = selectedItems.length;
    
    setDismantleSummary({ count, totalValue });
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
        toast.error('沒有可分解的獎項，請刷新後重試');
        return;
      }

      toast.success(`成功分解 ${successCount} 件獎項，獲得 ${totalRefund} 代幣！`);
      setShowDismantleModal(false);
      setSelectedForDelivery([]);
      fetchUserData(); // Refresh list and balance
      await refreshProfile();
      
    } catch (error) {
      console.error('Dismantle Error:', error);
      toast.error((error as Error)?.message || '分解失敗，請稍後再試');
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

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isGuest = !user;
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
      case 'check-in':
        return (
          <div className="p-3 lg:p-8">
            <DailyCheckInTab />
          </div>
        );
      case 'warehouse':
        return (
          <>
            {/* Mobile Layout */}
            <div className="md:hidden fixed inset-0 z-[60] bg-[#F5F5F5] dark:bg-neutral-950 flex flex-col h-[100dvh] overscroll-none">
              {/* Top Nav */}
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => {
                    if (activeWarehouseTab === 'all') {
                      router.back();
                    } else {
                      setActiveWarehouseTab('all');
                      setActiveWarehouseCategory('all');
                    }
                  }} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    {activeWarehouseTab === 'all' ? '我的倉庫' : '分解紀錄'}
                  </span>
                </div>
                {activeWarehouseTab === 'all' && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setActiveWarehouseTab('dismantled');
                        setActiveWarehouseCategory('all');
                      }}
                      className="text-[13px] font-bold text-neutral-500"
                    >
                      分解紀錄
                    </button>
                  </div>
                )}
              </div>

              {/* Sticky Tabs */}
              {(activeWarehouseTab === 'all' || activeWarehouseTab === 'dismantled') && (
                <div className="relative z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 -mx-0">
                  <div className={cn(
                    "max-w-7xl mx-auto space-y-2 pt-0 pb-0"
                  )}>
                    {activeWarehouseTab === 'all' && warehouseTabs.length > 2 && (
                      <Tabs
                        value={activeWarehouseCategory}
                        onValueChange={(val) => setActiveWarehouseCategory(val as ProductCategoryId)}
                        className="w-full"
                      >
                        <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                          {warehouseTabs.map((tab) => (
                             <TabsTrigger key={tab.id} value={tab.id}>
                               {tab.label}
                             </TabsTrigger>
                           ))}
                        </TabsList>
                      </Tabs>
                    )}
                    {activeWarehouseTab === 'dismantled' && (
                      <div className="flex items-center gap-1.5 pb-2 px-2 pt-2">
                        <div ref={dismantleTimeTabsRef} className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide">
                          <div className="flex items-center gap-1.5">
                            {[
                              { id: 'today', label: '今天' },
                              { id: '7days', label: '近7天' },
                              { id: '30days', label: '近30天' },
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                data-tab-id={tab.id}
                                onClick={() => setActiveDismantleTimeTab(tab.id as 'today' | '7days' | '30days')}
                                className={cn(
                                  "px-3 py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors",
                                  activeDismantleTimeTab === tab.id
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
              )}

              {/* 出貨說明 */}
              {activeWarehouseTab === 'all' && (
                <div className="bg-neutral-800 dark:bg-neutral-900 px-4 py-2.5 flex items-start gap-2 flex-shrink-0">
                  <span className="text-neutral-400 text-[11px] mt-px flex-shrink-0">⚠</span>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    訂單以廠商為單位分批出貨，每次申請限同一廠商品項。含公仔等大尺寸品項因超商包裝規格限制，一律以宅配方式出貨。
                  </p>
                </div>
              )}

              {/* Content List */}
              <div ref={mobileWarehouseScrollRef} className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-0 pb-24 bg-[#F5F5F5] dark:bg-neutral-950">
                {isLoadingData ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : activeWarehouseTab === 'all' ? (
                  filteredWarehouseItems.length === 0 ? (
                    <div className="py-20 text-center text-neutral-400">
                      <Box className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="font-black text-sm uppercase tracking-widest">沒有相關獎項</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                      {sortedWarehouseItems.slice(0, mobileWarehouseDisplayCount).map((item) => {
                        const isSelected = selectedForDelivery.includes(item.id);
                        const isPending = item.status === 'pending_delivery';
                        const isDisabled = isPending || (lockedSupplierName !== null && item.supplierName !== lockedSupplierName);
                        return (
                          <div
                            key={item.id}
                            onClick={() => !isDisabled && toggleDeliverySelection(item.id)}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2 transition-all",
                              isDisabled
                                ? "opacity-35 cursor-not-allowed"
                                : "active:bg-neutral-50 dark:active:bg-neutral-800/70",
                              isSelected && !isDisabled && "bg-accent-emerald/5"
                            )}
                          >
                            <div className="relative w-[56px] h-[56px] rounded-[8px] bg-[#28324E] overflow-hidden flex-shrink-0 border border-neutral-100 dark:border-neutral-800">
                              <Image
                                src={item.image || '/images/item.png'}
                                alt={item.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <div className="flex-1 min-w-0 py-0.5 space-y-0.5">
                              <p className="text-[11px] text-neutral-400 font-medium truncate">
                                {item.supplierName}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-primary font-black bg-primary/8 px-1.5 py-0.5 rounded-md border border-primary/10 whitespace-nowrap flex-shrink-0">
                                  {item.grade}
                                </span>
                                <h4 className="text-[13px] font-bold text-neutral-900 dark:text-white leading-tight truncate">
                                  {item.name}
                                </h4>
                              </div>
                              <p className="text-[11px] text-neutral-400 font-medium truncate">
                                {item.series}
                              </p>
                            </div>
                            <div
                              className="ml-1 pl-2 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isDisabled) toggleDeliverySelection(item.id);
                              }}
                            >
                              {isPending ? (
                                <span className="text-[11px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg whitespace-nowrap">
                                  出貨中
                                </span>
                              ) : (
                                <div
                                  className={cn(
                                    "w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-all bg-white dark:bg-neutral-900",
                                    isSelected
                                      ? "border-accent-emerald bg-accent-emerald"
                                      : "border-neutral-300 dark:border-neutral-700"
                                  )}
                                >
                                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {mobileWarehouseDisplayCount < sortedWarehouseItems.length && (
                        <div ref={mobileWarehouseSentinelRef} className="py-4 text-center text-xs text-neutral-400">
                          載入中...
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  // Dismantled List (Mobile)
                  filteredDismantledItems.length === 0 ? (
                    <div className="py-20 text-center text-neutral-400">
                      <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="font-black text-sm uppercase tracking-widest">尚無分解紀錄</p>
                    </div>
                  ) : (
                    <>
                      {/* Time Filter Tabs - Removed duplicate */}
          
                      <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                        {filteredDismantledItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 pl-2 pr-4 py-1.5">
                          <div className="flex-shrink-0 w-10 flex justify-center">
                            <span className="text-[13px] text-primary font-black uppercase tracking-widest bg-primary/5 px-1.5 py-0.5 rounded-lg border border-primary/10 whitespace-nowrap">
                              {item.grade}
                            </span>
                          </div>
                          <div className="relative w-[60px] h-[60px] rounded-[8px] bg-[#28324E] overflow-hidden flex-shrink-0 border border-neutral-100 dark:border-neutral-800">
                            <Image 
                              src={item.image || '/images/item.png'} 
                              alt={item.name} 
                              fill 
                              className="object-cover" 
                              unoptimized
                            />
                          </div>
                          <div className="flex-1 min-w-0 py-0.5 space-y-0.5">
                            <h4 className="text-[13px] font-bold text-neutral-900 dark:text-white leading-tight line-clamp-2">{item.name}</h4>
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] text-neutral-400 font-bold">{item.dismantled_at}</span>
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right flex items-center justify-end gap-1">
                            <span className="text-[13px] font-black text-accent-red">+{item.recycleValue}</span>
                            <Image
                              src="/images/gcoin.png"
                              alt="G"
                              width={14}
                              height={14}
                              className="object-contain"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    </>
                  )
                )}
              </div>

              {/* Mobile Fixed Bottom Bar (Only for Warehouse Tab) */}
              {activeWarehouseTab === 'all' && (
                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] z-[60] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex items-center px-3">
                  {selectedForDelivery.length === 0 ? (
                    <button
                      onClick={() => { setSelectedForDelivery(filteredWarehouseItems.filter(i => i.status !== 'pending_delivery').map(i => i.id)); setLockedSupplierName(null); }}
                      className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 h-[44px] rounded-xl text-base font-black"
                    >
                      全選 ({filteredWarehouseItems.length})
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 w-full">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-neutral-900 dark:text-white">已選 {selectedForDelivery.length}</span>
                            <button onClick={() => { setSelectedForDelivery([]); setLockedSupplierName(null); }} className="text-xs text-neutral-400 font-bold">取消</button>
                        </div>
                        <div className="flex-1 flex gap-2 justify-end">
                            <button onClick={handleDismantleClick} className="flex-1 bg-accent-red text-white h-[44px] rounded-xl text-base font-black">分解</button>
                            {selectedForDelivery.length <= 5 && (
                              <>
                                {flags.exchange && selectedForDelivery.length === 1 && warehouseItems.find(i => i.id === selectedForDelivery[0] && isMajorGrade(i.grade)) && (
                                  (() => {
                                    const item = warehouseItems.find(i => i.id === selectedForDelivery[0])!;
                                    return (
                                      <button
                                        onClick={() => handleSellClick(item)}
                                        disabled={Boolean(item?.isPreorder && item?.preorderAvailableAt && new Date(item.preorderAvailableAt).getTime() > Date.now())}
                                        className="flex-1 bg-accent-yellow text-neutral-800 h-[44px] rounded-xl text-base font-black disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        上架
                                      </button>
                                    );
                                  })()
                                )}
                                <button
                                  onClick={() => setShowDeliveryModal(true)}
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
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="hidden md:block px-6 py-5">
            <div className="mb-4 lg:mb-6">
              <ProfileSectionHeader
                title="我的倉庫"
                description="管理您獲得的獎項，隨時申請出貨"
                actions={
                  activeWarehouseTab === 'all' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedForDelivery(filteredWarehouseItems.filter(i => i.status !== 'pending_delivery').map(i => i.id))}
                        disabled={selectedForDelivery.length >= filteredWarehouseItems.length || filteredWarehouseItems.length === 0}
                        className="h-9 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-black text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        全選{filteredWarehouseItems.length > 0 ? ` (${filteredWarehouseItems.length})` : ''}
                      </button>
                      {selectedForDelivery.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setSelectedForDelivery([])}
                            className="h-9 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-black text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                          >
                            重選
                          </button>
                          <button
                            type="button"
                            onClick={handleDismantleClick}
                            className="h-9 px-3 rounded-lg bg-accent-red text-white text-[13px] font-black"
                          >
                            分解 ({selectedForDelivery.length})
                          </button>
                          {flags.exchange && (() => {
                            if (selectedForDelivery.length > 5) return null;
                            if (selectedForDelivery.length !== 1) return null;
                            const item = warehouseItems.find(i => i.id === selectedForDelivery[0]);
                            if (!item || !isMajorGrade(item.grade)) return null;
                            return (
                              <button
                                type="button"
                                onClick={() => handleSellClick(item)}
                                disabled={Boolean(item?.isPreorder && item?.preorderAvailableAt && new Date(item.preorderAvailableAt).getTime() > Date.now())}
                                className="h-9 px-3 rounded-lg bg-accent-yellow text-neutral-900 text-[13px] font-black disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                上架市集
                              </button>
                            );
                          })()}
                          {selectedForDelivery.length <= 5 ? (
                            <button
                              type="button"
                              onClick={() => setShowDeliveryModal(true)}
                              disabled={Boolean(selectedForDelivery.some(id => {
                                const itm = warehouseItems.find(i => i.id === id);
                                return itm?.isPreorder && itm?.preorderAvailableAt && new Date(itm?.preorderAvailableAt).getTime() > Date.now();
                              }))}
                              className="h-9 px-3 rounded-lg bg-primary text-white text-[13px] font-black disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              申請配送 ({selectedForDelivery.length})
                            </button>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : null
                }
              />
            </div>

            <Tabs value={activeWarehouseTab} onValueChange={(val) => setActiveWarehouseTab(val as 'all' | 'dismantled')} className="w-full">
              <TabsList className="mb-4 overflow-x-auto scrollbar-hide border-b border-neutral-100 dark:border-neutral-800 px-0 md:px-2 justify-start">
                <TabsTrigger value="all">
                  全部獎項 ({warehouseItems.length})
                </TabsTrigger>
                <TabsTrigger value="dismantled">
                  已分解 ({dismantledItems.length})
                </TabsTrigger>
              </TabsList>

              <TabsContentWrapper>
                <TabsContent value="all">
                  <div className="mb-4">
                    <ProfileToolbar
                      left={
                        <>
                          <input
                            value={desktopWarehouseSearch}
                            onChange={(e) => setDesktopWarehouseSearch(e.target.value)}
                            placeholder="搜尋賞別 / 獎項 / 籤號"
                            className="h-9 w-[320px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                          />
                          <select
                            value={activeWarehouseCategory}
                            onChange={(e) => setActiveWarehouseCategory(e.target.value as ProductCategoryId)}
                            className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                          >
                            {warehouseTabs.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={activeWarehouseSubCategory}
                            onChange={(e) =>
                              setActiveWarehouseSubCategory(
                                e.target.value as 'all' | 'tradable' | 'small_prize' | 'preorder'
                              )
                            }
                            className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                          >
                            {warehouseSubTabs.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </>
                      }
                      right={
                        <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                          共 {filteredWarehouseItems.length} 筆
                        </div>
                      }
                    />
                  </div>

                  {isLoadingData ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 border border-neutral-100 dark:border-neutral-800 rounded-2xl animate-pulse">
                          <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex-shrink-0" />
                          <div className="space-y-2 flex-1">
                            <div className="h-4 w-1/3 bg-neutral-100 dark:bg-neutral-800 rounded" />
                            <div className="h-3 w-1/4 bg-neutral-100 dark:bg-neutral-800 rounded" />
                          </div>
                          <div className="h-8 w-20 bg-neutral-100 dark:bg-neutral-800 rounded-lg" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {filteredWarehouseItems.length === 0 ? (
                        <div className="py-20 text-center text-neutral-400">
                          <Box className="w-12 h-12 mx-auto mb-4 opacity-20" />
                          <p className="font-black text-sm uppercase tracking-widest">
                            {warehouseItems.length === 0 ? '倉庫目前是空的' : '沒有相關獎項'}
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Mobile List */}
                          <div className="md:hidden divide-y divide-neutral-100 dark:divide-neutral-800 border-t border-b border-neutral-100 dark:border-neutral-800">
                            {filteredWarehouseItems.map((item) => {
                              const isSelected = selectedForDelivery.includes(item.id);
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => toggleDeliverySelection(item.id)}
                                  className={cn(
                                    "flex items-center gap-1 pl-3 pr-4 py-2 active:bg-neutral-50 dark:active:bg-neutral-800/70 transition-all",
                                    isSelected && "bg-accent-emerald/5"
                                  )}
                                >
                                  <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
                                    <span className="px-1.5 py-0.5 bg-accent-red/10 text-accent-red text-[10px] font-black rounded border border-accent-red/10 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                                      {item.grade}
                                    </span>
                                  </div>
                                  <div className="relative w-14 h-14 rounded-xl bg-[#28324E] overflow-hidden flex-shrink-0">
                                    <Image
                                      src={item.image || '/images/item.png'}
                                      alt={item.name}
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-[13px] font-black text-neutral-900 dark:text-white leading-snug line-clamp-2">
                                      {item.name}
                                    </h4>
                                    <p className="text-[11px] text-neutral-400 font-bold mt-0.5 truncate">
                                      {item.series}
                                    </p>
                                  </div>
                                  <div
                                    className="ml-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleDeliverySelection(item.id);
                                    }}
                                  >
                                    <div
                                      className={cn(
                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white dark:bg-neutral-900",
                                        isSelected
                                          ? "border-accent-emerald bg-accent-emerald"
                                          : "border-neutral-200 dark:border-neutral-700"
                                      )}
                                    >
                                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="hidden md:block space-y-3">
                            {(() => {
                              const q = desktopWarehouseSearch.trim().toLowerCase();
                              const list = filteredWarehouseItems.filter((item) => {
                                if (!q) return true;
                                const text = `${item.grade} ${item.name} ${item.series} ${item.ticketNo}`.toLowerCase();
                                return text.includes(q);
                              });

                              const total = list.length;
                              const totalPages = Math.max(1, Math.ceil(total / desktopWarehousePageSize));
                              const page = Math.min(desktopWarehousePage, totalPages);
                              const start = (page - 1) * desktopWarehousePageSize;
                              const pageRows = list.slice(start, start + desktopWarehousePageSize);

                              return (
                                <>
                                  <ProfileDataTable
                                    columns={[
                                      {
                                        key: 'select',
                                        header: '',
                                        className: 'w-[52px]',
                                        render: (item) => {
                                          const isSelected = selectedForDelivery.includes(item.id);
                                          return (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleDeliverySelection(item.id);
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
                                          );
                                        },
                                      },
                                      {
                                        key: 'grade',
                                        header: '賞別',
                                        className: 'w-[110px]',
                                        render: (item) => (
                                          <span className="inline-flex px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/10 text-[12px] font-black whitespace-nowrap">
                                            {item.grade}
                                          </span>
                                        ),
                                      },
                                      {
                                        key: 'item',
                                        header: '獎項內容',
                                        render: (item) => (
                                          <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shrink-0">
                                              <Image
                                                src={item.image || '/images/item.png'}
                                                alt={item.name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                              />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="font-black text-neutral-900 dark:text-white truncate">{item.name}</div>
                                              <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">{item.series}</div>
                                            </div>
                                          </div>
                                        ),
                                      },
                                      {
                                        key: 'date',
                                        header: '獲得日期',
                                        className: 'w-[160px]',
                                        render: (item) => (
                                          <div className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
                                            {item.date}
                                          </div>
                                        ),
                                      },
                                      {
                                        key: 'ticket',
                                        header: '籤號',
                                        className: 'w-[120px]',
                                        render: (item) => (
                                          <span className="inline-flex px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 font-amount whitespace-nowrap">
                                            {item.ticketNo}
                                          </span>
                                        ),
                                      },
                                    ]}
                                    rows={pageRows}
                                    rowKey={(r) => String(r.id)}
                                    onRowClick={(item) => toggleDeliverySelection(item.id)}
                                    empty={warehouseItems.length === 0 ? '倉庫目前是空的' : '沒有相關獎項'}
                                  />

                                  <ProfilePagination
                                    page={page}
                                    pageSize={desktopWarehousePageSize}
                                    total={total}
                                    onPageChange={setDesktopWarehousePage}
                                    onPageSizeChange={(s) => {
                                      setDesktopWarehousePageSize(s);
                                      setDesktopWarehousePage(1);
                                    }}
                                  />
                                </>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="dismantled">
                  <div className="mb-4">
                    <ProfileToolbar
                      left={
                        <>
                          <input
                            value={desktopDismantledSearch}
                            onChange={(e) => setDesktopDismantledSearch(e.target.value)}
                            placeholder="搜尋賞別 / 獎項"
                            className="h-9 w-[320px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                          />
                          <select
                            value={activeDismantleTimeTab}
                            onChange={(e) => setActiveDismantleTimeTab(e.target.value as 'today' | '7days' | '30days')}
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
                          共 {filteredDismantledItems.length} 筆
                        </div>
                      }
                    />
                  </div>

                  {isLoadingData ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 border border-neutral-100 dark:border-neutral-800 rounded-2xl animate-pulse">
                          <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex-shrink-0" />
                          <div className="space-y-2 flex-1">
                            <div className="h-4 w-1/3 bg-neutral-100 dark:bg-neutral-800 rounded" />
                            <div className="h-3 w-1/4 bg-neutral-100 dark:bg-neutral-800 rounded" />
                          </div>
                          <div className="h-8 w-20 bg-neutral-100 dark:bg-neutral-800 rounded-lg" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {dismantledItems.length === 0 ? (
                        <div className="py-20 text-center text-neutral-400">
                          <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-20" />
                          <p className="font-black text-sm uppercase tracking-widest">尚無分解紀錄</p>
                        </div>
                      ) : (
                        <>
                          {/* Mobile Grid for Dismantled */}
                          <div className="md:hidden grid grid-cols-2 gap-3 p-3">
                            {filteredDismantledItems.map((item) => (
                              <div key={item.id} className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 p-3 space-y-3 shadow-sm relative overflow-hidden">
                                <div className="aspect-square bg-[#28324E] rounded-xl overflow-hidden relative">
                                  <Image 
                                    src={item.image || '/images/item.png'} 
                                    alt={item.name} 
                                    fill 
                                    className="object-cover" 
                                    unoptimized
                                  />
                                  <div className="absolute bottom-2 left-2">
                                    <span className="px-2 py-0.5 bg-neutral-600 text-white text-[10px] font-black rounded-md uppercase">{item.grade}</span>
                                  </div>
                                </div>
                                <div>
                                  <h4 className="text-[13px] font-black text-neutral-900 dark:text-white leading-tight line-clamp-2 min-h-[2.5em] break-all">{item.name}</h4>
                                  <div className="flex justify-between items-center mt-2">
                                    <span className="text-[10px] text-neutral-400 font-bold">{item.dismantled_at}</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-black text-accent-red">+{item.recycleValue}</span>
                                    <Image
                                      src="/images/gcoin.png"
                                      alt="G"
                                      width={12}
                                      height={12}
                                      className="object-contain"
                                    />
                                  </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="hidden md:block space-y-3">
                            {(() => {
                              const q = desktopDismantledSearch.trim().toLowerCase();
                              const list = filteredDismantledItems.filter((item) => {
                                if (!q) return true;
                                const text = `${item.grade} ${item.name} ${item.series} ${item.dismantled_at}`.toLowerCase();
                                return text.includes(q);
                              });

                              const total = list.length;
                              const totalPages = Math.max(1, Math.ceil(total / desktopDismantledPageSize));
                              const page = Math.min(desktopDismantledPage, totalPages);
                              const start = (page - 1) * desktopDismantledPageSize;
                              const pageRows = list.slice(start, start + desktopDismantledPageSize);

                              return (
                                <>
                                  <ProfileDataTable
                                    columns={[
                                      {
                                        key: 'grade',
                                        header: '賞別',
                                        className: 'w-[110px]',
                                        render: (item) => (
                                          <span className="inline-flex px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/10 text-[12px] font-black whitespace-nowrap">
                                            {item.grade}
                                          </span>
                                        ),
                                      },
                                      {
                                        key: 'item',
                                        header: '獎項內容',
                                        render: (item) => (
                                          <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shrink-0">
                                              <Image
                                                src={item.image || '/images/item.png'}
                                                alt={item.name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                              />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="font-black text-neutral-900 dark:text-white truncate">{item.name}</div>
                                              <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">{item.series}</div>
                                            </div>
                                          </div>
                                        ),
                                      },
                                      {
                                        key: 'date',
                                        header: '分解日期',
                                        className: 'w-[160px]',
                                        render: (item) => (
                                          <div className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
                                            {item.dismantled_at}
                                          </div>
                                        ),
                                      },
                                      {
                                        key: 'value',
                                        header: '獲得代幣',
                                        className: 'w-[140px]',
                                        render: (item) => (
                                          <div className="flex items-center gap-1.5">
                                            <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
                                            <span className="text-[14px] font-black text-accent-red font-amount tracking-tighter">
                                              +{item.recycleValue.toLocaleString()}
                                            </span>
                                          </div>
                                        ),
                                      },
                                    ]}
                                    rows={pageRows}
                                    rowKey={(r) => String(r.id)}
                                    empty="尚無分解紀錄"
                                  />

                                  <ProfilePagination
                                    page={page}
                                    pageSize={desktopDismantledPageSize}
                                    total={total}
                                    onPageChange={setDesktopDismantledPage}
                                    onPageSizeChange={(s) => {
                                      setDesktopDismantledPageSize(s);
                                      setDesktopDismantledPage(1);
                                    }}
                                  />
                                </>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </TabsContent>
              </TabsContentWrapper>
            </Tabs>


            </div>
            {/* Delivery Modal */}
            <AnimatePresence>
              {showDeliveryModal && (
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
                      if (!isDesktop && info.offset.y > 100) setShowDeliveryModal(false);
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
                      <h3 className={cn("font-black text-neutral-900 dark:text-white", isDesktop ? "text-xl" : "text-base")}>確認配送資訊</h3>
                      <button onClick={() => setShowDeliveryModal(false)} className="w-8 h-8 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                        <X className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                      </button>
                    </div>
                    <div className={cn("flex-1 overflow-y-auto", isDesktop ? "p-6 space-y-4" : "p-3 space-y-3")}>
                      <div className={cn("bg-neutral-50 dark:bg-neutral-800 rounded-xl space-y-2", isDesktop ? "p-4" : "p-3")}>
                        <div className={cn("flex justify-between", isDesktop ? "text-sm" : "text-[13px]")}>
                          <span className="text-neutral-500 dark:text-neutral-400 font-bold">配送件數</span>
                          <span className="font-black text-neutral-900 dark:text-white">{selectedForDelivery.length.toLocaleString()} 件</span>
                        </div>
                        <div className={cn("flex justify-between", isDesktop ? "text-sm" : "text-[13px]")}>
                          <span className="text-neutral-500 dark:text-neutral-400 font-bold">運費</span>
                          <span className="font-black text-primary">免運費</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className={cn("font-black text-neutral-900 dark:text-white", isDesktop ? "text-sm" : "text-[13px]")}>配送方式</p>
                        
                        {/* Logistics Type Selection */}
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setLogisticsType('HOME')}
                            className={cn(
                              "flex-1 py-2.5 px-3 rounded-xl border-2 font-black text-sm transition-all",
                              logisticsType === 'HOME'
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500"
                            )}
                          >
                            宅配到府
                          </button>
                          <button
                            type="button"
                            onClick={() => !hasLargePackage && setLogisticsType('CVS')}
                            disabled={hasLargePackage}
                            className={cn(
                              "flex-1 py-2.5 px-3 rounded-xl border-2 font-black text-sm transition-all",
                              hasLargePackage
                                ? "border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-300 dark:text-neutral-600 cursor-not-allowed"
                                : logisticsType === 'CVS'
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500"
                            )}
                          >
                            超商取貨
                          </button>
                        </div>
                        {hasLargePackage && (
                          <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800">
                            ⚠ 包含大尺寸一番賞／自製賞品項，僅限宅配出貨
                          </div>
                        )}

                        {logisticsType === 'CVS' && (
                          <div className="space-y-3 pt-2">
                             <label className="text-xs font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">選擇超商體系</label>
                             <div className="grid grid-cols-2 gap-2">
                                {[
                                  { id: 'UNIMART', label: '7-11' },
                                  { id: 'FAMI', label: '全家' },
                                  { id: 'HILIFE', label: '萊爾富' },
                                  { id: 'OKMART', label: 'OK超商' }
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
                                {storeId ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">已選擇門市</span>
                                      <button
                                  type="button"
                                  onClick={() => {
                                    // Save selected items before redirect
                                    try {
                                      sessionStorage.setItem('pending_delivery_items', JSON.stringify(selectedForDelivery));
                                    } catch (e) {
                                      console.error('Failed to save delivery items:', e);
                                    }

                                    const form = document.createElement('form');
                                          form.method = 'POST';
                                          const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
                                          form.action = `${baseUrl}/api/logistics/map`;
                                          const input = document.createElement('input');
                                          input.name = 'logisticsSubType';
                                          input.value = logisticsSubType;
                                          input.type = 'hidden';
                                          form.appendChild(input);
                                          document.body.appendChild(form);
                                          form.submit();
                                        }}
                                        className="text-[11px] font-black text-neutral-400 hover:text-primary transition-colors"
                                      >
                                        重選門市
                                      </button>
                                    </div>
                                    <div className="font-bold text-sm text-neutral-900 dark:text-white">{storeName} ({storeId})</div>
                                    <div className="text-xs text-neutral-500">{storeAddress}</div>
                                  </div>
                                ) : (
                                  <div className="text-center py-1">
                                     <button 
                                           type="button" 
                                           onClick={() => {
                                             // Save selected items before redirect
                                             try {
                                               sessionStorage.setItem('pending_delivery_items', JSON.stringify(selectedForDelivery));
                                             } catch (e) {
                                               console.error('Failed to save delivery items:', e);
                                             }

                                             const form = document.createElement('form');
                                          form.method = 'POST';
                                          const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
                                          form.action = `${baseUrl}/api/logistics/map`;
                                          const input = document.createElement('input');
                                          input.name = 'logisticsSubType';
                                          input.value = logisticsSubType;
                                          input.type = 'hidden';
                                          form.appendChild(input);
                                          document.body.appendChild(form);
                                          form.submit();
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
                        )}

                        <p className={cn("font-black text-neutral-900 dark:text-white pt-2", isDesktop ? "text-sm" : "text-[13px]")}>收件人資訊</p>
                         <div className="grid grid-cols-1 gap-3">
                           <input 
                             value={settingsForm.recipientName} 
                             onChange={e => setSettingsForm({...settingsForm, recipientName: e.target.value})}
                             placeholder="收件人姓名" 
                             className={cn(
                               "w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all",
                               isDesktop ? "px-4 py-3 text-sm" : "px-3 py-2.5 text-[13px]"
                             )}
                           />
                           <input 
                             value={settingsForm.recipientPhone}
                             onChange={e => setSettingsForm({...settingsForm, recipientPhone: e.target.value})}
                             placeholder="聯絡電話" 
                             className={cn(
                               "w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all",
                               isDesktop ? "px-4 py-3 text-sm" : "px-3 py-2.5 text-[13px]"
                             )}
                           />
                           {logisticsType === 'HOME' && (
                             <input 
                               value={settingsForm.recipientAddress}
                               onChange={e => setSettingsForm({...settingsForm, recipientAddress: e.target.value})}
                               placeholder="收件地址" 
                               className={cn(
                                 "w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all",
                                 isDesktop ? "px-4 py-3 text-sm" : "px-3 py-2.5 text-[13px]"
                               )}
                             />
                           )}
                         </div>
                         {(!settingsForm.recipientName || !settingsForm.recipientPhone || (logisticsType === 'HOME' && !settingsForm.recipientAddress)) ? (
                           <p className="text-xs text-accent-red font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> 請填寫完整收件資訊</p>
                         ) : null}
                      </div>
                    </div>
                    <div className={cn(
                      "border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center gap-3 shrink-0 mt-auto",
                      isDesktop ? "h-24 px-6" : "h-16 px-4"
                    )}>
                      <button 
                        onClick={() => setShowDeliveryModal(false)} 
                        className={cn(
                          "flex-1 rounded-xl font-black text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-neutral-50 dark:bg-neutral-800",
                          isDesktop ? "h-[52px] text-lg" : "h-[44px] text-base"
                        )}
                      >
                        取消
                      </button>
                      <button 
                        onClick={handleConfirmDelivery}
                        disabled={isSubmittingDelivery || !settingsForm.recipientName || !settingsForm.recipientPhone || !settingsForm.recipientAddress}
                        className={cn(
                          "flex-1 bg-primary text-white rounded-xl font-black shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100",
                          isDesktop ? "h-[52px] text-lg" : "h-[44px] text-base"
                        )}
                      >
                        {isSubmittingDelivery ? '處理中...' : '確認配送'}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
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
                      <h3 className={cn("font-black text-neutral-900 dark:text-white", isDesktop ? "text-xl" : "text-base")}>確認分解項目</h3>
                      <button onClick={() => setShowDismantleModal(false)} className="w-8 h-8 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                        <X className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                      </button>
                    </div>
                    <div className={cn("flex-1 overflow-y-auto", isDesktop ? "p-6 space-y-4" : "p-3 space-y-3")}>
                      <div className={cn("bg-neutral-50 dark:bg-neutral-800 rounded-xl space-y-2", isDesktop ? "p-4" : "p-3")}>
                        <div className={cn("flex justify-between", isDesktop ? "text-sm" : "text-[13px]")}>
                          <span className="text-neutral-500 dark:text-neutral-400 font-bold">分解數量</span>
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
                      <div className={cn("bg-accent-red/5 dark:bg-accent-red/10 rounded-xl border border-accent-red/10 dark:border-accent-red/20", isDesktop ? "p-4" : "p-3")}>
                        <div className="flex gap-3">
                          <AlertCircle className="w-5 h-5 text-accent-red flex-shrink-0" />
                          <div className="space-y-1">
                            <p className={cn("font-black text-accent-red", isDesktop ? "text-sm" : "text-[13px]")}>注意：分解後無法復原</p>
                            <p className={cn("text-accent-red/80 font-bold leading-relaxed", isDesktop ? "text-xs" : "text-[11px]")}>
                              確認分解後，獎項將會從倉庫移除並轉換為代幣。代幣可用於再次抽獎或兌換其他商品。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      "border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center gap-3 shrink-0 mt-auto",
                      isDesktop ? "h-24 px-6" : "h-16 px-4"
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
                          <span>確認分解</span>
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
                            src={sellingItem.image || '/images/item.png'} 
                            alt={sellingItem.name} 
                            width={64} 
                            height={64} 
                            className="object-cover rounded-lg bg-white dark:bg-neutral-700" 
                            unoptimized
                          />
                          <div>
                            <span className="px-2 py-0.5 bg-accent-red text-white text-[10px] font-black rounded-md uppercase">{sellingItem.grade}</span>
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
                                 src="/images/gcoin.png"
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
                      isDesktop ? "h-24 px-6" : "h-16 px-4"
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
            <div className="md:hidden fixed inset-0 z-[60] bg-[#F5F5F5] dark:bg-neutral-950 flex flex-col">
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => activeMarketTab === 'listing' ? router.back() : setActiveMarketTab('listing')} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    {activeMarketTab === 'listing' ? '交易所管理' : '交易紀錄'}
                  </span>
                </div>
                {activeMarketTab === 'listing' && (
                  <button 
                    onClick={() => setActiveMarketTab('sold_records')}
                    className="text-[13px] font-bold text-neutral-500"
                  >
                    交易紀錄
                  </button>
                )}
              </div>

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
                <div className="flex-1 overflow-y-auto p-0 pb-24 bg-[#F5F5F5] dark:bg-neutral-950">
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
                                  <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
                                src={item.product.image || '/images/item.png'} 
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
                                  item.type === 'sell' ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                                )}>
                                  {item.type === 'sell' ? '售出' : '購入'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-neutral-400">{item.updated_at.split(' ')[0]}</span>
                                <div className="flex items-center gap-1.5">
                                  <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
                        description="管理您的上架獎項與售出紀錄"
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
                              <span className="inline-flex px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/10 text-[12px] font-black whitespace-nowrap">
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
                                    src={item.product.image || '/images/item.png'}
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
                                <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
                      description="管理您的上架獎項與售出紀錄"
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
                            <span className="inline-flex px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 text-[12px] font-black whitespace-nowrap">
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
                                  src={item.product.image || '/images/item.png'}
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
                                'inline-flex px-2 py-0.5 rounded-md text-[12px] font-black whitespace-nowrap',
                                item.type === 'sell' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
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
                              <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
                                <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
          <div className="pb-24 md:pb-0">
            {/* Mobile Header & Tabs */}
            <div className="md:hidden fixed inset-0 z-[60] bg-[#F5F5F5] dark:bg-neutral-950 flex flex-col h-[100dvh] overscroll-none">
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => router.back()} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    配送訂單
                  </span>
                </div>
              </div>

              {/* Mobile Sticky Tabs (Using Tabs Component style) */}
              <div className="sticky top-0 z-30 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
                <div className="max-w-7xl mx-auto space-y-2 pt-0 pb-0">
                    <Tabs 
                      key={activeDeliveryTab} // Force re-render
                      defaultValue={activeDeliveryTab}
                      value={activeDeliveryTab} 
                      onValueChange={(val) => setActiveDeliveryTab(val as 'all' | 'submitted' | 'shipping' | 'completed' | 'cancelled')}
                      className="w-full"
                    >
                      <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b-0 pb-0 overflow-x-auto no-scrollbar">
                        {[
                          { id: 'all', label: '全部' },
                          { id: 'submitted', label: '已提交' },
                          { id: 'shipping', label: '配送中' },
                          { id: 'completed', label: '已完成' },
                          { id: 'cancelled', label: '已取消' }
                        ].map((tab) => (
                          <TabsTrigger key={tab.id} value={tab.id} className="whitespace-nowrap">
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                </div>
              </div>

              {/* Mobile List Style (Unified 3-Layer Structure) */}
              <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-0 pb-24 bg-[#F5F5F5] dark:bg-neutral-950">
                {filteredDeliveryHistory.length === 0 ? (
                  <div className="py-20 text-center text-neutral-400">
                    <Truck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">尚無配送訂單</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 border-t border-b border-neutral-100 dark:border-neutral-800">
                    {filteredDeliveryHistory.map((order) => {
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
                              "sticky top-0 z-30 p-3 space-y-2 transition-colors cursor-pointer",
                              !isExpanded && "bg-white dark:bg-neutral-900 active:bg-neutral-50 dark:active:bg-neutral-800/50",
                              isExpanded && "bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800"
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
                                   return <div className="text-[13px] font-black text-emerald-500">已送達</div>;
                                 }
                                 if (s === 'submitted' || s === 'processing') {
                                   return <div className="text-[13px] font-black text-neutral-400">待出貨</div>;
                                 }
                                 if (['picked_up', 'shipping'].includes(s) && order.arrivalDate && order.arrivalDate !== '-') {
                                   const text = getArrivalText(order.arrivalDate) || `${order.arrivalDate}送達`;
                                   return (
                                     <div className="text-[13px] font-black text-emerald-500">預計{text}</div>
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
                                className="bg-yellow-50 dark:bg-yellow-950 border-t border-yellow-200 dark:border-yellow-800 overflow-hidden"
                              >
                                <div className="p-3 space-y-3">
                                  {/* Shipping Info */}
                                  <div className="bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-2">
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
                                                      {item.grade}賞
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
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden md:block px-6 py-5">
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

                const total = list.length;
                const totalPages = Math.max(1, Math.ceil(total / desktopDeliveryPageSize));
                const page = Math.min(desktopDeliveryPage, totalPages);
                const start = (page - 1) * desktopDeliveryPageSize;
                const pageRows = list.slice(start, start + desktopDeliveryPageSize);

                return (
                  <div className="space-y-4">
                    <ProfileSectionHeader
                      title="配送訂單"
                      description="追蹤您的獎項配送狀態"
                    />

                    <ProfileToolbar
                      left={
                        <>
                          <input
                            value={desktopDeliverySearch}
                            onChange={(e) => setDesktopDeliverySearch(e.target.value)}
                            placeholder="搜尋訂單編號 / 追蹤號碼 / 商品"
                            className="h-9 w-[360px] max-w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                          />
                          <select
                            value={activeDeliveryTab}
                            onChange={(e) =>
                              setActiveDeliveryTab(
                                e.target.value as 'all' | 'submitted' | 'shipping' | 'completed' | 'cancelled'
                              )
                            }
                            className="h-9 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-[13px] font-bold text-neutral-700 dark:text-neutral-200"
                          >
                            <option value="all">全部</option>
                            <option value="submitted">已提交</option>
                            <option value="shipping">配送中</option>
                            <option value="completed">已完成</option>
                            <option value="cancelled">已取消</option>
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
                          key: 'order',
                          header: '訂單 / 日期',
                          render: (order) => (
                            <div className="min-w-0">
                              <div className="font-black text-neutral-900 dark:text-white truncate">
                                {order.order_number || `#${String(order.id).slice(0, 8)}`}
                              </div>
                              <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold">
                                {order.date}
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: 'status',
                          header: '狀態',
                          className: 'w-[120px]',
                          render: (order) => <ProfileStatusBadge config={getStatusConfig(order.status)} />,
                        },
                        {
                          key: 'logistics',
                          header: '物流',
                          render: (order) => (
                            <div className="min-w-0">
                              <div className="font-black text-neutral-900 dark:text-white truncate">
                                {order.method || '-'}
                              </div>
                              <div className="text-[12px] text-neutral-500 dark:text-neutral-400 font-bold truncate">
                                {order.tracking || '-'}
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: 'items',
                          header: '內容',
                          className: 'w-[110px]',
                          render: (order) => (
                            <div className="text-[13px] font-black text-neutral-900 dark:text-white">
                              {order.items?.length || 0} 項
                            </div>
                          ),
                        },
                        {
                          key: 'arrival',
                          header: '到貨',
                          className: 'w-[130px]',
                          render: (order) => (
                            <div className="text-[13px] font-black text-neutral-900 dark:text-white">
                              {order.arrivalDate || '-'}
                            </div>
                          ),
                        },
                        {
                          key: 'action',
                          header: '',
                          className: 'w-[90px]',
                          cellClassName: 'text-right',
                          render: (order) => {
                            const expanded = expandedOrderId === order.id;
                            return (
                              <button
                                type="button"
                                onClick={() => setExpandedOrderId(expanded ? null : order.id)}
                                className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[12px] font-black text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                              >
                                {expanded ? '收合' : '查看'}
                              </button>
                            );
                          },
                        },
                      ]}
                      rows={pageRows}
                      rowKey={(o) => String(o.id)}
                      isRowExpanded={(o) => expandedOrderId === o.id}
                      renderExpanded={(order) => (
                        <div className="space-y-2">
                          <div className="text-[12px] font-black text-neutral-600 dark:text-neutral-300">
                            配送商品（{order.items?.length || 0}）
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(order.items || []).map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 bg-white dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800 px-2 py-2"
                              >
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-primary/10 text-primary border border-primary/10 whitespace-nowrap">
                                  {it.grade}
                                </span>
                                <div className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100 truncate">
                                  {it.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      empty="尚無配送訂單"
                    />

                    <ProfilePagination
                      page={page}
                      pageSize={desktopDeliveryPageSize}
                      total={total}
                      onPageChange={setDesktopDeliveryPage}
                      onPageSizeChange={(s) => {
                        setDesktopDeliveryPageSize(s);
                        setDesktopDeliveryPage(1);
                      }}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        );
      case 'draw-history':
        return (
          <div className="pb-20 md:pb-0">
            {/* Mobile Header & Tabs */}
            <div className="md:hidden fixed inset-0 z-[60] bg-[#F5F5F5] dark:bg-neutral-950 flex flex-col h-[100dvh] overscroll-none">
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => router.back()} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    抽獎紀錄
                  </span>
                </div>
              </div>

              {/* Mobile List */}
              <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-0 pb-24 bg-[#F5F5F5] dark:bg-neutral-950">
                {drawHistory.length === 0 ? (
                  <div className="py-20 text-center text-neutral-400">
                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">尚無抽獎紀錄</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 border-t border-b border-neutral-100 dark:border-neutral-800">
                    {drawHistory.map((item) => {
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
                              "sticky top-0 z-30 p-3 space-y-2 active:bg-neutral-50 dark:active:bg-neutral-800/50 transition-colors cursor-pointer",
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
                                  <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
                                  <span className="text-[14px] font-black text-neutral-900 dark:text-white font-amount tracking-tighter">
                                    {item.cost.toLocaleString()}
                                  </span>
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
                                        <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[11px] font-black rounded-md border border-neutral-200 dark:border-neutral-700 font-sans shrink-0">
                                          {result.ticket_number}
                                        </span>
                                        <span className="px-2 py-0.5 bg-accent-red/10 text-accent-red text-[11px] font-black rounded-md border border-accent-red/10 uppercase shrink-0">
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
                      description="查看抽卡結果與獎項明細"
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
                            <span className="inline-flex px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-900 text-[12px] font-black text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 font-mono">
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
                              <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
                                  <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 whitespace-nowrap">
                                    {result.ticket_number}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-primary/10 text-primary border border-primary/10 whitespace-nowrap">
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
          <div className="pb-24 md:pb-0">
            {/* Mobile Header & Tabs */}
            <div className="md:hidden fixed inset-0 z-[60] bg-[#F5F5F5] dark:bg-neutral-950 flex flex-col h-[100dvh] overscroll-none">
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => router.back()} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    儲值紀錄
                  </span>
                </div>
              </div>

              {/* Mobile Sticky Tabs (Using Tabs Component style) */}
              <div className="sticky top-0 z-30 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
                <div className="max-w-7xl mx-auto space-y-2 pt-0 pb-0">
                    <Tabs 
                      key={activeTopupTimeTab} // Force re-render on tab change to ensure underline updates
                      defaultValue={activeTopupTimeTab}
                      value={activeTopupTimeTab} 
                      onValueChange={(val) => setActiveTopupTimeTab(val as 'today' | '7days' | '30days')}
                      className="w-full"
                    >
                      <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b-0 pb-0">
                        {[
                          { id: 'today', label: '今天' },
                          { id: '7days', label: '近7天' },
                          { id: '30days', label: '近30天' }
                        ].map((tab) => (
                          <TabsTrigger key={tab.id} value={tab.id}>
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                </div>
              </div>

              {/* Mobile List Style (Unified 3-Layer Structure) */}
              <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-0 pb-24 bg-[#F5F5F5] dark:bg-neutral-950">
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
                                {new Date(item.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '/')}
                              </div>
                            </div>
                            
                            {/* Layer 2: Content Summary */}
                            <div className="flex items-center gap-2">
                                <div className="text-[14px] font-black text-neutral-900 dark:text-white leading-tight flex items-center gap-1.5">
                                  儲值 
                                  <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
                    <ProfileSectionHeader title="儲值紀錄" description="管理您的代幣儲值明細" />

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
                                {new Date(item.created_at).toLocaleString('zh-TW')}
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
                              <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
            <div className="md:hidden fixed inset-0 z-[60] bg-[#F5F5F5] dark:bg-neutral-950 flex flex-col">
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => router.back()} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    我的關注
                  </span>
                </div>
              </div>

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

              <div className="flex-1 overflow-y-auto px-2 pt-2 pb-24 bg-[#F5F5F5] dark:bg-neutral-950">
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
                      color: 'text-emerald-700 dark:text-emerald-300',
                      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
                      border: 'border-emerald-100 dark:border-emerald-900/30',
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
                      description="您感興趣的商品清單"
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
                                  src={p.image || '/images/item.png'}
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
                              <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="object-contain" />
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
          <div className="pb-24 md:pb-0">
            {/* Mobile Header */}
            <div className="md:hidden fixed inset-0 z-[60] bg-[#F5F5F5] dark:bg-neutral-950 flex flex-col h-[100dvh] overscroll-none">
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => router.back()} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    我的優惠券
                  </span>
                </div>
                <button 
                  onClick={() => setIsCouponModalOpen(true)}
                  className="text-[13px] font-black text-primary px-3 py-1.5 bg-primary/5 rounded-lg border border-primary/10"
                >
                  輸入優惠代碼
                </button>
              </div>

              {/* Mobile List */}
              <div className="flex-1 overflow-y-auto bg-[#F5F5F5] dark:bg-neutral-950 pb-24">
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
                              {coupon.expiryDate ? `期限：${new Date(coupon.expiryDate).toLocaleDateString()}` : '無使用期限'}
                           </p>
                        </div>

                        <div className="flex-shrink-0 self-center">
                           <span className={cn(
                             "px-2 py-1 rounded-md text-[11px] font-black uppercase tracking-wider border",
                             coupon.status === 'unused' 
                               ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
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
                      color: 'text-emerald-700 dark:text-emerald-300',
                      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
                      border: 'border-emerald-100 dark:border-emerald-900/30',
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
                      description="查看與管理您的優惠券"
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
                              {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : '無期限'}
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
          <div className="pb-24 md:pb-0 bg-neutral-100 dark:bg-neutral-950 min-h-screen">
            {/* Mobile Header */}
            <div className="md:hidden fixed inset-0 z-[60] bg-neutral-100 dark:bg-neutral-950 flex flex-col h-[100dvh] overscroll-none">
              <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-2 h-[57px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => router.back()} className="text-neutral-900 dark:text-white -ml-2 p-2">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-[18px] font-black text-neutral-900 dark:text-white">
                    修改個人資訊
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="space-y-3 p-3">
                  {/* Info Group 1 */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
                    <div 
                      className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                      onClick={handleAvatarClick}
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
                                src={user?.avatar_url || '/images/avatar.png'} 
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
                  </div>

                  {/* Info Group 2 */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
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

                  {/* Info Group 3 */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
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
                    <div className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer">
                    <label className="text-[15px] text-neutral-800 dark:text-neutral-200">電子郵件</label>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[14px]", user?.email ? "text-neutral-900 dark:text-white" : "text-accent-red")}>
                        {user?.email || '立即設定'}
                      </span>
                      {/* <ChevronRight className="w-4 h-4 text-neutral-300" /> */}
                    </div>
                  </div>
                  <div 
                    className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                    onClick={() => {
                      const emailParam = user?.email ? `&email=${encodeURIComponent(user.email)}` : '';
                      router.push(`/forgot-password?from=${encodeURIComponent('/profile?tab=settings')}${emailParam}`);
                    }}
                  >
                    <label className="text-[15px] text-neutral-800 dark:text-neutral-200">修改密碼</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-neutral-400">修改</span>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
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
                </div>
              </div>
            </div>

            {/* Desktop View */}
            <div className="hidden md:block max-w-2xl mx-auto p-8">
              <div className="space-y-3">
                {/* Info Group 1 */}
                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
                  <div 
                    className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                    onClick={handleAvatarClick}
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
                              src={user?.avatar_url || '/images/avatar.png'} 
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
                </div>

                {/* Info Group 2 */}
                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
                  <div 
                    className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                    onClick={() => {
                      if (settingsForm.gender) return;
                      setTempGender('');
                      setShowEditGender(true);
                    }}
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

                {/* Info Group 3 */}
                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
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
                  <div className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer">
                    <label className="text-[15px] text-neutral-800 dark:text-neutral-200">電子郵件</label>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[14px]", user?.email ? "text-neutral-900 dark:text-white" : "text-accent-red")}>
                        {user?.email || '立即設定'}
                      </span>
                      {/* <ChevronRight className="w-4 h-4 text-neutral-300" /> */}
                    </div>
                  </div>
                  <div 
                    className="flex items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/50 cursor-pointer"
                    onClick={() => router.push('/update-password')}
                  >
                    <label className="text-[15px] text-neutral-800 dark:text-neutral-200">修改密碼</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-neutral-400">修改</span>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
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
                <div className="mt-6 px-4 md:px-0">
                  <button 
                    type="button" 
                    onClick={handleLogout}
                    className="w-full bg-white dark:bg-neutral-800 text-neutral-500 h-11 rounded-lg border border-neutral-200 dark:border-neutral-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-[15px]"
                  >
                    登出
                  </button>
                </div>
              </div>
            </div>

            {isPhoneBindModalOpen && (
              <div className="fixed inset-0 z-[90] bg-white dark:bg-neutral-950">
                <div className="fixed top-0 left-0 right-0 h-[56px] flex items-center justify-center bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800 z-[95] px-4">
                  <button
                    onClick={() => setIsPhoneBindModalOpen(false)}
                    className="absolute left-4 p-2 -ml-2 text-neutral-900 dark:text-white"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <h1 className="text-lg font-black text-neutral-900 dark:text-white">手機驗證</h1>
                </div>

                <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col relative">
                  <div className="flex-1 flex flex-col justify-start items-center pt-[88px] px-6 pb-8">
                    <div className="w-full max-w-sm">
                      {phoneStep === 'input' ? (
                        <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="mb-8">
                            <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-2">手機門號</label>
                            <input
                              name="phone"
                              type="tel"
                              placeholder="09xxxxxxxx"
                              className="border-0 border-b border-neutral-200 dark:border-neutral-700 rounded-none bg-transparent focus:ring-0 focus:border-primary focus:bg-transparent h-12 text-base placeholder:text-neutral-400 w-full font-black text-neutral-900 dark:text-white"
                              value={phoneNumberInput}
                              onChange={(e) => setPhoneNumberInput(e.target.value)}
                              autoFocus
                            />
                          </div>

                          <SolidButton
                            onClick={handleSendPhoneOtp}
                            isLoading={isSendingPhoneOtp}
                            disabled={isSendingPhoneOtp || !phoneNumberInput.trim()}
                          >
                            下一步
                          </SolidButton>
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

                          <SolidButton
                            onClick={handleVerifyPhoneOtp}
                            isLoading={isVerifyingPhoneOtp}
                            disabled={isVerifyingPhoneOtp || phoneOtp.replace(/\D/g, '').length < 6}
                          >
                            確認驗證
                          </SolidButton>

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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20 transition-colors">
      <div className={cn(
        "max-w-7xl mx-auto w-full",
        activeTab === 'settings' ? "p-0" : "px-0 sm:px-6 lg:px-8 pt-0 sm:pt-6"
      )}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-8 items-start relative">
          
          {/* 1. Mobile Menu View (Only shown on mobile when no tab is active) */}
          <div className={cn("md:hidden col-span-1 space-y-2.5", isMobileDetailOpen && "hidden")}>
            {/* Mobile Header - RankingTop Style */}
            <div className="relative w-full aspect-[375/195] select-none">
              {/* Background */}
              <div className="absolute inset-0 w-full h-full">
                <Image 
                  src="/images/profile/topbg.png" 
                  alt="Background" 
                  fill 
                  className="object-cover pointer-events-none" 
                  priority
                  unoptimized
                />
              </div>

              {/* Profile Info Section */}
              <div className="absolute top-[8%] left-0 w-full px-[4.2%] flex items-center justify-between">
                <div className="flex-1 flex items-center gap-[2.1%] min-w-0">
                  {/* Avatar */}
                  <div className="relative shrink-0 w-[16%] aspect-square rounded-full overflow-hidden border-2 border-white/20">
                    {isGuest ? (
                      <div className="w-full h-full bg-neutral-200 flex items-center justify-center">
                        <User className="w-1/2 h-1/2 text-neutral-400" />
                      </div>
                    ) : (
                      <Image 
                        src={user.avatar_url || '/images/avatar.png'} 
                        alt={user.name || 'User'} 
                        fill 
                        className="object-cover" 
                        unoptimized
                      />
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
                        <CheckCircle2 className="w-[18px] h-[18px] text-emerald-200 drop-shadow-sm shrink-0" />
                      )}
                      {/* Badge Image */}
                      {!isGuest && user.is_phone_verified && (
                        <div className="relative shrink-0 w-[24px] h-[24px]">
                          <Image src="/images/profile/badge.png" alt="Badge" fill className="object-contain" unoptimized />
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
                        <span className="text-[14px] font-bold text-[#ffe600]">{user.invite_code || '-'}</span>
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
                        {!isGuest && !user.is_phone_verified && (
                          <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-accent-red border-2 border-white/20 rounded-full" />
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
                          <Image src="/images/gcoin.png" alt="Token" fill className="object-contain" unoptimized />
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
                        className="h-7 px-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <span className="text-xs text-white font-bold">儲值紀錄</span>
                        <ChevronRight className="w-3 h-3 text-white/70" />
                      </button>
                    </div>
                    
                    {/* Bottom Row: Amount (Left) and Topup (Right) */}
                    <div className="flex justify-between items-end">
                      <div className="text-[36px] leading-none font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-[#ffa800] to-white drop-shadow-sm font-amount">
                        {isGuest ? '0' : (user.tokens?.toLocaleString() || '0')}
                      </div>
                      
                      <Link
                        href={isGuest ? loginHref : '/topup'}
                        className="h-8 px-4 bg-[#ffd900] rounded-full flex items-center justify-center text-[#282828] text-sm font-black shadow-lg shadow-yellow-500/20 active:scale-95 transition-transform"
                      >
                        儲值
                      </Link>
                    </div>
                  </div>
                </div>
            </div>

            {flags.sell && (
              <div className="mx-2 mt-2 bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-3">
                  <div className="text-[16px] font-black text-neutral-900 dark:text-white">購買清單</div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isGuest) {
                        router.push(loginHref);
                        return;
                      }
                      router.push('/purchases');
                    }}
                    className="text-[12px] font-black text-neutral-600 dark:text-neutral-300 flex items-center gap-1"
                  >
                    查看全部
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 px-2.5 pb-3">
                  {[
                    { key: 'to_pay', label: '待付款', icon: Wallet, count: purchaseCounts.toPay },
                    { key: 'to_ship', label: '待出貨', icon: Box, count: purchaseCounts.toShip },
                    { key: 'to_receive', label: '待收貨', icon: Truck, count: purchaseCounts.toReceive },
                    { key: 'review', label: '評價', icon: Star, count: purchaseCounts.review },
                  ].map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => {
                        if (isGuest) {
                          router.push(loginHref);
                          return;
                        }
                        router.push(`/purchases?tab=${it.key}`);
                      }}
                      className="relative py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700"
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="relative">
                          <it.icon className="w-6 h-6 text-neutral-900 dark:text-white stroke-[1.5]" />
                          {it.count > 0 && (
                            <div className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black grid place-items-center">
                              {it.count > 99 ? '99+' : it.count}
                            </div>
                          )}
                        </div>
                        <div className="text-[12px] font-black text-neutral-700 dark:text-neutral-200">{it.label}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                ...(flags.sell
                  ? ([
                      {
                        id: 'sell-manage',
                        label: '販售管理',
                        icon: Box,
                        color: 'text-accent-red',
                        onClick: () => router.push('/sell/manage'),
                      },
                    ] as any[])
                  : []),
                ...(flags.market
                  ? ([
                      {
                        id: 'market',
                        label: '交易所管理',
                        icon: Store,
                        color: 'text-purple-500',
                        onClick: () => handleTabChange('market'),
                      },
                    ] as any[])
                  : []),
                ...(flags.exchange
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
              ].map((item) => (
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
                  <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 group-hover:translate-x-1 transition-all" />
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

          {/* 2. Mobile Detail View (Only shown on mobile when a tab is active) */}
          <div className={cn("md:hidden col-span-1", !isMobileDetailOpen && "hidden")}>
          <div className="bg-white dark:bg-neutral-900 min-h-[500px] overflow-hidden">
              {renderTabContent()}
            </div>
          </div>

          {/* 3. Desktop View (Hidden on mobile) */}
          <div className="hidden md:grid md:col-span-12 grid-cols-12 gap-4 lg:gap-6 w-full items-start">
            <div className="md:col-span-3 lg:col-span-3 space-y-3 sticky top-24">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3">
              <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-shrink-0">
                      {isGuest ? (
                        <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl border-2 border-neutral-50 dark:border-neutral-800 shadow-soft bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
                          <User className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl overflow-hidden border-2 border-neutral-50 dark:border-neutral-800 shadow-soft p-0.5 bg-white dark:bg-neutral-800">
                          <Image 
                            src={user.avatar_url || 'https://github.com/shadcn.png'} 
                            alt={user.name || 'User'} 
                            fill 
                            className="rounded-[8px] object-cover" 
                            unoptimized
                          />
                        </div>
                      )}
                      {!isGuest && (
                        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-accent-emerald border-2 border-white dark:border-neutral-900 rounded-full shadow-sm" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isGuest ? (
                          <Link
                            href={loginHref}
                            className="text-sm lg:text-base font-black text-primary truncate tracking-tight underline decoration-dotted underline-offset-2"
                          >
                            登入後顯示
                          </Link>
                        ) : (
                          <>
                            <h2 className="text-sm lg:text-base font-black text-neutral-900 dark:text-white truncate tracking-tight">
                              {user.name}
                            </h2>
                            {user.is_phone_verified && (
                              <CheckCircle2 className="w-3 h-3 text-accent-emerald flex-shrink-0" />
                            )}
                          </>
                        )}
                      </div>
                      {!isGuest && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <div
                            className="flex items-center gap-1.5 cursor-pointer group/invite"
                            onClick={() => {
                              if (user.invite_code) {
                                navigator.clipboard.writeText(user.invite_code);
                                toast.success('邀請碼已複製');
                              }
                            }}
                          >
                            <span className="text-[13px] font-black text-neutral-400 uppercase tracking-wider">邀請碼</span>
                            <span className="text-[13px] font-mono font-black text-primary group-hover/invite:text-primary/80 transition-colors">
                              {user.invite_code || '-'}
                            </span>
                            <Copy className="w-3.5 h-3.5 text-neutral-300 group-hover/invite:text-primary transition-colors" />
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Settings Icon */}
                    <button
                      onClick={() => handleTabChange('settings')}
                      className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 rounded-full transition-all"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded-lg border border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center gap-1.5">
                      <Image src="/images/gcoin.png" alt="G" width={24} height={24} className="object-contain" />
                      {isGuest ? (
                        <Link
                          href={loginHref}
                          className="text-[13px] font-black text-primary underline decoration-dotted underline-offset-2"
                        >
                          登入後顯示
                        </Link>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-lg font-black text-accent-red font-amount leading-none tracking-tighter">
                            {user.tokens?.toLocaleString() || 0}
                          </span>
                        </div>
                      )}
                    </div>
                    <Link
                      href={isGuest ? loginHref : '/topup'}
                      className="text-[13px] font-black text-primary hover:text-primary/80 transition-colors uppercase tracking-widest bg-white dark:bg-neutral-800 px-2 py-1 rounded border border-primary/10 shadow-sm self-start"
                    >
                      儲值
                    </Link>
                  </div>
                </div>
              </div>
              
              {flags.sell && (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 overflow-hidden">
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (isGuest) {
                          router.push(loginHref);
                          return;
                        }
                        router.push('/sell/manage');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group text-left text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                    >
                      <Box className="w-5 h-5 stroke-[2.5] text-neutral-300 group-hover:text-primary transition-colors" />
                      <span className="truncate">販售管理</span>
                      <ChevronRight className="ml-auto w-4 h-4 transition-transform hidden sm:block text-neutral-200 group-hover:text-neutral-400" />
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 overflow-hidden">
              <div className="space-y-1">
                {navItems.filter(item => item.id !== 'check-in' && item.id !== 'settings' && item.id !== 'market').map((item) => (
                  <button 
                    key={item.id} 
                    onClick={() => {
                      if (isGuest) {
                        router.push(loginHref);
                        return;
                      }
                      handleTabChange(item.id as TabType);
                    }} 
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group text-left", 
                      activeTab === item.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 stroke-[2.5]", activeTab === item.id ? "text-white" : "text-neutral-300 group-hover:text-primary transition-colors")} />
                    <span className="truncate">{item.label}</span>
                    <ChevronRight className={cn("ml-auto w-4 h-4 transition-transform hidden sm:block", activeTab === item.id ? "text-white/50" : "text-neutral-200 group-hover:text-neutral-400")} />
                  </button>
                ))}
              </div>
            </div>

              <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 overflow-hidden">
                <div className="space-y-1">
                  {flags.market && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isGuest) {
                          router.push(loginHref);
                          return;
                        }
                        handleTabChange('market');
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group text-left",
                        activeTab === 'market'
                          ? "bg-primary text-white shadow-lg shadow-primary/20"
                          : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                      )}
                    >
                      <Store className={cn("w-5 h-5 stroke-[2.5]", activeTab === 'market' ? "text-white" : "text-neutral-300 group-hover:text-primary transition-colors")} />
                      <span className="truncate">交易所管理</span>
                      <ChevronRight className={cn("ml-auto w-4 h-4 transition-transform hidden sm:block", activeTab === 'market' ? "text-white/50" : "text-neutral-200 group-hover:text-neutral-400")} />
                    </button>
                  )}

                  {flags.exchange && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isGuest) {
                          router.push(loginHref);
                          return;
                        }
                        router.push('/exchange/manage');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all group text-left text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                    >
                      <RefreshCw className="w-5 h-5 stroke-[2.5] text-neutral-300 group-hover:text-primary transition-colors" />
                      <span className="truncate">交換管理</span>
                      <ChevronRight className="ml-auto w-4 h-4 transition-transform hidden sm:block text-neutral-200 group-hover:text-neutral-400" />
                    </button>
                  )}
                </div>
              </div>
          </div>
          <div className="md:col-span-9 lg:col-span-9 w-full">
              <div className="bg-white dark:bg-neutral-900 rounded-2xl lg:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 min-h-[600px] lg:min-h-[700px] overflow-hidden">
                {renderTabContent()}
              </div>
            </div>
          </div>

        </div>
      </div>
      {/* Edit Nickname Modal (Alert Style) */}
      <AlertModal
        isOpen={showEditNickname}
        onClose={() => setShowEditNickname(false)}
        title="編輯名稱"
        variant="default"
      >
        <div className="mb-2">
          <input  
            value={settingsForm.nickname}
            onChange={e => setSettingsForm({...settingsForm, nickname: e.target.value})}
            className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            placeholder="輸入名稱"
            autoFocus
          />
        </div>
        <p className="text-xs text-neutral-400 mb-6">名稱長度限制 2-20 個字元</p>

        <button
          onClick={() => handleUpdateProfile('nickname', settingsForm.nickname)}
          disabled={isUpdatingProfile || !settingsForm.nickname}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
        </button>
      </AlertModal>

      {/* Title Picker Modal */}
      <AlertModal
        isOpen={showTitlePicker}
        onClose={() => setShowTitlePicker(false)}
        title="選擇稱號"
        variant="default"
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
        <button
          onClick={() => setShowTitlePicker(false)}
          className="w-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 h-[44px] rounded-lg font-bold text-[15px] active:scale-[0.98] transition-all"
        >
          關閉
        </button>
      </AlertModal>

      {/* Edit Gender Modal */}
      <AlertModal
        isOpen={showEditGender}
        onClose={() => {
          // Reset temp gender when closing without saving
          setTempGender('');
          setShowEditGender(false);
        }}
        title="設定性別"
        variant="default"
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
      </AlertModal>

      {/* Edit Birthday Modal */}
      <AlertModal
        isOpen={showEditBirthday}
        onClose={() => {
          setTempBirthday(null);
          setShowEditBirthday(false);
        }}
        title="設定生日"
        variant="default"
      >
        <div className="mb-4">
          <p className="text-sm text-neutral-500 mb-2">生日設定後將無法修改，請確認輸入正確。</p>
          <div className="relative w-full">
            <style>{datePickerStyles}</style>
            {isMobile ? (
              <input
                type="date"
                value={tempBirthday ? tempBirthday.toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const selectedDate = new Date(e.target.value);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
                    
                    if (selectedDate > today) {
                      toast.error('不能選擇未來日期');
                      // Reset to empty or keep previous valid date? 
                      // Let's reset to null to force user to pick again
                      setTempBirthday(null);
                      // Also reset the input value visually if possible, though controlled input handles it via value prop
                    } else {
                      setTempBirthday(selectedDate);
                    }
                  } else {
                    setTempBirthday(null);
                  }
                }}
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                style={{ height: '48px' }}
              />
            ) : (
              <DatePicker
                selected={tempBirthday}
                onChange={(date: Date | null) => setTempBirthday(date)}
                dateFormat="yyyy/MM/dd"
                maxDate={new Date()}
                placeholderText="年 / 月 / 日"
                locale="zh-TW"
                showYearDropdown
                scrollableYearDropdown
                yearDropdownItemNumber={100}
                showMonthDropdown
                withPortal={false} 
                popperProps={{
                  strategy: "fixed", 
                }}
                customInput={
                  <input 
                    className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                    readOnly 
                  />
                }
              />
            )}
          </div>
        </div>
        <button
          onClick={() => {
            if (tempBirthday) {
              // Format date to YYYY-MM-DD
              const year = tempBirthday.getFullYear();
              const month = String(tempBirthday.getMonth() + 1).padStart(2, '0');
              const day = String(tempBirthday.getDate()).padStart(2, '0');
              const dateString = `${year}-${month}-${day}`;
              handleUpdateProfile('birthday', dateString);
            }
          }}
          disabled={isUpdatingProfile || !tempBirthday}
          className="w-full bg-primary text-white h-[44px] rounded-lg font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '確認設定'}
        </button>
      </AlertModal>

      {/* Logout Confirm Modal */}
      <AlertModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="登出確認"
        description="確定要登出您的帳號嗎？"
        variant="confirm"
        confirmText="確認登出"
        onConfirm={async () => {
          await logout();
          setShowLogoutConfirm(false);
        }}
      />

      {/* Address Book Modal (Slide-in) */}
      <AnimatePresence>
        {showAddressBook && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col"
          >
            {/* Header */}
            <div className="bg-white dark:bg-neutral-900 h-[57px] flex items-center px-2 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
              <button 
                onClick={() => setShowAddressBook(false)} 
                className="p-2 -ml-2 text-primary"
              >
                <ChevronLeft className="w-6 h-6 stroke-[3]" />
              </button>
              <h2 className="flex-1 text-center text-[17px] font-medium text-neutral-900 dark:text-white mr-8">我的地址</h2>
            </div>

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
            <div className="flex-1 overflow-y-auto pt-3">
              
              {/* Only show Home Address */}
                {(settingsForm.recipientName && settingsForm.recipientPhone && settingsForm.recipientAddress) ? (
                  <div className="bg-white dark:bg-neutral-900 mb-3">
                    <div className="p-4 flex gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-medium text-neutral-900 dark:text-white">{settingsForm.recipientName}</span>
                          <span className="text-[13px] text-neutral-500 border-l border-neutral-300 pl-2 ml-1">
                            {maskPhoneForDisplay(settingsForm.recipientPhone)}
                          </span>
                        </div>
                        <p className="text-[13px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                          {settingsForm.recipientAddress}
                        </p>
                        <div className="pt-1">
                          <span className="inline-block px-1 py-[1px] border border-primary text-primary text-[10px] rounded-[2px]">預設</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowEditRecipient(true)}
                        className="text-[13px] font-medium text-primary self-start shrink-0 ml-2"
                      >
                        編輯
                      </button>
                    </div>
                    <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 mx-4" />
                  </div>
                ) : (
                  <div className="p-8 text-center text-neutral-400 text-sm">
                    尚未設定收件地址
                  </div>
                )}
            </div>

            {/* Bottom Add Button */}
            <div className="bg-white dark:bg-neutral-900 p-4 pb-safe border-t border-neutral-100 dark:border-neutral-800">
              <button
                onClick={() => {
                   if (!settingsForm.recipientName) {
                     setShowEditRecipient(true);
                   } else {
                     toast.error('目前僅支援設定一組地址');
                   }
                }}
                className="w-full h-[44px] border border-primary text-primary rounded-[4px] flex items-center justify-center gap-2 text-[15px] font-medium active:bg-primary/5 transition-colors"
              >
                <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                  <span className="text-sm leading-none -mt-0.5">+</span>
                </div>
                新增地址
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit CVS Modal */}
      <AlertModal
        isOpen={showEditCvs}
        onClose={() => setShowEditCvs(false)}
        title="設定超商取貨"
        variant="default"
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
                  { id: 'OKMART', label: 'OK超商' }
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
                          const form = document.createElement('form');
                          form.method = 'POST';
                          const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
                          form.action = `${baseUrl}/api/logistics/map`;
                          const input = document.createElement('input');
                          input.name = 'logisticsSubType';
                          input.value = logisticsSubType;
                          input.type = 'hidden';
                          form.appendChild(input);
                          
                          // Add action for profile update
                          const actionInput = document.createElement('input');
                          actionInput.name = 'action';
                          actionInput.value = 'update_profile_cvs';
                          actionInput.type = 'hidden';
                          form.appendChild(actionInput);

                          document.body.appendChild(form);
                          form.submit();
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
                          const form = document.createElement('form');
                          form.method = 'POST';
                          const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
                          form.action = `${baseUrl}/api/logistics/map`;
                          const input = document.createElement('input');
                          input.name = 'logisticsSubType';
                          input.value = logisticsSubType;
                          input.type = 'hidden';
                          form.appendChild(input);

                          // Add action for profile update
                          const actionInput = document.createElement('input');
                          actionInput.name = 'action';
                          actionInput.value = 'update_profile_cvs';
                          actionInput.type = 'hidden';
                          form.appendChild(actionInput);

                          document.body.appendChild(form);
                          form.submit();
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
                 className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                 placeholder="輸入代號"
                 readOnly
               />
            </div>
            <div className="col-span-1">
               <label className="text-xs text-neutral-500 mb-1 block">門市名稱</label>
               <input
                 value={settingsForm.cvsStoreName}
                 onChange={(e) => setSettingsForm({ ...settingsForm, cvsStoreName: e.target.value })}
                 className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
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
              className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="輸入門市地址"
              readOnly
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">取貨人姓名</label>
            <input
              value={settingsForm.cvsRecipientName}
              onChange={(e) => setSettingsForm({ ...settingsForm, cvsRecipientName: e.target.value })}
              className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="請填寫真實姓名"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">取貨人電話</label>
            <input
              value={settingsForm.cvsRecipientPhone}
              onChange={(e) => setSettingsForm({ ...settingsForm, cvsRecipientPhone: e.target.value })}
              className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2.5 text-[15px] font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="請填寫手機號碼"
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
      </AlertModal>

      {/* Edit Recipient Modal (Slide-in) */}
      <AnimatePresence>
        {showEditRecipient && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col"
          >
            {/* Header */}
            <div className="bg-white dark:bg-neutral-900 h-[57px] flex items-center px-2 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
              <button 
                onClick={() => setShowEditRecipient(false)} 
                className="p-2 -ml-2 text-neutral-900 dark:text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="flex-1 text-center text-[17px] font-medium text-neutral-900 dark:text-white mr-8">編輯地址</h2>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="bg-white dark:bg-neutral-900 mt-3 px-4">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  <div className="py-1">
                    <input 
                      value={settingsForm.recipientName}
                      onChange={e => setSettingsForm({...settingsForm, recipientName: e.target.value})}
                      className="w-full bg-transparent border-none py-3 px-0 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-0"
                      placeholder="收件人姓名"
                    />
                  </div>
                  <div className="py-1">
                    <input 
                      value={settingsForm.recipientPhone}
                      onChange={e => setSettingsForm({...settingsForm, recipientPhone: e.target.value})}
                      className="w-full bg-transparent border-none py-3 px-0 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-0"
                      placeholder="手機號碼"
                      type="tel"
                    />
                  </div>
                  <div className="py-1">
                    <input 
                      value={settingsForm.recipientAddress}
                      onChange={e => setSettingsForm({...settingsForm, recipientAddress: e.target.value})}
                      className="w-full bg-transparent border-none py-3 px-0 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-0"
                      placeholder="詳細地址 (地區、街道、門牌號碼)"
                    />
                  </div>
                </div>
              </div>
              
              {/* Default Toggle (Visual only for now) */}
              <div className="bg-white dark:bg-neutral-900 mt-3 px-4 py-3 flex items-center justify-between">
                <span className="text-[15px] text-neutral-900 dark:text-white">設為預設地址</span>
                <div className="w-11 h-6 bg-emerald-500 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 pb-safe bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
              <button
                onClick={() => handleUpdateProfile('recipient', '')}
                disabled={isUpdatingProfile || !settingsForm.recipientName || !settingsForm.recipientPhone || !settingsForm.recipientAddress}
                className="w-full bg-primary text-white h-[44px] rounded-[4px] font-medium text-[15px] shadow-sm active:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from  "react-datepicker";
import { zhTW } from 'date-fns/locale/zh-TW';

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

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  );
}
