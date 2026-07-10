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

  return (
    <div className={cn("grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 sm:gap-3 content-start", className)}>
      {tickets.map((ticket) => {
        const isSelected = selectedTickets.includes(ticket.number);
        const isDisabledByLimit = limitReached && !isSelected;
        const disabled = ticket.isSold || isDisabledByLimit;
        const hasResult = ticket.isSold && (ticket.prizeLevel || ticket.prizeName);

        // Shorten prize level for compact display
        const shortLevel = ticket.prizeLevel
          ? ticket.prizeLevel
              .replace(/賞$/, '')
              .replace(/Last One|LAST ONE|最後賞/i, 'LO')
              .slice(0, 4)
          : '';

        return (
          <div
            key={ticket.number}
            className={cn(
              "relative rounded-[8px] border-2 transition-all duration-200 flex flex-col items-center justify-center",
              hasResult ? "py-1 min-h-[3.2rem]" : "aspect-square",
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
                "font-black leading-none tracking-wider",
                hasResult ? "text-[9px] text-neutral-400 dark:text-neutral-600" : "text-xs",
                !hasResult && ticket.isSold && "text-neutral-400 dark:text-neutral-600",
                isSelected && "text-neutral-900",
                !ticket.isSold && !isSelected && "text-white"
              )}
            >
              {ticket.number.toString().padStart(2, "0")}
            </span>
            {hasResult && (
              <>
                <span className="text-[10px] font-black text-neutral-600 dark:text-neutral-400 leading-tight mt-0.5 max-w-full px-0.5 truncate">
                  {shortLevel}
                </span>
                {ticket.prizeName && (
                  <span className="text-[8px] text-neutral-400 dark:text-neutral-600 leading-tight max-w-full px-0.5 truncate">
                    {ticket.prizeName.slice(0, 6)}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
