"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, BarChart3, DollarSign, Activity, RefreshCw, Star } from "lucide-react";
import { CandlestickChart, type OHLCVBar } from "@/components/chart/CandlestickChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isInWatchlist, toggleWatchlist } from "@/lib/storage/watchlist";

interface QuoteData {
  symbol: string;
  name: string;
  market: string;
  currency: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

type Interval = "1d" | "1wk" | "1mo";

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: "1d", label: "日K" },
  { value: "1wk", label: "周K" },
  { value: "1mo", label: "月K" },
];

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "1mo", label: "1月" },
  { value: "3mo", label: "3月" },
  { value: "6mo", label: "半年" },
  { value: "1y", label: "1年" },
  { value: "2y", label: "2年" },
  { value: "5y", label: "5年" },
];

export default function StockDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string) ?? "";

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [ohlcv, setOhlcv] = useState<OHLCVBar[]>([]);
  const [interval, setInterval] = useState<Interval>("1d");
  const [range, setRange] = useState("6mo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crosshairBar, setCrosshairBar] = useState<OHLCVBar | null>(null);
  const [watchlisted, setWatchlisted] = useState(false);

  // Check watchlist on mount
  useEffect(() => { setWatchlisted(isInWatchlist(symbol)); }, [symbol]);

  const isAShare = /^\d{6}$/.test(symbol);

  const fetchData = useCallback(async (int: Interval, rng: string) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch quote + OHLCV in parallel
      const quotePromise = isAShare
        ? (async () => {
            // A-share → Sina quotes
            const res = await fetch(`/api/market/quotes?symbols=${symbol}`);
            if (!res.ok) return null;
            const j = await res.json();
            if (j.success && j.data?.[0]) {
              const t = j.data[0];
              return {
                symbol: t.stock.symbol,
                name: t.stock.name,
                market: t.stock.market,
                currency: t.stock.currency ?? "CNY",
                open: t.quote.open,
                high: t.quote.high,
                low: t.quote.low,
                close: t.quote.close,
                volume: t.quote.volume,
                change: t.quote.change,
                changePercent: t.quote.changePercent,
              } as QuoteData;
            }
            return null;
          })()
        : (async () => {
            // HK/US → try Sina first (supports hk/gb), then Yahoo
            try {
              const res = await fetch(`/api/market/quotes?symbols=${symbol}`);
              if (res.ok) {
                const j = await res.json();
                if (j.success && j.data?.[0]) {
                  const t = j.data[0];
                  return {
                    symbol: t.stock.symbol,
                    name: t.stock.name,
                    market: t.stock.market,
                    currency: t.stock.currency ?? "USD",
                    open: t.quote.open,
                    high: t.quote.high,
                    low: t.quote.low,
                    close: t.quote.close,
                    volume: t.quote.volume,
                    change: t.quote.change,
                    changePercent: t.quote.changePercent,
                  } as QuoteData;
                }
              }
            } catch {}
            // Fallback to Yahoo ticker
            try {
              const res = await fetch(`/api/market/ticker?symbol=${symbol}`);
              if (res.ok) {
                const j = await res.json();
                if (j.success && j.data) {
                  return {
                    symbol: j.data.stock.symbol,
                    name: j.data.stock.name,
                    market: j.data.stock.market,
                    currency: j.data.stock.currency ?? "USD",
                    open: j.data.quote.open,
                    high: j.data.quote.high,
                    low: j.data.quote.low,
                    close: j.data.quote.close,
                    volume: j.data.quote.volume,
                    change: j.data.quote.change,
                    changePercent: j.data.quote.changePercent,
                  } as QuoteData;
                }
              }
            } catch {}
            return null;
          })();

      const [q, ohlcvRes] = await Promise.all([
        quotePromise,
        fetch(`/api/market/ohlcv?symbol=${symbol}&interval=${int}&range=${rng}&limit=200`),
      ]);

      if (q) setQuote(q);

      if (ohlcvRes.ok) {
        const oj = await ohlcvRes.json();
        if (oj.success && oj.data) {
          setOhlcv(oj.data);
        } else {
          setError(oj.error ?? "无K线数据");
        }
      } else {
        setError("K线数据获取失败");
      }
    } catch (e) {
      setError(`数据加载失败: ${e instanceof Error ? e.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }, [symbol, isAShare]);

  useEffect(() => {
    if (symbol) fetchData(interval, range);
  }, [symbol, interval, range, fetchData]);

  const isUp = quote ? quote.change >= 0 : false;
  const currencySymbol = quote?.currency === "USD" ? "$" : quote?.currency === "HKD" ? "HK$" : "¥";

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </Link>
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold">{quote?.name ?? symbol}</h1>
            <span className="text-sm text-muted-foreground">{symbol}</span>
            {quote?.market && (
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{quote.market}</span>
            )}
            <button
              onClick={() => {
                const added = toggleWatchlist({
                  symbol,
                  name: quote?.name ?? symbol,
                  market: quote?.market ?? "SSE",
                });
                setWatchlisted(added);
              }}
              title={watchlisted ? "取消自选" : "加入自选"}
              className="ml-1 p-1.5 rounded-lg hover:bg-accent transition-all"
            >
              <Star className={`w-4 h-4 ${watchlisted ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={() => fetchData(interval, range)}
            disabled={loading}
            className="shrink-0 rounded-lg bg-destructive text-destructive-foreground px-3 py-1.5 text-xs hover:bg-destructive/90 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            重试
          </button>
        </div>
      )}

      {/* Quote Summary Cards */}
      {quote && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">最新价</div>
              <div className={`text-2xl font-bold ${isUp ? "text-red-500" : "text-green-500"}`}>
                {currencySymbol}{quote.close.toFixed(2)}
              </div>
              <div className={`flex items-center gap-1 text-sm mt-1 ${isUp ? "text-red-500" : "text-green-500"}`}>
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isUp ? "+" : ""}{quote.change.toFixed(2)} ({isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%)
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">开盘</div>
              <div className="text-xl font-semibold">{currencySymbol}{quote.open.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">最高 / 最低</div>
              <div className="text-xl font-semibold text-red-500">{currencySymbol}{quote.high.toFixed(2)}</div>
              <div className="text-sm text-green-500">{currencySymbol}{quote.low.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">成交量</div>
              <div className="text-xl font-semibold">
                {quote.volume >= 1e8
                  ? `${(quote.volume / 1e8).toFixed(1)}亿`
                  : `${(quote.volume / 1e4).toFixed(0)}万`}
              </div>
              <div className="text-xs text-muted-foreground mt-1">手</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Interval & Range Selectors + Crosshair Info */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setInterval(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                interval === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="w-px bg-border mx-1" />
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-2.5 py-1.5 text-sm rounded-md transition-colors ${
                range === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {crosshairBar && (
          <div className="text-sm text-muted-foreground flex items-center gap-4">
            <span>开: {currencySymbol}{crosshairBar.open.toFixed(2)}</span>
            <span>高: <span className="text-red-500">{currencySymbol}{crosshairBar.high.toFixed(2)}</span></span>
            <span>低: <span className="text-green-500">{currencySymbol}{crosshairBar.low.toFixed(2)}</span></span>
            <span>收: {currencySymbol}{crosshairBar.close.toFixed(2)}</span>
            <span>量: {(crosshairBar.volume / 10000).toFixed(0)}万</span>
          </div>
        )}
      </div>

      {/* K-line Chart */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {quote?.name ?? symbol} — K线图
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              加载中...
            </div>
          ) : (
            <CandlestickChart
              data={ohlcv}
              symbol={symbol}
              name={quote?.name ?? symbol}
              height={520}
              showVolume={true}
              onCrosshairMove={setCrosshairBar}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
