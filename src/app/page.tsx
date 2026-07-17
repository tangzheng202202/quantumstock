"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { SectorRotationChart } from "@/components/dashboard/SectorRotationChart";
import { IndexOverview } from "@/components/dashboard/IndexOverview";
import { AIQuickInsight } from "@/components/dashboard/AIQuickInsight";
import { StatCard } from "@/components/dashboard/StatCard";
import { TickerRow } from "@/components/dashboard/TickerRow";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuotes, useMarketStats, useWatchlistQuotes } from "@/lib/hooks";
import { Wifi, WifiOff, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";

export default function DashboardPage() {
  const [selectedMarket] = useState<string>("all");
  const [showAllWatchlist, setShowAllWatchlist] = useState(false);

  const { tickers, loading, dataSource } = useQuotes();
  const marketStats = useMarketStats();
  const { quotes: watchlist, loading: wlLoading, hasPersonalWatchlist } = useWatchlistQuotes();

  const filteredTickers = selectedMarket === "all" ? tickers : tickers.filter(t => {
    if (selectedMarket === "A") return /^\d{6}$/.test(t.stock.symbol);
    if (selectedMarket === "HK") return t.stock.market === "HKEX";
    if (selectedMarket === "US") return t.stock.market === "NASDAQ" || t.stock.market === "NYSE";
    return true;
  });

  const gainers = [...filteredTickers].sort((a, b) => b.quote.changePercent - a.quote.changePercent).slice(0, 5);
  const losers = [...filteredTickers].sort((a, b) => a.quote.changePercent - b.quote.changePercent).slice(0, 5);
  const displayList = showAllWatchlist ? watchlist : watchlist.slice(0, 4);

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1600px] mx-auto">
      {/* Data Source */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">市场仪表盘</h1>
        <div className="flex items-center gap-3">
          {dataSource === "live" ? (
            <span className="flex items-center gap-1 text-xs text-success"><Wifi className="h-3 w-3" /> 新浪实时</span>
          ) : dataSource === "mock" ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><WifiOff className="h-3 w-3" /> 离线数据</span>
          ) : null}
        </div>
      </div>

      {/* Indices */}
      <IndexOverview />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="上涨家数" value={marketStats.gainers} suffix="全市场" accent="bull" bordered />
        <StatCard label="下跌家数" value={marketStats.losers} suffix="全市场" accent="bear" bordered />
        <StatCard
          label="今日成交额"
          value={marketStats.volume > 0 ? `${(marketStats.volume / 1e8).toFixed(0)}亿` : "—"}
        />
        <StatCard
          label="市场情绪"
          value={marketStats.sentiment}
          accent={marketStats.gainers > marketStats.losers ? "bull" : marketStats.gainers < marketStats.losers ? "bear" : "warning"}
        />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Watchlist */}
        <div className="col-span-12 lg:col-span-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{hasPersonalWatchlist ? "我的自选" : "热门关注"}</CardTitle>
                  <CardDescription>{watchlist.length} 只股票</CardDescription>
                </div>
                {watchlist.length > 4 && (
                  <button onClick={() => setShowAllWatchlist(!showAllWatchlist)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    {showAllWatchlist ? "收起" : "展开"} {showAllWatchlist ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {wlLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : displayList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">暂无自选股</p>
              ) : (
                displayList.map((t) => <TickerRow key={t.stock.symbol} ticker={t} starred />)
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Movers */}
        <div className="col-span-12 lg:col-span-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>涨幅榜 / 跌幅榜</CardTitle>
              <CardDescription>实时涨跌幅 TOP 5</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-6 w-full" />)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-bull font-medium mb-2 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> 涨幅榜</p>
                    {gainers.map((t, i) => <TickerRow key={t.stock.symbol} ticker={t} rank={i + 1} />)}
                  </div>
                  <div>
                    <p className="text-xs text-bear font-medium mb-2 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> 跌幅榜</p>
                    {losers.map((t, i) => <TickerRow key={t.stock.symbol} ticker={t} rank={i + 1} />)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Quick Insight */}
        <div className="col-span-12 lg:col-span-3">
          <AIQuickInsight />
        </div>
      </div>

      {/* Market Heatmap + Sector Rotation */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <MarketHeatmap />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <SectorRotationChart />
        </div>
      </div>
    </div>
  );
}
