"""
Server-side backtest engine (Phase 3) — semantic port of src/lib/backtest/engine.ts.

A-share market constraints preserved exactly:
  - Limit-up/down blocks (buy at limit-up / sell at limit-down skipped)
  - T+1 settlement (no same-bar sell after buy)
  - Stamp tax on sells (0.1% A-shares)
  - Commission both sides + slippage model
  - Round-lot trading (100 shares for A-shares)

Strategies: dual_ma | turtle | momentum | mean_reversion (same signal semantics).

Pure numpy — no vectorbt/backtrader dependency (they add ~200MB and their event
loop semantics differ from the TS engine we must stay consistent with; revisit
only when parameter-optimization workloads arrive).
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
import numpy as np
from pydantic import BaseModel, Field


# ==================== Models ====================

class KLineBar(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0
    prevClose: Optional[float] = None


class MarketConstraints(BaseModel):
    limitUp: float = 0
    limitDown: float = 0
    tPlusOne: bool = False
    stampTaxSell: float = 0
    lotSize: int = 1


A_SHARE_MAIN = MarketConstraints(limitUp=0.10, limitDown=-0.10, tPlusOne=True, stampTaxSell=0.001, lotSize=100)
A_SHARE_GEM = MarketConstraints(limitUp=0.20, limitDown=-0.20, tPlusOne=True, stampTaxSell=0.001, lotSize=100)
UNRESTRICTED = MarketConstraints()


class StrategyParams(BaseModel):
    fastPeriod: Optional[int] = None
    slowPeriod: Optional[int] = None
    entryPeriod: Optional[int] = None
    exitPeriod: Optional[int] = None
    lookback: Optional[int] = None
    topN: Optional[int] = None
    bbPeriod: Optional[int] = None
    stdDev: Optional[float] = None


class BacktestRequest(BaseModel):
    bars: List[KLineBar]
    strategyId: str
    params: StrategyParams = Field(default_factory=StrategyParams)
    initialCapital: float = 1_000_000
    commission: float = 0.0003
    market: MarketConstraints = Field(default_factory=MarketConstraints)
    slippagePct: float = 0.0005


# ==================== Indicators ====================

def sma(values: np.ndarray, period: int) -> np.ndarray:
    out = np.full(len(values), np.nan)
    if len(values) >= period:
        c = np.cumsum(values)
        c[period:] = c[period:] - c[:-period]
        out[period - 1:] = c[period - 1:] / period
    return out


def donchian(highs: np.ndarray, lows: np.ndarray, period: int):
    n = len(highs)
    upper = np.full(n, np.nan)
    lower = np.full(n, np.nan)
    for i in range(period - 1, n):
        upper[i] = highs[i - period + 1: i + 1].max()
        lower[i] = lows[i - period + 1: i + 1].min()
    return upper, lower


# ==================== Strategies (signal semantics identical to TS) ====================

@dataclass
class Signal:
    date: str
    type: str  # "buy" | "sell"
    price: float
    index: int


def _dual_ma(closes: np.ndarray, dates: List[str], p: StrategyParams) -> List[Signal]:
    fast = sma(closes, p.fastPeriod or 10)
    slow = sma(closes, p.slowPeriod or 30)
    signals: List[Signal] = []
    position = False
    for i in range(1, len(closes)):
        if np.isnan(fast[i]) or np.isnan(slow[i]) or np.isnan(fast[i - 1]) or np.isnan(slow[i - 1]):
            continue
        golden = fast[i - 1] <= slow[i - 1] and fast[i] > slow[i]
        death = fast[i - 1] >= slow[i - 1] and fast[i] < slow[i]
        if golden and not position:
            signals.append(Signal(dates[i], "buy", closes[i], i)); position = True
        elif death and position:
            signals.append(Signal(dates[i], "sell", closes[i], i)); position = False
    return signals


def _turtle(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, dates: List[str], p: StrategyParams) -> List[Signal]:
    entry = p.entryPeriod or 20
    exit_ = p.exitPeriod or 10
    dc_entry_u, _ = donchian(highs, lows, entry)
    _, dc_exit_l = donchian(highs, lows, exit_)
    signals: List[Signal] = []
    position = False
    for i in range(1, len(closes)):
        if np.isnan(dc_entry_u[i - 1]) or np.isnan(dc_exit_l[i - 1]):
            continue
        if closes[i] > dc_entry_u[i - 1] and not position:
            signals.append(Signal(dates[i], "buy", closes[i], i)); position = True
        elif closes[i] < dc_exit_l[i - 1] and position:
            signals.append(Signal(dates[i], "sell", closes[i], i)); position = False
    return signals


def _momentum(closes: np.ndarray, dates: List[str], p: StrategyParams) -> List[Signal]:
    lookback = p.lookback or 20
    signals: List[Signal] = []
    position = False
    ret = np.zeros_like(closes)
    ret[lookback:] = closes[lookback:] / closes[:-lookback] - 1
    for i in range(lookback, len(closes)):
        if not position and ret[i] > 0.08:
            signals.append(Signal(dates[i], "buy", closes[i], i)); position = True
        elif position and ret[i] < -0.05:
            signals.append(Signal(dates[i], "sell", closes[i], i)); position = False
    return signals


def _mean_reversion(closes: np.ndarray, dates: List[str], p: StrategyParams) -> List[Signal]:
    period = p.bbPeriod or 20
    k = p.stdDev or 2.0
    mid = sma(closes, period)
    std = np.full_like(closes, np.nan)
    for i in range(period - 1, len(closes)):
        std[i] = closes[i - period + 1: i + 1].std()
    signals: List[Signal] = []
    position = False
    for i in range(1, len(closes)):
        if np.isnan(mid[i]) or np.isnan(mid[i - 1]):
            continue
        upper, lower = mid[i] + k * std[i], mid[i] - k * std[i]
        upper_prev, lower_prev = mid[i - 1] + k * std[i - 1], mid[i - 1] - k * std[i - 1]
        if not position and closes[i - 1] < lower_prev and closes[i] > lower:
            signals.append(Signal(dates[i], "buy", closes[i], i)); position = True
        elif position and closes[i - 1] > upper_prev and closes[i] < upper:
            signals.append(Signal(dates[i], "sell", closes[i], i)); position = False
    return signals


def generate_signals(bars: List[KLineBar], strategy_id: str, p: StrategyParams) -> List[Signal]:
    closes = np.array([b.close for b in bars])
    highs = np.array([b.high for b in bars])
    lows = np.array([b.low for b in bars])
    dates = [b.date for b in bars]
    if strategy_id == "dual_ma":
        return _dual_ma(closes, dates, p)
    if strategy_id == "turtle":
        return _turtle(highs, lows, closes, dates, p)
    if strategy_id == "momentum":
        return _momentum(closes, dates, p)
    if strategy_id == "mean_reversion":
        return _mean_reversion(closes, dates, p)
    raise ValueError(f"Unknown strategy: {strategy_id}")


# ==================== Execution (port of runBacktest) ====================

def run_backtest(req: BacktestRequest) -> Dict[str, Any]:
    bars = req.bars
    if len(bars) < 30:
        raise ValueError("K线数据不足，至少需要30个交易日")

    m = req.market
    signals = generate_signals(bars, req.strategyId, req.params)
    signal_at = {s.index: s for s in signals}

    trades: List[Dict[str, Any]] = []
    cash = req.initialCapital
    position = 0
    entry_price = 0.0
    entry_date = ""
    entry_index = -1

    equity_curve: List[Dict[str, Any]] = []

    for i, bar in enumerate(bars):
        prev_close = bar.prevClose if bar.prevClose is not None else bar.open
        signal = signal_at.get(i)

        at_limit_up = m.limitUp > 0 and prev_close > 0 and bar.close >= prev_close * (1 + m.limitUp) * 0.999
        at_limit_down = m.limitDown < 0 and prev_close > 0 and bar.close <= prev_close * (1 + m.limitDown) * 1.001

        if signal and signal.type == "buy" and position == 0:
            if not at_limit_up:
                buy_price = signal.price * (1 + req.slippagePct)
                effective = buy_price * (1 + req.commission)
                if m.lotSize == 1:
                    max_shares = int(cash / effective)
                else:
                    max_shares = int(cash / effective / m.lotSize) * m.lotSize
                if max_shares > 0:
                    cash -= max_shares * effective
                    position = max_shares
                    entry_price = buy_price
                    entry_date = signal.date
                    entry_index = i

        elif signal and signal.type == "sell" and position > 0:
            t_plus_one_block = m.tPlusOne and i == entry_index
            if not at_limit_down and not t_plus_one_block:
                sell_price = signal.price * (1 - req.slippagePct)
                gross = position * sell_price
                stamp = gross * m.stampTaxSell
                proceeds = gross * (1 - req.commission) - stamp
                entry_cost = position * entry_price * (1 + req.commission)
                pnl = proceeds - entry_cost
                exit_date = signal.date
                entry_dt = np.datetime64(entry_date[:10]) if len(entry_date) >= 10 else None
                exit_dt = np.datetime64(exit_date[:10]) if len(exit_date) >= 10 else None
                hold_days = int((exit_dt - entry_dt).astype(int)) if entry_dt is not None and exit_dt is not None else 0
                trades.append({
                    "entryDate": entry_date, "exitDate": exit_date,
                    "entryPrice": round(entry_price, 4), "exitPrice": round(sell_price, 4),
                    "quantity": position, "pnl": round(pnl, 2),
                    "pnlPercent": round(pnl / entry_cost * 100, 4),
                    "holdDays": hold_days, "side": "long",
                })
                cash += proceeds
                position = 0
            # TS engine: on blocked sell, equity still pushed below

        equity_curve.append({"date": bar.date, "value": round(cash + position * bar.close, 2)})

    # Close any open position at last close for metrics
    if position > 0:
        last = bars[-1]
        sell_price = last.close * (1 - req.slippagePct)
        gross = position * sell_price
        stamp = gross * m.stampTaxSell
        proceeds = gross * (1 - req.commission) - stamp
        entry_cost = position * entry_price * (1 + req.commission)
        pnl = proceeds - entry_cost
        trades.append({
            "entryDate": entry_date, "exitDate": last.date,
            "entryPrice": round(entry_price, 4), "exitPrice": round(sell_price, 4),
            "quantity": position, "pnl": round(pnl, 2),
            "pnlPercent": round(pnl / entry_cost * 100, 4),
            "holdDays": 0, "side": "long", "forcedClose": True,
        })

    metrics = compute_metrics(equity_curve, trades, req.initialCapital)
    return {"metrics": metrics, "equityCurve": equity_curve, "trades": trades}


def compute_metrics(equity_curve, trades, initial_capital):
    values = np.array([e["value"] for e in equity_curve], dtype=float)
    final = values[-1] if len(values) else initial_capital
    total_return = final / initial_capital - 1

    n = len(values)
    annual_return = 0.0
    if n > 1:
        years = n / 250
        if years > 0 and final > 0:
            annual_return = (final / initial_capital) ** (1 / years) - 1

    # Max drawdown + duration
    peak = -np.inf
    mdd = 0.0
    peak_idx = 0
    mdd_duration = 0
    cur_duration = 0
    for i, v in enumerate(values):
        if v > peak:
            peak = v
            peak_idx = i
            cur_duration = 0
        else:
            cur_duration = i - peak_idx
            mdd_duration = max(mdd_duration, cur_duration)
        if peak > 0:
            mdd = min(mdd, v / peak - 1)

    # Daily returns → sharpe/sortino (risk-free 0, 250 trading days)
    sharpe = sortino = 0.0
    if n > 2:
        rets = values[1:] / values[:-1] - 1
        sd = rets.std()
        if sd > 0:
            sharpe = float(rets.mean() / sd * np.sqrt(250))
        downside = rets[rets < 0]
        dsd = downside.std() if len(downside) > 1 else 0
        if dsd > 0:
            sortino = float(rets.mean() / dsd * np.sqrt(250))

    calmar = float(annual_return / abs(mdd)) if mdd < 0 else 0.0

    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))
    profit_factor = float(gross_win / gross_loss) if gross_loss > 0 else (float("inf") if gross_win > 0 else 0.0)

    hold_days = [t["holdDays"] for t in trades]

    return {
        "totalReturn": round(total_return * 100, 4),
        "annualReturn": round(annual_return * 100, 4),
        "maxDrawdown": round(mdd * 100, 4),
        "maxDrawdownDuration": mdd_duration,
        "sharpeRatio": round(sharpe, 4),
        "sortinoRatio": round(sortino, 4),
        "calmarRatio": round(calmar, 4),
        "winRate": round(len(wins) / len(trades) * 100, 2) if trades else 0,
        "profitFactor": round(profit_factor, 4) if profit_factor != float("inf") else 99999,
        "avgWin": round(gross_win / len(wins), 2) if wins else 0,
        "avgLoss": round(-gross_loss / len(losses), 2) if losses else 0,
        "totalTrades": len(trades),
        "winningTrades": len(wins),
        "losingTrades": len(losses),
        "avgHoldDays": round(sum(hold_days) / len(hold_days), 1) if hold_days else 0,
    }
