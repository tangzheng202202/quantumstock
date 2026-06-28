"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import {
  Briefcase,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
  X,
  Upload,
  Download,
} from "lucide-react";

interface Position {
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currency: string;
}

const STORAGE_KEY = "quantumstock:portfolio:positions";
const CASH_KEY = "quantumstock:portfolio:cash";

interface PositionWithPrice extends Position {
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  weight: number;
  dayChange: number;
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [cash, setCash] = useState(1000000);
  const [pricedPositions, setPricedPositions] = useState<PositionWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPos, setNewPos] = useState({ symbol: "", quantity: "", avgCost: "" });
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const storedCash = localStorage.getItem(CASH_KEY);
      if (stored) setPositions(JSON.parse(stored));
      if (storedCash) setCash(parseFloat(storedCash));
    } catch {}
    setLoading(false);
  }, []);

  // Save to localStorage whenever changes
  useEffect(() => {
    if (!loading) localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  }, [positions, loading]);
  useEffect(() => {
    if (!loading) localStorage.setItem(CASH_KEY, String(cash));
  }, [cash, loading]);

  // Fetch current prices for all positions
  const refreshPrices = useCallback(async () => {
    if (positions.length === 0) {
      setPricedPositions([]);
      return;
    }
    const symbols = positions.map(p => p.symbol);
    try {
      const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
      if (!res.ok) return;
      const j = await res.json();
      if (!j.success) return;

      const tickers: any[] = j.data;
      const totalMV = positions.reduce((s, p) => {
        const t = tickers.find(t => t.stock.symbol === p.symbol);
        return s + (t ? t.quote.close * p.quantity : 0);
      }, 0) + cash;

      const enriched: PositionWithPrice[] = positions.map(p => {
        const t = tickers.find(t => t.stock.symbol === p.symbol);
        const price = t?.quote.close ?? 0;
        const mv = price * p.quantity;
        const cost = p.avgCost * p.quantity;
        return {
          ...p,
          currentPrice: price,
          marketValue: mv,
          pnl: mv - cost,
          pnlPercent: cost > 0 ? ((mv - cost) / cost) * 100 : 0,
          weight: totalMV > 0 ? (mv / totalMV) * 100 : 0,
          dayChange: t?.quote.changePercent ?? 0,
        };
      });
      setPricedPositions(enriched);
    } catch (e) {
      console.warn("[portfolio] price refresh failed", e);
    }
  }, [positions, cash]);

  useEffect(() => {
    if (!loading) refreshPrices();
    const t = setInterval(refreshPrices, 30000);
    return () => clearInterval(t);
  }, [refreshPrices, loading]);

  const addPosition = () => {
    const symbol = newPos.symbol.trim().toUpperCase();
    const quantity = parseInt(newPos.quantity);
    const avgCost = parseFloat(newPos.avgCost);
    if (!symbol || !quantity || !avgCost || quantity <= 0 || avgCost <= 0) return;
    setPositions(prev => [...prev, { symbol, name: symbol, quantity, avgCost, currency: "CNY" }]);
    setNewPos({ symbol: "", quantity: "", avgCost: "" });
    setShowAddForm(false);
  };

  const removePosition = (symbol: string) => {
    setPositions(prev => prev.filter(p => p.symbol !== symbol));
  };

  // Aggregate metrics
  const totalMV = pricedPositions.reduce((s, p) => s + p.marketValue, 0) + cash;
  const totalCost = pricedPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
  const totalPnl = totalMV - cash - totalCost;
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  // Fix: dayPnl = sum(marketValue * dayChange%) 
  const dayPnl = pricedPositions.reduce((s, p) => s + p.marketValue * p.dayChange / 100, 0);
  const investedRatio = totalMV > 0 ? (totalMV - cash) / totalMV * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">投资组合</h1>
          <p className="text-sm text-muted-foreground mt-1">
            主账户 · 持仓 {pricedPositions.length} 只 · 数据本地存储
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshPrices}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-all flex items-center gap-2"
          >
            <Shield className="h-4 w-4" /> 刷新价格
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-all flex items-center gap-2"
          >
            <Upload className="h-4 w-4" /> {showImport ? "收起导入" : "导入持仓"}
          </button>
          <button
            onClick={() => {
              if (pricedPositions.length === 0) return;
              const csv = "代码,名称,数量,成本价,现价,市值,盈亏,盈亏%,今日涨跌,权重%\n" + pricedPositions.map(p =>
                `${p.symbol},${p.name},${p.quantity},${p.avgCost},${p.currentPrice},${p.marketValue.toFixed(0)},${p.pnl.toFixed(0)},${p.pnlPercent.toFixed(2)},${p.dayChange.toFixed(2)},${p.weight.toFixed(1)}`
              ).join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `portfolio_${new Date().toISOString().slice(0,10)}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-all flex items-center gap-2"
            title="导出为CSV"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> {showAddForm ? "取消" : "添加持仓"}
          </button>
        </div>
      </div>

      {/* Add Position Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>添加持仓</CardTitle>
            <CardDescription>输入股票代码、持仓数量和平均成本</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="代码 (如 600519)"
                value={newPos.symbol}
                onChange={e => setNewPos({ ...newPos, symbol: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <input
                type="number"
                placeholder="数量 (股)"
                value={newPos.quantity}
                onChange={e => setNewPos({ ...newPos, quantity: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <input
                type="number"
                step="0.01"
                placeholder="平均成本"
                value={newPos.avgCost}
                onChange={e => setNewPos({ ...newPos, avgCost: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <button
                onClick={addPosition}
                className="rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-all"
              >
                确认添加
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              支持 A股(600519) / 港股(00700) / 美股(AAPL)。价格每30秒自动刷新。
            </p>
          </CardContent>
        </Card>
      )}

      {/* CSV Import Panel */}
      {showImport && (
        <Card>
          <CardHeader>
            <CardTitle>导入券商持仓</CardTitle>
            <CardDescription>从券商APP导出持仓后，将数据粘贴到下方（支持CSV、TXT格式，格式：代码,名称,数量,成本）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"示例格式:\n600519,贵州茅台,100,1680.50\n000858,五粮液,200,145.30\n00700,腾讯控股,300,380.00\nAAPL,Apple Inc,50,185.75"}
              className="w-full h-32 rounded-lg border border-input bg-background p-3 text-xs font-mono resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const lines = importText.trim().split("\n").filter(Boolean);
                  const newPositions = lines.map(line => {
                    const parts = line.split(/[,，\t]+/).map(p => p.trim());
                    return {
                      symbol: parts[0],
                      name: parts[1] || parts[0],
                      quantity: parseInt(parts[2]) || 0,
                      avgCost: parseFloat(parts[3]) || 0,
                      currency: parts[0].match(/^\d/) ? "CNY" : parts[0].match(/^\d{5}$/) ? "HKD" : "USD",
                    };
                  }).filter(p => p.symbol && p.quantity > 0 && p.avgCost > 0);

                  if (newPositions.length > 0) {
                    setPositions(prev => [...prev, ...newPositions.filter(np => !prev.some(p => p.symbol === np.symbol))]);
                    setImportText("");
                    setShowImport(false);
                  }
                }}
                disabled={!importText.trim()}
                className="rounded-lg bg-primary text-primary-foreground text-sm px-4 py-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                确认导入 ({importText.trim().split("\n").filter(Boolean).length} 行)
              </button>
              <button onClick={() => { setImportText(""); setShowImport(false); }} className="text-xs text-muted-foreground hover:text-foreground">取消</button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              支持东方财富、同花顺、华泰证券等主流券商的导出格式。多列用逗号/中文逗号/制表符分隔。数据仅保存在本地浏览器，不会上传。
            </p>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>总资产</CardDescription></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{formatCurrency(totalMV, "CNY")}</p>
            <p className="text-xs text-muted-foreground mt-1">现金: {formatCurrency(cash, "CNY")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>持仓盈亏</CardDescription></CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold font-mono", totalPnl >= 0 ? "text-bull" : "text-bear")}>
              {totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl, "CNY")}
            </p>
            <p className={cn("text-xs mt-1 flex items-center gap-1", totalPnl >= 0 ? "text-bull" : "text-bear")}>
              {totalPnl >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {formatPercent(totalPnlPercent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>投入比例</CardDescription></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{investedRatio.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              已投入 {formatCurrency(totalMV - cash, "CNY")} / 现金 {formatCurrency(cash, "CNY")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>持仓数</CardDescription></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{pricedPositions.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {pricedPositions.filter(p => p.pnl > 0).length} 盈 / {pricedPositions.filter(p => p.pnl <= 0).length} 亏
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>持仓明细</CardTitle>
          <CardDescription>实时价格来自新浪财经，每30秒刷新</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pricedPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Briefcase className="h-12 w-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">暂无持仓</p>
              <p className="text-xs text-muted-foreground mt-1">点击右上角「添加持仓」开始管理你的投资组合</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-y border-border bg-muted/30">
                  {["代码", "名称", "数量", "成本", "现价", "市值", "盈亏", "今日", "权重", "操作"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pricedPositions.map(p => (
                  <tr key={p.symbol} className="border-b border-border hover:bg-accent/50 transition-all">
                    <td className="px-3 py-2.5 text-xs font-mono font-medium">{p.symbol}</td>
                    <td className="px-3 py-2.5 text-xs">{p.name}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{p.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{p.avgCost.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{p.currentPrice.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{formatCurrency(p.marketValue, p.currency)}</td>
                    <td className={cn("px-3 py-2.5 text-xs font-mono", p.pnl >= 0 ? "text-bull" : "text-bear")}>
                      {p.pnl >= 0 ? "+" : ""}{formatCurrency(p.pnl, p.currency)}
                      <span className="text-[10px] block">({p.pnlPercent >= 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%)</span>
                    </td>
                    <td className={cn("px-3 py-2.5 text-xs font-mono", p.dayChange >= 0 ? "text-bull" : "text-bear")}>
                      {p.dayChange >= 0 ? "+" : ""}{p.dayChange.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono">{p.weight.toFixed(1)}%</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => removePosition(p.symbol)}
                        className="text-muted-foreground hover:text-destructive transition-all"
                        title="删除持仓"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Profit Curve Bar Chart */}
      {pricedPositions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>盈亏概览</CardTitle>
            <CardDescription>持仓盈亏分布图</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {pricedPositions.map((p) => {
                const barHeight = Math.max(4, Math.min(96, Math.abs(p.pnlPercent) * 3));
                const isProfit = p.pnlPercent >= 0;
                return (
                  <div key={p.symbol} className="flex flex-col items-center flex-1 min-w-0" title={`${p.symbol} ${p.name}: ${formatPercent(p.pnlPercent)}`}>
                    <span className="text-[8px] text-muted-foreground whitespace-nowrap truncate max-w-full">{p.symbol}</span>
                    <div className={cn("w-full max-w-[40px] rounded-t", isProfit ? "bg-bull/80" : "bg-bear/80")}
                      style={{ height: barHeight, marginTop: isProfit ? 96 - barHeight : 0 }} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cash Management */}
      <Card>
        <CardHeader>
          <CardTitle>现金管理</CardTitle>
          <CardDescription>调整现金余额（用于模拟入金/出金）</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <input
            type="number"
            value={cash}
            onChange={e => setCash(parseFloat(e.target.value) || 0)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono w-48"
          />
          <span className="text-xs text-muted-foreground">CNY</span>
        </CardContent>
      </Card>
    </div>
  );
}
