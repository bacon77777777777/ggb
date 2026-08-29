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

/**
 * 兩端淡出的寬度（px）
 *
 * 28px 試過太弱：中文字寬約 15px，只夠讓最後一個字的右半邊變淡，
 * 使用者仍然讀成完整的字、以為到底了（老闆實測 iPhone 16 的「一番賞」）。
 * 44px 約等於三個字，最後那個字會整個化掉，才看得出後面還有東西。
 */
const EDGE_FADE = 44;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const context = React.useContext(TabsContext);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });

  React.useEffect(() => {
    if (context?.activeTab && scrollContainerRef.current) {
      const activeElement = scrollContainerRef.current.querySelector(`[data-value="${context.activeTab}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [context?.activeTab]);

  /*
   * 捲動提示（老闆 2026-08-29 回報）
   *
   * iPhone 16 開情報頁，頁籤剛好在「一番賞」整齊結束，右邊的「卡牌」完全沒有
   * 露出來 —— 看起來就像只有五個分類，沒人知道還能往右滑。
   * 頁籤數量與字寬是會變的，總會有某個裝置寬度剛好切在字與字之間。
   *
   * 解法是把**還有東西的那一側淡出**：最後一個字被漸層吃掉一角，就看得出來
   * 它是被裁掉而不是結束。用 mask 而不是疊一層底色的漸層 ——
   * 這支元件被六個頁面用，各自的底色不同（白、深色、毛玻璃），
   * 疊色會在某些頁面露出一條錯色的邊。mask 淡的是內容本身，不挑底色。
   *
   * 兩側各自判斷：捲到最右就只淡左邊，沒有溢出時完全不套 mask
   * （不然靜止的頁籤兩端會無故糊掉）。
   */
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges(prev => {
        const next = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 };
        return prev.left === next.left && prev.right === next.right ? prev : next;
      });
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    // 觀察子元素：中文字型載入後頁籤寬度才定案，只看容器量不到那次變化
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [children]);

  /*
   * 漸層在**碰到邊界之前**就要全透明（`- 4px`），不然最外側那一兩個像素還留著
   * 一點墨色，看起來像「字剛好排到底」而不是「被切掉」。
   */
  const mask = edges.left || edges.right
    ? `linear-gradient(to right, ${
        edges.left ? `transparent 4px, #000 ${EDGE_FADE}px` : '#000 0'
      }, ${
        edges.right ? `#000 calc(100% - ${EDGE_FADE}px), transparent calc(100% - 4px)` : '#000 100%'
      })`
    : undefined;

  return (
    <div
      ref={scrollContainerRef}
      className={cn("flex items-center gap-2 overflow-x-auto scrollbar-hide", className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
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
