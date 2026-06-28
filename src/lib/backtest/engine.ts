/**
 * Client-side strategy backtesting engine.
 * Computes real metrics from K-line data — no mock numbers.
 */

export interface KLineBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdDays: number;
  side: "long";
}

export interface BacktestMetrics {
  totalReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgHoldDays: number;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  equityCurve: { date: string; value: number }[];
  trades: Trade[];
}

export interface StrategyParams {
  fastPeriod?: number;
  slowPeriod?: number;
  entryPeriod?: number;
  exitPeriod?: number;
  atrPeriod?: number;
  lookback?: number;
  topN?: number;
  bbPeriod?: number;
  stdDev?: number;
}

// ---------- Indicators (imported from @/lib/indicators) ----------

import { SMA, BollingerBands } from "@/lib/indicators";

function donchianChannel(highs: number[], lows: number[], period: number) {
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < highs.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let hMax = -Infinity, lMin = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hMax) hMax = highs[j];
      if (lows[j] < lMin) lMin = lows[j];
    }
    upper.push(hMax);
    lower.push(lMin);
  }
  return { upper, lower };
}

// ---------- Strategies ----------

interface Signal {
  date: string;
  type: "buy" | "sell";
  price: number;
  index: number;
}

function dualMaStrategy(bars: KLineBar[], params: StrategyParams): Signal[] {
  const fast = SMA(bars.map(b => b.close), params.fastPeriod ?? 10);
  const slow = SMA(bars.map(b => b.close), params.slowPeriod ?? 30);
  const signals: Signal[] = [];
  let position = false;

  for (let i = 1; i < bars.length; i++) {
    if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) continue;
    const goldenCross = fast[i - 1]! <= slow[i - 1]! && fast[i]! > slow[i]!;
    const deathCross = fast[i - 1]! >= slow[i - 1]! && fast[i]! < slow[i]!;

    if (goldenCross && !position) {
      signals.push({ date: bars[i].date, type: "buy", price: bars[i].close, index: i });
      position = true;
    } else if (deathCross && position) {
      signals.push({ date: bars[i].date, type: "sell", price: bars[i].close, index: i });
      position = false;
    }
  }
  return signals;
}

function turtleStrategy(bars: KLineBar[], params: StrategyParams): Signal[] {
  const entry = params.entryPeriod ?? 20;
  const exit = params.exitPeriod ?? 10;
  const dcEntry = donchianChannel(bars.map(b => b.high), bars.map(b => b.low), entry);
  const dcExit = donchianChannel(bars.map(b => b.high), bars.map(b => b.low), exit);
  const signals: Signal[] = [];
  let position = false;

  for (let i = 1; i < bars.length; i++) {
    if (dcEntry.upper[i - 1] == null || dcExit.lower[i - 1] == null) continue;
    // Breakout above previous upper channel → buy
    if (bars[i].close > dcEntry.upper[i - 1]! && !position) {
      signals.push({ date: bars[i].date, type: "buy", price: bars[i].close, index: i });
      position = true;
    }
    // Close below previous exit channel lower → sell
    else if (bars[i].close < dcExit.lower[i - 1]! && position) {
      signals.push({ date: bars[i].date, type: "sell", price: bars[i].close, index: i });
      position = false;
    }
  }
  return signals;
}

function meanReversionStrategy(bars: KLineBar[], params: StrategyParams): Signal[] {
  const period = params.bbPeriod ?? 20;
  const stdDev = params.stdDev ?? 2;
  const { upper, lower, middle: mid } = BollingerBands(bars.map(b => b.close), period, stdDev);
  const signals: Signal[] = [];
  let position = false;

  for (let i = 1; i < bars.length; i++) {
    if (upper[i] == null || lower[i] == null || mid[i] == null) continue;
    // Touch lower band → buy
    if (bars[i].close <= lower[i]! && !position) {
      signals.push({ date: bars[i].date, type: "buy", price: bars[i].close, index: i });
      position = true;
    }
    // Touch upper band or middle → sell
    else if (bars[i].close >= mid[i]! && position) {
      signals.push({ date: bars[i].date, type: "sell", price: bars[i].close, index: i });
      position = false;
    }
  }
  return signals;
}

function momentumStrategy(bars: KLineBar[], params: StrategyParams): Signal[] {
  // For single-stock momentum: buy if recent N-day return > 0, sell if < 0
  const lookback = params.lookback ?? 20;
  const signals: Signal[] = [];
  let position = false;

  for (let i = lookback; i < bars.length; i++) {
    const pastReturn = (bars[i].close - bars[i - lookback].close) / bars[i - lookback].close;
    if (pastReturn > 0.02 && !position) {
      signals.push({ date: bars[i].date, type: "buy", price: bars[i].close, index: i });
      position = true;
    } else if (pastReturn < -0.02 && position) {
      signals.push({ date: bars[i].date, type: "sell", price: bars[i].close, index: i });
      position = false;
    }
  }
  return signals;
}

// ---------- Engine ----------

