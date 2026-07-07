import React from 'react';
import { cn } from '@/lib/utils';

interface NavbarLayoutProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  leftClassName?: string;
  centerClassName?: string;
  rightClassName?: string;
  isSticky?: boolean;
}

export default function NavbarLayout({ 
  left, 
  center, 
  right, 
  className,
  leftClassName,
  centerClassName,
  rightClassName,
  isSticky = true
}: NavbarLayoutProps) {
  return (
    <nav className={cn(
      "bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 top-0 z-50 transition-colors",
      isSticky ? "sticky" : "relative",
      className
    )}>
      <div className="px-2 h-[57px] flex items-center justify-between relative">
        {/* Left Slot - Always on left */}
        <div className={cn("flex items-center gap-0 md:gap-8 min-w-0 relative z-20 shrink-0", leftClassName)}>
          {left}
        </div>

        {/* Center Slot - Absolute centered on mobile, or flexible in desktop */}
        <div className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10 w-full pointer-events-none md:static md:translate-x-0 md:translate-y-0 md:w-auto md:justify-start md:flex-1 md:pl-4",
          centerClassName
        )}>
          <div className="pointer-events-auto max-w-full flex justify-center md:justify-start w-full">
            {center}
          </div>
        </div>

        {/* Right Slot - Always on right */}
        <div className={cn("flex items-center gap-0.5 lg:gap-2 shrink-0 z-20 ml-auto pl-2", rightClassName)}>
          {right}
        </div>
      </div>
    </nav>
  );
}
