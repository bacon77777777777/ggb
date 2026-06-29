import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { Database } from '@/types/database.types';
import Link from 'next/link';

interface GachaCollectionListProps {
  productId: number;
  prizes: Database['public']['Tables']['product_prizes']['Row'][];
  refreshKey?: number;
}

export function GachaCollectionList({ productId, prizes, refreshKey }: GachaCollectionListProps) {
  const { user } = useAuth();
  const [obtainedPrizeIds, setObtainedPrizeIds] = useState<Set<number>>(new Set());
  const [supabase] = useState(() => createClient());
  const [zoomedPrize, setZoomedPrize] = useState<Database['public']['Tables']['product_prizes']['Row'] | null>(null);

  useEffect(() => {
    async function fetchUserCollection() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('draw_records')
          .select('product_prize_id')
          .eq('user_id', user.id)
          .eq('product_id', productId);

        if (error) throw error;

        const ids = new Set(data?.map(r => r.product_prize_id).filter((id): id is number => id !== null) || []);
        setObtainedPrizeIds(ids);
      } catch (error) {
        console.error('Error fetching collection:', error);
      } finally {
        // no-op
      }
    }

    fetchUserCollection();
  }, [user, productId, supabase, refreshKey]);

  const allObtainedPrizeIds = new Set(obtainedPrizeIds);

  // Filter out Last One prize for the collection list as it's a special prize
  // But usually in Gacha, every item is collectable. 
  // If Last One is treated as a separate collectable, keep it.
  // The user requirement says "Display all prizes... Obtained: Color, Not Obtained: Grayscale".
  // I will include all prizes.

  return (
    <div className="relative w-full" style={{ aspectRatio: '750/798' }}>
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="/images/gacha/cab.png"
          alt="全套收集背景"
          fill
          className="object-cover object-[0_0]"
          unoptimized
        />
      </div>

      <div className="relative z-10 h-full px-6 pt-[50px] pb-6">
        <div
          className="absolute left-1/2 -translate-x-1/2 text-center"
          style={{ top: '2.5%' }}
        >
          <h2 className="text-base font-black text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
            全套收集 ({user ? allObtainedPrizeIds.size : 0}/{prizes.length})
          </h2>
          {!user && (
            <div className="mt-1 text-[11px] font-bold text-white/80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              登入查看收集進度
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-y-3 gap-x-[9%] relative h-[235px] md:h-[calc(100%-3.6rem)]">
          {prizes.map((prize) => {
            const isObtained = allObtainedPrizeIds.has(prize.id);

            return (
              <button
                key={prize.id}
                type="button"
                onClick={() => setZoomedPrize(prize)}
                className={cn(
                  "aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-300 relative group focus:outline-none",
                  !isObtained && "grayscale"
                )}
              >
                <div className="absolute inset-0 p-[6%] pb-[28%]">
                  <Image
                    src={prize.image_url || `/images/item/${productId.toString().padStart(5, '0')}.jpg`}
                    alt={prize.name}
                    fill
                    className="object-contain drop-shadow-sm"
                    unoptimized
                  />
                  <div
                    className={cn(
                      "absolute inset-0 bg-black/60 pointer-events-none transition-opacity",
                      isObtained ? "opacity-0" : "opacity-100"
                    )}
                  />
                </div>
                <div className="absolute top-[75px] inset-x-[4%] flex justify-center">
                  <span
                    className={cn(
                      "text-[10px] font-black px-2 rounded shadow-sm backdrop-blur-sm bg-white/75 text-neutral-800",
                      "inline-flex items-center justify-center text-center leading-tight",
                      "h-[32px] max-h-[32px] overflow-hidden",
                      "w-full"
                    )}
                  >
                    {prize.name}
                  </span>
                </div>
              </button>
            );
          })}

          {!user && (
            <div className="absolute inset-0 z-20 backdrop-blur-[2px] bg-white/60 dark:bg-neutral-950/60 flex items-center justify-center">
              <Link href={`/login?redirect=/item/${productId}`}>
                <Button size="lg" className="shadow-xl">
                  登入查看收集狀況
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {zoomedPrize &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[2600] bg-black/80 flex items-center justify-center"
            onClick={() => setZoomedPrize(null)}
          >
            <div
              className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center justify-center gap-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-white text-base font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] text-center px-3">
                {zoomedPrize.name}
              </div>
              <Image
                src={zoomedPrize.image_url || `/images/item/${productId.toString().padStart(5, '0')}.jpg`}
                alt={zoomedPrize.name}
                width={800}
                height={800}
                className="max-w-full max-h-full object-contain rounded-2xl"
                unoptimized
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
