"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  HistogramData,
  CrosshairMode,
} from "lightweight-charts";

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  data: OHLCVBar[];
  symbol: string;
  name: string;
  height?: number;
  showVolume?: boolean;
  onCrosshairMove?: (bar: OHLCVBar | null) => void;
}

export function CandlestickChart({
  data,
  height = 500,
  showVolume = true,
  onCrosshairMove,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const initChart = useCallback(() => {
    if (!containerRef.current || data.length === 0) return;

    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const container = containerRef.current;
    const chartHeight = showVolume ? height - 100 : height;

    const chart = createChart(container, {
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#cbd5e1" : "#475569",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
        horzLines: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#6366f1", width: 1, style: 2 },
        horzLine: { color: "#6366f1", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.2)",
        scaleMargins: showVolume ? { top: 0.1, bottom: 0.25 } : { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.2)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          const d = new Date((time as number) * 1000);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        },
      },
      width: container.clientWidth,
      height: chartHeight,
    });

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#ef4444",
      downColor: "#22c55e",
      borderUpColor: "#ef4444",
      borderDownColor: "#22c55e",
      wickUpColor: "#ef4444",
      wickDownColor: "#22c55e",
    });

    const candleData: CandlestickData[] = data.map((bar) => ({
      time: (bar.timestamp / 1000) as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));

    candleSeries.setData(candleData);
    candleSeriesRef.current = candleSeries;

    // Volume series
    if (showVolume) {
      const volumeSeries = chart.addHistogramSeries({
        color: "rgba(99,102,241,0.5)",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });

      const volumeData: HistogramData[] = data.map((bar) => {
        const isUp = bar.close >= bar.open;
        return {
          time: (bar.timestamp / 1000) as Time,
          value: bar.volume,
          color: isUp
            ? "rgba(239,68,68,0.4)"
            : "rgba(34,197,94,0.4)",
        };
      });

      volumeSeries.setData(volumeData);
      volumeSeriesRef.current = volumeSeries;

      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
        visible: false,
      });
    }

    // Crosshair callback
    if (onCrosshairMove) {
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || param.point === undefined) {
          onCrosshairMove(null);
          return;
        }
        const idx = candleData.findIndex((d) => d.time === param.time);
        if (idx >= 0 && idx < data.length) {
          onCrosshairMove(data[idx]);
        }
      });
    }

    // Fit content
    chart.timeScale().fitContent();

    chartRef.current = chart;

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [data, height, showVolume, onCrosshairMove, isDark]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] text-muted-foreground">
        暂无K线数据
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full" style={{ height }} />
  );
}
