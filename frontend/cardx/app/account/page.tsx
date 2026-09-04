"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard, SurfaceRowLink } from "@/cardx/components/ui/Kit";
import { formatMoney } from "@/cardx/components/ui/money";
import { mockMarketListings, mockPacks, mockTrades } from "@/cardx/lib/mock/home";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";

type SellerListingStatus = "active" | "inactive" | "sold";
type SellerListing = {
  refId: string;
  status: SellerListingStatus;
  priceAmount: number;
  currency: "TWD";
  createdAt: number;
  updatedAt: number;
};

const SELLER_LISTINGS_KEY = "cardx.seller.listings.v1";

type CreatorPackStatus = "active" | "inactive" | "sold_out";
type CreatorPack = {
  packId: string;
  status: CreatorPackStatus;
  priceAmount: number;
  currency: "TWD";
  inventory: number;
  soldCount: number;
  createdAt: number;
  updatedAt: number;
};

const CREATOR_PACKS_KEY = "cardx.creator.packs.v1";

type SellerFulfillmentStatus =
  | "paid"
  | "packing"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refund_pending"
  | "dispute_opened";

type SellerFulfillmentKind = "market" | "pack";

type SellerFulfillment = {
  fulfillmentId: string;
  kind: SellerFulfillmentKind;
  refId: string;
  title: string;
  amount: number;
  currency: "TWD";
  status: SellerFulfillmentStatus;
  trackingNumber?: string;
  updatedAtIso: string;
};

const SELLER_FULFILLMENT_KEY = "cardx.seller.fulfillment.v1";

type MyTradeStatus = "chatting" | "matching" | "completed" | "cancelled";
type MyTrade = {
  tradeId: string;
  status: MyTradeStatus;
  updatedAtIso: string;
};

const MY_TRADES_KEY = "cardx.trades.my.v1";

