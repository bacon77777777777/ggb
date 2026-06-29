import { cn } from '@/lib/utils';

export interface Ticket {
  number: number;
  isSold: boolean;
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

        return (
          <button
            key={ticket.number}
            disabled={disabled}
            onClick={() => onToggle(ticket.number)}
            className={cn(
              "relative aspect-square rounded-[8px] border-2 transition-all duration-200 flex items-center justify-center group",
              ticket.isSold || isDisabledByLimit
                ? "bg-neutral-200 dark:bg-neutral-800 border-transparent text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
                : isSelected
                  ? "bg-[#FBBF24] border-[#F59E0B] text-neutral-900 shadow-[0_2px_8px_rgba(251,191,36,0.4)] scale-[1.02] z-10 ring-2 ring-[#FBBF24]/30"
                  : "bg-[#3B82F6] border-[#2563EB] text-white hover:border-[#1D4ED8] hover:shadow-md active:scale-95 shadow-sm"
            )}
          >
            <span
              className={cn(
                "font-amount font-black leading-none tracking-wider text-xs",
                "font-[\"Chiron_GoRound_TC\"]"
              )}
            >
              {ticket.number.toString().padStart(2, "0")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
