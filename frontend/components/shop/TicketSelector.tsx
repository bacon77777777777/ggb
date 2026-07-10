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

        const shortLevel = ticket.prizeLevel
          ? ticket.prizeLevel
              .replace(/Last One|LAST ONE|最後賞/i, 'LO')
              .slice(0, 5)
          : '';

        return (
          <div
            key={ticket.number}
            className={cn(
              "relative rounded-[8px] border-2 transition-all duration-200 flex flex-col items-center",
              hasResult ? "justify-start p-0 gap-0" : "justify-center aspect-square",
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
            {/* Ticket number */}
            <span
              className={cn(
                "leading-none tracking-wider",
                hasResult ? "text-[11px] font-bold" : "text-sm font-black",
                ticket.isSold
                  ? "text-neutral-500 dark:text-neutral-400"
                  : isSelected
                    ? "text-neutral-900"
                    : "text-white"
              )}
            >
              {ticket.number.toString().padStart(2, "0")}
            </span>

            {/* Prize info for sold tickets */}
            {hasResult && (
              <>
                <span className="text-[11px] font-black text-neutral-700 dark:text-neutral-300 leading-tight max-w-full truncate w-full text-center">
                  {shortLevel}
                </span>
                {ticket.prizeName && (
                  <span className="text-[9px] font-bold text-neutral-600 dark:text-neutral-400 leading-tight max-w-full line-clamp-2 break-all w-full text-center">
                    {ticket.prizeName}
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
