"use client";

import { useRouter } from "next/navigation";
import { cn, formatCurrency, formatLargeNumber } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { TickerData } from "@/types";

interface StockTickerProps {
  ticker: TickerData;
  compact?: boolean;
}

export function StockTicker({ ticker, compact = false }: StockTickerProps) {
  const router = useRouter();
  const { stock, quote } = ticker;
  const isUp = quote.changePercent > 0;
  const isNeutral = quote.changePercent === 0;

  const handleClick = () => router.push(`/stock/${stock.symbol}`);

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className="flex items-center justify-between rounded-lg p-3 hover:bg-accent/50 transition-all cursor-pointer"
      >
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{stock.symbol}</span>
          <span className="text-[10px] text-muted-foreground truncate">{stock.name}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm font-mono font-medium">
            {formatCurrency(quote.close, stock.currency)}
          </span>
          <span className={cn("text-xs font-mono", isUp ? "text-bull" : isNeutral ? "text-muted-foreground" : "text-bear")}>
            {isUp && "+"}{quote.changePercent.toFixed(2)}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className="rounded-lg border border-border p-4 hover:bg-accent/30 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{stock.symbol}</span>
            <span className="text-xs text-muted-foreground">{stock.market}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{stock.name}</p>
        </div>
        {isUp ? (
          <TrendingUp className="h-4 w-4 text-bull" />
        ) : isNeutral ? (
          <Minus className="h-4 w-4 text-muted-foreground" />
        ) : (
          <TrendingDown className="h-4 w-4 text-bear" />
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl font-mono font-bold">
          {formatCurrency(quote.close, stock.currency)}
        </span>
        <span className={cn("text-sm font-mono font-medium", isUp ? "text-bull" : isNeutral ? "text-muted-foreground" : "text-bear")}>
          {isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
        <div>
          <span className="text-[10px] text-muted-foreground">最高</span>
          <p className="text-xs font-mono">{formatCurrency(quote.high, stock.currency)}</p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">最低</span>
          <p className="text-xs font-mono">{formatCurrency(quote.low, stock.currency)}</p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">开盘</span>
          <p className="text-xs font-mono">{formatCurrency(quote.open, stock.currency)}</p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">成交量</span>
          <p className="text-xs font-mono">{formatLargeNumber(quote.volume)}</p>
        </div>
      </div>
    </div>
  );
}