export function runBacktest(
  bars: KLineBar[],
  strategyId: string,
  params: StrategyParams,
  initialCapital = 1000000,
  commission = 0.0003
): BacktestResult {
  if (bars.length < 30) {
    throw new Error("K线数据不足，至少需要30个交易日");
  }

  // 1. Generate signals
  let signals: Signal[];
  switch (strategyId) {
    case "dual_ma": signals = dualMaStrategy(bars, params); break;
    case "turtle": signals = turtleStrategy(bars, params); break;
    case "momentum": signals = momentumStrategy(bars, params); break;
    case "mean_reversion": signals = meanReversionStrategy(bars, params); break;
    default: throw new Error(`Unknown strategy: ${strategyId}`);
  }

  // 2. Execute trades
  const trades: Trade[] = [];
  let cash = initialCapital;
  let position = 0; // shares held
  let entryPrice = 0;
  let entryDate = "";
  let entryIndex = 0;

  const equityCurve: { date: string; value: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const signal = signals.find(s => s.index === i);

    if (signal?.type === "buy" && position === 0) {
      const maxShares = Math.floor(cash / signal.price / 100) * 100; // round lot
      if (maxShares > 0) {
        const cost = maxShares * signal.price * (1 + commission);
        if (cost <= cash) {
          cash -= cost;
          position = maxShares;
          entryPrice = signal.price;
          entryDate = signal.date;
          entryIndex = i;
        }
      }
    } else if (signal?.type === "sell" && position > 0) {
      const proceeds = position * signal.price * (1 - commission);
      cash += proceeds;
      const pnl = proceeds - position * entryPrice * (1 + commission);
      const pnlPercent = (pnl / (position * entryPrice)) * 100;
      const holdDays = i - entryIndex;
      trades.push({
        entryDate,
        exitDate: signal.date,
        entryPrice,
        exitPrice: signal.price,
        quantity: position,
        pnl,
        pnlPercent,
        holdDays,
        side: "long",
      });
      position = 0;
    }

    // Mark-to-market equity
    const equity = cash + position * bar.close;
    equityCurve.push({ date: bar.date, value: equity });
  }

  // Close any open position at last bar
  if (position > 0) {
    const lastBar = bars[bars.length - 1];
    const proceeds = position * lastBar.close * (1 - commission);
    cash += proceeds;
    const pnl = proceeds - position * entryPrice * (1 + commission);
    const pnlPercent = (pnl / (position * entryPrice)) * 100;
    trades.push({
      entryDate,
      exitDate: lastBar.date,
      entryPrice,
      exitPrice: lastBar.close,
      quantity: position,
      pnl,
      pnlPercent,
      holdDays: bars.length - 1 - entryIndex,
      side: "long",
    });
    equityCurve[equityCurve.length - 1].value = cash;
  }

  // 3. Compute metrics
  const finalEquity = equityCurve[equityCurve.length - 1]?.value ?? initialCapital;
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;
  const years = bars.length / 252;
  const annualReturn = years > 0 ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100 : 0;

  // Max drawdown
  let peak = -Infinity, maxDD = 0, maxDDStart = 0, maxDDEnd = 0, currentDDStart = 0;
  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i].value > peak) {
      peak = equityCurve[i].value;
      currentDDStart = i;
    }
    const dd = (equityCurve[i].value - peak) / peak * 100;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDStart = currentDDStart;
      maxDDEnd = i;
    }
  }
  const maxDrawdownDuration = maxDDEnd - maxDDStart;

  // Daily returns for Sharpe/Sortino
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value);
  }
  const meanRet = dailyReturns.reduce((s, r) => s + r, 0) / (dailyReturns.length || 1);
  const variance = dailyReturns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (dailyReturns.length || 1);
  const std = Math.sqrt(variance);
  const sharpeRatio = std > 0 ? (meanRet / std) * Math.sqrt(252) : 0;
  const downsideReturns = dailyReturns.filter(r => r < 0);
  const downsideStd = Math.sqrt(
    downsideReturns.length > 0
      ? downsideReturns.reduce((s, r) => s + r * r, 0) / downsideReturns.length
      : 0
  );
  const sortinoRatio = downsideStd > 0 ? (meanRet / downsideStd) * Math.sqrt(252) : 0;

  // Trade metrics
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? -grossLoss / losses.length : 0;
  const avgHoldDays = trades.length > 0
    ? trades.reduce((s, t) => s + t.holdDays, 0) / trades.length
    : 0;

  return {
    metrics: {
      totalReturn,
      annualReturn,
      maxDrawdown: maxDD,
      maxDrawdownDuration,
      sharpeRatio: +sharpeRatio.toFixed(2),
      sortinoRatio: +sortinoRatio.toFixed(2),
      calmarRatio: maxDD !== 0 ? +(annualReturn / Math.abs(maxDD)).toFixed(2) : 0,
      winRate: +winRate.toFixed(1),
      profitFactor: profitFactor === Infinity ? 99 : +profitFactor.toFixed(2),
      avgWin: +avgWin.toFixed(2),
      avgLoss: +avgLoss.toFixed(2),
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      avgHoldDays: +avgHoldDays.toFixed(1),
    },
    equityCurve,
    trades,
  };
}

// Fetch K-line bars for backtesting
export async function fetchBacktestData(symbol: string, range = "2y"): Promise<KLineBar[]> {
  const rangeToLimit: Record<string, number> = {
    "6mo": 130, "1y": 250, "2y": 500, "5y": 1200,
  };
  const limit = rangeToLimit[range] ?? 500;
  const res = await fetch(`/api/market/ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range}&limit=${limit}`);
  if (!res.ok) throw new Error(`K线获取失败: HTTP ${res.status}`);
  const j = await res.json();
  if (!j.success) throw new Error(j.error ?? "未知错误");
  return (j.data as any[]).map(b => ({
    date: new Date(b.timestamp).toISOString().slice(0, 10),
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
  }));
}
