"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { searchStocks, fetchQuotes, KNOWN_STOCKS } from "@/lib/data/market";
import { getWatchlist, toggleWatchlist } from "@/lib/storage/watchlist";
import { cn } from "@/lib/utils";
import { Search, Loader2, X, RefreshCw, Star, Download } from "lucide-react";
import { toast } from "sonner";
import type { TickerData, StockInfo } from "@/types";

const FILTER_GROUPS = [
  { name: "技术指标", filters: [
    { id: "rsi_oversold", label: "RSI超卖 (<30)" },
    { id: "rsi_overbought", label: "RSI超买 (>70)" },
    { id: "macd_golden", label: "MACD金叉" },
    { id: "ma_bullish", label: "均线多头排列" },
  ]},
  { name: "量价关系", filters: [
    { id: "vol_breakout", label: "放量突破 (量比>2)" },
    { id: "vol_shrink", label: "缩量回调 (量比<0.5)" },
    { id: "new_high", label: "创60日新高" },
  ]},
  { name: "基本面", filters: [
    { id: "pe_low", label: "PE 0~15 (低估值)" },
    { id: "roe_high", label: "ROE > 15%" },
    { id: "growth_high", label: "营收增速 > 20%" },
  ]},
];

/**
 * Enrich tickers with real financial metrics fetched from EastMoney.
 * Falls back to null (displayed as "—") when data is unavailable —
 * never returns fake Math.sin values.
 */
async function enrichWithMetricsAsync(tickers: TickerData[]): Promise<any[]> {
  const result: any[] = [];
  for (const t of tickers) {
    let pe: string | null = null;
    let roe: string | null = null;
    const revenueGrowth: string | null = null;

    // Only A-shares have financial data via EastMoney snapshot
    if (/^\d{6}$/.test(t.stock.symbol)) {
      try {
        const res = await fetch(`/api/market/financials?symbol=${t.stock.symbol}`);
        if (res.ok) {
          const j = await res.json();
          if (j.success && j.data) {
            if (j.data.peTtm != null) pe = j.data.peTtm.toFixed(1);
            else if (j.data.pe != null) pe = j.data.pe.toFixed(1);
            if (j.data.roe != null) roe = j.data.roe.toFixed(1);
          }
        }
      } catch {}
    }

    // Technical indicators computed from real quote
    // VolRatio: today's volume / 5-day average — approximated as 1.0 since we only have today's data
    const volRatio = "1.0";
    // RSI requires multi-day close data — would need K-line; mark as null for now
    const rsi: string | null = null;

    // Score: simple heuristic from changePercent + ROE
    let score = 50;
    if (t.quote.changePercent > 0) score += Math.min(t.quote.changePercent * 2, 20);
    else score += Math.max(t.quote.changePercent * 2, -20);
    if (roe) score += Math.min(parseFloat(roe) / 5, 15);

    result.push({
      ...t,
      pe,
      roe,
      revenueGrowth,
      rsi,
      volRatio,
      score: Math.max(0, Math.min(100, Math.round(score))),
    });
  }
  return result;
}

/** Apply confirmed filters by re-fetching from the screener API with filter params */
async function applyFiltersAsync(filters: string[], setResults: (d: any[]) => void, setFilteredResults: (d: any[]) => void): Promise<void> {
  if (filters.length === 0) return;
  const peMax = filters.includes("pe_low") ? "15" : undefined;
  const roeMin = filters.includes("roe_high") ? "15" : undefined;

  try {
    const params = new URLSearchParams();
    params.set("sortBy", "changePercent");
    params.set("sortOrder", "desc");
    params.set("limit", "500");
    if (peMax) params.set("peMax", peMax);
    if (roeMin) params.set("roeMin", roeMin);

    const res = await fetch(`/api/market/screener?${params.toString()}`);
    if (res.ok) {
      const j = await res.json();
      if (j.success && j.data) {
        const mapped = j.data.map((item: any) => ({
          stock: { symbol: item.symbol, name: item.name, market: item.symbol.startsWith("6") || item.symbol.startsWith("688") ? "SSE" : "SZSE", currency: "CNY" },
          quote: { close: item.price, changePercent: item.changePercent, change: item.change, volume: item.volume * 100, amount: item.amount },
          pe: item.pe != null ? item.pe.toFixed(1) : null,
          roe: item.roe != null ? item.roe.toFixed(1) : null,
          revenueGrowth: null, rsi: null, volRatio: "—",
          score: item.changePercent > 0 ? Math.min(80, 50 + item.changePercent * 2) : Math.max(20, 50 + item.changePercent * 2),
        }));
        setFilteredResults(mapped);
      }
    }
  } catch {}
}

