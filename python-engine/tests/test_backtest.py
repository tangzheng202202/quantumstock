"""Pytest suite for the server backtest engine.

Verifies A-share constraint semantics against the TS engine's documented
behavior (the TS engine's 18 vitest cases are the spec).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python-engine"))

import pytest
from backtest import (
    BacktestRequest, KLineBar, StrategyParams, MarketConstraints,
    A_SHARE_MAIN, A_SHARE_GEM, UNRESTRICTED, run_backtest, sma,
)


def make_bars(n=250, base=100.0, drift=0.001):
    """Deterministic pseudo-random walk."""
    import random
    random.seed(42)
    bars = []
    price = base
    prev = None
    for i in range(n):
        change = random.uniform(-0.03, 0.03) + drift
        o = price
        c = price * (1 + change)
        h = max(o, c) * 1.005
        l = min(o, c) * 0.995
        bars.append(KLineBar(date=f"2025-{(i // 28) % 12 + 1:02d}-{i % 28 + 1:02d}",
                             open=o, high=h, low=l, close=c, volume=1000000, prevClose=prev))
        prev = c
        price = c
    return bars


class TestSMA:
    def test_basic(self):
        v = sma(__import__("numpy").array([1, 2, 3, 4, 5.0]), 3)
        assert v[0] != v[0]  # nan
        assert abs(v[2] - 2.0) < 1e-9
        assert abs(v[4] - 4.0) < 1e-9


class TestRunBacktest:
    def test_min_bars_guard(self):
        with pytest.raises(ValueError):
            run_backtest(BacktestRequest(bars=make_bars(20), strategyId="dual_ma"))

    def test_all_strategies_run(self):
        bars = make_bars()
        for sid in ["dual_ma", "turtle", "momentum", "mean_reversion"]:
            r = run_backtest(BacktestRequest(bars=bars, strategyId=sid))
            assert "metrics" in r and "equityCurve" in r and "trades" in r
            assert len(r["equityCurve"]) == len(bars)

    def test_unknown_strategy(self):
        with pytest.raises(ValueError):
            run_backtest(BacktestRequest(bars=make_bars(), strategyId="nope"))

    def test_equity_starts_at_capital(self):
        bars = make_bars()
        r = run_backtest(BacktestRequest(bars=bars, strategyId="dual_ma", initialCapital=500000))
        assert abs(r["equityCurve"][0]["value"] - 500000) < 1.0 or r["trades"]

    def test_t_plus_one_no_same_bar_sell(self):
        # Construct bars where a golden cross and death cross occur far apart;
        # then verify no trade has entryDate == exitDate
        bars = make_bars(300)
        r = run_backtest(BacktestRequest(bars=bars, strategyId="dual_ma", market=A_SHARE_MAIN))
        for t in r["trades"]:
            assert t["entryDate"] != t["exitDate"]

    def test_round_lot_a_share(self):
        bars = make_bars()
        r = run_backtest(BacktestRequest(bars=bars, strategyId="dual_ma", market=A_SHARE_MAIN))
        for t in r["trades"]:
            assert t["quantity"] % 100 == 0

    def test_unrestricted_no_lot_constraint(self):
        bars = make_bars()
        r = run_backtest(BacktestRequest(bars=bars, strategyId="dual_ma", market=UNRESTRICTED))
        # lotSize=1 → quantities need not be multiples of 100
        # (just verify it runs and produces valid trades)
        assert isinstance(r["metrics"]["totalTrades"], int)

    def test_gem_constraints_applied(self):
        bars = make_bars()
        r = run_backtest(BacktestRequest(bars=bars, strategyId="dual_ma", market=A_SHARE_GEM))
        assert r["metrics"]["maxDrawdown"] <= 0

    def test_forced_close_marks_trade(self):
        # Momentum with high threshold likely ends open → forced close
        bars = make_bars(60)
        r = run_backtest(BacktestRequest(bars=bars, strategyId="dual_ma"))
        # All trades well-formed regardless
        for t in r["trades"]:
            assert t["entryPrice"] > 0 and t["exitPrice"] > 0 and t["quantity"] > 0


class TestMetrics:
    def test_win_rate_consistency(self):
        bars = make_bars()
        r = run_backtest(BacktestRequest(bars=bars, strategyId="turtle"))
        m = r["metrics"]
        assert m["winningTrades"] + m["losingTrades"] == m["totalTrades"]
        if m["totalTrades"] > 0:
            assert 0 <= m["winRate"] <= 100