function UiIcon({ href, size = 18, opacity = 0.92 }: { href: string; size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ opacity }}>
      <use href={href} />
    </svg>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParamRaw = (searchParams?.get("tab") ?? "").trim().toLowerCase();
  const user = useMemo(
    () => ({
      handle: "@coddy20123",
      level: "Silver",
      points: 18420,
      favorites: 12,
      recent: 7,
    }),
    []
  );
  const [authUser, setAuthUser] = useState<{ provider: "google" | "email"; email?: string } | null>(null);
  const [kycStatus, setKycStatus] = useState<"none" | "reviewing" | "approved" | "rejected">("none");
  const [addressCount, setAddressCount] = useState(0);
  const [defaultAddress, setDefaultAddress] = useState<{ name: string; addressLine: string } | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [openingCount, setOpeningCount] = useState(0);
  const [privacyHideProfile, setPrivacyHideProfile] = useState(false);
  const [privacyHideStats, setPrivacyHideStats] = useState(true);
  const [privacyHideHistory, setPrivacyHideHistory] = useState(false);
  const [privacyHideRewards, setPrivacyHideRewards] = useState(false);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);
  type TabKey = "overview" | "orders" | "openings" | "trades" | "seller";
  const [recentOrders, setRecentOrders] = useState<Array<{ id: string; title: string; kind: "order" | "opening"; status?: string }>>([]);
  const [sellerListings, setSellerListings] = useState<SellerListing[]>([]);
  const [listingFilter, setListingFilter] = useState<"all" | SellerListingStatus>("all");
  const [myTrades, setMyTrades] = useState<MyTrade[]>([]);
  const [tradeFilter, setTradeFilter] = useState<"all" | MyTradeStatus>("all");
  const [creatorPacks, setCreatorPacks] = useState<CreatorPack[]>([]);
  const [packFilter, setPackFilter] = useState<"all" | CreatorPackStatus>("all");
  const [sellMode, setSellMode] = useState<"market" | "packs">("market");
  const [sellerFulfillment, setSellerFulfillment] = useState<SellerFulfillment[]>([]);
  const [fulfillmentFilter, setFulfillmentFilter] = useState<
    "all" | "to_ship" | "in_transit" | "completed" | "after_sales"
  >("all");
  const [buyerFilter, setBuyerFilter] = useState<"all" | "to_pay" | "to_ship" | "to_receive" | "completed" | "after_sales">("all");
  const [openingFilter, setOpeningFilter] = useState<"all" | "to_ship" | "to_receive" | "completed" | "after_sales">("all");
  const [manageMenu, setManageMenu] = useState<{ type: "listing" | "pack" | "trade" | "fulfillment"; id: string } | null>(null);
  const [editModal, setEditModal] = useState<
    | { kind: "listing"; id: string; price: string }
    | { kind: "pack"; id: string; price: string; inventory: string }
    | null
  >(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordNext2, setPasswordNext2] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaBusy, setTwoFaBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem("cardx.security.2fa.enabled");
        setTwoFaEnabled(raw === "1");
      } catch {
        setTwoFaEnabled(false);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!manageMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-cardx-menu="1"]')) return;
      setManageMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setManageMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [manageMenu]);

  useEffect(() => {
    if (!editModal) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-cardx-modal="1"]')) return;
      setEditModal(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditModal(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editModal]);

  const sellerToShipCount = useMemo(() => sellerFulfillment.filter((x) => x.status === "paid" || x.status === "packing").length, [sellerFulfillment]);
  const listingCounts = useMemo(() => {
    const active = sellerListings.filter((x) => x.status === "active").length;
    const inactive = sellerListings.filter((x) => x.status === "inactive").length;
    const sold = sellerListings.filter((x) => x.status === "sold").length;
    return { all: sellerListings.length, active, inactive, sold };
  }, [sellerListings]);

  const packCounts = useMemo(() => {
    const active = creatorPacks.filter((x) => x.status === "active").length;
    const inactive = creatorPacks.filter((x) => x.status === "inactive").length;
    const soldOut = creatorPacks.filter((x) => x.status === "sold_out").length;
    return { all: creatorPacks.length, active, inactive, soldOut };
  }, [creatorPacks]);

  const tradeCounts = useMemo(() => {
    const chatting = myTrades.filter((x) => x.status === "chatting").length;
    const matching = myTrades.filter((x) => x.status === "matching").length;
    const completed = myTrades.filter((x) => x.status === "completed").length;
    const cancelled = myTrades.filter((x) => x.status === "cancelled").length;
    return { all: myTrades.length, chatting, matching, completed, cancelled };
  }, [myTrades]);

  const fulfillmentCounts = useMemo(() => {
    const toShip = sellerFulfillment.filter((x) => x.status === "paid" || x.status === "packing").length;
    const inTransit = sellerFulfillment.filter((x) => x.status === "shipped" || x.status === "delivered").length;
    const completed = sellerFulfillment.filter((x) => x.status === "completed").length;
    const afterSales = sellerFulfillment.filter((x) => x.status === "refund_pending" || x.status === "dispute_opened" || x.status === "cancelled").length;
    return { all: sellerFulfillment.length, toShip, inTransit, completed, afterSales };
  }, [sellerFulfillment]);

  const tab = useMemo<TabKey>(() => {
    const s = (tabParamRaw ?? "").trim().toLowerCase();
    if (!s || s === "overview" || s === "account") return "overview";
    if (s === "orders") return "orders";
    if (s === "openings" || s === "opening" || s === "packs" || s === "pack") return "openings";
    if (s === "trades" || s === "trade") return "trades";
    if (s === "seller" || s === "sell" || s === "listings") return "seller";
    if (s === "security" || s === "settings" || s === "setting") return "overview";
    return "overview";
  }, [tabParamRaw]);

  function goTab(next: TabKey) {
    if (next === "overview") {
      router.replace("/account");
      return;
    }
    router.replace(`/account?tab=${next}`);
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("cardx.auth.user");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const provider = parsed.provider === "google" || parsed.provider === "email" ? (parsed.provider as "google" | "email") : null;
      if (!provider) return;
      const email = typeof parsed.email === "string" ? parsed.email : undefined;
      window.setTimeout(() => setAuthUser({ provider, email }), 0);
    } catch {}
  }, []);

  const canChangePassword = useMemo(() => authUser?.provider === "email", [authUser?.provider]);

  async function changePassword() {
    setPasswordMsg(null);
    const np = passwordNext.trim();
    const np2 = passwordNext2.trim();
    if (!canChangePassword) {
      setPasswordMsg({ tone: "error", text: "目前登入方式不支援變更密碼" });
      return;
    }
    if (np.length < 8) {
      setPasswordMsg({ tone: "error", text: "新密碼需至少 8 個字元" });
      return;
    }
    if (np !== np2) {
      setPasswordMsg({ tone: "error", text: "兩次輸入的新密碼不一致" });
      return;
    }

    setPasswordBusy(true);
    try {
      const sb = supabaseBrowser();
      if (!sb) {
        setPasswordMsg({ tone: "error", text: "目前未設定 Supabase，暫時無法變更密碼" });
        return;
      }
      const { error } = await sb.auth.updateUser({ password: np });
      if (error) {
        setPasswordMsg({ tone: "error", text: error.message });
        return;
      }
      setPasswordMsg({ tone: "success", text: "密碼已更新" });
      setPasswordOpen(false);
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordNext2("");
    } finally {
      setPasswordBusy(false);
    }
  }

  function toggleTwoFa() {
    setTwoFaBusy(true);
    try {
      setTwoFaEnabled((prev) => {
        const next = !prev;
        try {
          window.localStorage.setItem("cardx.security.2fa.enabled", next ? "1" : "0");
        } catch {}
        return next;
      });
    } finally {
      window.setTimeout(() => setTwoFaBusy(false), 150);
    }
  }

  function buyerBucket(kind: "order" | "opening", status?: string) {
    const s = (status ?? "").toLowerCase();
    if (kind === "opening") {
      if (s === "created" || s === "payment_pending") return "to_ship" as const;
      if (s === "paid" || s === "packing" || s === "opened") return "to_ship" as const;
      if (s === "shipped" || s === "delivered") return "to_receive" as const;
      if (s === "completed") return "completed" as const;
      if (s === "refund_pending" || s === "refunded" || s === "dispute_open" || s === "dispute_resolved" || s === "canceled") return "after_sales" as const;
      return "all" as const;
    }
    if (s === "created" || s === "payment_pending") return "to_pay" as const;
    if (s === "paid" || s === "packing" || s === "opened") return "to_ship" as const;
    if (s === "shipped" || s === "delivered") return "to_receive" as const;
    if (s === "completed") return "completed" as const;
    if (s === "refund_pending" || s === "refunded" || s === "dispute_open" || s === "dispute_resolved") return "after_sales" as const;
    if (s === "canceled") return "after_sales" as const;
    return "all" as const;
  }

  function buyerStatusLabel(kind: "order" | "opening", status?: string) {
    const s = (status ?? "").toLowerCase();
    if (kind === "opening" && (s === "created" || s === "payment_pending")) return "待出貨";
    if (kind === "order" && (s === "created" || s === "payment_pending")) return "待付款";
    if (s === "paid" || s === "packing" || s === "opened") return "待出貨";
    if (s === "shipped") return "運送中";
    if (s === "delivered") return "待收貨";
    if (s === "completed") return "已完成";
    if (s === "refund_pending" || s === "refunded") return "退款中";
    if (s === "dispute_open" || s === "dispute_resolved") return "爭議";
    if (kind === "opening" && s === "canceled") return "已取消";
    if (kind === "order" && s === "canceled") return "已取消";
    return status ?? "";
  }

  const filteredRecentOrders = useMemo(() => {
    const list = recentOrders.filter((x) => x.kind === "order");
    if (buyerFilter === "all") return list;
    return list.filter((x) => buyerBucket(x.kind, x.status) === buyerFilter);
  }, [buyerFilter, recentOrders]);

  const orderBucketCounts = useMemo(() => {
    const ordersOnly = recentOrders.filter((x) => x.kind === "order");
    const counts = { all: ordersOnly.length, to_pay: 0, to_ship: 0, to_receive: 0, completed: 0, after_sales: 0 };
    for (const x of ordersOnly) {
      const b = buyerBucket("order", x.status);
      if (b === "to_pay") counts.to_pay += 1;
      if (b === "to_ship") counts.to_ship += 1;
      if (b === "to_receive") counts.to_receive += 1;
      if (b === "completed") counts.completed += 1;
      if (b === "after_sales") counts.after_sales += 1;
    }
    return counts;
  }, [recentOrders]);

  const recentOpenings = useMemo(() => recentOrders.filter((x) => x.kind === "opening"), [recentOrders]);

  const filteredOpenings = useMemo(() => {
    if (openingFilter === "all") return recentOpenings;
    return recentOpenings.filter((x) => buyerBucket("opening", x.status) === openingFilter);
  }, [openingFilter, recentOpenings]);

  const openingBucketCounts = useMemo(() => {
    const counts = { all: recentOpenings.length, to_ship: 0, to_receive: 0, completed: 0, after_sales: 0 };
    for (const x of recentOpenings) {
      const b = buyerBucket("opening", x.status);
      if (b === "to_ship") counts.to_ship += 1;
      if (b === "to_receive") counts.to_receive += 1;
      if (b === "completed") counts.completed += 1;
      if (b === "after_sales") counts.after_sales += 1;
    }
    return counts;
  }, [recentOpenings]);

  useEffect(() => {
    function sync() {
      try {
        const rawKyc = window.localStorage.getItem("cardx.kyc.v1");
        const parsedKyc = rawKyc ? (JSON.parse(rawKyc) as unknown) : null;
        const status =
          parsedKyc && typeof parsedKyc === "object" && "status" in parsedKyc
            ? (parsedKyc as { status?: unknown }).status
            : undefined;
        const resolvedStatus =
          status === "reviewing" || status === "approved" || status === "rejected" ? status : ("none" as const);
        setKycStatus(resolvedStatus);
      } catch {
        setKycStatus("none");
      }

      try {
        const raw = window.localStorage.getItem("cardx.addresses.v1");
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(parsed)) {
          setAddressCount(parsed.length);
          const picked =
            parsed.find((a) => a && typeof a === "object" && (a as { isDefault?: unknown }).isDefault) ??
            parsed.find((a) => a && typeof a === "object");
          const name = picked && typeof (picked as { name?: unknown }).name === "string" ? ((picked as { name: string }).name as string) : "";
          const addressLine =
            picked && typeof (picked as { addressLine?: unknown }).addressLine === "string"
              ? ((picked as { addressLine: string }).addressLine as string)
              : "";
          setDefaultAddress(name && addressLine ? { name, addressLine } : null);
        } else {
          setAddressCount(0);
          setDefaultAddress(null);
        }
      } catch {
        setAddressCount(0);
        setDefaultAddress(null);
      }

      try {
        const rawOrders = window.localStorage.getItem("cardx.orders.v1");
        const rawOpenings = window.localStorage.getItem("cardx.openings.v1");
        const orders = rawOrders ? (JSON.parse(rawOrders) as unknown) : [];
        const openings = rawOpenings ? (JSON.parse(rawOpenings) as unknown) : [];
        const orderLen = Array.isArray(orders) ? orders.length : 0;
        const openingLen = Array.isArray(openings) ? openings.length : 0;
        setOrderCount(orderLen);
        setOpeningCount(openingLen);

        const merged: Array<{ id: string; title: string; kind: "order" | "opening"; status?: string }> = [];
        if (Array.isArray(orders)) {
          for (const o of orders.slice(0, 6)) {
            if (!o || typeof o !== "object") continue;
            const id = typeof (o as { id?: unknown }).id === "string" ? ((o as { id: string }).id as string) : "";
            const title = typeof (o as { title?: unknown }).title === "string" ? ((o as { title: string }).title as string) : "市集訂單";
            const status = typeof (o as { status?: unknown }).status === "string" ? ((o as { status: string }).status as string) : undefined;
            if (!id) continue;
            merged.push({ id, title, kind: "order", status });
          }
        }
        if (Array.isArray(openings)) {
          for (const x of openings.slice(0, 6)) {
            if (!x || typeof x !== "object") continue;
            const id = typeof (x as { id?: unknown }).id === "string" ? ((x as { id: string }).id as string) : "";
            const title = typeof (x as { title?: unknown }).title === "string" ? ((x as { title: string }).title as string) : "卡包開抽";
            const status = typeof (x as { status?: unknown }).status === "string" ? ((x as { status: string }).status as string) : undefined;
            if (!id) continue;
            merged.push({ id, title, kind: "opening", status });
          }
        }
        setRecentOrders(merged.slice(0, 6));
      } catch {
        setOrderCount(0);
        setOpeningCount(0);
        setRecentOrders([]);
      }

      try {
        const raw = window.localStorage.getItem(SELLER_LISTINGS_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(parsed)) {
          setSellerListings([]);
          return;
        }
        const cleaned: SellerListing[] = [];
        for (const x of parsed) {
          if (!x || typeof x !== "object") continue;
          const refId = typeof (x as { refId?: unknown }).refId === "string" ? ((x as { refId: string }).refId as string) : "";
          const status = (x as { status?: unknown }).status;
          const priceAmount = typeof (x as { priceAmount?: unknown }).priceAmount === "number" ? ((x as { priceAmount: number }).priceAmount as number) : NaN;
          const createdAt = typeof (x as { createdAt?: unknown }).createdAt === "number" ? ((x as { createdAt: number }).createdAt as number) : Date.now();
          const updatedAt = typeof (x as { updatedAt?: unknown }).updatedAt === "number" ? ((x as { updatedAt: number }).updatedAt as number) : createdAt;
          const resolvedStatus: SellerListingStatus = status === "active" || status === "inactive" || status === "sold" ? (status as SellerListingStatus) : "inactive";
          if (!refId || !Number.isFinite(priceAmount)) continue;
          cleaned.push({ refId, status: resolvedStatus, priceAmount, currency: "TWD", createdAt, updatedAt });
        }
        setSellerListings(cleaned.sort((a, b) => b.updatedAt - a.updatedAt));
      } catch {
        setSellerListings([]);
      }

      try {
        const raw = window.localStorage.getItem(CREATOR_PACKS_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(parsed)) {
          setCreatorPacks([]);
          return;
        }
        const cleaned: CreatorPack[] = [];
        for (const x of parsed) {
          if (!x || typeof x !== "object") continue;
          const packId = typeof (x as { packId?: unknown }).packId === "string" ? ((x as { packId: string }).packId as string) : "";
          const status = (x as { status?: unknown }).status;
          const priceAmount = typeof (x as { priceAmount?: unknown }).priceAmount === "number" ? ((x as { priceAmount: number }).priceAmount as number) : NaN;
          const inventory = typeof (x as { inventory?: unknown }).inventory === "number" ? ((x as { inventory: number }).inventory as number) : 0;
          const soldCount = typeof (x as { soldCount?: unknown }).soldCount === "number" ? ((x as { soldCount: number }).soldCount as number) : 0;
          const createdAt = typeof (x as { createdAt?: unknown }).createdAt === "number" ? ((x as { createdAt: number }).createdAt as number) : Date.now();
          const updatedAt = typeof (x as { updatedAt?: unknown }).updatedAt === "number" ? ((x as { updatedAt: number }).updatedAt as number) : createdAt;
          const resolvedStatus: CreatorPackStatus =
            status === "active" || status === "inactive" || status === "sold_out" ? (status as CreatorPackStatus) : "inactive";
          if (!packId || !Number.isFinite(priceAmount)) continue;
          cleaned.push({
            packId,
            status: resolvedStatus,
            priceAmount,
            currency: "TWD",
            inventory: Math.max(0, Math.floor(inventory)),
            soldCount: Math.max(0, Math.floor(soldCount)),
            createdAt,
            updatedAt,
          });
        }
        setCreatorPacks(cleaned.sort((a, b) => b.updatedAt - a.updatedAt));
      } catch {
        setCreatorPacks([]);
      }

      try {
        const raw = window.localStorage.getItem(SELLER_FULFILLMENT_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(parsed)) {
          setSellerFulfillment([]);
          return;
        }
        const cleaned: SellerFulfillment[] = [];
        for (const x of parsed) {
          if (!x || typeof x !== "object") continue;
          const fulfillmentId =
            typeof (x as { fulfillmentId?: unknown }).fulfillmentId === "string" ? ((x as { fulfillmentId: string }).fulfillmentId as string) : "";
          const kind = (x as { kind?: unknown }).kind;
          const refId = typeof (x as { refId?: unknown }).refId === "string" ? ((x as { refId: string }).refId as string) : "";
          const title = typeof (x as { title?: unknown }).title === "string" ? ((x as { title: string }).title as string) : "";
          const amount = typeof (x as { amount?: unknown }).amount === "number" ? ((x as { amount: number }).amount as number) : NaN;
          const status = (x as { status?: unknown }).status;
          const trackingNumber =
            typeof (x as { trackingNumber?: unknown }).trackingNumber === "string" ? ((x as { trackingNumber: string }).trackingNumber as string) : undefined;
          const updatedAtIso =
            typeof (x as { updatedAtIso?: unknown }).updatedAtIso === "string" ? ((x as { updatedAtIso: string }).updatedAtIso as string) : "";
          const resolvedKind: SellerFulfillmentKind = kind === "market" || kind === "pack" ? (kind as SellerFulfillmentKind) : "market";
          const resolvedStatus: SellerFulfillmentStatus =
            status === "paid" ||
            status === "packing" ||
            status === "shipped" ||
            status === "delivered" ||
            status === "completed" ||
            status === "cancelled" ||
            status === "refund_pending" ||
            status === "dispute_opened"
              ? (status as SellerFulfillmentStatus)
              : "paid";
          if (!fulfillmentId || !refId || !title || !Number.isFinite(amount)) continue;
          cleaned.push({
            fulfillmentId,
            kind: resolvedKind,
            refId,
            title,
            amount,
            currency: "TWD",
            status: resolvedStatus,
            trackingNumber,
            updatedAtIso: updatedAtIso || new Date().toISOString(),
          });
        }
        setSellerFulfillment(cleaned.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso)));
      } catch {
        setSellerFulfillment([]);
      }

      try {
        const raw = window.localStorage.getItem(MY_TRADES_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(parsed)) {
          setMyTrades([]);
          return;
        }
        const cleaned: MyTrade[] = [];
        for (const x of parsed) {
          if (!x || typeof x !== "object") continue;
          const tradeId = typeof (x as { tradeId?: unknown }).tradeId === "string" ? ((x as { tradeId: string }).tradeId as string) : "";
          const status = (x as { status?: unknown }).status;
          const updatedAtIso = typeof (x as { updatedAtIso?: unknown }).updatedAtIso === "string" ? ((x as { updatedAtIso: string }).updatedAtIso as string) : "";
          const resolvedStatus: MyTradeStatus =
            status === "chatting" || status === "matching" || status === "completed" || status === "cancelled" ? (status as MyTradeStatus) : "chatting";
          if (!tradeId) continue;
          cleaned.push({ tradeId, status: resolvedStatus, updatedAtIso: updatedAtIso || new Date().toISOString() });
        }
        setMyTrades(cleaned.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso)));
      } catch {
        setMyTrades([]);
      }
    }

    window.setTimeout(sync, 0);
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const displayName = authUser?.email ? (authUser.email.split("@")[0] ?? user.handle.replace(/^@/, "")) : user.handle.replace(/^@/, "");

  const tabs = useMemo(
    () => [
      { key: "overview", label: "總覽", icon: "#icon-bag-dollar" as const, href: "/account" },
      { key: "orders", label: "我的訂單", icon: "#icon-box" as const },
      { key: "openings", label: "卡包紀錄", icon: "#icon-gift" as const },
      { key: "trades", label: "交換紀錄", icon: "#icon-swap" as const },
      { key: "seller", label: "賣家管理", icon: "#icon-docs" as const },
    ],
    []
  );

  const activeTab = useMemo(() => tabs.find((t) => t.key === tab) ?? tabs[0]!, [tab, tabs]);


  function writeSellerListings(next: SellerListing[]) {
    try {
      window.localStorage.setItem(SELLER_LISTINGS_KEY, JSON.stringify(next));
    } catch {}
  }

  function writeCreatorPacks(next: CreatorPack[]) {
    try {
      window.localStorage.setItem(CREATOR_PACKS_KEY, JSON.stringify(next));
    } catch {}
  }

  function writeSellerFulfillment(next: SellerFulfillment[]) {
    try {
      window.localStorage.setItem(SELLER_FULFILLMENT_KEY, JSON.stringify(next));
    } catch {}
  }

  function writeMyTrades(next: MyTrade[]) {
    try {
      window.localStorage.setItem(MY_TRADES_KEY, JSON.stringify(next));
    } catch {}
  }

  function seedSellerListings() {
    const seeded: SellerListing[] = mockMarketListings.slice(0, 5).map((x, idx) => {
      const now = Date.now() - idx * 60_000;
      return { refId: x.id, status: "active", priceAmount: x.price.amount, currency: "TWD", createdAt: now, updatedAt: now };
    });
    writeSellerListings(seeded);
    setSellerListings(seeded);
    setListingFilter("all");
  }

  function seedCreatorPacks() {
    const seeded: CreatorPack[] = mockPacks.slice(0, 5).map((x, idx) => {
      const now = Date.now() - idx * 90_000;
      return {
        packId: x.id,
        status: "active",
        priceAmount: x.price.amount,
        currency: "TWD",
        inventory: 200,
        soldCount: Math.max(0, 20 - idx * 3),
        createdAt: now,
        updatedAt: now,
      };
    });
    writeCreatorPacks(seeded);
    setCreatorPacks(seeded);
    setPackFilter("all");
  }

  function seedSellerFulfillment() {
    const seeded: SellerFulfillment[] = [
      ...mockMarketListings.slice(0, 3).map((x, idx) => {
        const dt = new Date(Date.now() - idx * 55e5).toISOString();
        const status: SellerFulfillmentStatus = idx === 0 ? "paid" : idx === 1 ? "packing" : "shipped";
        return {
          fulfillmentId: `m_${x.id}`,
          kind: "market" as const,
          refId: x.id,
          title: x.title,
          amount: x.price.amount,
          currency: "TWD" as const,
          status,
          trackingNumber: status === "shipped" ? "SF123456789TW" : undefined,
          updatedAtIso: dt,
        };
      }),
      ...mockPacks.slice(0, 3).map((x, idx) => {
        const dt = new Date(Date.now() - (idx + 1) * 42e5).toISOString();
        const status: SellerFulfillmentStatus = idx === 0 ? "paid" : idx === 1 ? "shipped" : "completed";
        return {
          fulfillmentId: `p_${x.id}`,
          kind: "pack" as const,
          refId: x.id,
          title: x.title,
          amount: x.price.amount,
          currency: "TWD" as const,
          status,
          trackingNumber: status === "shipped" ? "711-0000-0000" : undefined,
          updatedAtIso: dt,
        };
      }),
    ];
    writeSellerFulfillment(seeded);
    setSellerFulfillment(seeded);
    setFulfillmentFilter("all");
  }

  function seedMyTrades() {
    const nowIso = new Date().toISOString();
    const seeded: MyTrade[] = mockTrades.slice(0, 6).map((t, idx) => {
      const status: MyTradeStatus = idx % 4 === 0 ? "chatting" : idx % 4 === 1 ? "matching" : idx % 4 === 2 ? "completed" : "cancelled";
      const dt = new Date(Date.now() - idx * 36e5).toISOString();
      return { tradeId: t.id, status, updatedAtIso: dt || nowIso };
    });
    writeMyTrades(seeded);
    setMyTrades(seeded);
    setTradeFilter("all");
  }

  function setListingStatus(refId: string, status: SellerListingStatus) {
    setSellerListings((prev) => {
      const next = prev.map((x) => (x.refId === refId ? { ...x, status, updatedAt: Date.now() } : x)).sort((a, b) => b.updatedAt - a.updatedAt);
      writeSellerListings(next);
      return next;
    });
  }

  function setListingPrice(refId: string, priceAmount: number) {
    setSellerListings((prev) => {
      const next = prev.map((x) => (x.refId === refId ? { ...x, priceAmount, updatedAt: Date.now() } : x)).sort((a, b) => b.updatedAt - a.updatedAt);
      writeSellerListings(next);
      return next;
    });
  }

  function removeListing(refId: string) {
    setSellerListings((prev) => {
      const next = prev.filter((x) => x.refId !== refId);
      writeSellerListings(next);
      return next;
    });
  }

  function setCreatorPackStatus(packId: string, status: CreatorPackStatus) {
    setCreatorPacks((prev) => {
      const next = prev.map((x) => (x.packId === packId ? { ...x, status, updatedAt: Date.now() } : x)).sort((a, b) => b.updatedAt - a.updatedAt);
      writeCreatorPacks(next);
      return next;
    });
  }

  function setCreatorPackPrice(packId: string, priceAmount: number) {
    setCreatorPacks((prev) => {
      const next = prev.map((x) => (x.packId === packId ? { ...x, priceAmount, updatedAt: Date.now() } : x)).sort((a, b) => b.updatedAt - a.updatedAt);
      writeCreatorPacks(next);
      return next;
    });
  }

  function setCreatorPackInventory(packId: string, inventory: number) {
    setCreatorPacks((prev) => {
      const next = prev
        .map((x) => (x.packId === packId ? { ...x, inventory: Math.max(0, Math.floor(inventory)), updatedAt: Date.now() } : x))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      writeCreatorPacks(next);
      return next;
    });
  }

  function removeCreatorPack(packId: string) {
    setCreatorPacks((prev) => {
      const next = prev.filter((x) => x.packId !== packId);
      writeCreatorPacks(next);
      return next;
    });
  }

  function updateFulfillment(fulfillmentId: string, next: Partial<Pick<SellerFulfillment, "status" | "trackingNumber">>) {
    setSellerFulfillment((prev) => {
      const updated = prev
        .map((x) =>
          x.fulfillmentId === fulfillmentId
            ? { ...x, ...next, updatedAtIso: new Date().toISOString() }
            : x
        )
        .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
      writeSellerFulfillment(updated);
      return updated;
    });
  }

  function removeFulfillment(fulfillmentId: string) {
    setSellerFulfillment((prev) => {
      const next = prev.filter((x) => x.fulfillmentId !== fulfillmentId);
      writeSellerFulfillment(next);
      return next;
    });
  }

  function setTradeStatus(tradeId: string, status: MyTradeStatus) {
    setMyTrades((prev) => {
      const next = prev
        .map((x) => (x.tradeId === tradeId ? { ...x, status, updatedAtIso: new Date().toISOString() } : x))
        .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
      writeMyTrades(next);
      return next;
    });
  }

  function removeTrade(tradeId: string) {
    setMyTrades((prev) => {
      const next = prev.filter((x) => x.tradeId !== tradeId);
      writeMyTrades(next);
      return next;
    });
  }

  useEffect(() => {
    if (!tabMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const wrap = tabMenuRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      setTabMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [tabMenuOpen]);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="帳戶" />

            <div className={homeStyles.accountContainer}>
              <div ref={tabMenuRef} className={homeStyles.accountTabsDropdownWrap}>
                <button
                  type="button"
                  className={homeStyles.accountTabsDropdownBtn}
                  aria-label="切換帳戶頁籤"
                  aria-expanded={tabMenuOpen}
                  onClick={() => setTabMenuOpen((v) => !v)}
                >
                  <span className={homeStyles.accountTabsDropdownLeft}>
                    <span className={homeStyles.accountTabsDropdownIcon} aria-hidden="true">
                      <UiIcon href={activeTab.icon} size={18} />
                    </span>
                    <span className={homeStyles.accountTabsDropdownText}>{activeTab.label}</span>
                  </span>
                  <span
                    className={`${homeStyles.accountTabsDropdownChevron} ${tabMenuOpen ? homeStyles.accountTabsDropdownChevronOpen : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {tabMenuOpen ? (
                  <div className={homeStyles.accountTabsDropdownMenu} role="menu" aria-label="帳戶頁籤">
                    {tabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`${homeStyles.accountTabsDropdownItem} ${t.key === activeTab.key ? homeStyles.accountTabsDropdownItemActive : ""}`}
                        role="menuitem"
                        onClick={() => {
                          setTabMenuOpen(false);
                          goTab(t.key as TabKey);
                        }}
                      >
                        <span className={homeStyles.accountTabsDropdownIcon} aria-hidden="true">
                          <UiIcon href={t.icon} size={18} />
                        </span>
                        <span className={homeStyles.accountTabsDropdownText}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div
                className={homeStyles.accountTabsRow}
              >
                {tabs.map((t) => {
                  const active = t.key === activeTab.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => goTab(t.key as TabKey)}
                      className={`${homeStyles.accountTabBtn} ${active ? homeStyles.accountTabBtnActive : ""}`}
                      style={{
                        borderRadius: 16,
                        border: 0,
                        cursor: "pointer",
                        display: "grid",
                        justifyItems: "center",
                        alignContent: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 16,
                          display: "grid",
                          placeItems: "center",
                          background: active ? "rgba(43,124,255,0.26)" : "#f3f4f6",
                          color: "#374151",
                        }}
                      >
                        <UiIcon href={t.icon} size={20} />
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.2px" }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {tab === "overview" ? (
              <>
              <div style={{ marginTop: 14 }}>
                <SurfaceCard style={{ borderRadius: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>快速入口</div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Button3D color="blue" onClick={() => goTab("seller")} style={{ height: 38, borderRadius: 12 }}>
                      賣家管理
                    </Button3D>
                    <Button3D color="green" onClick={() => goTab("trades")} style={{ height: 38, borderRadius: 12 }}>
                      交換紀錄
                    </Button3D>
                    <SecondaryButton onClick={() => goTab("orders")} style={{ height: 38, borderRadius: 12 }}>
                      我的訂單
                    </SecondaryButton>
                    <SecondaryButton onClick={() => goTab("openings")} style={{ height: 38, borderRadius: 12 }}>
                      卡包紀錄
                    </SecondaryButton>
                  </div>
                </SurfaceCard>
              </div>
              <div className={homeStyles.accountSummaryGrid}>
                <div
                  className={homeStyles.accountCard}
                  style={{
                    borderRadius: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    minHeight: 78,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 999,
                        background: "radial-gradient(circle at 30% 30%, #f3f4f6, #e5e7eb)",
                        flex: "0 0 auto",
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>變更</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280", whiteSpace: "nowrap" }}>
                    <UiIcon href="#icon-chevron-right" size={18} opacity={0.7} />
                  </div>
                </div>

                <button
                  type="button"
                  className={homeStyles.accountCard}
                  onClick={() => router.push("/account/kyc")}
                  style={{
                    borderRadius: 16,
                    minHeight: 78,
                    display: "grid",
                    gap: 8,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 14,
                          background: "#f3f4f6",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <UiIcon href="#icon-docs" size={20} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>KYC 實名驗證</div>
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 14,
                            fontWeight: 950,
                            color:
                              kycStatus === "approved"
                                ? "#22c55e"
                                : kycStatus === "reviewing"
                                  ? "#eab308"
                                  : kycStatus === "rejected"
                                    ? "#f87171"
                                    : "#374151",
                          }}
                        >
                          {kycStatus === "approved" ? "已通過" : kycStatus === "reviewing" ? "審核中" : kycStatus === "rejected" ? "未通過" : "未提交"}
                        </div>
                      </div>
                    </div>
                    <UiIcon href="#icon-chevron-right" size={18} opacity={0.7} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 750, color: "#6b7280", lineHeight: "18px" }}>
                    交易前需要完成實名驗證，才能購買與開抽。
                  </div>
                </button>

                <button
                  type="button"
                  className={`${homeStyles.accountCard} ${homeStyles.accountSummaryWide}`}
                  onClick={() => router.push("/account/addresses")}
                  style={{
                    borderRadius: 16,
                    minHeight: 78,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      aria-hidden="true"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 16,
                        background: "#f3f4f6",
                        display: "grid",
                        placeItems: "center",
                        color: "#374151",
                        flex: "0 0 auto",
                      }}
                    >
                      <UiIcon href="#icon-box" size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>
                        預設收件地址{addressCount > 0 ? `（共 ${addressCount} 個地址）` : ""}
                      </div>
                      {defaultAddress ? (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 13,
                            fontWeight: 900,
                            color: "#111827",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {defaultAddress.name}｜{defaultAddress.addressLine}
                        </div>
                      ) : (
                        <div style={{ marginTop: 2, fontSize: 13, fontWeight: 900, color: "#374151" }}>
                          尚未新增，前往地址簿設定收件地址
                        </div>
                      )}
                    </div>
                  </div>
                  <UiIcon href="#icon-chevron-right" size={18} opacity={0.7} />
                </button>
              </div>

              <div
                className={homeStyles.accountMidGrid}
              >
                <div
                  className={homeStyles.accountCard}
                  style={{
                    borderRadius: 18,
                    background: "linear-gradient(180deg, rgba(30, 110, 216, 0.95), rgba(30, 110, 216, 0.75))",
                    color: "#ffffff",
                    overflow: "hidden",
                    minHeight: 220,
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.14)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <UiIcon href="#icon-box" size={18} />
                      </span>
                      <div style={{ fontSize: 14, fontWeight: 950, color: "#ffffff" }}>訂單與開抽</div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 750, color: "#e5e7eb", lineHeight: "18px", maxWidth: 440 }}>
                      追蹤市集購買與卡包開抽的付款、物流與狀態進度。
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push("/orders")}
                      style={{
                        marginTop: 14,
                        width: 220,
                        height: 40,
                        borderRadius: 12,
                        border: 0,
                        background: "rgba(0,0,0,0.18)",
                        color: "#ffffff",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      查看我的訂單
                    </button>
                  </div>
                  <div
                    style={{
                      justifySelf: "end",
                      width: "100%",
                      maxWidth: 360,
                      height: 188,
                      borderRadius: 16,
                      background:
                        "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.16), rgba(255,255,255,0.04)), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => router.push("/orders")}
                      style={{ display: "grid", gap: 4, justifyItems: "center", background: "none", border: 0, cursor: "pointer", color: "inherit" }}
                    >
                      <span style={{ fontSize: 26, fontWeight: 950, color: "#ffffff", letterSpacing: "-0.3px" }}>{orderCount}</span>
                      <span style={{ fontSize: 12, fontWeight: 850, color: "#e5e7eb" }}>市集訂單</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => goTab("openings")}
                      style={{
                        display: "grid",
                        gap: 4,
                        justifyItems: "center",
                        background: "none",
                        border: 0,
                        borderLeft: "1px solid rgba(255,255,255,0.14)",
                        cursor: "pointer",
                        color: "inherit",
                        height: "100%",
                        alignContent: "center",
                      }}
                    >
                      <span style={{ fontSize: 26, fontWeight: 950, color: "#ffffff", letterSpacing: "-0.3px" }}>{openingCount}</span>
                      <span style={{ fontSize: 12, fontWeight: 850, color: "#e5e7eb" }}>卡包開抽</span>
                    </button>
                  </div>
                </div>

                <div
                  className={homeStyles.accountCard}
                  style={{
                    borderRadius: 18,
                    minHeight: 220,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 12,
                        background: "#f3f4f6",
                        display: "grid",
                        placeItems: "center",
                        color: "#374151",
                      }}
                    >
                      <UiIcon href="#icon-settings" size={18} />
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 950, color: "#111827" }}>設定個人信息</div>
                  </div>
                  <div style={{ marginTop: 12, display: "grid", gap: 0 }}>
                    {[
                      { label: "隱藏我的用戶名於廣場發表", value: privacyHideProfile, onChange: setPrivacyHideProfile },
                      { label: "隱藏統計數據", value: privacyHideStats, onChange: setPrivacyHideStats },
                      { label: "隱藏活動紀錄", value: privacyHideHistory, onChange: setPrivacyHideHistory },
                      { label: "隱藏獎勵活動", value: privacyHideRewards, onChange: setPrivacyHideRewards },
                    ].map((row, idx, all) => (
                      <label
                        key={row.label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "12px 2px",
                          cursor: "pointer",
                          borderBottom: idx === all.length - 1 ? 0 : "1px solid #e5e7eb",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 850, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.label}
                        </span>
                        <input
                          type="checkbox"
                          checked={row.value}
                          onChange={(e) => row.onChange(e.target.checked)}
                          aria-label={row.label}
                          style={{ width: 18, height: 18, accentColor: "#2b7cff", cursor: "pointer" }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className={homeStyles.accountSecurityGrid}>
                <div
                  className={homeStyles.accountCard}
                  style={{
                    borderRadius: 18,
                    minHeight: 170,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 30, height: 30, borderRadius: 12, background: "#f3f4f6", display: "grid", placeItems: "center" }}
                      >
                        <UiIcon href="#icon-docs" size={18} />
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>我的電子郵件</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: authUser?.email ? "#22c55e" : "#6b7280", whiteSpace: "nowrap" }}>
                      {authUser?.email ? "已綁定" : "未綁定"}
                    </div>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 2px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>訂閱促銷電郵</span>
                    <input type="checkbox" defaultChecked aria-label="訂閱促銷電郵" style={{ width: 18, height: 18, accentColor: "#2b7cff" }} />
                  </label>
                  <input
                    value={authUser?.email ?? ""}
                    readOnly
                    aria-label="Email"
                    placeholder="尚未綁定"
                    style={{
                      width: "100%",
                      height: 38,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      color: "#111827",
                      padding: "0 12px",
                      fontSize: 13,
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                </div>

                <div
                  className={homeStyles.accountCard}
                  style={{
                    borderRadius: 18,
                    minHeight: 170,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 30, height: 30, borderRadius: 12, background: "#f3f4f6", display: "grid", placeItems: "center" }}
                      >
                        <UiIcon href="#icon-settings" size={18} />
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>密碼</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: canChangePassword ? "#22c55e" : "#6b7280", whiteSpace: "nowrap" }}>
                      {canChangePassword ? "可變更" : "不適用"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 750, color: "#6b7280", lineHeight: "18px" }}>密碼組合需至少 8 個字元，由數字字母與符號組合。</div>
                  {passwordMsg ? (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 850,
                        color: passwordMsg.tone === "success" ? "#16a34a" : "#dc2626",
                        lineHeight: "18px",
                      }}
                    >
                      {passwordMsg.text}
                    </div>
                  ) : null}

                  {passwordOpen ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <input
                        value={passwordCurrent}
                        onChange={(e) => setPasswordCurrent(e.target.value)}
                        type="password"
                        placeholder="目前密碼（選填）"
                        aria-label="目前密碼"
                        style={{
                          width: "100%",
                          height: 38,
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                          color: "#111827",
                          padding: "0 12px",
                          fontSize: 13,
                          fontWeight: 800,
                          outline: "none",
                        }}
                      />
                      <input
                        value={passwordNext}
                        onChange={(e) => setPasswordNext(e.target.value)}
                        type="password"
                        placeholder="新密碼（至少 8 碼）"
                        aria-label="新密碼"
                        style={{
                          width: "100%",
                          height: 38,
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                          color: "#111827",
                          padding: "0 12px",
                          fontSize: 13,
                          fontWeight: 800,
                          outline: "none",
                        }}
                      />
                      <input
                        value={passwordNext2}
                        onChange={(e) => setPasswordNext2(e.target.value)}
                        type="password"
                        placeholder="再次輸入新密碼"
                        aria-label="再次輸入新密碼"
                        style={{
                          width: "100%",
                          height: 38,
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                          color: "#111827",
                          padding: "0 12px",
                          fontSize: 13,
                          fontWeight: 800,
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={passwordBusy || !canChangePassword}
                          onClick={() => void changePassword()}
                          style={{
                            flex: "1 1 160px",
                            height: 40,
                            borderRadius: 12,
                            border: 0,
                            background: "linear-gradient(180deg, rgba(43,124,255,0.95), rgba(43,124,255,0.72))",
                            color: "#fff",
                            fontWeight: 950,
                            cursor: passwordBusy ? "default" : "pointer",
                            opacity: passwordBusy || !canChangePassword ? 0.6 : 1,
                          }}
                        >
                          {passwordBusy ? "更新中..." : "更新密碼"}
                        </button>
                        <SecondaryButton
                          onClick={() => {
                            setPasswordOpen(false);
                            setPasswordMsg(null);
                            setPasswordCurrent("");
                            setPasswordNext("");
                            setPasswordNext2("");
                          }}
                          style={{ height: 40, borderRadius: 12 }}
                        >
                          取消
                        </SecondaryButton>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canChangePassword}
                      onClick={() => {
                        setPasswordMsg(null);
                        setPasswordOpen(true);
                      }}
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 12,
                        border: 0,
                        background: "linear-gradient(180deg, rgba(43,124,255,0.95), rgba(43,124,255,0.72))",
                        color: "#fff",
                        fontWeight: 950,
                        cursor: canChangePassword ? "pointer" : "default",
                        opacity: canChangePassword ? 1 : 0.55,
                      }}
                    >
                      變更
                    </button>
                  )}
                </div>

                <div
                  className={homeStyles.accountCard}
                  style={{
                    borderRadius: 18,
                    minHeight: 170,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 30, height: 30, borderRadius: 12, background: "#f3f4f6", display: "grid", placeItems: "center" }}
                      >
                        <UiIcon href="#icon-notifications" size={18} />
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>兩步驗證 (2FA)</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: twoFaEnabled ? "#22c55e" : "#dc2626", whiteSpace: "nowrap" }}>
                      {twoFaEnabled ? "已啟動" : "未啟動"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 750, color: "#6b7280", lineHeight: "18px" }}>
                    為帳戶增加額外安全層，防止未經授權的登入。
                  </div>
                  {twoFaEnabled ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ borderRadius: 14, background: "#f3f4f6", padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>備用碼（示意）</div>
                        <div style={{ marginTop: 6, display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#374151" }}>
                          <div>R3K9-1Q8Z</div>
                          <div>7M2A-LP4D</div>
                          <div>H9T1-K2Q7</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={twoFaBusy}
                        onClick={toggleTwoFa}
                        style={{
                          width: "100%",
                          height: 40,
                          borderRadius: 12,
                          border: 0,
                          background: "linear-gradient(180deg, rgba(237,29,73,0.95), rgba(237,29,73,0.72))",
                          color: "#fff",
                          fontWeight: 950,
                          cursor: twoFaBusy ? "default" : "pointer",
                          opacity: twoFaBusy ? 0.6 : 1,
                        }}
                      >
                        {twoFaBusy ? "處理中..." : "停用"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={twoFaBusy}
                      onClick={toggleTwoFa}
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 12,
                        border: 0,
                        background: "linear-gradient(180deg, rgba(237,29,73,0.95), rgba(237,29,73,0.72))",
                        color: "#fff",
                        fontWeight: 950,
                        cursor: twoFaBusy ? "default" : "pointer",
                        opacity: twoFaBusy ? 0.6 : 1,
                      }}
                    >
                      {twoFaBusy ? "處理中..." : "啟動"}
                    </button>
                  )}
                </div>
              </div>
              </>
              ) : null}

              {tab === "seller" ? (
                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", gap: 8, borderRadius: 14, background: "#f3f4f6", padding: 6, width: "min(520px, 100%)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSellMode("market");
                        setManageMenu(null);
                      }}
                      style={{
                        flex: 1,
                        height: 42,
                        border: 0,
                        borderRadius: 10,
                        padding: "0 14px",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 900,
                        background: sellMode === "market" ? "#ffffff" : "transparent",
                        color: sellMode === "market" ? "#111827" : "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        whiteSpace: "nowrap",
                      }}
                    >
                      市集上架 <span style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>{sellerListings.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSellMode("packs");
                        setManageMenu(null);
                      }}
                      style={{
                        flex: 1,
                        height: 42,
                        border: 0,
                        borderRadius: 10,
                        padding: "0 14px",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 900,
                        background: sellMode === "packs" ? "#ffffff" : "transparent",
                        color: sellMode === "packs" ? "#111827" : "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        whiteSpace: "nowrap",
                      }}
                    >
                      自製卡包 <span style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>{creatorPacks.length}</span>
                    </button>
                  </div>

                  {sellMode === "market" ? (
                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    {!sellerListings.length ? (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <SecondaryButton onClick={seedSellerListings} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                          建立範例
                        </SecondaryButton>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setListingFilter("all")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={listingFilter === "all" ? "info" : "muted"}>全部 {listingCounts.all}</Pill>
                      </button>
                      <button type="button" onClick={() => setListingFilter("active")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={listingFilter === "active" ? "info" : "muted"}>上架中 {listingCounts.active}</Pill>
                      </button>
                      <button type="button" onClick={() => setListingFilter("inactive")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={listingFilter === "inactive" ? "info" : "muted"}>已下架 {listingCounts.inactive}</Pill>
                      </button>
                      <button type="button" onClick={() => setListingFilter("sold")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={listingFilter === "sold" ? "info" : "muted"}>已售出 {listingCounts.sold}</Pill>
                      </button>
                    </div>

                    {!sellerListings.length ? (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>
                        尚無上架紀錄。
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {sellerListings
                          .filter((x) => (listingFilter === "all" ? true : x.status === listingFilter))
                          .map((x) => {
                            const listing = mockMarketListings.find((m) => m.id === x.refId) ?? null;
                            const title = listing?.title ?? x.refId;
                            const img = "/cardx/placeholder.svg";
                            const price = formatMoney({ amount: x.priceAmount, currency: x.currency });
                            const statusLabel = x.status === "active" ? "上架中" : x.status === "sold" ? "已售出" : "已下架";
                            const tone = x.status === "active" ? "success" : x.status === "sold" ? "info" : "muted";
                            return (
                              <div
                                key={x.refId}
                                style={{
                                  borderRadius: 16,
                                  background: "#f3f4f6",
                                  padding: 14,
                                  display: "grid",
                                  gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <img alt="" src={img} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", background: "#f3f4f6", flex: "0 0 auto" }} />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {title}
                                      </div>
                                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                        <span style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>{price}</span>
                                        <Pill tone={tone}>{statusLabel}</Pill>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <SecondaryButton href={`/market/${x.refId}`} style={{ height: 34, borderRadius: 12 }}>
                                      查看
                                    </SecondaryButton>
                                    <div data-cardx-menu="1">
                                      <SecondaryButton
                                        onClick={() =>
                                          setManageMenu((prev) =>
                                            prev?.type === "listing" && prev.id === x.refId ? null : { type: "listing", id: x.refId }
                                          )
                                        }
                                        style={{ height: 34, borderRadius: 12 }}
                                        disabled={x.status === "sold"}
                                      >
                                        管理
                                      </SecondaryButton>
                                    </div>
                                  </div>
                                </div>

                                {manageMenu?.type === "listing" && manageMenu.id === x.refId ? (
                                  <div data-cardx-menu="1" style={{ position: "relative" }}>
                                    <div
                                      style={{
                                        position: "absolute",
                                        right: 0,
                                        top: 0,
                                        zIndex: 40,
                                        width: 220,
                                        borderRadius: 14,
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        boxShadow: "0 14px 40px rgba(0,0,0,0.15)",
                                        padding: 6,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditModal({ kind: "listing", id: x.refId, price: String(x.priceAmount) });
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        調整價格
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setListingStatus(x.refId, x.status === "active" ? "inactive" : "active");
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        {x.status === "active" ? "下架" : "上架"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setListingStatus(x.refId, "sold");
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        標記售出
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          removeListing(x.refId);
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#dc2626",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        移除
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </SurfaceCard>
                  ) : null}

                  {sellMode === "packs" ? (
                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    {!creatorPacks.length ? (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <SecondaryButton onClick={seedCreatorPacks} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                          建立範例
                        </SecondaryButton>
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setPackFilter("all")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={packFilter === "all" ? "info" : "muted"}>全部 {packCounts.all}</Pill>
                      </button>
                      <button type="button" onClick={() => setPackFilter("active")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={packFilter === "active" ? "info" : "muted"}>上架中 {packCounts.active}</Pill>
                      </button>
                      <button type="button" onClick={() => setPackFilter("inactive")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={packFilter === "inactive" ? "info" : "muted"}>已下架 {packCounts.inactive}</Pill>
                      </button>
                      <button type="button" onClick={() => setPackFilter("sold_out")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={packFilter === "sold_out" ? "info" : "muted"}>售罄 {packCounts.soldOut}</Pill>
                      </button>
                    </div>

                    {!creatorPacks.length ? (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>
                        尚無自製卡包。
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {creatorPacks
                          .filter((x) => (packFilter === "all" ? true : x.status === packFilter))
                          .map((x) => {
                            const pack = mockPacks.find((p) => p.id === x.packId) ?? null;
                            const title = pack?.title ?? x.packId;
                            const img = "/cardx/placeholder.svg";
                            const price = formatMoney({ amount: x.priceAmount, currency: x.currency });
                            const statusLabel = x.status === "active" ? "上架中" : x.status === "sold_out" ? "售罄" : "已下架";
                            const tone = x.status === "active" ? "success" : x.status === "sold_out" ? "info" : "muted";
                            return (
                              <div
                                key={x.packId}
                                style={{
                                  borderRadius: 16,
                                  background: "#f3f4f6",
                                  padding: 14,
                                  display: "grid",
                                  gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <img alt="" src={img} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", background: "#f3f4f6", flex: "0 0 auto" }} />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {title}
                                      </div>
                                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                        <span style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>{price}</span>
                                        <Pill tone={tone}>{statusLabel}</Pill>
                                        <Pill tone="muted">庫存 {x.inventory}</Pill>
                                        <Pill tone="muted">已售 {x.soldCount}</Pill>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <SecondaryButton href={`/packs/${x.packId}`} style={{ height: 34, borderRadius: 12 }}>
                                      查看
                                    </SecondaryButton>
                                    <div data-cardx-menu="1">
                                      <SecondaryButton
                                        onClick={() =>
                                          setManageMenu((prev) =>
                                            prev?.type === "pack" && prev.id === x.packId ? null : { type: "pack", id: x.packId }
                                          )
                                        }
                                        style={{ height: 34, borderRadius: 12 }}
                                        disabled={x.status === "sold_out"}
                                      >
                                        管理
                                      </SecondaryButton>
                                    </div>
                                  </div>
                                </div>

                                {manageMenu?.type === "pack" && manageMenu.id === x.packId ? (
                                  <div data-cardx-menu="1" style={{ position: "relative" }}>
                                    <div
                                      style={{
                                        position: "absolute",
                                        right: 0,
                                        top: 0,
                                        zIndex: 40,
                                        width: 220,
                                        borderRadius: 14,
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        boxShadow: "0 14px 40px rgba(0,0,0,0.15)",
                                        padding: 6,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditModal({ kind: "pack", id: x.packId, price: String(x.priceAmount), inventory: String(x.inventory) });
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        編輯
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCreatorPackStatus(x.packId, x.status === "active" ? "inactive" : "active");
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        {x.status === "active" ? "下架" : "上架"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCreatorPackStatus(x.packId, "sold_out");
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        標記售罄
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          removeCreatorPack(x.packId);
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#dc2626",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        移除
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </SurfaceCard>
                  ) : null}

                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    {!sellerFulfillment.length ? (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <SecondaryButton onClick={seedSellerFulfillment} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                          建立範例
                        </SecondaryButton>
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setFulfillmentFilter("all")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={fulfillmentFilter === "all" ? "info" : "muted"}>全部 {fulfillmentCounts.all}</Pill>
                      </button>
                      <button type="button" onClick={() => setFulfillmentFilter("to_ship")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={fulfillmentFilter === "to_ship" ? "info" : "muted"}>待出貨 {fulfillmentCounts.toShip}</Pill>
                      </button>
                      <button type="button" onClick={() => setFulfillmentFilter("in_transit")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={fulfillmentFilter === "in_transit" ? "info" : "muted"}>運送中 {fulfillmentCounts.inTransit}</Pill>
                      </button>
                      <button type="button" onClick={() => setFulfillmentFilter("completed")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={fulfillmentFilter === "completed" ? "info" : "muted"}>已完成 {fulfillmentCounts.completed}</Pill>
                      </button>
                      <button type="button" onClick={() => setFulfillmentFilter("after_sales")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={fulfillmentFilter === "after_sales" ? "info" : "muted"}>售後 {fulfillmentCounts.afterSales}</Pill>
                      </button>
                    </div>

                    {!sellerFulfillment.length ? (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>目前沒有需要處理的出貨。</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {sellerFulfillment
                          .filter((x) => {
                            if (fulfillmentFilter === "all") return true;
                            if (fulfillmentFilter === "to_ship") return x.status === "paid" || x.status === "packing";
                            if (fulfillmentFilter === "in_transit") return x.status === "shipped" || x.status === "delivered";
                            if (fulfillmentFilter === "completed") return x.status === "completed";
                            return x.status === "refund_pending" || x.status === "dispute_opened" || x.status === "cancelled";
                          })
                          .map((x) => {
                            const kindLabel = x.kind === "pack" ? "卡包" : "市集";
                            const statusLabel =
                              x.status === "paid"
                                ? "已付款"
                                : x.status === "packing"
                                  ? "備貨中"
                                  : x.status === "shipped"
                                    ? "已出貨"
                                    : x.status === "delivered"
                                      ? "已送達"
                                      : x.status === "completed"
                                        ? "已完成"
                                        : x.status === "refund_pending"
                                          ? "退款中"
                                          : x.status === "dispute_opened"
                                            ? "爭議中"
                                            : "已取消";
                            const tone =
                              x.status === "completed"
                                ? "success"
                                : x.status === "shipped" || x.status === "delivered"
                                  ? "info"
                                  : x.status === "refund_pending" || x.status === "dispute_opened"
                                    ? "muted"
                                    : "muted";
                            const href = x.kind === "pack" ? `/packs/${x.refId}` : `/market/${x.refId}`;
                            const primary =
                              x.status === "paid" || x.status === "packing"
                                ? { label: "出貨", action: "ship" as const }
                                : x.status === "shipped"
                                  ? { label: "標記送達", action: "delivered" as const }
                                  : x.status === "delivered"
                                    ? { label: "完成", action: "complete" as const }
                                    : null;
                            return (
                              <div
                                key={x.fulfillmentId}
                                style={{
                                  borderRadius: 16,
                                  background: "#f3f4f6",
                                padding: 14,
                                  display: "grid",
                                  gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {x.title}
                                    </div>
                                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                      <Pill tone="muted">{kindLabel}</Pill>
                                      <Pill tone={tone}>{statusLabel}</Pill>
                                      <span style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                        {formatMoney({ amount: x.amount, currency: x.currency })}
                                      </span>
                                      {x.trackingNumber ? <Pill tone="muted">單號 {x.trackingNumber}</Pill> : null}
                                    </div>
                                  </div>

                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
                                    {primary ? (
                                      <Button3D
                                        color="blue"
                                        onClick={() => {
                                          if (primary.action === "ship") {
                                            const tracking = window.prompt("請輸入物流單號（可留空）", x.trackingNumber ?? "");
                                            const trimmed = (tracking ?? "").trim();
                                            updateFulfillment(x.fulfillmentId, { status: "shipped", trackingNumber: trimmed || undefined });
                                            return;
                                          }
                                          if (primary.action === "delivered") {
                                            updateFulfillment(x.fulfillmentId, { status: "delivered" });
                                            return;
                                          }
                                          if (primary.action === "complete") {
                                            updateFulfillment(x.fulfillmentId, { status: "completed" });
                                          }
                                        }}
                                        style={{ height: 34, borderRadius: 12 }}
                                      >
                                        {primary.label}
                                      </Button3D>
                                    ) : null}
                                    <SecondaryButton href={href} style={{ height: 34, borderRadius: 12 }}>
                                      查看
                                    </SecondaryButton>
                                    <div data-cardx-menu="1">
                                      <SecondaryButton
                                        onClick={() =>
                                          setManageMenu((prev) =>
                                            prev?.type === "fulfillment" && prev.id === x.fulfillmentId ? null : { type: "fulfillment", id: x.fulfillmentId }
                                          )
                                        }
                                        style={{ height: 34, borderRadius: 12 }}
                                      >
                                        更多
                                      </SecondaryButton>
                                    </div>
                                  </div>
                                </div>

                                {manageMenu?.type === "fulfillment" && manageMenu.id === x.fulfillmentId ? (
                                  <div data-cardx-menu="1" style={{ position: "relative" }}>
                                    <div
                                      style={{
                                        position: "absolute",
                                        right: 0,
                                        top: 0,
                                        zIndex: 40,
                                        width: 220,
                                        borderRadius: 14,
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        boxShadow: "0 14px 40px rgba(0,0,0,0.15)",
                                        padding: 6,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const tracking = window.prompt("物流單號", x.trackingNumber ?? "");
                                          const trimmed = (tracking ?? "").trim();
                                          updateFulfillment(x.fulfillmentId, { trackingNumber: trimmed || undefined });
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        編輯單號
                                      </button>
                                      {x.status !== "completed" ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateFulfillment(x.fulfillmentId, { status: "refund_pending" });
                                            setManageMenu(null);
                                          }}
                                          style={{
                                            width: "100%",
                                            height: 38,
                                            borderRadius: 12,
                                            border: "1px solid transparent",
                                            background: "transparent",
                                            color: "#111827",
                                            fontSize: 13,
                                            fontWeight: 900,
                                            textAlign: "left",
                                            padding: "0 10px",
                                            cursor: "pointer",
                                          }}
                                        >
                                          退款
                                        </button>
                                      ) : null}
                                      {x.status !== "completed" ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateFulfillment(x.fulfillmentId, { status: "dispute_opened" });
                                            setManageMenu(null);
                                          }}
                                          style={{
                                            width: "100%",
                                            height: 38,
                                            borderRadius: 12,
                                            border: "1px solid transparent",
                                            background: "transparent",
                                            color: "#111827",
                                            fontSize: 13,
                                            fontWeight: 900,
                                            textAlign: "left",
                                            padding: "0 10px",
                                            cursor: "pointer",
                                          }}
                                        >
                                          爭議
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          removeFulfillment(x.fulfillmentId);
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#dc2626",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        移除
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </SurfaceCard>
                </div>
              ) : null}

              {tab === "trades" ? (
                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {!myTrades.length ? (
                          <SecondaryButton onClick={seedMyTrades} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                            建立範例
                          </SecondaryButton>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setTradeFilter("all")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={tradeFilter === "all" ? "info" : "muted"}>全部 {tradeCounts.all}</Pill>
                      </button>
                      <button type="button" onClick={() => setTradeFilter("chatting")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={tradeFilter === "chatting" ? "info" : "muted"}>洽談中 {tradeCounts.chatting}</Pill>
                      </button>
                      <button type="button" onClick={() => setTradeFilter("matching")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={tradeFilter === "matching" ? "info" : "muted"}>交換中 {tradeCounts.matching}</Pill>
                      </button>
                      <button type="button" onClick={() => setTradeFilter("completed")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={tradeFilter === "completed" ? "info" : "muted"}>已完成 {tradeCounts.completed}</Pill>
                      </button>
                      <button type="button" onClick={() => setTradeFilter("cancelled")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={tradeFilter === "cancelled" ? "info" : "muted"}>已取消 {tradeCounts.cancelled}</Pill>
                      </button>
                    </div>

                    {!myTrades.length ? (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>
                        尚無交換紀錄。你可以先建立範例資料，或等交換流程完成後在這裡管理狀態與進度。
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {myTrades
                          .filter((x) => (tradeFilter === "all" ? true : x.status === tradeFilter))
                          .map((x) => {
                            const t = mockTrades.find((m) => m.id === x.tradeId) ?? null;
                            const title = t?.title ?? x.tradeId;
                            const sub = t ? `${t.offerSummary} · ${t.wantSummary}` : "";
                            const statusLabel =
                              x.status === "completed" ? "已完成" : x.status === "matching" ? "交換中" : x.status === "cancelled" ? "已取消" : "洽談中";
                            const tone = x.status === "completed" ? "success" : x.status === "matching" ? "info" : x.status === "cancelled" ? "muted" : "muted";
                            return (
                              <div
                                key={x.tradeId}
                                style={{
                                  borderRadius: 16,
                                  background: "#f3f4f6",
                                  padding: 14,
                                  display: "grid",
                                  gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {title}
                                    </div>
                                    {sub ? (
                                      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {sub}
                                      </div>
                                    ) : null}
                                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                      <Pill tone={tone}>{statusLabel}</Pill>
                                      <span style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>
                                        {new Date(x.updatedAtIso).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <SecondaryButton href={`/trades/${x.tradeId}`} style={{ height: 34, borderRadius: 12 }}>
                                      查看
                                    </SecondaryButton>
                                    <div data-cardx-menu="1">
                                      <SecondaryButton
                                        onClick={() =>
                                          setManageMenu((prev) =>
                                            prev?.type === "trade" && prev.id === x.tradeId ? null : { type: "trade", id: x.tradeId }
                                          )
                                        }
                                        style={{ height: 34, borderRadius: 12 }}
                                      >
                                        管理
                                      </SecondaryButton>
                                    </div>
                                  </div>
                                </div>

                                {manageMenu?.type === "trade" && manageMenu.id === x.tradeId ? (
                                  <div data-cardx-menu="1" style={{ position: "relative" }}>
                                    <div
                                      style={{
                                        position: "absolute",
                                        right: 0,
                                        top: 0,
                                        zIndex: 40,
                                        width: 220,
                                        borderRadius: 14,
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        boxShadow: "0 14px 40px rgba(0,0,0,0.15)",
                                        padding: 6,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTradeStatus(x.tradeId, x.status === "chatting" ? "matching" : "chatting");
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        {x.status === "matching" ? "改回洽談" : "標記交換中"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTradeStatus(x.tradeId, "completed");
                                          setManageMenu(null);
                                        }}
                                        disabled={x.status === "completed"}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                          opacity: x.status === "completed" ? 0.55 : 1,
                                          pointerEvents: x.status === "completed" ? "none" : undefined,
                                        }}
                                      >
                                        標記完成
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTradeStatus(x.tradeId, "cancelled");
                                          setManageMenu(null);
                                        }}
                                        disabled={x.status === "cancelled"}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#111827",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                          opacity: x.status === "cancelled" ? 0.55 : 1,
                                          pointerEvents: x.status === "cancelled" ? "none" : undefined,
                                        }}
                                      >
                                        標記取消
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          removeTrade(x.tradeId);
                                          setManageMenu(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 38,
                                          borderRadius: 12,
                                          border: "1px solid transparent",
                                          background: "transparent",
                                          color: "#dc2626",
                                          fontSize: 13,
                                          fontWeight: 900,
                                          textAlign: "left",
                                          padding: "0 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        移除
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </SurfaceCard>
                </div>
              ) : null}

              {tab === "orders" ? (
                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setBuyerFilter("all")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={buyerFilter === "all" ? "info" : "muted"}>{buyerFilter === "all" ? `全部 (${orderBucketCounts.all})` : "全部"}</Pill>
                      </button>
                      <button type="button" onClick={() => setBuyerFilter("to_pay")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={buyerFilter === "to_pay" ? "info" : "muted"}>
                          {buyerFilter === "to_pay" ? `待付款 (${orderBucketCounts.to_pay})` : "待付款"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setBuyerFilter("to_ship")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={buyerFilter === "to_ship" ? "info" : "muted"}>
                          {buyerFilter === "to_ship" ? `待出貨 (${orderBucketCounts.to_ship})` : "待出貨"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setBuyerFilter("to_receive")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={buyerFilter === "to_receive" ? "info" : "muted"}>
                          {buyerFilter === "to_receive" ? `待收貨 (${orderBucketCounts.to_receive})` : "待收貨"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setBuyerFilter("completed")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={buyerFilter === "completed" ? "info" : "muted"}>
                          {buyerFilter === "completed" ? `已完成 (${orderBucketCounts.completed})` : "已完成"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setBuyerFilter("after_sales")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={buyerFilter === "after_sales" ? "info" : "muted"}>
                          {buyerFilter === "after_sales" ? `退款/爭議 (${orderBucketCounts.after_sales})` : "退款/爭議"}
                        </Pill>
                      </button>
                    </div>

                    {filteredRecentOrders.length ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {filteredRecentOrders.slice(0, 8).map((x) => (
                          <SurfaceRowLink key={`${x.kind}_${x.id}`} href={`/orders/${x.id}`}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {x.title}
                              </div>
                              <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                {x.status ? <Pill tone="info">{buyerStatusLabel("order", x.status)}</Pill> : null}
                              </div>
                            </div>
                            <span aria-hidden="true" style={{ color: "#6b7280", fontWeight: 900 }}>
                              →
                            </span>
                          </SurfaceRowLink>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>
                        這個狀態目前沒有紀錄。
                      </div>
                    )}

                  </SurfaceCard>
                </div>
              ) : null}

              {tab === "openings" ? (
                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setOpeningFilter("all")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={openingFilter === "all" ? "info" : "muted"}>
                          {openingFilter === "all" ? `全部 (${openingBucketCounts.all})` : "全部"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setOpeningFilter("to_ship")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={openingFilter === "to_ship" ? "info" : "muted"}>
                          {openingFilter === "to_ship" ? `待出貨 (${openingBucketCounts.to_ship})` : "待出貨"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setOpeningFilter("to_receive")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={openingFilter === "to_receive" ? "info" : "muted"}>
                          {openingFilter === "to_receive" ? `待收貨 (${openingBucketCounts.to_receive})` : "待收貨"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setOpeningFilter("completed")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={openingFilter === "completed" ? "info" : "muted"}>
                          {openingFilter === "completed" ? `已完成 (${openingBucketCounts.completed})` : "已完成"}
                        </Pill>
                      </button>
                      <button type="button" onClick={() => setOpeningFilter("after_sales")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                        <Pill tone={openingFilter === "after_sales" ? "info" : "muted"}>
                          {openingFilter === "after_sales" ? `退款/爭議 (${openingBucketCounts.after_sales})` : "退款/爭議"}
                        </Pill>
                      </button>
                    </div>

                    {filteredOpenings.length ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {filteredOpenings.slice(0, 8).map((x) => (
                          <SurfaceRowLink key={`${x.kind}_${x.id}`} href={`/openings/${x.id}`}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {x.title}
                              </div>
                              <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                {x.status ? <Pill tone="info">{buyerStatusLabel("opening", x.status)}</Pill> : null}
                              </div>
                            </div>
                            <span aria-hidden="true" style={{ color: "#6b7280", fontWeight: 900 }}>
                              →
                            </span>
                          </SurfaceRowLink>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>
                        {recentOpenings.length ? "這個狀態目前沒有紀錄。" : "目前沒有卡包紀錄。"}
                      </div>
                    )}

                  </SurfaceCard>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {editModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            data-cardx-modal="1"
            style={{
              width: "min(420px, 100%)",
              borderRadius: 18,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 18px 60px rgba(0,0,0,0.18)",
              padding: 14,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 950, color: "#111827" }}>
              {editModal.kind === "listing" ? "調整價格" : "編輯卡包"}
            </div>

            {editModal.kind === "listing" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>價格（TWD）</div>
                <input
                  value={editModal.price}
                  inputMode="numeric"
                  onChange={(e) => setEditModal((prev) => (prev && prev.kind === "listing" ? { ...prev, price: e.target.value } : prev))}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    color: "#111827",
                    padding: "0 12px",
                    fontSize: 14,
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>價格（TWD）</div>
                  <input
                    value={editModal.price}
                    inputMode="numeric"
                    onChange={(e) => setEditModal((prev) => (prev && prev.kind === "pack" ? { ...prev, price: e.target.value } : prev))}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      color: "#111827",
                      padding: "0 12px",
                      fontSize: 14,
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>庫存</div>
                  <input
                    value={editModal.inventory}
                    inputMode="numeric"
                    onChange={(e) => setEditModal((prev) => (prev && prev.kind === "pack" ? { ...prev, inventory: e.target.value } : prev))}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      color: "#111827",
                      padding: "0 12px",
                      fontSize: 14,
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <SecondaryButton onClick={() => setEditModal(null)} style={{ height: 38, borderRadius: 12 }}>
                取消
              </SecondaryButton>
              <Button3D
                color="blue"
                onClick={() => {
                  if (editModal.kind === "listing") {
                    const num = Number(editModal.price);
                    if (!Number.isFinite(num) || num <= 0) return;
                    setListingPrice(editModal.id, Math.floor(num));
                    setEditModal(null);
                    return;
                  }
                  const price = Number(editModal.price);
                  const inv = Number(editModal.inventory);
                  if (Number.isFinite(price) && price > 0) setCreatorPackPrice(editModal.id, Math.floor(price));
                  if (Number.isFinite(inv) && inv >= 0) setCreatorPackInventory(editModal.id, Math.floor(inv));
                  setEditModal(null);
                }}
                style={{ height: 38, borderRadius: 12 }}
              >
                儲存
              </Button3D>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
