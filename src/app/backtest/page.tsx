"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { runBacktest, fetchBacktestData, type BacktestResult } from "@/lib/backtest/engine";
import {
  BarChart3,
  Play,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Loader2,
  Download,
  Maximize2,
} from "lucide-react";

const STRATEGIES = [
  {
    id: "dual_ma",
    name: "双均线策略",
    description: "经典的双均线交叉策略，短周期均线上穿长周期均线买入",
    difficulty: "入门",
    params: [
      { name: "fastPeriod", label: "快线周期", type: "number", default: 10, min: 2, max: 60 },
      { name: "slowPeriod", label: "慢线周期", type: "number", default: 30, min: 5, max: 120 },
    ],
  },
  {
    id: "turtle",
    name: "海龟交易策略",
    description: "基于唐奇安通道突破的经典趋势跟踪策略",
    difficulty: "进阶",
    params: [
      { name: "entryPeriod", label: "入场周期", type: "number", default: 20, min: 10, max: 60 },
      { name: "exitPeriod", label: "出场周期", type: "number", default: 10, min: 5, max: 30 },
      { name: "atrPeriod", label: "ATR周期", type: "number", default: 20, min: 10, max: 40 },
    ],
  },
  {
    id: "momentum",
    name: "动量策略",
    description: "买入过去N日涨幅最高的标的，定期再平衡",
    difficulty: "入门",
    params: [
      { name: "lookback", label: "回看天数", type: "number", default: 20, min: 5, max: 120 },
      { name: "rebalance", label: "调仓周期", type: "number", default: 20, min: 5, max: 60 },
      { name: "topN", label: "持仓数量", type: "number", default: 5, min: 1, max: 20 },
    ],
  },
  {
    id: "mean_reversion",
    name: "均值回归策略",
    description: "基于布林带的价格均值回归策略，触及下轨买入触及上轨卖出",
    difficulty: "中级",
    params: [
      { name: "bbPeriod", label: "布林带周期", type: "number", default: 20, min: 10, max: 60 },
      { name: "stdDev", label: "标准差倍数", type: "number", default: 2, min: 1, max: 4, step: 0.5 },
    ],
  },
  {
    id: "custom",
    name: "自定义策略",
    description: "使用策略DSL编写自己的量化策略",
    difficulty: "高级",
    params: [],
  },
];


