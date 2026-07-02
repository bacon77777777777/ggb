'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { 
  CreditCard, 
  Smartphone, 
  Banknote, 
  CheckCircle2, 
  Zap,
  Lock,
  Globe,
  Store,
  Barcode,
  X
} from 'lucide-react';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

const TOPUP_PLANS = [
  { id: 'p1', amount: 100, points: 100, bonus: 0, isHot: false },
  { id: 'p2', amount: 500, points: 500, bonus: 25, isHot: false },
  { id: 'p3', amount: 1000, points: 1000, bonus: 80, isHot: true },
  { id: 'p4', amount: 3000, points: 3000, bonus: 300, isHot: false },
  { id: 'p5', amount: 5000, points: 5000, bonus: 600, isHot: false },
  { id: 'p6', amount: 100000, points: 100000, bonus: 15000, isHot: false },
];

const PAYMENT_METHODS = [
  { id: 'credit_card', name: '信用卡 / 金融卡', icon: <CreditCard className="w-5 h-5" /> },
  { id: 'webatm', name: 'WebATM', icon: <Globe className="w-5 h-5" /> },
  { id: 'vacc', name: 'ATM 轉帳', icon: <Banknote className="w-5 h-5" /> },
  { id: 'cvs', name: '超商代碼繳費', icon: <Store className="w-5 h-5" /> },
  { id: 'barcode', name: '超商條碼繳費', icon: <Barcode className="w-5 h-5" /> },
  { id: 'line_pay', name: 'LINE Pay', icon: <Smartphone className="w-5 h-5 text-[#00C300]" /> },
  { id: 'other', name: '其他 (測試用)', icon: <Zap className="w-5 h-5 text-yellow-500" /> },
];

