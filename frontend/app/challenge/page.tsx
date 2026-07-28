'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Coins, ChevronRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';

interface SlotMachine {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price_per_spin: number;
  sort_order: number;
}

export default function ChallengePage() {
  const router = useRouter();
  const [machines, setMachines] = useState<SlotMachine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/slot/machines')
      .then(r => r.json())
      .then(d => setMachines(d.machines ?? []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <ProductLoadingScreen />;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-4 pt-[env(safe-area-inset-top)] py-4">
        <h1 className="text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          挑戰
        </h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          轉動命運・追求大獎
        </p>
      </div>

      {machines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-neutral-400 dark:text-neutral-600">
          <Zap className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">目前沒有可挑戰的機台</p>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-3">
          {machines.map((machine, i) => (
            <motion.div
              key={machine.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <MachineCard machine={machine} onTap={() => router.push(`/challenge/${machine.id}`)} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function MachineCard({ machine, onTap }: { machine: SlotMachine; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full text-left bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-stretch">
        {/* Machine image */}
        <div className="relative w-28 h-28 flex-shrink-0 bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950 dark:to-indigo-950">
          {machine.image_url ? (
            <Image
              src={machine.image_url}
              alt={machine.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <Zap className="w-10 h-10 text-violet-400 dark:text-violet-500" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 px-4 py-3 flex flex-col justify-between min-w-0">
          <div>
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm line-clamp-1">
              {machine.name}
            </h3>
            {machine.description && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                {machine.description}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Coins className="w-3.5 h-3.5" />
              <span className="text-xs font-bold">{machine.price_per_spin} G幣 / 次</span>
            </div>
            <div className="flex items-center gap-1 text-violet-600 dark:text-violet-400 text-xs font-bold">
              挑戰
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
