'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const TabsContext = React.createContext<{
  activeTab: string;
  setActiveTab: (id: string) => void;
} | null>(null);

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [selected, setSelected] = React.useState(defaultValue);
  const activeTab = value ?? selected;
  const setActiveTab = onValueChange ?? setSelected;

  return (
    <TabsContext.Provider value={{ activeTab: activeTab!, setActiveTab }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const context = React.useContext(TabsContext);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (context?.activeTab && scrollContainerRef.current) {
      const activeElement = scrollContainerRef.current.querySelector(`[data-value="${context.activeTab}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [context?.activeTab]);

  return (
    <div 
      ref={scrollContainerRef}
      className={cn("flex items-center gap-2 overflow-x-auto scrollbar-hide", className)}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used within Tabs");

  const isActive = context.activeTab === value;

  return (
    <button
      data-value={value}
      onClick={() => context.setActiveTab(value)}
      className={cn(
        "relative px-3 py-2 text-[15px] font-black whitespace-nowrap transition-colors outline-none select-none",
        isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
        className
      )}
    >
      <span className="relative z-10">{children}</span>
      {isActive && (
        <motion.div
          layoutId="activeTabIndicator"
          className="absolute inset-x-1 bottom-0 h-[3px] rounded-t-sm bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </button>
  );
}

/**
 * TabsContentWrapper
 * Uses CSS Grid Stacking to overlay tab contents.
 * This ensures the container height is determined by the tallest content,
 * preventing layout shifts when switching between tabs of different heights.
 */
export function TabsContentWrapper({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("grid", className)}
      style={{ gridTemplateAreas: '"content"' }}
    >
      {children}
    </div>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsContent must be used within Tabs");

  const isActive = context.activeTab === value;

  return (
    <div
      className={cn(
        "transition-opacity duration-200",
        isActive ? "opacity-100 visible z-10" : "opacity-0 invisible z-0 pointer-events-none",
        className
      )}
      style={{ gridArea: 'content' }}
    >
      {children}
    </div>
  );
}
