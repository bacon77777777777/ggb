import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface Ticket {
  number: number;
  isSold: boolean;
  prizeLevel?: string;
  prizeName?: string;
}

interface TicketSelectorProps {
  tickets: Ticket[];
  selectedTickets: number[];
  onToggle: (number: number) => void;
  className?: string;
  maxSelectable?: number;
}

export function TicketSelector({
  tickets,
  selectedTickets,
  onToggle,
  className,
  maxSelectable
}: TicketSelectorProps) {
  const limitReached =
    typeof maxSelectable === 'number' &&
    maxSelectable > 0 &&
    selectedTickets.length >= maxSelectable;

  // Count occurrences of each prize level across all sold tickets
  const prizeLevelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tickets) {
      if (t.isSold && t.prizeLevel) {
        counts[t.prizeLevel] = (counts[t.prizeLevel] || 0) + 1;
      }
    }
    return counts;
  }, [tickets]);

  return (
    <div className={cn("grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 sm:gap-3 content-start", className)}>
      {tickets.map((ticket) => {
        const isSelected = selectedTickets.includes(ticket.number);
        const isDisabledByLimit = limitReached && !isSelected;
        const disabled = ticket.isSold || isDisabledByLimit;
        const hasResult = ticket.isSold && !!ticket.prizeLevel;

        const shortLevel = ticket.prizeLevel
          ? ticket.prizeLevel
              .replace(/Last One|LAST ONE|最後賞/i, 'LO')
              .slice(0, 5)
          : '';

        const isRare = ticket.prizeLevel
          ? (prizeLevelCounts[ticket.prizeLevel] || 0) <= 5
          : false;

        if (hasResult) {
          return (
            <div
              key={ticket.number}
              className="aspect-square rounded-[8px] bg-neutral-100 dark:bg-neutral-800 flex flex-col items-center justify-between py-1.5 px-1 cursor-not-allowed"
            >
              <span className="text-[10px] sm:text-[11px] font-bold text-neutral-400 dark:text-neutral-500 leading-none">
                {ticket.number.toString().padStart(2, '0')}
              </span>
              <span className={cn(
                "text-[11px] sm:text-[12px] font-black leading-none",
                isRare ? "text-red-500" : "text-neutral-800 dark:text-neutral-200"
              )}>
                {shortLevel}
              </span>
            </div>
          );
        }

        return (
          <div
            key={ticket.number}
            className={cn(
              "aspect-square relative rounded-[8px] border-2 transition-all duration-200 flex flex-col items-center justify-center",
              ticket.isSold || isDisabledByLimit
                ? "bg-neutral-200 dark:bg-neutral-800 border-transparent cursor-not-allowed"
                : isSelected
                  ? "bg-[#FBBF24] border-[#F59E0B] text-neutral-900 shadow-[0_2px_8px_rgba(251,191,36,0.4)] scale-[1.02] z-10 ring-2 ring-[#FBBF24]/30"
                  : "bg-[#3B82F6] border-[#2563EB] text-white hover:border-[#1D4ED8] hover:shadow-md active:scale-95 shadow-sm",
              !ticket.isSold && !isDisabledByLimit && "cursor-pointer"
            )}
            onClick={() => {
              if (!disabled) onToggle(ticket.number);
            }}
          >
            <span
              className={cn(
                "text-sm font-black leading-none tracking-wider",
                ticket.isSold
                  ? "text-neutral-500 dark:text-neutral-400"
                  : isSelected
                    ? "text-neutral-900"
                    : "text-white"
              )}
            >
              {ticket.number.toString().padStart(2, '0')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