export default function BacktestPage() {
  const [selectedStrategy, setSelectedStrategy] = useState(STRATEGIES[0]);
  const [params, setParams] = useState<Record<string, number>>(
    Object.fromEntries(STRATEGIES[0].params.map((p) => [p.name, p.default]))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [btSymbol, setBtSymbol] = useState("600519");
  const [btRange, setBtRange] = useState("2y");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (selectedStrategy.id === "custom") {
      setError("自定义策略需在「设置」中编写策略代码后启用");
      return;
    }
    setIsRunning(true);
    setError(null);
    setResult(null);
    setHasResult(false);

    try {
      const bars = await fetchBacktestData(btSymbol, btRange);
      if (bars.length < 30) {
        setError(`K线数据不足：仅获取到 ${bars.length} 根，需要至少 30 根。请选择更长时间范围或更换标的。`);
        setIsRunning(false);
        return;
      }
      const btResult = runBacktest(bars, selectedStrategy.id, params);
      setResult(btResult);
      setHasResult(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "回测失败");
    } finally {
      setIsRunning(false);
    }
  };

  const selectStrategy = (strategy: typeof STRATEGIES[0]) => {
    setSelectedStrategy(strategy);
    setParams(Object.fromEntries(strategy.params.map((p) => [p.name, p.default])));
    setHasResult(false);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">策略回测</h1>
        <p className="text-sm text-muted-foreground mt-1">
          内置经典策略模板，支持参数优化，可视化回测结果
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Strategy & Config */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {/* Strategy Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>选择策略</CardTitle>
              <CardDescription>内置经典量化策略</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectStrategy(s)}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    selectedStrategy.id === s.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{s.name}</p>
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                        s.difficulty === "入门" ? "bg-success/10 text-success"
                        : s.difficulty === "中级" ? "bg-warning/10 text-warning"
                        : s.difficulty === "进阶" ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                      )}>
                        {s.difficulty}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                      {s.description}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Parameters */}
          {selectedStrategy.params.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>策略参数</CardTitle>
                <CardDescription>调整回测参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedStrategy.params.map((param) => (
                  <div key={param.name}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium">{param.label}</label>
                      <span className="text-xs font-mono text-muted-foreground">
                        {params[param.name]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step ?? 1}
                      value={params[param.name]}
                      onChange={(e) =>
                        setParams({ ...params, [param.name]: Number(e.target.value) })
                      }
                      className="w-full h-1.5 rounded-full bg-muted appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3
                        [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-primary"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Run Config */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>回测设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">回测标的</label>
                <input
                  type="text"
                  defaultValue="600519, 300750, AAPL"
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium block mb-1">标的代码</label>
                  <input
                    type="text"
                    value={btSymbol}
                    onChange={(e) => setBtSymbol(e.target.value.trim())}
                    placeholder="如 600519"
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">时间范围</label>
                  <select
                    value={btRange}
                    onChange={(e) => setBtRange(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs"
                  >
                    <option value="6mo">近6月</option>
                    <option value="1y">近1年</option>
                    <option value="2y">近2年</option>
                    <option value="5y">近5年</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">初始资金</label>
                <input
                  type="number"
                  defaultValue={1000000}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          <button
            onClick={handleRun}
            disabled={isRunning}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                回测运行中...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                运行回测
              </>
            )}
          </button>
        </div>

        {/* Right: Results */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          {isRunning ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm font-medium">正在拉取K线数据并执行回测...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  标的: {btSymbol} · 范围: {btRange} · 策略: {selectedStrategy.name}
                </p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20">
                <p className="text-sm text-destructive mb-3">{error}</p>
                <p className="text-xs text-muted-foreground">请检查股票代码或更换策略参数后重试</p>
              </CardContent>
            </Card>
          ) : hasResult && result ? (
            <>
              {/* Performance Metrics */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "总收益率", value: formatPercent(result.metrics.totalReturn), icon: TrendingUp, color: result.metrics.totalReturn >= 0 ? "text-bull" : "text-bear" },
                  { label: "年化收益", value: formatPercent(result.metrics.annualReturn), icon: Target, color: result.metrics.annualReturn >= 0 ? "text-bull" : "text-bear" },
                  { label: "最大回撤", value: formatPercent(result.metrics.maxDrawdown), icon: TrendingDown, color: "text-bear" },
                  { label: "夏普比率", value: result.metrics.sharpeRatio.toFixed(2), icon: Shield, color: "text-primary" },
                ].map((m) => (
                  <Card key={m.label}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className={cn("text-xl font-bold font-mono mt-1", m.color)}>
                        {m.value}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* More Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>详细指标</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { label: "胜率", value: formatPercent(result.metrics.winRate) },
                      { label: "盈亏比", value: result.metrics.profitFactor.toFixed(2) },
                      { label: "总交易次数", value: result.metrics.totalTrades.toString() },
                      { label: "盈利交易", value: result.metrics.winningTrades.toString() },
                      { label: "亏损交易", value: result.metrics.losingTrades.toString() },
                      { label: "平均盈利", value: formatPercent(result.metrics.avgWin) },
                      { label: "平均亏损", value: formatPercent(result.metrics.avgLoss) },
                      { label: "平均持仓天数", value: result.metrics.avgHoldDays.toFixed(1) + "天" },
                      { label: "索提诺比率", value: result.metrics.sortinoRatio.toFixed(2) },
                      { label: "最大回撤持续", value: result.metrics.maxDrawdownDuration + "天" },
                    ].map((m) => (
                      <div key={m.label} className="rounded-lg bg-muted/30 p-3">
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        <p className="text-sm font-mono font-medium mt-0.5">{m.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Equity Curve */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>权益曲线</CardTitle>
                      <CardDescription>策略净值走势 vs 基准</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border border-border p-1.5 hover:bg-accent transition-all">
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button className="rounded-lg border border-border p-1.5 hover:bg-accent transition-all">
                        <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] flex items-end gap-[1px]">
                    {result.equityCurve.length > 0 ? (
                      (() => {
                        const values = result.equityCurve.map(p => p.value);
                        const min = Math.min(...values);
                        const max = Math.max(...values);
                        const range = max - min || 1;
                        // Sample down if too many points
                        const step = Math.max(1, Math.floor(result.equityCurve.length / 200));
                        return result.equityCurve
                          .filter((_, i) => i % step === 0)
                          .map((point) => {
                            const height = ((point.value - min) / range) * 100;
                            const isProfit = point.value >= 1000000;
                            return (
                              <div
                                key={point.date}
                                className={cn(
                                  "flex-1 rounded-t-sm transition-all cursor-pointer",
                                  isProfit ? "bg-bull/40 hover:bg-bull" : "bg-bear/40 hover:bg-bear"
                                )}
                                style={{ height: `${Math.max(2, height)}%` }}
                                title={`${point.date}: ${formatCurrency(point.value, "CNY")}`}
                              />
                            );
                          });
                      })()
                    ) : (
                      <p className="mx-auto text-xs text-muted-foreground">无权益曲线数据</p>
                    )}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                    {result.equityCurve.length > 0 && (
                      <>
                        <span>{result.equityCurve[0].date}</span>
                        <span>{result.equityCurve[Math.floor(result.equityCurve.length / 2)].date}</span>
                        <span>{result.equityCurve[result.equityCurve.length - 1].date}</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Trade Log */}
              <Card>
                <CardHeader>
                  <CardTitle>交易记录</CardTitle>
                  <CardDescription>最近交易详情</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-y border-border bg-muted/30">
                        {["日期", "标的", "方向", "价格", "数量", "盈亏", "持仓天数"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                            该策略在所选时间段内未触发任何交易。请尝试调整参数或更换策略。
                          </td>
                        </tr>
                      ) : (
                        result.trades.slice(-50).reverse().map((trade) => (
                        <tr key={`${trade.entryDate}-${trade.exitDate}`} className="border-b border-border hover:bg-accent/50 transition-all">
                          <td className="px-4 py-2.5 text-xs font-mono">{trade.exitDate}</td>
                          <td className="px-4 py-2.5 text-xs font-mono font-medium">{btSymbol}</td>
                          <td className="px-4 py-2.5 text-xs font-medium text-bear">
                            平仓
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">{trade.exitPrice.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-xs font-mono">{trade.quantity}</td>
                          <td className={cn(
                            "px-4 py-2.5 text-xs font-mono",
                            trade.pnl > 0 ? "text-bull" : "text-bear"
                          )}>
                            {formatCurrency(trade.pnl, "CNY")} ({trade.pnlPercent.toFixed(2)}%)
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                            {trade.holdDays}天
                          </td>
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="flex flex-col items-center justify-center py-20">
              <BarChart3 className="h-16 w-16 text-muted-foreground/20 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">选择策略并配置参数</p>
              <p className="text-xs text-muted-foreground mt-1">输入股票代码、选择时间范围，点击「运行回测」</p>
              <p className="text-[10px] text-muted-foreground/70 mt-3">
                支持A股(600519)、港股(00700)、美股(AAPL)。K线数据来自东方财富/新浪财经实时接口。
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