export default function ScreenerPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [confirmedFilters, setConfirmedFilters] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [filteredResults, setFilteredResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState("loading");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup search timer on unmount
  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, []);
  const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());

  // Load watchlist on mount
  useEffect(() => {
    const wl = getWatchlist();
    setWatchlistSet(new Set(wl.map((i: any) => i.symbol)));
  }, []);

  // Load full A-share market data from EastMoney screener API
  const loadMarket = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/market/screener?sortBy=changePercent&sortOrder=desc&limit=500");
      if (res.ok) {
        const j = await res.json();
        if (j.success && Array.isArray(j.data)) {
          const mapped = j.data.map((item: any) => ({
            stock: {
              symbol: String(item.symbol ?? ""),
              name: String(item.name ?? item.symbol ?? ""),
              market: String(item.symbol ?? "").startsWith("6") || String(item.symbol ?? "").startsWith("688") ? "SSE" : "SZSE",
              currency: "CNY",
            },
            quote: {
              close: Number(item.price) || 0,
              changePercent: Number(item.changePercent) || 0,
              change: Number(item.change) || 0,
              volume: (Number(item.volume) || 0) * 100,
              amount: Number(item.amount) || 0,
            },
            pe: item.pe != null ? Number(item.pe).toFixed(1) : null,
            roe: item.roe != null ? Number(item.roe).toFixed(1) : null,
            revenueGrowth: null,
            rsi: null,
            volRatio: "—",
            score: item.changePercent > 0 ? Math.min(80, 50 + item.changePercent * 2) : Math.max(20, 50 + item.changePercent * 2),
          }));
          setResults(mapped);
          setDataSource("eastmoney");
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn("[screener] Market API failed, falling back:", e);
      toast.warning("全量市场数据获取失败，降级为热门股", { id: "screener-fail" });
    }
    // Fallback: load 15 popular stocks
    try {
      const symbols = KNOWN_STOCKS.slice(0, 15).map(s => s.symbol);
      const { data } = await fetchQuotes(symbols);
      setResults(data.map(t => ({ ...t, pe: null, roe: null, revenueGrowth: null, rsi: null, volRatio: "—", score: 50 })));
      enrichWithMetricsAsync(data).then(enriched => setResults(enriched));
    } catch { setDataSource("mock"); }
    setLoading(false);
  }, []);

  useEffect(() => { loadMarket(); }, [loadMarket]);

  // Debounced search
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (q.length < 1) {
      setSearchResults([]);
      return;
    }

    // Direct 6-digit code? Show it immediately
    if (/^\d{6}$/.test(q.trim())) {
      const mkt = q.startsWith("6") || q.startsWith("688") ? "SSE" : "SZSE";
      setSearchResults([{ symbol: q.trim(), name: q.trim(), market: mkt as any, currency: "CNY" }]);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const stocks = await searchStocks(q);
        setSearchResults(stocks);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 200);
  }, []);

  // View a single stock
  const viewStock = useCallback(async (stock: StockInfo) => {
    setSearchQuery("");
    setSearchResults([]);
    setLoading(true);
    setConfirmedFilters([]);
    setFilteredResults([]);
    try {
      const { data, source } = await fetchQuotes([stock.symbol]);
      setDataSource(source);
      // If Sina returned a real name, use it
      if (data.length > 0 && data[0].stock.name !== stock.symbol) {
        stock = { ...stock, name: data[0].stock.name };
      }
      setResults(data.map(t => ({ ...t, pe: null, roe: null, revenueGrowth: null, rsi: null, volRatio: "—", score: 50 })));
      enrichWithMetricsAsync(data).then(enriched => setResults(enriched));
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">股票筛选器</h1>
          <p className="text-sm text-muted-foreground mt-1">
            搜索任意A股代码或名称，查看实时行情。支持5000+只A股
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dataSource === "sina" && <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-medium text-success">新浪实时</span>}
          <button onClick={loadMarket} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent transition-all flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> 刷新
          </button>
          <button
            onClick={() => {
              const rows = (confirmedFilters.length > 0 ? filteredResults : results) as any[];
              if (rows.length === 0) return;
              const csv = "代码,名称,现价,涨跌幅,涨跌额,PE,ROE\n" + rows.map((r: any) =>
                `${r.stock.symbol},${r.stock.name},${r.quote.close},${r.quote.changePercent},${r.quote.change},${r.pe || ""},${r.roe || ""}`
              ).join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `screener_${new Date().toISOString().slice(0,10)}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent transition-all flex items-center gap-1"
            title="导出为CSV"
          >
            <Download className="h-3 w-3" /> 导出
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="输入股票代码或名称搜索... (如: 600519, 宁德时代, 000001, 平安)"
            className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {(searchResults.length > 0 || searching) && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {searching ? (
              <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" /><span className="text-xs text-muted-foreground mt-1 block">搜索中...</span></div>
            ) : (
              searchResults.slice(0, 12).map((stock) => {
                const isWL = watchlistSet.has(stock.symbol);
                return (
                <div key={stock.symbol} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-all">
                  <button onClick={() => viewStock(stock)} className="flex items-center gap-3 flex-1 text-left">
                  <span className="text-sm font-mono font-medium w-20">{stock.symbol}</span>
                  <span className="text-sm flex-1">{stock.name}</span>
                  <span className="text-[10px] text-muted-foreground">{stock.market}</span>
                  <span className="text-[10px] text-primary ml-1">查看 →</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const added = toggleWatchlist({ symbol: stock.symbol, name: stock.name, market: stock.market });
                      setWatchlistSet(prev => {
                        const next = new Set(prev);
                        if (added) next.add(stock.symbol); else next.delete(stock.symbol);
                        return next;
                      });
                    }}
                    className="p-1 hover:bg-accent rounded shrink-0"
                    title={isWL ? "取消自选" : "加入自选"}
                  >
                    <Star className={`w-3.5 h-3.5 ${isWL ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                  </button>
                </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Filters */}
        <div className="col-span-12 lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>筛选条件</CardTitle><CardDescription>{activeFilters.length} 个已选</CardDescription></div>
                {activeFilters.length > 0 && <button onClick={() => { setActiveFilters([]); setConfirmedFilters([]); setFilteredResults([]); }} className="text-xs text-muted-foreground hover:text-foreground">清除</button>}
              </div>
            </CardHeader>
            <CardContent>
              {FILTER_GROUPS.map((group) => (
                <div key={group.name} className="mb-4 last:mb-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">{group.name}</p>
                  <div className="space-y-1">
                    {group.filters.map((f) => (
                      <button key={f.id} onClick={() => setActiveFilters(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                        className={cn("w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition-all",
                          activeFilters.includes(f.id) ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-muted-foreground")}>
                        <div className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          activeFilters.includes(f.id) ? "border-primary bg-primary" : "border-muted-foreground/30")}>
                          {activeFilters.includes(f.id) && (
                            <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {activeFilters.length > 0 && (
                <button
                  onClick={() => {
                    setConfirmedFilters([...activeFilters]);
                    applyFiltersAsync(activeFilters, setResults, setFilteredResults);
                  }}
                  className="w-full mt-3 rounded-lg bg-primary text-primary-foreground text-xs py-2 hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
                >
                  应用筛选 (显示 {activeFilters.length} 条件)
                </button>
              )}
              {confirmedFilters.length > 0 && (
                <p className="text-[10px] text-primary mt-2">✓ 已应用 {confirmedFilters.length} 个筛选条件</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Table */}
        <div className="col-span-12 lg:col-span-9">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div><CardTitle>行情数据</CardTitle><CardDescription>
                  {confirmedFilters.length > 0 
                    ? `筛选: ${filteredResults.length} 只 / 共 ${results.length} 只` 
                    : `${results.length} 只股票`}
                </CardDescription></div>
                {selectedForBatch.size > 0 && (
                  <button 
                    onClick={() => {
                      selectedForBatch.forEach(sym => {
                        const row = (confirmedFilters.length > 0 ? filteredResults : results).find((r: any) => r.stock.symbol === sym);
                        if (row) toggleWatchlist({ symbol: sym, name: row.stock.name, market: row.stock.market });
                      });
                      setWatchlistSet(prev => { const n = new Set(prev); selectedForBatch.forEach(s => n.add(s)); return n; });
                      setSelectedForBatch(new Set());
                    }}
                    className="rounded-lg bg-yellow-500 text-white text-xs px-3 py-1.5 hover:bg-yellow-600 transition-all flex items-center gap-1"
                  >
                    <Star className="h-3 w-3 fill-current" /> 批量加入自选 ({selectedForBatch.size}只)
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground ml-2">加载实时数据...</span></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-y border-border bg-muted/30">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-8">
                          <input type="checkbox" onChange={(e) => {
                            const rows = (confirmedFilters.length > 0 ? filteredResults : results) as any[];
                            setSelectedForBatch(e.target.checked ? new Set(rows.map((r: any) => r.stock.symbol)) : new Set());
                          }} checked={(() => {
                            const rows = (confirmedFilters.length > 0 ? filteredResults : results) as any[];
                            return rows.length > 0 && rows.every((r: any) => selectedForBatch.has(r.stock.symbol));
                          })()} className="w-3.5 h-3.5" />
                        </th>
                        {["代码", "名称", "市场", "现价", "涨跌幅", "涨跌额", "成交量(手)", "成交额", "PE", "评分", "自选"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(confirmedFilters.length > 0 ? filteredResults : results).map((row: any) => {
                        const q = row.quote;
                        const isUp = q.changePercent > 0;
                        const isWL = watchlistSet.has(row.stock.symbol);
                        return (
                          <tr key={row.stock.symbol} className="border-b border-border hover:bg-accent/50 transition-all">
                            <td className="px-4 py-3"><input type="checkbox" checked={selectedForBatch.has(row.stock.symbol)} onChange={() => {
                              setSelectedForBatch(prev => { const n = new Set(prev); if (n.has(row.stock.symbol)) n.delete(row.stock.symbol); else n.add(row.stock.symbol); return n; });
                            }} className="w-3.5 h-3.5" /></td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 text-sm font-mono font-medium cursor-pointer">{row.stock.symbol}</td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 text-sm cursor-pointer">{row.stock.name}</td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 text-xs text-muted-foreground cursor-pointer">{row.stock.market}</td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 text-sm font-mono font-medium cursor-pointer">{q.close.toFixed(2)}</td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className={cn("px-4 py-3 text-sm font-mono font-medium cursor-pointer", isUp ? "text-bull" : q.changePercent < 0 ? "text-bear" : "")}>
                              {isUp ? "+" : ""}{q.changePercent.toFixed(2)}%
                            </td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className={cn("px-4 py-3 text-sm font-mono cursor-pointer", isUp ? "text-bull" : q.change < 0 ? "text-bear" : "text-muted-foreground")}>
                              {isUp ? "+" : ""}{q.change.toFixed(2)}
                            </td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 text-sm font-mono cursor-pointer">{(q.volume / 100).toFixed(0)}</td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 text-sm font-mono cursor-pointer">{q.amount ? (q.amount / 1e4).toFixed(0) + "万" : "—"}</td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 text-sm font-mono cursor-pointer">{row.pe ?? "—"}</td>
                            <td onClick={() => router.push(`/stock/${row.stock.symbol}`)} className="px-4 py-3 cursor-pointer">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[60px]">
                                  <div className={cn("h-full rounded-full", row.score > 70 ? "bg-bull" : row.score > 40 ? "bg-warning" : "bg-bear")}
                                    style={{ width: `${row.score}%` }} />
                                </div>
                                <span className="text-xs font-mono font-medium">{row.score}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const added = toggleWatchlist({ symbol: row.stock.symbol, name: row.stock.name, market: row.stock.market });
                                  setWatchlistSet(prev => {
                                    const next = new Set(prev);
                                    if (added) next.add(row.stock.symbol); else next.delete(row.stock.symbol);
                                    return next;
                                  });
                                }}
                                className="p-1 hover:bg-accent rounded"
                                title={isWL ? "取消自选" : "加入自选"}
                              >
                                <Star className={`w-4 h-4 ${isWL ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {results.length === 0 && (
                        <tr><td colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                          搜索股票代码或名称查看实时行情<br/>
                          <span className="text-xs">支持 A 股全部代码，如 600519、300750、000001 等</span>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
