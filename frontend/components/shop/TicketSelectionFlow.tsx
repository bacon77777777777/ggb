'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { TicketSelector, Ticket } from '@/components/shop/TicketSelector';
import { Button } from '@/components/ui';
import { X, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { PurchaseConfirmation } from '@/components/shop/PurchaseConfirmation';
import { IchibanTicket } from '@/components/IchibanTicket';
import { LastOneCelebrationModal } from '@/components/shop/LastOneCelebrationModal';
import { PrizeResultModal } from '@/components/shop/PrizeResultModal';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

const ITEM_DEFAULT_IMG = '/images/item_defaulet.png';

interface TicketSelectionFlowProps {
  isModal?: boolean;
  onClose?: () => void;
  onRefreshProduct?: () => void;
}

interface DrawResult {
  grade: string;
  name: string;
  isOpened: boolean;
  image_url: string;
  is_last_one: boolean;
  ticket_number: number;
}

interface PlayIchibanResult {
  grade: string;
  name: string;
  image_url: string;
  is_last_one: boolean;
  ticket_number: number;
}

const getPlayErrorMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const maybe = err as {
      message?: string;
      error_description?: string;
      hint?: string;
      details?: string;
    };
    return (
      maybe.message ||
      maybe.error_description ||
      maybe.hint ||
      maybe.details ||
      '購買失敗'
    );
  }
  return '購買失敗';
};

