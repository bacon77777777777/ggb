import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from '@/hooks/use-media-query';
import { X, Ticket, ChevronRight, Coins, ChevronLeft, Loader2, Check, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { cn } from '@/lib/utils';
import { useAlert } from '@/components/ui/AlertDialog';
import Image from 'next/image';

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

  useEffect(() => {
    if (isOpen) {
      setView('confirm');
      setQuantity(1);
      setLockedQuantity(null);
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
  const canTenPull = !isSoldOut && maxQuantity >= 10;

  useEffect(() => {
    if (!isOpen || isProcessing) return;
    if (!canTenPull && quantity === 10) {
      setQuantity(1);
    }
  }, [isOpen, isProcessing, canTenPull, quantity]);

  // Calculations
  const totalPrice = product.price * quantity;
  
  // Calculate discount
  const selectedCoupon = coupons.find(c => c.id === selectedCouponId);
  let discountAmount = 0;
  
  // Calculate discount (only applies when NOT using points)
  if (!usePoints && selectedCoupon && selectedCoupon.coupon) {
    if (selectedCoupon.coupon.min_spend <= totalPrice) {
        if (selectedCoupon.coupon.discount_type === 'fixed') {
            discountAmount = selectedCoupon.coupon.discount_value;
        } else if (selectedCoupon.coupon.discount_type === 'percentage') {
            discountAmount = Math.floor(totalPrice * (selectedCoupon.coupon.discount_value / 100));
        }
    }
  }
  
  const finalPrice = Math.max(0, totalPrice - discountAmount);
  const pointsCost = totalPrice * 4; // Points cost is based on original price
  
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
    
    if (isSoldOut) {
      return;
    }

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
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "fixed left-0 right-0 z-[61] bg-white dark:bg-[#1a1b1e] border-t border-neutral-200 dark:border-white/10 flex flex-col max-h-[90vh]",
              isDesktop ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] rounded-2xl border h-auto" : "bottom-0 rounded-t-2xl"
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
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200">
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
                    {/* Quantity Selector */}
                    <div className={cn("bg-neutral-50 dark:bg-neutral-800/50 rounded-xl flex items-center justify-between", isDesktop ? "p-6" : "p-3")}>
                      <span className={cn("font-bold text-neutral-700 dark:text-neutral-300", isDesktop ? "text-[15px]" : "text-[13px]")}>購買數量</span>
                      <div className="flex items-center gap-2">
                        {/*
                          Use effective quantity to keep visual state stable during processing,
                          avoiding flicker from auto-fallback or external updates.
                        */}
                        {(() => {
                          const effectiveQuantity = isProcessing ? (lockedQuantity ?? quantity) : quantity;
                          return (
                            <>
                        <button
                          type="button"
                          onClick={() => setQuantity(1)}
                          disabled={isSoldOut || isProcessing}
                          className={cn(
                            "h-9 md:h-11 px-4 md:px-5 rounded-xl border font-black transition-all active:scale-95",
                            effectiveQuantity === 1
                              ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                              : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                            (isSoldOut || isProcessing) && "opacity-50 cursor-not-allowed hover:bg-white dark:hover:bg-neutral-900"
                          )}
                        >
                          單抽
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (canTenPull) setQuantity(10);
                          }}
                          disabled={isSoldOut || !canTenPull || isProcessing}
                          className={cn(
                            "h-9 md:h-11 px-4 md:px-5 rounded-xl border font-black transition-all active:scale-95",
                            effectiveQuantity === 10
                              ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                              : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                            (isSoldOut || !canTenPull || isProcessing) && "opacity-40 cursor-not-allowed hover:bg-white dark:hover:bg-neutral-900 active:scale-100"
                          )}
                        >
                          十連抽
                        </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Points Toggle */}
                    <div className={cn("bg-neutral-50 dark:bg-neutral-800/50 rounded-xl flex items-center justify-between", isDesktop ? "px-6 py-4" : "p-3")}>
                       <div className="flex items-center gap-2 text-[13px] md:text-[15px] font-black text-neutral-700 dark:text-neutral-300">
                          <Coins className="w-4 h-4 text-yellow-500" />
                          使用積分支付 (4積分 = 1代幣)
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
                         <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                       </label>
                    </div>

                    {/* Coupon Selector */}
                    <div className={cn("bg-neutral-50 dark:bg-neutral-800/50 rounded-xl flex items-center justify-between transition-opacity", isDesktop ? "px-6 py-4" : "p-3", usePoints && "opacity-50 pointer-events-none")}>
                       <div className="flex items-center gap-2 text-[13px] md:text-[15px] font-black text-neutral-700 dark:text-neutral-300">
                          <Ticket className="w-4 h-4 text-accent-yellow" />
                          優惠券
                       </div>
                       <button 
                         onClick={() => setView('coupons')}
                         className="flex items-center gap-1 text-[13px] md:text-[15px] font-bold text-neutral-400 hover:text-neutral-600 transition-colors group"
                       >
                          {selectedCoupon ? (
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
                            <span className="text-neutral-900 dark:text-neutral-100"><span className="font-amount">{totalPrice.toLocaleString()}</span> 元</span>
                          )}
                      </div>
                      
                      {usePoints ? (
                        <div className={cn("flex justify-between items-center font-bold text-neutral-400 dark:text-neutral-500", isDesktop ? "text-[15px]" : "text-[13px]")}>
                          <span>積分餘額</span>
                          <div className="flex flex-col items-end">
                            <span><span className="font-amount">{userPoints.toLocaleString()}</span> 積分</span>
                            {!isInsufficient && pointsCost > 0 && (
                              <span className="text-xs text-emerald-500">購買後剩餘: {(userPoints - pointsCost).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={cn("flex justify-between items-center font-bold text-neutral-400 dark:text-neutral-500", isDesktop ? "text-[15px]" : "text-[13px]")}>
                          <span>代幣餘額</span>
                          <div className="flex flex-col items-end">
                            <span><span className="font-amount">{userTokens.toLocaleString()}</span> 代幣</span>
                            {!isInsufficient && finalPrice > 0 && (
                              <span className="text-xs text-emerald-500">購買後剩餘: {(userTokens - finalPrice).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {discountAmount > 0 && !usePoints && (
                        <div className={cn("flex justify-between items-center font-bold text-accent-red", isDesktop ? "text-[15px]" : "text-[13px]")}>
                            <span>折扣金額</span>
                            <span>-<span className="font-amount">{discountAmount.toLocaleString()}</span> 元</span>
                        </div>
                      )}
                      
                      <div className="h-px bg-neutral-200 dark:bg-neutral-700 border-dashed w-full my-1" />
                      
                      <div className="flex justify-between items-end text-base font-black text-accent-red">
                          <span className={cn(isDesktop ? "text-[15px]" : "text-[13px]")}>實付金額</span>
                          {usePoints ? (
                            <span className={cn("leading-none", isDesktop ? "text-3xl" : "text-xl")}><span className="font-amount">{pointsCost.toLocaleString()}</span> 積分</span>
                          ) : (
                            <span className={cn("leading-none", isDesktop ? "text-3xl" : "text-xl")}><span className="font-amount">{finalPrice.toLocaleString()}</span> 代幣</span>
                          )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Coupon Selection View */
                <div className="p-4 space-y-3">
                  {loadingCoupons ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <span className="text-sm">載入優惠券中...</span>
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
                              <span className="text-xs font-bold px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-md text-neutral-500">
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
                  disabled={isProcessing || isSoldOut}
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
                      ? '處理中...'
                      : usePoints
                        ? `確認支付 ${pointsCost.toLocaleString()} 積分`
                        : `確認支付 ${finalPrice.toLocaleString()} 代幣`}
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
