'use client';
import { Loader2 } from 'lucide-react';

export function ProductLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-3 text-neutral-500 dark:text-neutral-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs font-black tracking-widest">載入商品中...</span>
      </div>
    </div>
  );
}