export default function TopupPage() {
  const { user, isAuthenticated, isLoading, refreshProfile } = useAuth();
  // const userTokens = user?.tokens || 0;
  const { showToast } = useToast();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  
  const [selectedPlan, setSelectedPlan] = useState(TOPUP_PLANS[2]);
  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0].id);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const isProcessingRef = useRef(false);

  const [paymentData, setPaymentData] = useState<{
    MerchantID: string;
    TradeInfo: string;
    TradeSha: string;
    Version: string;
    ApiUrl: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (paymentData && formRef.current) {
      formRef.current.submit();
    }
  }, [paymentData]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const openConfirmModal = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirmTopup = async () => {
    if (isProcessing || isProcessingRef.current) return;
    
    setIsProcessing(true);
    isProcessingRef.current = true;
    
    try {
      if (!user) throw new Error('請先登入後再嘗試');

      if (selectedMethod === 'other') {
        const { error } = await supabase.rpc('process_test_topup', {
          p_amount: selectedPlan.amount,
          p_bonus: selectedPlan.bonus
        });
        
        if (error) throw new Error(error.message);

        // Fire-and-forget: 任務追蹤 + 成就檢查
        if (user) {
          Promise.allSettled([
            supabase.rpc('track_mission_event', { p_event_type: 'recharge' }),
            supabase.rpc('track_mission_event', { p_event_type: 'recharge_amount', p_data: { amount: selectedPlan.amount } }),
            supabase.rpc('check_achievements', { p_user_id: user.id }),
          ]).catch(() => {});
        }

        showToast('儲值成功！', 'success');
        if (refreshProfile) await refreshProfile();
        router.push('/profile?tab=topup-history');
        return;
      }
      
      // 確認有有效 Session（避免因未攜帶 JWT 導致 anon 身份）
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        throw new Error('找不到有效登入狀態，請重新登入後再試');
      }

      // 統一透過後端建立藍新金流訂單
      // 1. 優先使用 NEXT_PUBLIC_API_URL (正式環境必須設定)
      // 2. 如果未設定且在 localhost，使用 http://127.0.0.1:3001
      // 3. 如果在 Vercel 等線上環境但未設定環境變數，嘗試使用相對路徑 (預設前後端同源) 或報錯
      let apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      if (!apiUrl) {
        if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
           apiUrl = 'http://127.0.0.1:3001'; 
        } else {
           // 線上環境若未設定 API URL，預設回退到 127.0.0.1:3001 (為了讓電腦端操作本地後端能運作)
           // 但手機端會因為無法連線到 localhost 而失敗，這是預期行為，必須設定環境變數才能解決手機端問題
           apiUrl = 'http://127.0.0.1:3001';
        }
      }
      
      // 確保 localhost 替換為 127.0.0.1 避免某些環境解析問題
      if (apiUrl.includes('localhost')) {
        apiUrl = apiUrl.replace('localhost', '127.0.0.1');
      }

      const res = await fetch(`${apiUrl}/api/payment/newebpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sess.session.access_token}`
        },
        body: JSON.stringify({
          amount: selectedPlan.amount,
          planId: selectedPlan.id,
          paymentMethod: selectedMethod
        })
      });

      // 檢查回應內容類型，避免 JSON 解析錯誤 (例如 404 HTML)
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Payment initialization failed');
        }
        setPaymentData(data);
      } else {
        const text = await res.text();
        console.error('API Error (Non-JSON response):', text);
        throw new Error(`連線失敗 (${res.status})：請檢查後端 API URL 設定`);
      }
      
      return; // 等待表單自動提交
      
    } catch (error: unknown) {
      console.error('Topup Error:', error ?? '(no error)');
      let message = '儲值失敗，請稍後再試';
      if (error && typeof error === 'object' && 'message' in error) {
        const withMessage = error as { message?: unknown };
        if (typeof withMessage.message === 'string' && withMessage.message) {
          message = withMessage.message;
        }
      }
      showToast(message, 'error');
      // Only reset processing state on error, success redirects
      setIsProcessing(false);
      isProcessingRef.current = false;
    } 
    // Do not reset in finally block for success case to prevent double submission during redirect delay
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-20 transition-colors">
      <div className="max-w-7xl mx-auto px-0 md:px-6 lg:px-8 pt-0 md:pt-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-0 md:gap-8 items-start relative">
            {/* Left: Plans & Methods */}
            <div className="md:col-span-7 space-y-2 md:space-y-8 pb-4 md:pb-0">
              
              {/* User Balance - Removed as requested */}

              {/* Plans Grid */}
              <section className="bg-white dark:bg-neutral-900 md:rounded-3xl p-4 md:p-6 border-y md:border border-neutral-100 dark:border-neutral-800 space-y-3 md:space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] md:text-sm font-black text-neutral-900 dark:text-white flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    選擇儲值金額
                  </h2>
                  <span className="text-[10px] md:text-xs font-bold text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded-full flex items-center gap-1">
                    1 TWD = 1 <Image src="/images/gcoin.png" alt="G" width={12} height={12} className="w-3 h-3 object-contain inline-block" />
                  </span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-3 gap-2 md:gap-3">
                  {TOPUP_PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={cn(
                        "relative p-2 md:p-5 rounded-xl md:rounded-3xl border transition-all text-center flex flex-col items-center justify-center gap-1 md:gap-1.5 group aspect-[4/3] md:aspect-auto",
                        selectedPlan.id === plan.id 
                          ? "border-primary bg-primary/5 shadow-sm md:shadow-lg shadow-primary/10 ring-1 ring-primary" 
                          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 hover:dark:border-neutral-700"
                      )}
                    >
                      {plan.isHot && (
                        <div className="absolute -top-2 -right-1 md:-right-2 z-10">
                          <span className="px-1.5 py-0.5 md:px-2.5 md:py-1 bg-accent-red text-white text-[9px] md:text-xs font-black rounded-full shadow-md flex items-center gap-0.5 md:gap-1 scale-90 md:scale-100 origin-right">
                            <Zap className="w-2 h-2 md:w-3 md:h-3 fill-current" />
                            HOT
                          </span>
                        </div>
                      )}
                      <div className="text-[10px] md:text-sm font-bold text-neutral-400 group-hover:text-neutral-500 transition-colors font-amount">
                        NT$ {plan.amount.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative w-5 h-5 md:w-6 md:h-6">
                          <Image src="/images/gcoin.png" alt="G" fill className="object-contain" unoptimized />
                        </div>
                        <span className="text-xl md:text-2xl font-black text-neutral-900 dark:text-white font-amount tracking-tight">{plan.points.toLocaleString()}</span>
                      </div>
                      {plan.bonus > 0 ? (
                        <div className="mt-0.5 md:mt-1 w-full flex justify-center">
                          <span className="text-[9px] md:text-xs font-black text-accent-emerald bg-accent-emerald/10 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                            +{plan.bonus.toLocaleString()} 贈點
                          </span>
                        </div>
                      ) : (
                        <div className="mt-0.5 md:mt-1 h-[19px] md:h-[24px]"></div>
                      )}
                      {selectedPlan.id === plan.id && (
                        <div className="absolute top-1 left-1 md:bottom-2 md:right-2 md:top-auto md:left-auto">
                          <CheckCircle2 className="w-3.5 h-3.5 md:w-5 md:h-5 text-primary fill-current bg-white rounded-full" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* Payment Methods */}
              <section className="bg-white dark:bg-neutral-900 md:rounded-3xl border-y md:border border-neutral-100 dark:border-neutral-800">
                <div className="p-4 md:p-6 border-b border-neutral-100 dark:border-neutral-800">
                  <h2 className="text-[13px] md:text-sm font-black text-neutral-900 dark:text-white flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    選擇付款方式
                  </h2>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={cn(
                        "w-full px-4 py-3 md:p-5 transition-all flex items-center justify-between group active:bg-neutral-50",
                        selectedMethod === method.id 
                          ? "bg-primary/[0.02]" 
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      )}
                    >
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className={cn(
                          "w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center transition-colors shrink-0 border border-neutral-100 dark:border-neutral-700",
                          selectedMethod === method.id ? "bg-white text-primary border-primary/20" : "bg-neutral-50 text-neutral-400 group-hover:text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                        )}>
                          {React.cloneElement(method.icon as React.ReactElement, { className: 'w-4 h-4 md:w-5 md:h-5' })}
                        </div>
                        <span className={cn(
                          "text-[14px] md:text-base font-bold",
                          selectedMethod === method.id ? "text-primary" : "text-neutral-500 dark:text-neutral-400"
                        )}>
                          {method.name}
                        </span>
                      </div>
                      <div className={cn(
                        "w-5 h-5 md:w-6 md:h-6 rounded-full border flex items-center justify-center transition-all",
                        selectedMethod === method.id 
                          ? "border-primary bg-primary text-white" 
                          : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 group-hover:border-neutral-300"
                      )}>
                        {selectedMethod === method.id && <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Terms Note (Mobile) */}
              <div className="px-4 py-3 md:hidden">
                <div className="text-[11px] text-neutral-400 leading-relaxed text-center">
                  點擊確認付款即表示同意 <Link href="/terms" className="text-neutral-500 underline decoration-neutral-300">服務條款</Link>
                </div>
              </div>
            </div>

            {/* Right: Summary Card (Desktop) */}
          <div className="md:col-span-5 md:h-full">
            <div className="md:sticky md:top-24 bg-white dark:bg-neutral-900 rounded-2xl md:rounded-4xl p-5 md:p-8 shadow-modal border border-neutral-100 dark:border-neutral-800 space-y-5 md:space-y-8">
              <h3 className="text-lg md:text-xl font-black text-neutral-900 dark:text-white tracking-tight">訂單摘要</h3>
              
              <div className="space-y-3 md:space-y-5">
                <div className="flex justify-between items-center text-sm md:text-base whitespace-nowrap">
                  <span className="text-neutral-500 dark:text-neutral-400 font-bold">儲值代幣</span>
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-900 dark:text-neutral-100 font-black font-amount">{selectedPlan.points.toLocaleString()}</span>
                    <Image src="/images/gcoin.png" alt="G" width={16} height={16} className="w-4 h-4 object-contain" />
                  </div>
                </div>
                {selectedPlan.bonus > 0 && (
                  <div className="flex justify-between items-center text-sm md:text-base whitespace-nowrap">
                    <span className="text-neutral-500 dark:text-neutral-400 font-bold">額外贈點</span>
                    <div className="flex items-center gap-1">
                      <span className="text-accent-emerald font-black font-amount">+{selectedPlan.bonus.toLocaleString()}</span>
                      <Image src="/images/gcoin.png" alt="G" width={16} height={16} className="w-4 h-4 object-contain" />
                    </div>
                  </div>
                )}
                <div className="h-px bg-neutral-100 dark:bg-neutral-800" />
                <div className="flex justify-between items-end whitespace-nowrap">
                  <span className="text-sm md:text-base text-neutral-500 dark:text-neutral-400 font-bold">應付總額</span>
                  <div className="text-right">
                    <span className="text-[10px] md:text-sm font-black text-neutral-400 dark:text-neutral-500 mr-1.5 uppercase font-amount">TWD</span>
                    <span className="text-2xl md:text-4xl font-black text-neutral-900 dark:text-neutral-100 font-amount tracking-tighter">
                      ${selectedPlan.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl md:rounded-2xl p-4 md:p-5 space-y-2 md:space-y-3">
                <div className="flex items-center gap-2 text-[11px] md:text-sm font-black text-neutral-400 uppercase tracking-widest">
                  <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent-emerald" />
                  儲值即表示您同意
                </div>
                <div className="text-[11px] md:text-sm text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed">
                  點擊確認付款即視為您已閱讀並同意 <Link href="/terms" className="text-primary hover:underline">服務條款</Link> 與 <Link href="/return-policy" className="text-primary hover:underline">退款政策</Link>。
                </div>
              </div>

              <div className="space-y-3 md:space-y-4">
                <Button 
                  onClick={openConfirmModal}
                  isLoading={isProcessing}
                  size="lg"
                  className="hidden md:flex w-full py-6 md:py-8 text-lg md:text-xl font-black rounded-xl md:rounded-2xl shadow-xl shadow-primary/20 items-center justify-center"
                >
                  前往付款
                </Button>

                <div className="flex items-center justify-center gap-2 text-[11px] md:text-sm text-neutral-400 font-bold">
                  <Lock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>採用 256 位元 SSL 安全加密</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="h-16 px-4 flex items-center gap-3 w-full">
          <div className="flex flex-col items-start justify-center min-w-[90px]">
             <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">應付總額</div>
             <div className="flex items-baseline gap-0.5">
                <span className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 mr-0.5 font-amount">NT$</span>
                <span className="text-xl font-black text-accent-red dark:text-accent-red font-amount tracking-tight">
                  {selectedPlan.amount.toLocaleString()}
                </span>
             </div>
          </div>
          <Button 
            onClick={openConfirmModal}
            isLoading={isProcessing}
            className="flex-1 h-[44px] text-[15px] font-black rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center"
          >
            前往付款
          </Button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirmOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed left-0 right-0 bottom-0 z-[61] bg-white dark:bg-[#1a1b1e] rounded-t-2xl border-t border-neutral-200 dark:border-white/10 flex flex-col max-h-[90vh] md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] md:h-auto md:rounded-2xl md:border md:bottom-auto"
            >
              {/* Header */}
              <div className="flex justify-between items-center px-4 py-3 md:px-6 md:py-4 border-b border-neutral-100 dark:border-neutral-800">
                <h3 className="text-base md:text-xl font-black text-neutral-900 dark:text-white">
                  確認付款資訊
                </h3>
                <button 
                  onClick={() => setIsConfirmOpen(false)}
                  className="p-1 -mr-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-transform"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 md:p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-neutral-500 dark:text-neutral-400 font-bold">儲值方案</span>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 font-black text-neutral-900 dark:text-white font-amount">
                        {selectedPlan.points.toLocaleString()} 
                        <Image src="/images/gcoin.png" alt="G" width={16} height={16} className="w-4 h-4 object-contain" />
                      </div>
                      {selectedPlan.bonus > 0 && (
                        <div className="text-xs font-bold text-accent-emerald font-amount">
                          + {selectedPlan.bonus.toLocaleString()} G 贈點
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-neutral-500 dark:text-neutral-400 font-bold">付款方式</span>
                    <span className="font-bold text-neutral-900 dark:text-white">
                      {PAYMENT_METHODS.find(m => m.id === selectedMethod)?.name}
                    </span>
                  </div>

                  <div className="h-px bg-neutral-100 dark:bg-neutral-800 border-dashed w-full my-1" />
                  
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-neutral-900 dark:text-white">應付總額</span>
                    <span className="text-2xl font-black text-primary font-amount">
                      NT$ {selectedPlan.amount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-xl text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed font-bold">
                  請確認上述資訊無誤。點擊「確認付款」後將跳轉至支付頁面或完成扣款。
                </div>
              </div>

              {/* Footer Button */}
              <div className="min-h-16 px-4 pt-3 pb-[env(safe-area-inset-bottom)] bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-center md:h-24 md:px-6 md:rounded-b-[24px]">
                <Button
                  onClick={handleConfirmTopup}
                  isLoading={isProcessing}
                  className="w-full h-[44px] md:h-[52px] rounded-xl text-[15px] md:text-lg font-black bg-primary text-white shadow-xl shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
                >
                  確認付款
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
      {/* Hidden NewebPay Form */}
      {paymentData && (
        <form ref={formRef} action={paymentData.ApiUrl} method="POST" className="hidden">
          <input type="hidden" name="MerchantID" value={paymentData.MerchantID} />
          <input type="hidden" name="TradeInfo" value={paymentData.TradeInfo} />
          <input type="hidden" name="TradeSha" value={paymentData.TradeSha} />
          <input type="hidden" name="Version" value={paymentData.Version} />
        </form>
      )}
    </div>
  );
}
