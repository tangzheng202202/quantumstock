/**
 * Technical Indicators Library
 * Pure TypeScript implementation of common technical indicators.
 */

export interface IndicatorInput {
  data: { high: number; low: number; close: number; volume: number }[];
}

// ---- SMA (Simple Moving Average) — O(n) rolling window ----
export function SMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    if (i < period - 1) {
      result.push(null);
    } else {
      result.push(sum / period);
    }
  }
  return result;
}

// ---- EMA (Exponential Moving Average) ----
export function EMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      const sum = data.slice(0, period).reduce((a, b) => a + b, 0);
      ema = sum / period;
      result.push(ema);
    } else {
      ema = (data[i] - ema!) * multiplier + ema!;
      result.push(ema);
    }
  }
  return result;
}

// ---- MACD ----
export function MACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = EMA(data, fastPeriod);
  const emaSlow = EMA(data, slowPeriod);

  const macdLine: (number | null)[] = emaFast.map((f, i) =>
    f !== null && emaSlow[i] !== null ? f - emaSlow[i]! : null
  );

  // Calculate signal line on valid MACD values
  const validMacd = macdLine.filter((v): v is number => v !== null);
  const signalRaw = EMA(validMacd, signalPeriod);
  const signal: (number | null)[] = new Array(macdLine.length).fill(null);

  let signalIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      if (signalIdx < signalRaw.length) {
        signal[i] = signalRaw[signalIdx];
      }
      signalIdx++;
    }
  }

  const histogram = macdLine.map((m, i) =>
    m !== null && signal[i] !== null ? m - signal[i]! : null
  );

  return { macd: macdLine, signal, histogram };
}

// ---- RSI (Relative Strength Index) ----
export function RSI(data: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const changes: number[] = [];

  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1]);
  }
  result.push(null); // first value has no RSI

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  if (avgLoss === 0) {
    result.push(100);
  } else {
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

// ---- Bollinger Bands ----
export function BollingerBands(
  data: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[]; bandwidth: (number | null)[] } {
  const middle = SMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const bandwidth: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1 || middle[i] === null) {
      upper.push(null);
      lower.push(null);
      bandwidth.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = middle[i]!;
      const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);

      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
      bandwidth.push(((upper[i]! - lower[i]!) / mean) * 100);
    }
  }

  return { upper, middle, lower, bandwidth };
}

// ---- ATR (Average True Range) ----
export function ATR(
  data: { high: number; low: number; close: number }[],
  period: number = 14
): (number | null)[] {
  const trueRanges: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      trueRanges.push(data[i].high - data[i].low);
    } else {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      );
      trueRanges.push(tr);
    }
  }

  return EMA(trueRanges, period);
}

// ---- Volume Profile (simplified) ----
export function VolumeProfile(
  data: { close: number; volume: number }[],
  bins: number = 20
): { price: number; volume: number; pct: number }[] {
  if (data.length === 0) return [];

  const min = Math.min(...data.map((d) => d.close));
  const max = Math.max(...data.map((d) => d.close));
  const binSize = (max - min) / bins;

  const profile: { price: number; volume: number }[] = [];
  for (let i = 0; i < bins; i++) {
    profile.push({
      price: min + binSize * (i + 0.5),
      volume: 0,
    });
  }

  for (const d of data) {
    const binIdx = Math.min(Math.floor((d.close - min) / binSize), bins - 1);
    profile[binIdx].volume += d.volume;
  }

  const totalVol = profile.reduce((s, p) => s + p.volume, 0);
  return profile.map((p) => ({
    ...p,
    pct: totalVol > 0 ? (p.volume / totalVol) * 100 : 0,
  }));
}

// ---- VWAP (Volume Weighted Average Price) ----
export function VWAP(
  data: { high: number; low: number; close: number; volume: number }[]
): (number | null)[] {
  const result: (number | null)[] = [];
  let cumulativePV = 0;
  let cumulativeVol = 0;

  for (const d of data) {
    const typical = (d.high + d.low + d.close) / 3;
    cumulativePV += typical * d.volume;
    cumulativeVol += d.volume;
    result.push(cumulativeVol > 0 ? cumulativePV / cumulativeVol : null);
  }

  return result;
}

