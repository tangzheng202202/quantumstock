// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useWatchlistStore } from "@/lib/stores/watchlist";
import { StatCard } from "@/components/dashboard/StatCard";
import { TickerRow } from "@/components/dashboard/TickerRow";
import type { TickerData } from "@/types";

// ---------- zustand watchlist store ----------

describe("useWatchlistStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useWatchlistStore.setState({ items: [], hydrated: false });
  });

  const item = { symbol: "600519", name: "贵州茅台", market: "SSE" };

  it("hydrates from localStorage", () => {
    localStorage.setItem(
      "quantumstock:watchlist",
      JSON.stringify([{ ...item, addedAt: 1 }])
    );
    useWatchlistStore.getState().hydrate();
    expect(useWatchlistStore.getState().items).toHaveLength(1);
    expect(useWatchlistStore.getState().hydrated).toBe(true);
  });

  it("add persists to state and localStorage", () => {
    const s = useWatchlistStore.getState();
    s.add(item);
    const state = useWatchlistStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].symbol).toBe("600519");
    expect(state.items[0].addedAt).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem("quantumstock:watchlist")!)).toHaveLength(1);
  });

  it("add ignores duplicates", () => {
    const s = useWatchlistStore.getState();
    s.add(item);
    s.add(item);
    expect(useWatchlistStore.getState().items).toHaveLength(1);
  });

  it("toggle adds then removes", () => {
    const s = useWatchlistStore.getState();
    expect(s.toggle(item)).toBe(true);
    expect(useWatchlistStore.getState().isIn("600519")).toBe(true);
    expect(useWatchlistStore.getState().toggle(item)).toBe(false);
    expect(useWatchlistStore.getState().isIn("600519")).toBe(false);
  });

  it("remove deletes the symbol", () => {
    const s = useWatchlistStore.getState();
    s.add(item);
    s.remove("600519");
    expect(useWatchlistStore.getState().items).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("quantumstock:watchlist")!)).toHaveLength(0);
  });
});

// ---------- StatCard ----------

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="上涨家数" value={3200} suffix="全市场" accent="bull" bordered />);
    expect(screen.getByText("上涨家数")).toBeInTheDocument();
    expect(screen.getByText("3200")).toBeInTheDocument();
    expect(screen.getByText("全市场")).toBeInTheDocument();
  });

  it("applies accent color class to the value", () => {
    render(<StatCard label="下跌家数" value={1500} accent="bear" />);
    expect(screen.getByText("1500")).toHaveClass("text-bear");
  });
});

// ---------- TickerRow ----------

const SAMPLE: TickerData = {
  stock: { symbol: "600519", name: "贵州茅台", market: "SSE", currency: "CNY" },
  quote: {
    timestamp: 0, open: 1700, high: 1715, low: 1695, close: 1710.5,
    volume: 1000, amount: 0, change: 20.5, changePercent: 1.21,
  },
  updatedAt: 0,
};

describe("TickerRow", () => {
  it("renders name, symbol, close and positive change with bull color", () => {
    render(<TickerRow ticker={SAMPLE} starred />);
    expect(screen.getByText("贵州茅台")).toBeInTheDocument();
    expect(screen.getByText("600519")).toBeInTheDocument();
    expect(screen.getByText("1710.50")).toBeInTheDocument();
    expect(screen.getByText("+1.21%")).toHaveClass("text-bull");
  });

  it("links to the stock detail page", () => {
    render(<TickerRow ticker={SAMPLE} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/stock/600519");
  });

  it("renders negative change with bear color", () => {
    const down: TickerData = {
      ...SAMPLE,
      quote: { ...SAMPLE.quote, change: -20.5, changePercent: -1.21 },
    };
    render(<TickerRow ticker={down} />);
    expect(screen.getByText("-1.21%")).toHaveClass("text-bear");
  });
});
