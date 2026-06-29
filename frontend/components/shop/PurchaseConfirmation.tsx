import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Database } from '@/types/database.types';
import { cn } from '@/lib/utils';
import { Ticket, ChevronRight, Coins, ChevronLeft, Loader2, Check, Info } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertDialog';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type UserCoupon = Database['public']['Tables']['user_coupons']['Row'] & {
  coupon: Database['public']['Tables']['coupons']['Row'] | null
}

interface PurchaseConfirmationProps {
  product: Database['public']['Tables']['products']['Row'];
  selectedTickets: number[];
  totalPrice: number;
  userTokens: number;
  userPoints: number;
  onConfirm: (options: { usePoints: boolean, couponId?: string }) => void;
  onCancel?: () => void;
  onTopUp?: () => void;
  isProcessing?: boolean;
  isLoggedIn?: boolean;
  onLogin?: () => void;
}

export function PurchaseConfirmation({
  product,
  selectedTickets,
  totalPrice,
  userTokens,
  userPoints,
  onConfirm,
  onTopUp,
  isProcessing = false,
  isLoggedIn = false,
  onLogin,
  className
}: PurchaseConfirmationProps & { className?: string }) {
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const [usePoints, setUsePoints] = useState(false);
  
  // Coupon states
  const [view, setView] = useState<'confirm' | 'coupons'>('confirm');
  const [coupons, setCoupons] = useState<UserCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [loadingCoupons, setLoadingCoupons] = useState(false);

  useEffect(() => {
    const fetchCoupons = async () => {
      setLoadingCoupons(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_coupons')
        .select(`
          *,
          coupon:coupons(*)
        `)
        .eq('user_id', user!.id)
        .eq('status', 'unused');
        
      if (error) {
        setCoupons([]);
        setLoadingCoupons(false);
        return;
      }

      if (data) {
        const now = new Date();
        const validCoupons = (data as UserCoupon[]).filter(uc => {
          if (!uc.coupon) return false;
          if (uc.coupon.is_active === false) return false;
          if (uc.expiry_date) {
            return new Date(uc.expiry_date) > now;
          }
          return true;
        });
        setCoupons(validCoupons);
      }
      setLoadingCoupons(false);
    };

    if (isLoggedIn && user) {
      fetchCoupons();
    }
  }, [isLoggedIn, user]);

  const selectedCoupon = coupons.find(c => c.id === selectedCouponId);
  let discountAmount = 0;
  
  // Calculate discount (only applies when NOT using points, for now)
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
  const pointsCost = totalPrice * 4; // Points cost is based on original price usually
  
  const isInsufficientTokens = userTokens < finalPrice;
  const isInsufficientPoints = userPoints < pointsCost;
  const isInsufficient = usePoints ? isInsufficientPoints : isInsufficientTokens;
  
  const currentCount = selectedTickets.length;

  // Coupon Selection View
  if (view === 'coupons') {
    
    return (
      <div className={cn("w-full bg-white dark:bg-neutral-900 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-full md:h-auto md:min-h-[500px]", className)}>
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
          <button 
            onClick={() => setView('confirm')}
            className="p-2 -ml-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-500" />
          </button>
          <h3 className="text-lg font-black text-neutral-900 dark:text-white">選擇優惠券</h3>
          <div className="w-9" />
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loadingCoupons ? (
             <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
               <Loader2 className="w-6 h-6 animate-spin" />
               <span className="text-sm font-bold">載入中...</span>
             </div>
          ) : coupons.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
               <Ticket className="w-12 h-12 opacity-20" />
               <span className="text-sm font-bold">目前沒有可用的優惠券</span>
             </div>
          ) : (
            <>
              <button
                onClick={() => {
                  setSelectedCouponId(null);
                  setView('confirm');
                }}
                className={cn(
                  "w-full p-4 rounded-xl border-2 text-left transition-all",
                  selectedCouponId === null
                    ? "border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800"
                    : "border-transparent bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-700 dark:text-neutral-200">不使用優惠券</span>
                  {selectedCouponId === null && <Check className="w-5 h-5 text-neutral-900 dark:text-white" />}
                </div>
              </button>

              {coupons.map(coupon => {
                const isAvailable = coupon.coupon && coupon.coupon.min_spend <= totalPrice;
                return (
                  <button
                    key={coupon.id}
                    disabled={!isAvailable}
                    onClick={() => {
                      if (isAvailable) {
                        setSelectedCouponId(coupon.id);
                        setView('confirm');
                      }
                    }}
                    className={cn(
                      "w-full relative overflow-hidden rounded-xl border-2 text-left transition-all group",
                      selectedCouponId === coupon.id
                        ? "border-accent-red bg-accent-red/5"
                        : "border-transparent bg-white dark:bg-neutral-800 shadow-sm border-neutral-100 dark:border-neutral-700",
                      !isAvailable && "opacity-50 grayscale cursor-not-allowed"
                    )}
                  >
                    <div className="p-4 flex gap-4">
                      <div className="w-24 shrink-0 flex flex-col items-center justify-center border-r border-dashed border-neutral-200 dark:border-neutral-600 pr-4">
                        <span className="text-2xl font-black text-accent-red font-amount">
                          {coupon.coupon?.discount_type === 'fixed' ? `$${coupon.coupon.discount_value}` : `${coupon.coupon?.discount_value}%`}
                        </span>
                        <span className="text-xs font-bold text-neutral-500 mt-1">OFF</span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="font-bold text-neutral-900 dark:text-white truncate">
                          {coupon.coupon?.code}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          低消 ${coupon.coupon?.min_spend?.toLocaleString()}
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          {(coupon.expiry_date ? new Date(coupon.expiry_date).toLocaleDateString() : '—')} 到期
                        </div>
                      </div>
                      <div className="flex items-center">
                        {selectedCouponId === coupon.id && (
                          <div className="w-6 h-6 rounded-full bg-accent-red text-white flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    );
  }

  // Confirmation View
  return (
    <div className={cn("w-full bg-white dark:bg-neutral-900 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300", className)}>
      
      <div className="flex-1 min-h-0">
        {/* Header: Product Info */}
        <div className="p-3 md:p-6 pb-2 md:pb-4 flex gap-3 md:gap-5">
          <div className="relative w-12 h-12 md:w-16 md:h-16 bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden shrink-0 shadow-sm border border-neutral-100 dark:border-neutral-700">
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
              <h3 className="font-black text-neutral-900 dark:text-white leading-tight line-clamp-1 text-base md:text-xl">
                {product.name}
              </h3>
            </div>
            {product.is_preorder && (
              <div className="mt-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200">
                  <Info className="w-3.5 h-3.5" />
                  <span className="text-[11px] md:text-[12px] font-bold">
                    預購商品，預計可配送日 {product.preorder_available_at ? new Date(product.preorder_available_at).toLocaleDateString() : '待公布'}
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-col justify-end mt-1">
              <div className="flex items-center gap-1">
                <Image
                        src="/images/gcoin.png"
                        alt="G Coin"
                        width={24}
                        height={24}
                        className="w-5 h-5 md:w-6 md:h-6 object-contain"
                      />
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg md:text-2xl font-black text-accent-red font-amount leading-none tracking-tighter">{product.price.toLocaleString()}</span>
                  <span className="text-[13px] md:text-[15px] font-black text-neutral-400 leading-none uppercase tracking-widest">/抽</span>
                  <span className="text-[13px] md:text-[15px] font-black text-neutral-400 leading-none ml-1">
                    優惠前：<span className="line-through font-amount">{Math.round(product.price * 1.2).toLocaleString()}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Tickets */}
        <div className="px-3 md:px-6 pb-2 md:pb-4">
          <div className="text-[13px] md:text-[15px] font-black text-neutral-400 mb-1 uppercase tracking-widest">已選擇票券:</div>
          <div className="w-full max-h-[150px] md:max-h-[260px] overflow-y-auto custom-scrollbar pr-1 md:pr-2">
            <div className="grid grid-cols-10 gap-1 md:gap-2 w-full">
            {selectedTickets.map(num => (
              <div 
                key={num} 
                className="aspect-square bg-primary text-white rounded-md flex items-center justify-center font-amount font-black text-[13px] md:text-[15px] shadow-sm shadow-primary/30 leading-none"
              >
                {num.toString().padStart(2, '0')}
              </div>
            ))}
            </div>
          </div>
        </div>

        {/* Summary Text */}
        <div className="text-center text-[13px] md:text-[15px] font-bold text-neutral-500 dark:text-neutral-400 mb-1 px-3 md:px-6">
           總計: <span className="font-amount">{currentCount.toLocaleString()}</span> 張票券
           <span className="text-[13px] md:text-[15px] text-neutral-400 ml-2">購買後扣除{usePoints ? '積分' : '代幣'}並抽選</span>
        </div>

        {/* Divider */}
        <div className="h-1 bg-neutral-100/50 dark:bg-neutral-800/50 w-full shrink-0" />

        {/* Options Rows */}
        <div className="px-3 md:px-6 py-2 md:py-4 space-y-2 md:space-y-4">
           {/* Points Toggle */}
           <div className="flex justify-between items-center pt-2">
              <div className="flex items-center gap-2 text-[13px] md:text-[15px] font-black text-neutral-700 dark:text-neutral-300">
                 <Coins className="w-3.5 h-3.5 md:w-4 md:h-4 text-yellow-500" />
                 使用積分支付 (4積分 = 1代幣)
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={usePoints}
                  onChange={(e) => {
                    setUsePoints(e.target.checked);
                    // If using points, reset coupon selection as coupons usually apply to cash/token price
                    if (e.target.checked) {
                      setSelectedCouponId(null);
                    }
                  }}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
           </div>

           {/* Coupons */}
           <div className={cn("flex justify-between items-center pt-2 transition-opacity", usePoints && "opacity-50 pointer-events-none")}>
              <div className="flex items-center gap-2 text-[13px] md:text-[15px] font-black text-neutral-700 dark:text-neutral-300">
                 <Ticket className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent-yellow" />
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
                 <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
           </div>

           {/* Subtotal Block */}
           <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-3 md:p-6 mt-2 space-y-2 md:space-y-4">
              <div className="flex justify-between items-center text-[13px] md:text-[15px] font-bold text-neutral-500">
                 <span>商品總額</span>
                 <span className="text-neutral-900">
                   <span className="font-amount">
                     {usePoints ? pointsCost.toLocaleString() : totalPrice.toLocaleString()}
                   </span> {usePoints ? '積分' : '元'}
                 </span>
              </div>
              
              {discountAmount > 0 && !usePoints && (
                <div className="flex justify-between items-center text-[13px] md:text-[15px] font-bold text-accent-red">
                   <span>優惠券折抵</span>
                   <span>
                     -<span className="font-amount">{discountAmount.toLocaleString()}</span> 元
                   </span>
                </div>
              )}

              <div className="flex justify-between items-center text-[13px] md:text-[15px] font-bold text-neutral-400">
                 <span>{usePoints ? '積分餘額' : '代幣餘額'}</span>
                 <div className="flex flex-col items-end">
                   <span>
                     <span className="font-amount">
                       {usePoints ? userPoints.toLocaleString() : userTokens.toLocaleString()}
                     </span> {usePoints ? '積分' : '代幣'}
                   </span>
                   {!isInsufficient && (usePoints ? pointsCost > 0 : finalPrice > 0) && (
                      <span className="text-xs text-emerald-500">
                        購買後剩餘: {usePoints ? (userPoints - pointsCost).toLocaleString() : (userTokens - finalPrice).toLocaleString()}
                      </span>
                   )}
                 </div>
              </div>
              <div className="h-px bg-neutral-200 dark:bg-neutral-700 border-dashed w-full my-1" />
              <div className="flex justify-between items-end text-base font-black text-accent-red">
                 <span className="text-[13px] md:text-[15px]">實付金額</span>
                 <span className="text-xl md:text-3xl leading-none">
                   <span className="font-amount">
                     {usePoints ? pointsCost.toLocaleString() : finalPrice.toLocaleString()}
                   </span> {usePoints ? '積分' : '元'}
                 </span>
              </div>
            {isInsufficient && (
              <div className="text-right text-xs text-red-500 font-bold">
                餘額不足，請{usePoints ? '獲得更多積分' : '儲值'}
              </div>
            )}
           </div>
        </div>
      </div>

      {/* Footer Payment Info & Button */}
      <div className="min-h-16 md:h-20 px-4 md:px-6 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-10 flex items-center justify-center mt-auto rounded-b-3xl pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:pt-0 md:pb-0">
         <Button 
          onClick={() => {
            if (!isLoggedIn) {
              showAlert({
                title: '提示',
                message: '請先登入會員',
                type: 'info',
                confirmText: '前往登入',
                onConfirm: () => onLogin?.()
              });
              return;
            }
            if (isInsufficient) {
              if (usePoints) {
                showAlert({
                  title: '積分不足',
                  message: '您的積分餘額不足',
                  type: 'info'
                });
              } else {
                showAlert({
                  title: '餘額不足',
                  message: '您的代幣餘額不足，是否前往儲值？',
                  type: 'confirm',
                  confirmText: '前往儲值',
                  onConfirm: () => onTopUp?.()
                });
              }
            } else {
              onConfirm({ usePoints, couponId: selectedCouponId || undefined });
            }
          }}
          disabled={selectedTickets.length === 0 || isProcessing}
          className="w-full h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-accent-red hover:bg-accent-red/90 text-white shadow-xl shadow-accent-red/20 transition-all active:scale-[0.98]"
          variant="danger"
        >
           {isProcessing ? '處理中...' : `確認支付 ${usePoints ? pointsCost.toLocaleString() + ' 積分' : finalPrice.toLocaleString() + ' 代幣'}`}
         </Button>
      </div>
    </div>
  );
}
