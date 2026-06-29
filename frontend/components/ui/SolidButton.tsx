'use client';

import React, { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface SolidButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  children: React.ReactNode;
}

export default function SolidButton({ 
  className, 
  isLoading = false, 
  children, 
  disabled,
  ...props 
}: SolidButtonProps) {
  return (
    <button 
      disabled={disabled || isLoading}
      className={cn(
        "w-full h-[44px] bg-primary text-white text-base rounded-xl font-black shadow-lg shadow-primary/30 transition-all active:scale-[0.98] flex items-center justify-center disabled:opacity-50 disabled:scale-100 disabled:shadow-none",
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}
