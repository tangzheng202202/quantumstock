import { memo } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TickerData } from "@/types";

interface TickerRowProps {
  ticker: TickerData;
  /** Show a star icon (used in watchlist). */
  starred?: boolean;
  /** Optional rank number (used in top-movers list). */
  rank?: number;
}

/**
 * TickerRow — a single clickable quote line linking to the stock detail page.
 * Memoized so long lists don't re-render every row on each poll.
 */
export const TickerRow = memo(function TickerRow({ ticker, starred = false, rank }: TickerRowProps) {
  const { stock, quote } = ticker;
  const isUp = quote.changePercent >= 0;

  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="flex items-center justify-between rounded-lg p-2 hover:bg-accent transition-all"
    >
      <div className="flex items-center gap-2 min-w-0">
        {rank != null && <span className="text-xs text-muted-foreground shrink-0">{rank}.</span>}
        {starred && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{stock.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{stock.symbol}</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-medium">{quote.close?.toFixed(2)}</p>
        <p className={cn("text-xs font-mono", isUp ? "text-bull" : "text-bear")}>
          {isUp ? "+" : ""}{quote.changePercent?.toFixed(2)}%
        </p>
      </div>
    </Link>
  );
});
