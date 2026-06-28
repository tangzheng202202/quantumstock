"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StockTicker } from "./StockTicker";
import type { TickerData } from "@/types";

interface WatchlistStripProps {
  tickers: TickerData[];
}

export function WatchlistStrip({ tickers }: WatchlistStripProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>自选股实时行情</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {tickers.slice(0, 5).map((ticker) => (
            <StockTicker key={ticker.stock.symbol} ticker={ticker} compact={false} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
