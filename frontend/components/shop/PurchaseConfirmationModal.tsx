import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from '@/hooks/use-media-query';
import { X, Ticket, ChevronRight, Coins, ChevronLeft, Loader2, Check, Info } from 'lucide-react';
import { IpLoader } from '@/components/ui/IpLoader';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { cn } from '@/lib/utils';
import { useAlert } from '@/components/ui/AlertDialog';
import Image from 'next/image';
import { fetchProductPromotion, promoDiscount, type ProductPromotion } from '@/lib/promotions';

type UserCoupon = Database['public']['Tables']['user_coupons']['Row'] & {
  coupon: Database['public']['Tables']['coupons']['Row'] | null
}

interface PurchaseConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Database['public']['Tables']['products']['Row'];
  userTokens: number;
  userPoints: number;
  isProcessing: boolean;
  onConfirm: (quantity: number, options: { usePoints: boolean, couponId?: string }) => void;
  onTopUp?: () => void;
}

export function PurchaseConfirmationModal({
  isOpen,
  onClose,
  product,
  userTokens,
  userPoints,
  isProcessing,
  onConfirm,
  onTopUp
}: PurchaseConfirmationModalProps) {
  const [quantity, setQuantity] = useState(1);
  const { showAlert } = useAlert();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const router = useRouter();
  const { user } = useAuth();
  
  // Coupon & Points states
  const [usePoints, setUsePoints] = useState(false);
  const [view, setView] = useState<'confirm' | 'coupons'>('confirm');
  const [coupons, setCoupons] = useState<UserCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [lockedQuantity, setLockedQuantity] = useState<number | null>(null);
  // Ref-based lock: updated synchronously before any state change, avoids batching race condition
  const processingQuantityRef = useRef<number>(1);
  // 促銷方案（migration 494 接進 play_gacha/play_ichiban 的那套）。
  // 這裡拿來顯示折抵與快捷湊套數，實際扣款以 DB 為準
  const [promo, setPromo] = useState<ProductPromotion | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void fetchProductPromotion(createClient(), product.id).then(p => { if (alive) setPromo(p); });
    return () => { alive = false; };
  }, [isOpen, product.id]);

  /**
   * 重置只在「開啟的那一刻」跑，單獨一個 effect、只相依 isOpen。
   *
   * 原本跟 ESC／優惠券混在同一個 effect，deps 帶著 onClose ——
   * 父層每次 re-render 都是新的 inline 箭頭函數，effect 就重跑、
   * setQuantity(1) 再執行一次：玩家點了十連抽，一秒後父層任何
   * 狀態更新（餘額刷新、商品 realtime）都會把數量打回單抽。
   */
  useEffect(() => {
    if (!isOpen) return;
    setView('confirm');
    setQuantity(1);
    setLockedQuantity(null);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEsc);

      // Fetch coupons
      if (user) {
        const fetchCoupons = async () => {
          setLoadingCoupons(true);
          const supabase = createClient();
          const { data, error } = await supabase
            .from('user_coupons')
            .select(`
              *,
              coupon:coupons(*)
            `)
            .eq('user_id', user.id)
            .eq('status', 'unused');
            
          if (!error && data) {
            const now = new Date();
            const validCoupons = (data as UserCoupon[]).filter(uc => {
              // 1. Must have coupon definition
              if (!uc.coupon) return false;
              // 2. Coupon definition must be active
              if (uc.coupon.is_active === false) return false;
              // 3. Check expiry if it exists
              if (uc.expiry_date) {
                return new Date(uc.expiry_date) > now;
              }
              // No expiry date means valid forever
              return true;
            });
            setCoupons(validCoupons);
          }
          setLoadingCoupons(false);
        };
        fetchCoupons();
      }

      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEsc);
      };
    }
  }, [isOpen, onClose, user]);

  const maxByRemaining = typeof product.remaining === 'number' ? product.remaining : 0;
  const isSoldOut = product.status === 'ended' || maxByRemaining === 0;
  const maxQuantity = maxByRemaining > 0 ? maxByRemaining : 1;
  // 步進範圍（老闆指定）：最少 1；轉蛋／盒玩最多 20，其餘 10。再受庫存夾制
  const maxCap = product.type === 'gacha' || product.type === 'blindbox' ? 20 : 10;
  const maxSelectable = Math.min(maxCap, maxQuantity);
  const canTenPull = !isSoldOut && maxSelectable >= 10;
  // 庫存變動、重開彈窗時把超出範圍的值拉回來
  useEffect(() => {
    if (!isOpen || isProcessing) return;
    if (quantity > maxSelectable) setQuantity(maxSelectable);
    if (quantity < 1) setQuantity(1);
  }, [isOpen, isProcessing, maxSelectable, quantity]);

  // Freeze displayed quantity during processing so prices stay consistent with button selection
  const effectiveQuantity = isProcessing ? processingQuantityRef.current : quantity;

  // Calculations
  const totalPrice = product.price * effectiveQuantity;

  // 促銷折抵。公式與 DB 的 promo_discount_for 一致（每湊滿 buy+free 抽折 free 抽）。
  // 積分支付不吃促銷（play_gacha 的積分路徑收全額），顯示也要一致
  const promoDiscountAmount = usePoints ? 0 : promoDiscount(promo, effectiveQuantity, product.price);

  // Calculate discount
  const selectedCoupon = coupons.find(c => c.id === selectedCouponId);
  let discountAmount = 0;

  // 優惠券與促銷不疊加（DB 規則：有促銷折抵時優惠券不生效），且僅限代幣支付
  if (!usePoints && promoDiscountAmount === 0 && selectedCoupon && selectedCoupon.coupon) {
    if (selectedCoupon.coupon.min_spend <= totalPrice) {
        if (selectedCoupon.coupon.discount_type === 'fixed') {
            discountAmount = selectedCoupon.coupon.discount_value;
        } else if (selectedCoupon.coupon.discount_type === 'percentage') {
            discountAmount = Math.floor(totalPrice * (selectedCoupon.coupon.discount_value / 100));
        }
    }
  }

  const finalPrice = Math.max(0, totalPrice - promoDiscountAmount - discountAmount);
  const pointsCost = totalPrice * 4;
  
  // Calculate remaining balance after purchase for immediate feedback
  // const remainingTokens = userTokens - finalPrice;
  // const remainingPoints = userPoints - pointsCost;
  
  const isInsufficientTokens = userTokens < finalPrice;
  const isInsufficientPoints = userPoints < pointsCost;
  const isInsufficient = usePoints ? isInsufficientPoints : isInsufficientTokens;

  const handleConfirm = () => {
    if (!user) {
      showAlert({
        title: '提示',
        message: '請先登入會員',
        type: 'info',
        confirmText: '前往登入',
        onConfirm: () => router.push(`/login?redirect=/item/${product.id}`)
      });
      return;
    }

    // 售罄或數量異常（下限 1，理論上到不了 0，留一道保險）
    if (isSoldOut || quantity < 1) {
      return;
    }

    // Set ref synchronously before any state/prop changes (no batching delay)
    processingQuantityRef.current = quantity;
    setLockedQuantity(quantity);
    if (isInsufficient) {
      if (usePoints) {
        showAlert({
          title: '積分不足',
          message: '您的積分餘額不足',
          type: 'info'
        });
      } else {
        onClose();
        showAlert({
          title: '餘額不足',
          message: '您的代幣餘額不足，是否前往儲值？',
          type: 'confirm',
          confirmText: '前往儲值',
          onConfirm: () => onTopUp?.()
        });
      }
      return;
    }

    onConfirm(Math.min(quantity, maxQuantity), { usePoints, couponId: selectedCouponId || undefined });
  };

  // Helper to get available coupons for current price
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ opacity: 0, y: isDesktop ? 0 : '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isDesktop ? 0 : '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "fixed z-[61] bg-white dark:bg-[#1a1b1e] flex flex-col max-h-[90vh] overflow-hidden",
              isDesktop
                ? "inset-0 m-auto w-[480px] h-fit rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl"
                : "left-0 right-0 bottom-0 rounded-t-2xl border-t border-neutral-200 dark:border-white/10"
            )}
          >
            {/* Header */}
            <div className={cn(
              "flex justify-between items-center border-b border-neutral-100 dark:border-neutral-800",
              isDesktop ? "px-6 py-4" : "px-4 py-3"
            )}>
              <div className="flex items-center gap-2">
                {view === 'coupons' && (
                  <button 
                    onClick={() => setView('confirm')}
                    className="p-1 -ml-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <h3 className={cn("font-black text-neutral-900 dark:text-white", isDesktop ? "text-xl" : "text-base")}>
                  {view === 'coupons' ? '選擇優惠券' : '購買確認'}
                </h3>
              </div>
              <button 
                onClick={onClose}
                className="p-1 -mr-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-transform"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {view === 'confirm' ? (
                <>
                  {/* Product Info */}
                  <div className={cn("flex gap-3", isDesktop ? "p-6 pb-4 gap-5" : "p-3 pb-2")}>
                    <div className={cn(
                      "relative bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden shrink-0 shadow-sm border border-neutral-100 dark:border-neutral-700",
                      isDesktop ? "w-16 h-16" : "w-12 h-12"
                    )}>
                      <Image
                        src={product.image_url || `/images/item/${product.id.toString().padStart(5, '0')}.jpg`}
                        alt={product.name}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.srcset = '/images/item.png';
                          target.src = '/images/item.png';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
                      <div>
                        <h3 className={cn("font-black text-neutral-900 dark:text-white leading-tight line-clamp-1", isDesktop ? "text-xl" : "text-base")}>
                          {product.name}
                        </h3>
                      </div>
                      {product.is_preorder && (
                        <div className="mt-1">
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-yellow-50 text-yellow-700 border border-yellow-200">
                            <Info className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold">
                              預購商品，預計可配送日 {product.preorder_available_at ? new Date(product.preorder_available_at).toLocaleDateString() : '待公布'}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col justify-end mt-1">
                        <div className="flex items-center gap-1">
                          <div className={cn("relative shrink-0", isDesktop ? "w-6 h-6" : "w-5 h-5")}>
                            <Image 
                              src="/images/gcoin.png" 
                              alt="G" 
                              fill
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                          <div className="flex items-baseline gap-0.5">
                            <span className={cn("font-black text-accent-red font-amount leading-none tracking-tighter", isDesktop ? "text-2xl" : "text-lg")}>{product.price.toLocaleString()}</span>
                            <span className={cn("font-black text-neutral-400 leading-none uppercase tracking-widest", isDesktop ? "text-[15px]" : "text-[13px]")}>/抽</span>
                            <span className={cn("font-black text-neutral-400 leading-none ml-1", isDesktop ? "text-[15px]" : "text-[13px]")}>
                              優惠前：<span className="line-through font-amount">{Math.round(product.price * 1.2).toLocaleString()}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={cn("space-y-2", isDesktop ? "px-6 pb-6 space-y-4" : "px-3")}>
                    {/* Quantity Selector（老闆核可的版型）：
                        操作列＝標題｜膠囊步進（⊖ n ⊕ 合成一個零件）｜十連抽。
                        促銷不做按鈕 —— 改為下方的動態提示列：未湊滿時整列可點、
                        一鍵補到門檻；已湊滿顯示已折金額。按鈕講不清規則，一句話可以 */}
                    <div className={cn("bg-neutral-50 dark:bg-neutral-800/50 rounded-xl", isDesktop ? "p-6" : "p-3")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("shrink-0 font-bold text-neutral-700 dark:text-neutral-300", isDesktop ? "text-[15px]" : "text-[13px]")}>購買數量</span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
                            <StepBtn
                              onStep={() => setQuantity(q => Math.max(1, q - 1))}
                              disabled={isSoldOut || isProcessing || effectiveQuantity <= 1}
                            >
                              −
                            </StepBtn>
                            <span className={cn(
                              "text-center font-black tabular-nums text-neutral-900 dark:text-neutral-50",
                              isDesktop ? "w-10 text-lg" : "w-8 text-base"
                            )}>
                              {effectiveQuantity}
                            </span>
                            <StepBtn
                              onStep={() => setQuantity(q => Math.min(maxSelectable, q + 1))}
                              disabled={isSoldOut || isProcessing || effectiveQuantity >= maxSelectable}
                            >
                              ＋
                            </StepBtn>
                          </div>
                          {canTenPull && (
                            <QuickBtn
                              active={effectiveQuantity === 10}
                              onClick={() => setQuantity(10)}
                              disabled={isSoldOut || isProcessing}
                            >
                              十連抽
                            </QuickBtn>
                          )}
                        </div>
                      </div>

                      {/* 促銷提示列（bundle 且代幣支付才有意義） */}
                      {promo && promo.type === 'bundle' && promo.free > 0 && !usePoints && (() => {
                        const unit = promo.buy + promo.free;
                        const sets = Math.floor(effectiveQuantity / unit);
                        const nextQty = (sets + 1) * unit;
                        const reachable = nextQty <= maxSelectable;
                        const perSet = promo.free * product.price;
                        if (promoDiscountAmount === 0 && !reachable) return null;
                        return (
                          <button
                            type="button"
                            disabled={!reachable || isSoldOut || isProcessing}
                            onClick={() => { if (reachable) setQuantity(nextQty); }}
                            className={cn(
                              "mt-2.5 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] md:text-[13px] font-bold transition-colors",
                              promoDiscountAmount > 0
                                ? "bg-accent-emerald/10 text-accent-emerald"
                                : "bg-accent-red/5 text-accent-red active:bg-accent-red/10"
                            )}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {promoDiscountAmount > 0 ? (
                                <>
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">已享 {promo.name}，折 {promoDiscountAmount.toLocaleString()} G</span>
                                </>
                              ) : (
                                <span className="truncate">再 +{nextQty - effectiveQuantity} 抽湊滿 {nextQty} 抽，現折 {perSet.toLocaleString()} G</span>
                              )}
                            </span>
                            {reachable && promoDiscountAmount === 0 && <ChevronRight className="w-4 h-4 shrink-0" />}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Points Toggle */}
                    <div className={cn("bg-neutral-50 dark:bg-neutral-800/50 rounded-xl flex items-center justify-between", isDesktop ? "px-6 py-4" : "p-3")}>
                       <div className="flex items-center gap-2 text-[13px] md:text-[15px] font-black text-neutral-700 dark:text-neutral-300">
                          <Coins className="w-4 h-4 text-yellow-500" />
                          使用積分支付（4 積分 = 1 G）
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer">
                         <input 
                           type="checkbox" 
                           className="sr-only peer" 
                           checked={usePoints}
                           onChange={(e) => {
                             setUsePoints(e.target.checked);
                             if (e.target.checked) {
                               setSelectedCouponId(null);
                             }
                           }}
                         />
                         <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-blue-600"></div>
                       </label>
                    </div>

                    {/* Coupon Selector。促銷與優惠券不疊加（DB 規則）：
                        有促銷折抵時鎖住並講明原因，不是無聲變灰 */}
                    <div className={cn("bg-neutral-50 dark:bg-neutral-800/50 rounded-xl flex items-center justify-between transition-opacity", isDesktop ? "px-6 py-4" : "p-3", (usePoints || promoDiscountAmount > 0) && "opacity-50 pointer-events-none")}>
                       <div className="flex items-center gap-2 text-[13px] md:text-[15px] font-black text-neutral-700 dark:text-neutral-300">
                          <Ticket className="w-4 h-4 text-accent-yellow" />
                          優惠券
                       </div>
                       <button
                         onClick={() => setView('coupons')}
                         className="flex items-center gap-1 text-[13px] md:text-[15px] font-bold text-neutral-400 hover:text-neutral-600 transition-colors group"
                       >
                          {promoDiscountAmount > 0 ? (
                            "不與促銷併用"
                          ) : selectedCoupon ? (
                            <span className="text-accent-red">
                              {selectedCoupon.coupon?.discount_type === 'fixed' ? `-$${discountAmount}` : `-${selectedCoupon.coupon?.discount_value}%`}
                            </span>
                          ) : (
                            "選擇優惠券"
                          )}
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                       </button>
                    </div>

                    {/* Subtotal Block */}
                    <div className={cn("bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-2 mb-3", isDesktop ? "p-6 space-y-4" : "p-3")}>
                      <div className={cn("flex justify-between items-center font-bold text-neutral-500 dark:text-neutral-400", isDesktop ? "text-[15px]" : "text-[13px]")}>
                          <span>商品總額</span>
                          {usePoints ? (
                            <span className="text-neutral-900 dark:text-neutral-100"><span className="font-amount">{pointsCost.toLocaleString()}</span> 積分</span>
                          ) : (
                            <GAmount value={totalPrice} className="text-neutral-900 dark:text-neutral-100" />
                          )}
                      </div>
                      
                      {usePoints ? (
                        <div className={cn("flex justify-between items-center font-bold text-neutral-400 dark:text-neutral-500", isDesktop ? "text-[15px]" : "text-[13px]")}>
                          <span>積分餘額</span>
                          <div className="flex flex-col items-end">
                            <span><span className="font-amount">{userPoints.toLocaleString()}</span> 積分</span>
                            {!isInsufficient && pointsCost > 0 && (
                              <span className="text-xs text-accent-emerald">購買後剩餘: {(userPoints - pointsCost).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={cn("flex justify-between items-center font-bold text-neutral-400 dark:text-neutral-500", isDesktop ? "text-[15px]" : "text-[13px]")}>
                          <span>G 幣餘額</span>
                          <div className="flex flex-col items-end">
                            <GAmount value={userTokens} />
                            {!isInsufficient && finalPrice > 0 && (
                              <span className="text-xs text-accent-emerald">購買後剩餘: {(userTokens - finalPrice).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {promoDiscountAmount > 0 && !usePoints && (
                        <div className={cn("flex justify-between items-center font-bold text-accent-red", isDesktop ? "text-[15px]" : "text-[13px]")}>
                            <span>活動促銷{promo ? `（${promo.badgeText || promo.name}）` : ''}</span>
                            <GAmount value={promoDiscountAmount} negative />
                        </div>
                      )}
                      {discountAmount > 0 && !usePoints && (
                        <div className={cn("flex justify-between items-center font-bold text-accent-red", isDesktop ? "text-[15px]" : "text-[13px]")}>
                            <span>折扣金額</span>
                            <GAmount value={discountAmount} negative />
                        </div>
                      )}
                      
                      <div className="h-px bg-neutral-200 dark:bg-neutral-700 border-dashed w-full my-1" />
                      
                      <div className="flex justify-between items-end text-base font-black text-accent-red">
                          <span className={cn(isDesktop ? "text-[15px]" : "text-[13px]")}>實付金額</span>
                          {usePoints ? (
                            <span className={cn("leading-none", isDesktop ? "text-3xl" : "text-xl")}><span className="font-amount">{pointsCost.toLocaleString()}</span> 積分</span>
                          ) : (
                            <GAmount value={finalPrice} iconSize={isDesktop ? 24 : 18} className={cn("leading-none", isDesktop ? "text-3xl" : "text-xl")} />
                          )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Coupon Selection View */
                <div className="p-4 space-y-3">
                  {loadingCoupons ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <IpLoader />
                    </div>
                  ) : coupons.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <Ticket className="w-12 h-12 mb-3 opacity-20" />
                      <span className="text-sm font-bold">暫無可用優惠券</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setSelectedCouponId(null);
                          setView('confirm');
                        }}
                        className={cn(
                          "w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden group",
                          selectedCouponId === null
                            ? "border-neutral-900 bg-neutral-50 dark:bg-neutral-800 dark:border-white"
                            : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
                        )}
                      >
                        <span className="font-bold text-neutral-900 dark:text-white">不使用優惠券</span>
                        {selectedCouponId === null && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full p-1">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                      
                      {coupons.map((userCoupon) => {
                        const coupon = userCoupon.coupon;
                        if (!coupon) return null;
                        
                        // Check if applicable
                        const isApplicable = coupon.min_spend <= totalPrice;
                        const isSelected = selectedCouponId === userCoupon.id;
                        
                        return (
                          <button
                            key={userCoupon.id}
                            onClick={() => {
                              if (isApplicable) {
                                setSelectedCouponId(userCoupon.id);
                                setView('confirm');
                              }
                            }}
                            disabled={!isApplicable}
                            className={cn(
                              "w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden group",
                              isSelected
                                ? "border-accent-red bg-accent-red/5"
                                : isApplicable
                                  ? "border-neutral-200 bg-white hover:border-accent-red/50 dark:border-neutral-800 dark:bg-neutral-900"
                                  : "border-neutral-100 bg-neutral-50 opacity-60 cursor-not-allowed dark:border-neutral-800 dark:bg-neutral-900"
                            )}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className={cn("font-black text-lg", isSelected ? "text-accent-red" : "text-neutral-900 dark:text-white")}>
                                {coupon.code}
                              </span>
                              <span className="text-xs font-bold px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-neutral-500">
                                {coupon.discount_type === 'fixed' ? '折抵金額' : '折扣百分比'}
                              </span>
                            </div>
                            
                            <div className={cn("text-sm font-bold mb-2", isSelected ? "text-accent-red/80" : "text-neutral-500")}>
                              {coupon.description || (coupon.discount_type === 'fixed' ? `立折 $${coupon.discount_value}` : `打 ${100 - coupon.discount_value} 折`)}
                            </div>
                            
                            <div className="text-xs text-neutral-400">
                              低消限制: ${coupon.min_spend}
                            </div>

                            {isSelected && (
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-accent-red text-white rounded-full p-1">
                                <Check className="w-4 h-4" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer Payment Info & Button */}
            {view === 'confirm' && (
              <div className={cn(
                "bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-10 flex items-center justify-center mt-auto",
                isDesktop ? "h-24 px-6 rounded-b-[24px]" : "min-h-16 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
              )}>
                <Button
                  onClick={handleConfirm}
                  disabled={isProcessing || isSoldOut || effectiveQuantity < 1}
                  className={cn(
                    "w-full rounded-xl font-black shadow-xl transition-all",
                    isDesktop ? "h-[52px] text-lg" : "h-[44px] text-base",
                    isSoldOut
                      ? "bg-neutral-300 text-neutral-500 shadow-none cursor-not-allowed"
                      : "bg-accent-red text-white shadow-accent-red/20 hover:bg-accent-red/90 active:scale-[0.98]"
                  )}
                  variant={isSoldOut ? "secondary" : "danger"}
                >
                  {isSoldOut
                    ? '商品已完抽'
                    : isProcessing
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />處理中...</span>
                      : usePoints
                        ? `確認支付 ${pointsCost.toLocaleString()} 積分`
                        : <span className="flex items-center justify-center gap-1.5">確認支付 <GAmount value={finalPrice} iconSize={16} /></span>}
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


/**
 * 數量步進鈕：點一下 +1／-1，按住 400ms 後每 90ms 連發（快速加減）。
 *
 * 用 pointerdown 觸發而不是 onClick —— 兩個都掛會在放開時多跳一步。
 * 放開的監聽掛在 window：手指按住時滑出按鈕範圍再放開，按鈕自己收不到
 * pointerup，不掛 window 連發就停不下來。到達邊界後 setQuantity 的夾制
 * 讓連發自然無效，不用特別停表。
 */
function StepBtn({ children, onStep, disabled }: {
  children: React.ReactNode; onStep: () => void; disabled: boolean;
}) {
  const holdRef = useRef<{ t?: ReturnType<typeof setTimeout>; iv?: ReturnType<typeof setInterval> }>({});

  const stop = React.useCallback(() => {
    if (holdRef.current.t) clearTimeout(holdRef.current.t);
    if (holdRef.current.iv) clearInterval(holdRef.current.iv);
    holdRef.current = {};
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  }, []);

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    onStep();
    holdRef.current.t = setTimeout(() => {
      holdRef.current.iv = setInterval(onStep, 90);
    }, 400);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button" disabled={disabled}
      onPointerDown={start}
      onContextMenu={e => e.preventDefault()}
      className={cn(
        "w-8 h-8 md:w-10 md:h-10 rounded-full bg-neutral-200/70 dark:bg-neutral-700",
        "text-neutral-700 dark:text-neutral-200 font-black md:text-lg select-none touch-none",
        "disabled:opacity-40 hover:bg-neutral-300/70 dark:hover:bg-neutral-600 transition-colors"
      )}
    >
      {children}
    </button>
  );
}

/** 快捷數量鈕（十連抽、促銷湊套）。accent 給促銷用，紅字提醒有折扣 */
function QuickBtn({ children, onClick, disabled, active, accent }: {
  children: React.ReactNode; onClick: () => void; disabled: boolean;
  active: boolean; accent?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={cn(
        // 高度對齊 StepBtn（h-8 / md:h-10），排成一行才不會高低差
        "h-8 md:h-10 px-2.5 md:px-4 rounded-full border text-[12px] md:text-sm font-black transition-all active:scale-95 whitespace-nowrap",
        active
          ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
          : accent
            ? "bg-white dark:bg-neutral-900 border-accent-red/40 text-accent-red hover:bg-accent-red/5"
            : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

/** G 幣金額：金幣圖標＋數字。全彈窗的 G 金額都走這裡，單位不再寫「元」「代幣」 */
function GAmount({ value, negative, iconSize = 14, className }: {
  value: number; negative?: boolean; iconSize?: number; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
      {negative && <span>-</span>}
      <Image src="/images/gcoin.png" alt="G" width={iconSize} height={iconSize}
        className="inline-block shrink-0" style={{ width: iconSize, height: iconSize }} />
      <span className="font-amount">{value.toLocaleString()}</span>
    </span>
  );
}
