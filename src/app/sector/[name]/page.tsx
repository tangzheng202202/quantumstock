"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Star, Network } from "lucide-react";
import { toggleWatchlist } from "@/lib/storage/watchlist";

interface SectorStock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change: number;
  pe: number | null;
  marketCap: number | null;
}

export default function SectorDetailPage() {
  const params = useParams();
  const sectorName = decodeURIComponent((params.name as string) ?? "");

  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [sectorCode, setSectorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wlSet, setWlSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sectorName) return;

    // Load watchlist
    try {
      const raw = localStorage.getItem("quantumstock:watchlist");
      if (raw) setWlSet(new Set(JSON.parse(raw).map((i: any) => i.symbol)));
    } catch {}

    setLoading(true);
    setError(null);

    // Step 1: Find the sector code from the sector list
    fetch("/api/market/sectors?dimension=change")
      .then(r => r.json())
      .then(async (j) => {
        if (!j.success || !j.data) { setError("无法获取板块列表"); setLoading(false); return; }
        const sector = j.data.find((s: any) => s.sector === sectorName);
        if (!sector?.sectorCode) { setError(`未找到板块 "${sectorName}" 的代码`); setLoading(false); return; }

        setSectorCode(sector.sectorCode);

        // Step 2: Fetch constituent stocks
        const stocksRes = await fetch(`/api/market/sector-stocks?code=${encodeURIComponent(sector.sectorCode)}`);
        if (!stocksRes.ok) { setError("成分股获取失败"); setLoading(false); return; }
        const stocksJson = await stocksRes.json();
        if (!stocksJson.success || !stocksJson.data) { setError("板块成分股数据为空"); setLoading(false); return; }

        setStocks(stocksJson.data);
      })
      .catch(() => setError("网络请求失败"))
      .finally(() => setLoading(false));
  }, [sectorName]);

  const gainers = stocks.filter(s => s.changePercent > 0);
  const losers = stocks.filter(s => s.changePercent < 0);
  const avgPE = stocks.filter(s => s.pe != null).length > 0
    ? stocks.filter(s => s.pe != null).reduce((s, st) => s + (st.pe ?? 0), 0) / stocks.filter(s => s.pe != null).length
    : null;

  return (
    <div className="px-6 py-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回
        </Link>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">{sectorName}</h1>
          {sectorCode && <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{sectorCode}</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <Card><CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/" className="text-xs text-primary hover:underline mt-3 inline-block">返回市场仪表盘 →</Link>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-4">
            <Card><CardHeader className="pb-2"><CardDescription>成分股</CardDescription></CardHeader><CardContent><span className="text-2xl font-bold">{stocks.length}</span></CardContent></Card>
            <Card className="border-l-4 border-l-bull"><CardHeader className="pb-2"><CardDescription>上涨</CardDescription></CardHeader><CardContent><span className="text-2xl font-bold text-bull">{gainers.length}</span></CardContent></Card>
            <Card className="border-l-4 border-l-bear"><CardHeader className="pb-2"><CardDescription>下跌</CardDescription></CardHeader><CardContent><span className="text-2xl font-bold text-bear">{losers.length}</span></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>涨跌比</CardDescription></CardHeader><CardContent><span className="text-2xl font-bold">{losers.length > 0 ? (gainers.length / (gainers.length + losers.length) * 100).toFixed(0) : "100"}%</span></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>平均PE</CardDescription></CardHeader><CardContent><span className="text-2xl font-bold">{avgPE != null ? avgPE.toFixed(1) : "—"}</span></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>成分股行情</CardTitle><CardDescription>{sectorName}板块 · {stocks.length} 只成分股 · 数据来源东方财富</CardDescription></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-y border-border bg-muted/30">
                      {["代码", "名称", "现价", "涨跌幅", "涨跌额", "PE", "市值", "自选"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.sort((a, b) => b.changePercent - a.changePercent).map(s => {
                      const isUp = s.changePercent >= 0;
                      const isWL = wlSet.has(s.symbol);
                      return (
                        <tr key={s.symbol} className="border-b border-border hover:bg-accent/50 transition-all">
                          <td className="px-4 py-3 text-sm font-mono font-medium">
                            <Link href={`/stock/${s.symbol}`} className="hover:text-primary">{s.symbol}</Link>
                          </td>
                          <td className="px-4 py-3 text-sm">{s.name}</td>
                          <td className="px-4 py-3 text-sm font-mono font-medium">{s.price.toFixed(2)}</td>
                          <td className={cn("px-4 py-3 text-sm font-mono font-medium", isUp ? "text-bull" : s.changePercent < 0 ? "text-bear" : "")}>
                            {isUp ? "+" : ""}{s.changePercent.toFixed(2)}%
                          </td>
                          <td className={cn("px-4 py-3 text-sm font-mono", isUp ? "text-bull" : s.change < 0 ? "text-bear" : "text-muted-foreground")}>
                            {isUp ? "+" : ""}{s.change.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{s.pe != null ? s.pe.toFixed(1) : "—"}</td>
                          <td className="px-4 py-3 text-sm font-mono">{s.marketCap ? (s.marketCap / 1e8).toFixed(0) + "亿" : "—"}</td>
                          <td className="px-4 py-3">
                            <button onClick={(e) => {
                              e.stopPropagation();
                              toggleWatchlist({ symbol: s.symbol, name: s.name, market: s.symbol.startsWith("6") || s.symbol.startsWith("688") ? "SSE" : "SZSE" });
                              setWlSet(prev => { const n = new Set(prev); if (n.has(s.symbol)) n.delete(s.symbol); else n.add(s.symbol); return n; });
                            }} className="p-1 hover:bg-accent rounded" title={isWL ? "取消自选" : "加入自选"}>
                              <Star className={`w-4 h-4 ${isWL ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