export function TicketSelectionFlow({ isModal = false, onClose, onRefreshProduct }: TicketSelectionFlowProps) {
  const params = useParams();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const tearSoundRef = useRef<HTMLAudioElement | null>(null);
  const resultSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/audio/tanweraman-paper-rip-fast-252617.mp3');
    audio.preload = 'auto';
    tearSoundRef.current = audio;

    return () => {
      if (tearSoundRef.current) {
        tearSoundRef.current.pause();
        tearSoundRef.current.src = '';
        tearSoundRef.current.load();
      }
    };
  }, []);

  const playTearSound = useCallback(() => {
    const audio = tearSoundRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);
  
  const [product, setProduct] = useState<Database['public']['Tables']['products']['Row'] | null>(null);
  const [soldTickets, setSoldTickets] = useState<number[]>([]);
  const [soldTicketInfo, setSoldTicketInfo] = useState<Record<number, { prizeLevel: string; prizeName: string }>>({});
  const [selectedTickets, setSelectedTickets] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Confirmation & Purchase State
  const [showConfirm, setShowConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showPrizeDetails, setShowPrizeDetails] = useState(false);
  const [showLastOneCelebration, setShowLastOneCelebration] = useState(false);
  const [showAPrizePopup, setShowAPrizePopup] = useState(false);
  const [drawnResults, setDrawnResults] = useState<DrawResult[]>([]);
  const [aPrizePopupPrize, setAPrizePopupPrize] = useState<DrawResult | null>(null);
  
  // Full results for Last One winner
  const [fullResults, setFullResults] = useState<DrawResult[]>([]);
  const [isFetchingFullResults, setIsFetchingFullResults] = useState(false);
  const [hasTriggeredAutoResults, setHasTriggeredAutoResults] = useState(false);
  const [totalTicketsCount, setTotalTicketsCount] = useState<number>(80);
  const [remainingTickets, setRemainingTickets] = useState<number | null>(null);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [blindboxPhase, setBlindboxPhase] = useState<'opening' | 'revealed'>('opening');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/audio/getpopup.mp3');
    audio.preload = 'auto';
    resultSoundRef.current = audio;

    return () => {
      if (resultSoundRef.current) {
        resultSoundRef.current.pause();
        resultSoundRef.current.src = '';
        resultSoundRef.current.load();
      }
    };
  }, []);

  useEffect(() => {
    if (!showLastOneCelebration && !showAPrizePopup) return;
    const audio = resultSoundRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [showLastOneCelebration, showAPrizePopup]);

  useEffect(() => {
    if (!product || product.type !== 'blindbox') return;
    if (drawnResults.length === 0) {
      setBlindboxPhase('opening');
      return;
    }
    setBlindboxPhase('opening');
    const timer = setTimeout(() => setBlindboxPhase('revealed'), 2000);
    return () => clearTimeout(timer);
  }, [product, drawnResults]);

  const handleShowFullResults = useCallback(async () => {
    if (!product) return;
    
    setIsFetchingFullResults(true);
    setShowResultModal(true);
    
    try {
      const { data, error } = await supabase
        .from('draw_records')
        .select('ticket_number, prize_level, prize_name, image_url, is_last_one')
        .eq('product_id', product.id)
        .order('ticket_number', { ascending: true });

      if (error) throw error;

      const formattedResults = data.map(record => ({
        grade: record.prize_level,
        name: record.prize_name,
        isOpened: true,
        image_url: record.image_url || '',
        is_last_one: record.is_last_one || false,
        ticket_number: record.ticket_number
      }));

      if (!formattedResults.some(r => r.is_last_one)) {
        const { data: prizeRows } = await supabase
          .from('product_prizes')
          .select('level, name, image_url, remaining')
          .eq('product_id', product.id);
        const normalRemaining = (prizeRows || [])
          .filter(p => !(p.level?.toLowerCase?.().includes('last one') || p.level?.includes?.('最後賞')))
          .reduce((sum, p) => sum + (p.remaining || 0), 0);
        if (normalRemaining === 0) {
          const loPrize = (prizeRows || []).find(p => p.level?.toLowerCase?.().includes('last one') || p.level?.includes?.('最後賞'));
          if (loPrize) {
            formattedResults.push({
              grade: loPrize.level || 'Last One',
              name: loPrize.name || '最後賞',
              isOpened: true,
              image_url: loPrize.image_url || '',
              is_last_one: true,
              ticket_number: 0
            });
          }
        }
      }

      setFullResults(formattedResults);
    } catch (err) {
      console.error(err);
      showToast('無法載入抽獎結果', 'error');
      setShowResultModal(false);
    } finally {
      setIsFetchingFullResults(false);
    }
  }, [product, supabase, showToast]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const productId = parseInt(params.id as string);
        if (isNaN(productId)) return;

        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single();
        
        if (productError) throw productError;
        setProduct(productData);
        setTotalTicketsCount(productData.total_count || 80);
        setRemainingTickets(
          typeof productData.remaining === 'number' ? productData.remaining : null
        );

        const { data: historyData, error: historyError } = await supabase
          .from('draw_records')
          .select('ticket_number, prize_level, prize_name')
          .eq('product_id', productId);

        if (historyError) throw historyError;

        const sold = historyData
          .map(h => h.ticket_number || 0)
          .filter(n => n > 0);
        setSoldTickets(sold);

        const infoMap: Record<number, { prizeLevel: string; prizeName: string }> = {};
        for (const h of historyData) {
          if (h.ticket_number && h.ticket_number > 0) {
            infoMap[h.ticket_number] = {
              prizeLevel: h.prize_level || '',
              prizeName: h.prize_name || '',
            };
          }
        }
        setSoldTicketInfo(infoMap);

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [params.id, supabase]);

  const baseRemaining = typeof remainingTickets === 'number'
    ? remainingTickets
    : totalTicketsCount - soldTickets.length;

  const selectionCap = Math.min(10, Math.max(baseRemaining, 0));
  const uiMaxSelectable = baseRemaining <= 10 ? selectionCap : undefined;

  const tickets: Ticket[] = useMemo(() => {
    const soldSet = new Set(soldTickets);

    if (typeof remainingTickets === 'number') {
      const targetSold = Math.max(
        0,
        Math.min(totalTicketsCount, totalTicketsCount - remainingTickets)
      );

      if (soldSet.size < targetSold) {
        for (let n = 1; n <= totalTicketsCount && soldSet.size < targetSold; n++) {
          if (!soldSet.has(n)) {
            soldSet.add(n);
          }
        }
      }
    }

    return Array.from({ length: totalTicketsCount }, (_, i) => {
      const num = i + 1;
      const info = soldTicketInfo[num];
      return {
        number: num,
        isSold: soldSet.has(num),
        prizeLevel: info?.prizeLevel,
        prizeName: info?.prizeName,
      };
    });
  }, [totalTicketsCount, soldTickets, remainingTickets, soldTicketInfo]);

  useEffect(() => {
    if (!product) return;
    const remaining = Math.max(baseRemaining, 0);
    const isEnded = product.status === 'ended' || remaining <= 0 || isSoldOut;
    if (!isEnded || hasTriggeredAutoResults) return;

    const hasLocalResults = drawnResults.length > 0;
    if (hasLocalResults) return;

    setHasTriggeredAutoResults(true);

    onRefreshProduct?.();

    if (product.type === 'blindbox' && product.id) {
      router.push(`/blindbox/${product.id}`);
      return;
    }

    if (params?.id) {
      router.push(`/item/${params.id}`);
      return;
    }

    if (product.id) {
      router.push(`/item/${product.id}`);
      return;
    }

    router.push('/');
  }, [
    product,
    baseRemaining,
    isSoldOut,
    drawnResults.length,
    hasTriggeredAutoResults,
    onRefreshProduct,
    onClose,
    router,
    params?.id,
  ]);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;

    const checkSoldOut = async () => {
      try {
        const { data, error } = await supabase
          .from('product_prizes')
          .select('remaining, level')
          .eq('product_id', product.id);

        if (error) throw error;

        const normalRemaining = (data || [])
          .filter(p => !(p.level?.toLowerCase?.().includes('last one') || p.level?.includes?.('最後賞')))
          .reduce((sum, p) => sum + (p.remaining || 0), 0);

        if (!cancelled) {
          setIsSoldOut(normalRemaining <= 0);
        }
      } catch (e) {
        console.error('Failed to check sold-out status', e);
      }
    };

    void checkSoldOut();

    return () => {
      cancelled = true;
    };
  }, [product, supabase]);

  const toggleTicket = (num: number) => {
    if (soldTickets.includes(num)) return;
    setSelectedTickets(prev => {
      if (prev.includes(num)) {
        return prev.filter(n => n !== num).sort((a, b) => a - b);
      }

      if (selectionCap <= 0) {
        showToast('已無剩餘籤號可以選擇', 'error');
        return prev;
      }

      if (prev.length >= selectionCap) {
        const next = [...prev];
        next.shift();
        next.push(num);
        return next.sort((a, b) => a - b);
      }

      return [...prev, num].sort((a, b) => a - b);
    });
  };

  const [showRandomMenu, setShowRandomMenu] = useState(false);

  const handleRandomSelect = (count: number) => {
    const allAvailable = tickets
      .filter(t => !t.isSold)
      .map(t => t.number);
    
    if (allAvailable.length === 0) return;
    
    const maxByRemaining = typeof remainingTickets === 'number'
      ? Math.min(remainingTickets, allAvailable.length)
      : allAvailable.length;
    
    const actualCount = Math.min(count, 10, maxByRemaining);
    
    if (actualCount <= 0) return;

    const shuffled = [...allAvailable].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, actualCount);
    
    setSelectedTickets(selected.sort((a, b) => a - b));
    setShowRandomMenu(false);
  };

  const handleBuyAll = () => {
    const allAvailable = tickets
      .filter(t => !t.isSold)
      .map(t => t.number);
    
    if (allAvailable.length === 0) {
        showToast('已無剩餘籤號', 'error');
        return;
    }
    const maxByRemaining = typeof remainingTickets === 'number'
      ? Math.min(remainingTickets, allAvailable.length)
      : allAvailable.length;

    if (maxByRemaining <= 0) {
      showToast('已無剩餘籤號', 'error');
      return;
    }

    if (maxByRemaining < allAvailable.length) {
      showToast(`實際僅剩 ${maxByRemaining} 張票券，已為您全選`, 'info');
    }

    const selected = allAvailable.slice(0, maxByRemaining);
    setSelectedTickets(selected);
    setShowAPrizePopup(false);
    setShowConfirm(true);
  };

  const handlePurchase = async (options?: { usePoints: boolean, couponId?: string }) => {
    if (!user) {
      router.push(`/login?redirect=/item/${params.id}`);
      return;
    }
    if (!product) return;
    
    // Close popups and start processing
    setShowAPrizePopup(false);
    setIsProcessing(true);
    
    try {
      const ticketsToPlay = [...selectedTickets];
      const { data, error } = await supabase.rpc('play_ichiban_locked', {
        p_product_id: product.id,
        p_ticket_numbers: ticketsToPlay,
        p_use_points: options?.usePoints || false,
        p_coupon_id: options?.couponId || null
      });
      
      if (error) throw error;
      
      const baseResults = (data as unknown as PlayIchibanResult[]).map((r) => ({
        grade: r.grade,
        name: r.name,
        isOpened: r.is_last_one ? true : false,
        image_url: r.image_url,
        is_last_one: r.is_last_one,
        ticket_number: r.ticket_number
      }));

      let results = baseResults;

      try {
        if (results.some(r => !r.image_url)) {
          const { data: prizeRows } = await supabase
            .from('product_prizes')
            .select('level, name, image_url')
            .eq('product_id', product.id);

          if (prizeRows && prizeRows.length > 0) {
            const imageMap = new Map<string, string>();
            for (const p of prizeRows) {
              if (!p.image_url) continue;
              const key = `${(p.level || '').trim()}|${(p.name || '').trim()}`;
              if (!imageMap.has(key)) {
                imageMap.set(key, p.image_url);
              }
            }

            results = results.map(r => {
              if (r.image_url) return r;
              const key = `${(r.grade || '').trim()}|${(r.name || '').trim()}`;
              const mapped = imageMap.get(key);
              return mapped ? { ...r, image_url: mapped } : r;
            });
          }
        }
      } catch (e) {
        console.warn('Failed to enrich prize images', e);
      }
      setDrawnResults(results);
      setSoldTickets(prev => {
        const merged = new Set(prev);
        ticketsToPlay.forEach(n => merged.add(n));
        return Array.from(merged).sort((a, b) => a - b);
      });
      setSoldTicketInfo(prev => {
        const updated = { ...prev };
        results.forEach(r => {
          if (r.ticket_number && r.ticket_number > 0) {
            updated[r.ticket_number] = { prizeLevel: r.grade || '', prizeName: r.name || '' };
          }
        });
        return updated;
      });
      setRemainingTickets(prev =>
        typeof prev === 'number' ? Math.max(prev - ticketsToPlay.length, 0) : prev
      );
      setSelectedTickets([]);
      if (refreshProfile) refreshProfile();

      import('@/lib/trackEvent').then(({ trackEvent }) => {
        trackEvent('draw', {
          productId: product.id,
          series: (product as any)?.series ?? undefined,
          meta: { count: ticketsToPlay.length },
        });
      });
      
      // Check for Last One and trigger celebration
      if (results.some(r => r.is_last_one)) {
        setShowLastOneCelebration(true);
      } else {
        // Fallback: 若後端未回傳但庫存已經只剩最後賞，補取最後賞記錄
        try {
          const { data: prizeRows } = await supabase
            .from('product_prizes')
            .select('level, name, image_url, remaining')
            .eq('product_id', product.id);
          
          const normalRemaining = (prizeRows || [])
            .filter(p => !(p.level?.toLowerCase?.().includes('last one') || p.level?.includes?.('最後賞')))
            .reduce((sum, p) => sum + (p.remaining || 0), 0);
          
          if (normalRemaining === 0) {
            // 嘗試從抽獎紀錄取最後賞
            const { data: loRecord } = await supabase
              .from('draw_records')
              .select('ticket_number, prize_level, prize_name, image_url, is_last_one')
              .eq('product_id', product.id)
              .eq('ticket_number', 0)
              .order('id', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (loRecord) {
              const lastOne = {
                grade: loRecord.prize_level,
                name: loRecord.prize_name,
                isOpened: true,
                image_url: loRecord.image_url || '',
                is_last_one: true,
                ticket_number: 0
              };
              const augmented = [...results, lastOne];
              setDrawnResults(augmented);
              setShowLastOneCelebration(true);
            } else {
              // 仍找不到，從獎池資料補一筆 UI 資料，確保流程與按鈕狀態正確
              const loPrize = (prizeRows || []).find(p => p.level?.toLowerCase?.().includes('last one') || p.level?.includes?.('最後賞'));
              if (loPrize) {
                const lastOne = {
                  grade: loPrize.level || 'Last One',
                  name: loPrize.name || '最後賞',
                  isOpened: true,
                  image_url: loPrize.image_url || '',
                  is_last_one: true,
                  ticket_number: 0
                };
                const augmented = [...results, lastOne];
                setDrawnResults(augmented);
                setShowLastOneCelebration(true);
              }
            }
          }
        } catch (e) {
          console.warn('Last One fallback check failed', e);
        }
      }

      onRefreshProduct?.();

      setShowConfirm(false); // Close confirmation modal
      
    } catch (error: unknown) {
      console.error('Purchase error:', error);
      const errorMsg = getPlayErrorMessage(error);
      showToast(errorMsg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenAll = () => {
    playTearSound();
    setDrawnResults(prev => {
      let newAPrize: DrawResult | null = null;

      const updated = prev.map(r => {
        if (r.is_last_one) {
          return r;
        }
        if (!r.isOpened && !newAPrize) {
          const g = (r.grade || '').toString().toUpperCase();
          const isAPrize = g === 'A' || g === 'A賞' || g.includes('A賞');
          if (isAPrize) {
            newAPrize = r;
          }
        }
        return { ...r, isOpened: true };
      });

      if (newAPrize) {
        setAPrizePopupPrize(newAPrize);
        setShowAPrizePopup(true);
      }

      return updated;
    });
  };

  const handleContinueDraw = () => {
    setDrawnResults([]);
    setFullResults([]);
    setSelectedTickets([]);
    setShowPrizeDetails(false);
    setShowLastOneCelebration(false);
    setShowResultModal(false);
    setShowAPrizePopup(false);
    setAPrizePopupPrize(null);
    setBlindboxPhase('opening');
  };

  const handleBackToProduct = () => {
    onRefreshProduct?.();

    if (onClose) {
      onClose();
      return;
    }

    if (product?.type === 'blindbox' && product.id) {
      router.push(`/blindbox/${product.id}`);
      return;
    }

    if (params?.id) {
      router.push(`/item/${params.id}`);
      return;
    }

    if (product?.id) {
      router.push(`/item/${product.id}`);
      return;
    }

    router.push('/');
  };

  // If we are showing results, render the result flow (New: Inline, Old: Modal)
  // Logic moved to inside the Reveal View block to prevent intercepting Last One full results

  const [isButtonsReady, setIsButtonsReady] = useState(false);

  useEffect(() => {
    if (drawnResults.length > 0) {
      setIsButtonsReady(false);
      const timer = setTimeout(() => {
        setIsButtonsReady(true);
      }, 2000); // 2 seconds buffer for Last One modal or just interaction delay
      return () => clearTimeout(timer);
    }
  }, [drawnResults]);

  if (isLoading) return (
    <div className="fixed inset-0 z-[2000] bg-neutral-950/80 flex items-center justify-center backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 text-white">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs font-black tracking-widest">載入機台中...</span>
      </div>
    </div>
  );
  if (!product) return <div className="min-h-[50vh] flex items-center justify-center">Product not found</div>;

  const computedRemaining = Math.max(baseRemaining, 0);
  const isProductEnded = product.status === 'ended' || computedRemaining <= 0 || isSoldOut;

  if (isProductEnded && drawnResults.length === 0) {
    return (
      <div className="fixed inset-0 z-[2000] bg-neutral-950/80 flex items-center justify-center backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-black tracking-widest">載入中...</span>
        </div>
      </div>
    );
  }

  // Prize Reveal View (Full Screen Overlay)
  if (drawnResults.length > 0 && product?.type === 'blindbox') {
    const hasLastOne = drawnResults.some(r => r.is_last_one);
    const ticketsRemaining = Math.max(totalTicketsCount - soldTickets.length, 0);
    const isFinished = ticketsRemaining <= 0 || product.status === 'ended';

    return (
      <div className="fixed inset-0 z-[2000] bg-white flex flex-col items-center justify-center p-6">
        {/* Interaction Buffer Overlay */}
        {!isButtonsReady && (
          <div className="absolute inset-0 z-[3000] bg-black/10 flex items-center justify-center cursor-wait" />
        )}

        <AnimatePresence>
          {showLastOneCelebration && (
            <LastOneCelebrationModal
              prize={drawnResults.find(r => r.is_last_one) || null}
              onClose={() => setShowLastOneCelebration(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAPrizePopup && aPrizePopupPrize && (
            <div className="fixed inset-0 z-[2500] flex items-center justify-center px-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative w-full overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-modal flex flex-col items-center text-center p-6">
                  <div className="text-base font-black text-neutral-900 dark:text-white mb-4 tracking-tight">
                    恭喜！真的很玄！
                  </div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                      className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 mb-3 flex items-center justify-center"
                    >
                    <Image
                      src={aPrizePopupPrize.image_url || ITEM_DEFAULT_IMG}
                      alt={aPrizePopupPrize.name}
                      width={160}
                      height={160}
                      className="w-full h-full object-cover"
                      unoptimized
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = ITEM_DEFAULT_IMG }}
                    />
                  </motion.div>

                  <div className="mb-2">
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-black text-neutral-700 dark:text-neutral-200 tracking-tight">
                      {aPrizePopupPrize.grade || 'A賞'}
                    </span>
                  </div>

                  <div className="mb-6 w-full px-2">
                    <p
                      className="text-neutral-900 dark:text-white font-bold text-[16px] leading-snug"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        lineHeight: '1.25rem',
                      }}
                    >
                      {aPrizePopupPrize.name}
                    </p>
                  </div>

                  <div className="w-full mt-2">
                    <Button
                      onClick={() => {
                        setShowAPrizePopup(false);
                        setAPrizePopupPrize(null);
                      }}
                      size="lg"
                      className="w-full rounded-[8px] h-[40px] px-6 text-[15px] font-semibold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 text-white"
                    >
                      確定
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {blindboxPhase === 'opening' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-4"
          >
            <div className="w-32 h-32 rounded-3xl bg-neutral-900 text-white flex items-center justify-center text-lg font-black tracking-widest">
              開盒中...
            </div>
            <div className="text-sm font-black text-neutral-500 tracking-widest uppercase">
              BLIND BOX
            </div>
          </motion.div>
        )}

        {blindboxPhase === 'revealed' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="w-full max-w-xl mx-auto flex flex-col items-center gap-6"
          >
            <div className="text-xs font-black text-neutral-400 tracking-widest uppercase">
              YOU GOT
            </div>
            <div className="w-full rounded-3xl bg-neutral-50 border border-neutral-200 shadow-lg overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="relative aspect-square bg-neutral-100">
                  <Image
                    src={drawnResults[0]?.image_url || ITEM_DEFAULT_IMG}
                    alt={drawnResults[0]?.name}
                    fill
                    className="object-cover"
                    unoptimized
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = ITEM_DEFAULT_IMG }}
                  />
                </div>
                <div className="p-4 sm:p-6 flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-black text-white text-[11px] font-black tracking-widest">
                      {drawnResults[0]?.grade}
                    </div>
                    <div className="text-lg sm:text-xl font-black text-neutral-900 leading-tight">
                      {drawnResults[0]?.name}
                    </div>
                    <div className="text-[11px] text-neutral-400 font-black">
                      票號 {drawnResults[0]?.ticket_number}
                    </div>
                    {hasLastOne && (
                      <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent-red/10 text-accent-red text-[11px] font-black tracking-widest">
                        LAST ONE
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400 font-black">
                    剩餘 {ticketsRemaining.toLocaleString()} / {totalTicketsCount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xl">
              <Button
                className="flex-1 h-[44px] rounded-xl text-sm font-black tracking-widest uppercase"
                onClick={handleContinueDraw}
              >
                再開一盒
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-[44px] rounded-xl text-sm font-black tracking-widest uppercase"
                onClick={handleBackToProduct}
              >
                返回盒玩頁
              </Button>
            </div>

            {isFinished && (
              <div className="text-[11px] font-black text-neutral-400 tracking-widest uppercase">
                此商品已無剩餘盒數
              </div>
            )}
          </motion.div>
        )}
      </div>
    );
  }

  if (drawnResults.length > 0) {
    const allOpened = drawnResults.every(r => r.isOpened);
    const hasLastOne = drawnResults.some(r => r.is_last_one);
    const normalTickets = drawnResults.filter(r => !r.is_last_one);
    const allNormalOpened = normalTickets.length === 0 || normalTickets.every(r => r.isOpened);
    const ticketsRemaining = Math.max(totalTicketsCount - soldTickets.length, 0);
    const isFinished = ticketsRemaining <= 0 || product.status === 'ended';
    const showResultsButton = hasLastOne || isFinished;

    const lastOnePrize = drawnResults.find(r => r.is_last_one) || null;

    return (
      <div className="fixed inset-0 z-[2000] bg-neutral-900 flex flex-col items-center justify-center p-3 pb-safe overflow-hidden pt-1 md:pt-12">
        <AnimatePresence>
          {showLastOneCelebration && lastOnePrize && (
            <LastOneCelebrationModal
              prize={lastOnePrize}
              onClose={() => setShowLastOneCelebration(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAPrizePopup && aPrizePopupPrize && (
            <div className="fixed inset-0 z-[2500] flex items-center justify-center px-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative w-full overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-modal flex flex-col items-center text-center p-6">
                  <div className="text-base font-black text-neutral-900 dark:text-white mb-4 tracking-tight">
                    恭喜！真的很玄！
                  </div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                      className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 mb-3 flex items-center justify-center"
                    >
                    <Image
                      src={aPrizePopupPrize.image_url || ITEM_DEFAULT_IMG}
                      alt={aPrizePopupPrize.name}
                      width={160}
                      height={160}
                      className="w-full h-full object-cover"
                      unoptimized
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = ITEM_DEFAULT_IMG }}
                    />
                  </motion.div>

                  <div className="mb-2">
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-black text-neutral-700 dark:text-neutral-200 tracking-tight">
                      {aPrizePopupPrize.grade || 'A賞'}
                    </span>
                  </div>

                  <div className="mb-6 w-full px-2">
                    <p
                      className="text-neutral-900 dark:text-white font-bold text-[16px] leading-snug"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        lineHeight: '1.25rem',
                      }}
                    >
                      {aPrizePopupPrize.name}
                    </p>
                  </div>

                  <div className="w-full mt-2">
                    <Button
                      onClick={() => {
                        setShowAPrizePopup(false);
                        setAPrizePopupPrize(null);
                      }}
                      size="lg"
                      className="w-full rounded-[8px] h-[40px] px-6 text-[15px] font-semibold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 text-white"
                    >
                      確定
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Background Image */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <Image 
            src="/images/gacha_bg.png" 
            alt="" 
            fill
            className="object-cover filter brightness-[0.85] scale-105"
            unoptimized
          />
          <div className="absolute inset-0 bg-neutral-900/50" />
        </div>
        
        <div className="relative z-10 flex-1 w-full max-w-5xl mx-auto overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div 
              key="tickets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 overflow-y-auto p-3 md:p-4 custom-scrollbar pb-28 md:pb-32 mt-2"
            >
               <div className={cn(
                "grid gap-3 md:gap-x-12 md:gap-y-14 w-full",
                showPrizeDetails 
                  ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" 
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
               )}>
                {drawnResults.map((result, idx) => {
                  const isLastOne = result.is_last_one;
                  const isHidden = isLastOne && !allNormalOpened;
                  const displayImage = isHidden
                    ? '/images/last_one_hidden.png'
                    : result.image_url && !result.image_url.startsWith('blob:')
                      ? result.image_url
                      : '/images/item.png';
                  
                  return (
                  <div key={idx} className={cn(
                    "animate-in fade-in zoom-in duration-300 w-full flex justify-center relative",
                    isLastOne && "order-last" // Ensure Last One is always last
                  )} style={{ animationDelay: `${idx * 100}ms` }}>
                    {isLastOne && isHidden && (
                       <div className="absolute inset-0 bg-yellow-500/20 rounded-xl blur-xl animate-pulse z-0 pointer-events-none" />
                    )}
                    <IchibanTicket 
                      grade={result.grade}
                      prizeName={result.name}
                      isOpened={isLastOne ? true : result.isOpened} // Last One is always visually opened
                      isLastOne={result.is_last_one}
                      ticketNumber={result.ticket_number}
                      imageUrl={displayImage}
                      coverImageUrl={undefined} // No cover for Last One
                      showPrizeDetail={showPrizeDetails}
                      className={cn(isLastOne && "z-10")}
                      onOpen={() => {
                        if (isLastOne) return;
                        const target = drawnResults[idx];
                        if (!target) return;
                        if (!target.isOpened) {
                          const g = (target.grade || '').toString().toUpperCase();
                          const isAPrize = g === 'A' || g === 'A賞' || g.includes('A賞');
                          if (isAPrize) {
                            setAPrizePopupPrize(target);
                            setShowAPrizePopup(true);
                          }
                        }
                        const newResults = [...drawnResults];
                        newResults[idx].isOpened = true;
                        setDrawnResults(newResults);
                      }}
                    />
                  </div>
                )})}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        
      {/* Bottom Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="h-16 px-4 md:px-6 flex items-center justify-center w-full">
          {!allOpened ? (
            <Button 
              onClick={handleOpenAll} 
              disabled={!isButtonsReady}
              className="w-full md:w-[320px] h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!isButtonsReady ? "載入中..." : "全部開啟"}
            </Button>
          ) : (
            <div className="flex gap-3 w-full justify-center">
              <Button 
                onClick={() => router.push('/profile?tab=warehouse')} 
                className="flex-1 md:flex-none md:w-[180px] h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-neutral-200 hover:bg-neutral-300 text-neutral-700 shadow-sm whitespace-nowrap"
              >
                前往倉庫
              </Button>
              <Button 
                onClick={() => setShowPrizeDetails(!showPrizeDetails)} 
                className="flex-1 md:flex-none md:w-[180px] h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black bg-neutral-200 hover:bg-neutral-300 text-neutral-700 shadow-sm whitespace-nowrap"
              >
                {showPrizeDetails ? "顯示籤號" : "顯示獎項"}
              </Button>
              <Button 
                onClick={() => {
                  if (showResultsButton) {
                    handleShowFullResults();
                  } else {
                    handleContinueDraw();
                  }
                }} 
                className={cn(
                  "flex-1 md:flex-none md:w-[180px] h-[44px] md:h-[52px] rounded-xl text-base md:text-lg font-black shadow-xl transition-colors whitespace-nowrap",
                  showResultsButton 
                    ? "bg-neutral-900 hover:bg-neutral-800 text-white shadow-neutral-900/20" 
                    : "bg-accent-red hover:bg-accent-red/90 text-white shadow-accent-red/20"
                )}
              >
                {showResultsButton ? "查詢結果" : "繼續抽獎"}
              </Button>
            </div>
          )}
        </div>
      </div>

        {/* Prize Result Modal for Variant A */}
        {showResultModal && (
          <PrizeResultModal 
            results={(fullResults.length > 0 ? fullResults : drawnResults)}
            onClose={() => setShowResultModal(false)}
            onBackToProduct={handleBackToProduct}
            isLoading={isFetchingFullResults}
            skipRevealAnimation={hasLastOne || fullResults.some(r => r.is_last_one)}
          />
        )}
      </div>
    );
  }

  // Modal Layout (Desktop) or Full Page (Mobile/Fallback)
  return (
    <div className={cn(
      "relative flex flex-col pb-[env(safe-area-inset-bottom)] bg-white dark:bg-neutral-900", 
      isModal 
        ? "w-full max-w-[640px] max-h-[80vh] h-full rounded-2xl overflow-hidden shadow-2xl mx-auto" 
        : "h-screen overflow-hidden pt-0" // Fixed height for page view to support internal scrolling, added padding for fixed header
    )}>
      {/* Header for Modal */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 fixed top-0 left-0 right-0 z-10 shrink-0 md:sticky md:top-0">
        <h3 className="text-lg font-black text-neutral-900 dark:text-white">選擇籤號</h3>
        <button 
          onClick={() => {
            onRefreshProduct?.();

            if (onClose) {
              onClose();
              return;
            }

            if (params?.id) {
              router.push(`/item/${params.id}`);
            } else {
              router.back();
            }
          }}
          className="w-6 h-6 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-neutral-500" />
        </button>
      </div>

      <div className={cn(
        "flex-1 flex flex-col overflow-hidden relative z-0",
        "pt-[60px] md:pt-0" // Add padding for fixed header on mobile modal
      )}>
        <div className="text-center py-2 text-sm text-neutral-500 font-bold bg-neutral-50/50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          點擊號碼進行抽獎 (可複選，滿十抽送一抽活動進行中)
        </div>
        <TicketSelector 
          tickets={tickets} 
          selectedTickets={selectedTickets} 
          onToggle={toggleTicket}
          maxSelectable={uiMaxSelectable}
          className={cn("p-4 overflow-y-auto flex-1 custom-scrollbar", isModal ? "pb-24" : "pb-32")}
        />
      </div>

      {/* Footer Action Bar */}
      <div className={cn("bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 pb-[env(safe-area-inset-bottom)] z-40 shadow-modal shrink-0", isModal ? "absolute bottom-0 left-0 right-0" : "fixed bottom-0 left-0 right-0")}>
        <div className="flex items-center gap-4 h-16 px-4">
          <div className="flex flex-col shrink-0 pl-1 justify-center h-full">
            <span className="text-[13px] text-neutral-400 font-black uppercase tracking-widest leading-none mb-0.5">已選 <span className="font-amount">{selectedTickets.length.toLocaleString()}</span> 張</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-accent-red font-amount leading-none">{(selectedTickets.length * product.price).toLocaleString()}</span>
              <span className="text-[13px] font-bold text-neutral-900 leading-none font-amount">元</span>
            </div>
          </div>

          <div className="flex-1 flex items-center gap-2 h-[44px]">
            <button 
              onClick={() => setSelectedTickets([])}
              className="px-3 h-[44px] bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-xl font-black text-sm flex items-center justify-center transition-colors shrink-0"
            >
              重置
            </button>
            <div className="relative shrink-0">
              <button 
                onClick={() => setShowRandomMenu(!showRandomMenu)}
                className="px-3 h-[44px] bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl font-black text-sm flex items-center justify-center transition-colors shadow-lg shadow-neutral-900/20"
              >
                隨機
              </button>
              {showRandomMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowRandomMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-32 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-100 dark:border-neutral-700 overflow-hidden z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                    {[1, 5, 10].map(num => (
                      <button
                        key={num}
                        onClick={() => handleRandomSelect(num)}
                        className="py-3 px-4 text-center font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors border-b border-neutral-100 dark:border-neutral-700 last:border-0"
                      >
                        隨機 <span className="font-amount">{num.toLocaleString()}</span> 張
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button 
              onClick={handleBuyAll}
              disabled={tickets.every(t => t.isSold)}
              className="px-3 h-[44px] bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-sm flex items-center justify-center transition-colors shadow-lg shadow-purple-600/30 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              包套
            </button>
            <Button 
              onClick={() => setShowConfirm(true)}
              disabled={selectedTickets.length === 0}
              className="flex-1 h-full text-base font-black rounded-xl shadow-lg shadow-accent-red/30 bg-accent-red hover:bg-accent-red/90 text-white transition-all active:scale-[0.98] whitespace-nowrap"
            >
              購買
            </Button>
          </div>
        </div>
      </div>

      {/* Purchase Confirmation Overlay */}
      {showConfirm && (
        <div className={cn("fixed inset-0 z-50 flex justify-center animate-in fade-in duration-200", isModal ? "items-center p-4" : "items-end pb-0")}>
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
             onClick={() => setShowConfirm(false)} 
           />
           
           {/* Bottom Sheet (Mobile) or Modal (Desktop/Modal Mode) */}
           <div className={cn("relative w-full mx-auto z-10 transition-all", isModal ? "max-w-[600px]" : "max-w-lg")}>
             <PurchaseConfirmation
              product={product}
              selectedTickets={selectedTickets}
              totalPrice={selectedTickets.length * product.price}
              userTokens={user?.tokens || 0}
              userPoints={user?.points || 0}
              onConfirm={handlePurchase}
              onCancel={() => setShowConfirm(false)}
              onTopUp={() => router.push('/topup')}
              isProcessing={isProcessing}
              isLoggedIn={!!user}
              onLogin={() => router.push('/login')}
    />
           </div>
        </div>
      )}
    </div>
  );
}
