"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { SectorRotationChart } from "@/components/dashboard/SectorRotationChart";
import { IndexOverview } from "@/components/dashboard/IndexOverview";
import { AIQuickInsight } from "@/components/dashboard/AIQuickInsight";
import { fetchQuotes } from "@/lib/data/market";
import { getWatchlist } from "@/lib/storage/watchlist";
import type { TickerData } from "@/types";
import { Star, TrendingUp, TrendingDown, Wifi, WifiOff, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<"loading" | "live" | "mock">("loading");
  const [displayWatchlist, setDisplayWatchlist] = useState<TickerData[]>([]);
  const [wlLoading, setWlLoading] = useState(true);
  const [showAllWatchlist, setShowAllWatchlist] = useState(false);
  const [hasPersonalWatchlist, setHasPersonalWatchlist] = useState(false);
  const [marketStats, setMarketStats] = useState<{
    gainers: number; losers: number; volume: number; sentiment: "—" | "偏多" | "偏空" | "中性";
  }>({ gainers: 0, losers: 0, volume: 0, sentiment: "—" });

  const loadMarketStats = useCallback(async () => {
    try {
      const res = await fetch("/api/market/screener?sortBy=volume&sortOrder=desc&limit=500");
      if (res.ok) {
        const j = await res.json();
        if (j.success && j.data) {
          const all = j.data as any[];
          const g = all.filter((s: any) => s.changePercent > 0).length;
          const l = all.filter((s: any) => s.changePercent < 0).length;
          const v = all.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
          const sentiment = g > l ? "偏多" : g < l ? "偏空" : "中性";
          setMarketStats({ gainers: g, losers: l, volume: v, sentiment });
        }
      }
    } catch {}
  }, []);

  const loadUnifiedWatchlist = useCallback(async () => {
    setWlLoading(true);
    try {
      const wl = getWatchlist();
      if (wl.length > 0) {
        setHasPersonalWatchlist(true);
        const symbols = wl.map(w => w.symbol);
        const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
        if (res.ok) {
          const j = await res.json();
          if (j.success && j.data) {
            setDisplayWatchlist(j.data);
            setWlLoading(false);
            return;
          }
        }
      } else {
        setHasPersonalWatchlist(false);
      }
      const result = await fetchQuotes();
      setDisplayWatchlist(result.data.slice(0, 8));
    } catch {
      try {
        const result = await fetchQuotes();
        setDisplayWatchlist(result.data.slice(0, 8));
      } catch {}
    } finally {
      setWlLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchQuotes();
      setTickers(result.data);
      setDataSource(result.source === "mock" ? "mock" : "live");
    } catch {
      setDataSource("mock");
      toast.warning("实时行情获取失败，显示离线数据", { description: "网络恢复后将自动刷新", id: "quotes-fail" });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    loadUnifiedWatchlist();
    loadMarketStats();

    let interval: ReturnType<typeof setInterval>;
    let wlInterval: ReturnType<typeof setInterval>;
    let statsInterval: ReturnType<typeof setInterval>;

    const startPolling = () => {
      interval = setInterval(loadData, 60000);
      wlInterval = setInterval(loadUnifiedWatchlist, 60000);
      statsInterval = setInterval(loadMarketStats, 120000);
    };
    const stopPolling = () => {
      clearInterval(interval); clearInterval(wlInterval); clearInterval(statsInterval);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        loadData(); loadUnifiedWatchlist();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadData, loadUnifiedWatchlist, loadMarketStats]);

  const filteredTickers = selectedMarket === "all" ? tickers : tickers.filter(t => {
    if (selectedMarket === "A") return /^\d{6}$/.test(t.stock.symbol);
    if (selectedMarket === "HK") return t.stock.market === "HKEX";
    if (selectedMarket === "US") return t.stock.market === "NASDAQ" || t.stock.market === "NYSE";
    return true;
  });

  const gainers = [...filteredTickers].sort((a, b) => b.quote.changePercent - a.quote.changePercent).slice(0, 5);
  const losers = [...filteredTickers].sort((a, b) => a.quote.changePercent - b.quote.changePercent).slice(0, 5);
  const displayList = showAllWatchlist ? displayWatchlist : displayWatchlist.slice(0, 4);

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
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-bull">
          <CardHeader className="pb-2"><CardDescription>上涨家数</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-bull">{marketStats.gainers}</span>
              <span className="text-xs text-muted-foreground mb-1">全市场</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-bear">
          <CardHeader className="pb-2"><CardDescription>下跌家数</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-bear">{marketStats.losers}</span>
              <span className="text-xs text-muted-foreground mb-1">全市场</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>今日成交额</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">
                {marketStats.volume > 0 ? (marketStats.volume / 1e8).toFixed(0) : "—"}亿
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>市场情绪</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className={`text-2xl font-bold ${marketStats.gainers > marketStats.losers ? "text-bull" : marketStats.gainers < marketStats.losers ? "text-bear" : "text-warning"}`}>
                {marketStats.sentiment}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Watchlist */}
        <div className="col-span-12 lg:col-span-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{hasPersonalWatchlist ? "我的自选" : "热门关注"}</CardTitle>
                  <CardDescription>{displayWatchlist.length} 只股票</CardDescription>
                </div>
                {displayWatchlist.length > 4 && (
                  <button onClick={() => setShowAllWatchlist(!showAllWatchlist)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    {showAllWatchlist ? "收起" : "展开"} {showAllWatchlist ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {wlLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : displayList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">暂无自选股</p>
              ) : (
                displayList.map((t) => {
                  const isUp = t.quote.changePercent >= 0;
                  return (
                    <Link key={t.stock.symbol} href={`/stock/${t.stock.symbol}`} className="flex items-center justify-between rounded-lg p-2 hover:bg-accent transition-all">
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                        <div>
                          <p className="text-sm font-medium">{t.stock.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{t.stock.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-medium">{t.quote.close?.toFixed(2)}</p>
                        <p className={cn("text-xs font-mono", isUp ? "text-bull" : "text-bear")}>
                          {isUp ? "+" : ""}{t.quote.changePercent?.toFixed(2)}%
                        </p>
                      </div>
                    </Link>
                  );
                })
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
                <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-bull font-medium mb-2 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> 涨幅榜</p>
                    {gainers.map((t, i) => (
                      <Link key={t.stock.symbol} href={`/stock/${t.stock.symbol}`} className="flex items-center justify-between py-1.5 hover:bg-accent rounded px-2 transition-all">
                        <span className="text-xs text-muted-foreground">{i + 1}.</span>
                        <span className="text-xs flex-1 truncate ml-1">{t.stock.name}</span>
                        <span className="text-xs font-mono text-bull">+{t.quote.changePercent?.toFixed(2)}%</span>
                      </Link>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-bear font-medium mb-2 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> 跌幅榜</p>
                    {losers.map((t, i) => (
                      <Link key={t.stock.symbol} href={`/stock/${t.stock.symbol}`} className="flex items-center justify-between py-1.5 hover:bg-accent rounded px-2 transition-all">
                        <span className="text-xs text-muted-foreground">{i + 1}.</span>
                        <span className="text-xs flex-1 truncate ml-1">{t.stock.name}</span>
                        <span className="text-xs font-mono text-bear">{t.quote.changePercent?.toFixed(2)}%</span>
                      </Link>
                    ))}
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