// ---- Detecting crossovers ----
export function detectCross(
  fast: (number | null)[],
  slow: (number | null)[],
  lookback: number = 1
): ("golden" | "dead" | null)[] {
  const result: ("golden" | "dead" | null)[] = [];

  for (let i = 0; i < fast.length; i++) {
    if (i < lookback || fast[i] === null || slow[i] === null) {
      result.push(null);
      continue;
    }
    const prevFast = fast[i - lookback];
    const prevSlow = slow[i - lookback];

    if (prevFast === null || prevSlow === null) {
      result.push(null);
    } else if (prevFast <= prevSlow && fast[i]! > slow[i]!) {
      result.push("golden");
    } else if (prevFast >= prevSlow && fast[i]! < slow[i]!) {
      result.push("dead");
    } else {
      result.push(null);
    }
  }

  return result;
}

// ---- Multi-timeframe analysis helper ----
export interface SignalResult {
  signal: "bullish" | "bearish" | "neutral";
  strength: number;  // 0-100
  details: { indicator: string; signal: string; timeframe: string }[];
}

export function multiTimeframeSignals(
  dailyData: { high: number; low: number; close: number; volume: number }[],
  weeklyData: { high: number; low: number; close: number; volume: number }[]
): SignalResult {
  const details: { indicator: string; signal: string; timeframe: string }[] = [];
  let bullishCount = 0;
  let totalCount = 0;

  const dailyClose = dailyData.map((d) => d.close);
  const weeklyClose = weeklyData.map((d) => d.close);

  // Daily RSI
  const dailyRsi = RSI(dailyClose, 14);
  const lastDailyRsi = dailyRsi[dailyRsi.length - 1];
  totalCount++;
  if (lastDailyRsi !== null) {
    if (lastDailyRsi > 70) {
      details.push({ indicator: "RSI", signal: "bearish (overbought)", timeframe: "daily" });
    } else if (lastDailyRsi < 30) {
      details.push({ indicator: "RSI", signal: "bullish (oversold)", timeframe: "daily" });
      bullishCount++;
    } else {
      details.push({ indicator: "RSI", signal: "neutral", timeframe: "daily" });
      bullishCount += 0.5;
    }
  }

  // Weekly RSI
  const weeklyRsi = RSI(weeklyClose, 14);
  const lastWeeklyRsi = weeklyRsi[weeklyRsi.length - 1];
  totalCount++;
  if (lastWeeklyRsi !== null) {
    if (lastWeeklyRsi > 70) {
      details.push({ indicator: "RSI", signal: "bearish (overbought)", timeframe: "weekly" });
    } else if (lastWeeklyRsi < 30) {
      details.push({ indicator: "RSI", signal: "bullish (oversold)", timeframe: "weekly" });
      bullishCount++;
    } else {
      details.push({ indicator: "RSI", signal: "neutral", timeframe: "weekly" });
      bullishCount += 0.5;
    }
  }

  // Daily MACD
  const dailyMacd = MACD(dailyClose);
  const lastMacd = dailyMacd.macd[dailyMacd.macd.length - 1];
  const lastSignal = dailyMacd.signal[dailyMacd.signal.length - 1];
  totalCount++;
  if (lastMacd !== null && lastSignal !== null) {
    if (lastMacd > lastSignal) {
      details.push({ indicator: "MACD", signal: "bullish", timeframe: "daily" });
      bullishCount++;
    } else {
      details.push({ indicator: "MACD", signal: "bearish", timeframe: "daily" });
    }
  }

  // Daily MA cross (10/30)
  const ma10 = EMA(dailyClose, 10);
  const ma30 = EMA(dailyClose, 30);
  const crosses = detectCross(ma10, ma30);
  totalCount++;
  const lastCross = crosses[crosses.length - 1];
  if (ma10[ma10.length - 1] !== null && ma30[ma30.length - 1] !== null) {
    if (ma10[ma10.length - 1]! > ma30[ma30.length - 1]!) {
      details.push({ indicator: "MA(10/30)", signal: "bullish (uptrend)", timeframe: "daily" });
      bullishCount++;
    } else {
      details.push({ indicator: "MA(10/30)", signal: "bearish (downtrend)", timeframe: "daily" });
    }
  }

  const strength = (bullishCount / Math.max(totalCount, 1)) * 100;

  return {
    signal: strength > 60 ? "bullish" : strength < 40 ? "bearish" : "neutral",
    strength,
    details,
  };
}
