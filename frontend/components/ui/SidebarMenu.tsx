'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronRight } from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface SidebarMenuProps {
  title?: string;
  titleIcon?: LucideIcon;
  items: MenuItem[];
  activeId: string;
  onItemClick: (id: string) => void;
  className?: string;
  showChevron?: boolean;
}

export const SidebarMenu: React.FC<SidebarMenuProps> = ({
  title,
  titleIcon: TitleIcon,
  items,
  activeId,
  onItemClick,
  className,
  showChevron = true,
}) => {
  return (
    <div className={cn("bg-white rounded-2xl shadow-sm border border-neutral-100 p-3", className)}>
      {title && (
        <div className="px-3 py-2 text-xs font-black text-neutral-400 uppercase tracking-widest mb-1 flex items-center gap-2">
          {TitleIcon && <TitleIcon className="w-4 h-4" />}
          {title}
        </div>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = activeId === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all group relative overflow-hidden",
                isActive
                  ? "bg-primary text-white font-black shadow-md shadow-primary/20"
                  : "text-neutral-600 hover:bg-neutral-50 font-bold"
              )}
            >
              {/* Glossy overlay for active item */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />
              )}
              
              {Icon && (
                <Icon 
                  className={cn(
                    "w-5 h-5 transition-colors flex-shrink-0", 
                    isActive ? "text-white" : "text-neutral-400 group-hover:text-neutral-600"
                  )} 
                />
              )}
              
              <span className="flex-1 text-left truncate">{item.label}</span>
              
              {showChevron && (
                <ChevronRight 
                  className={cn(
                    "w-4 h-4 transition-all flex-shrink-0", 
                    isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
                  )} 
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
