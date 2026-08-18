import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency: string = "CNY"): string {
  const locales: Record<string, string> = {
    CNY: "zh-CN",
    USD: "en-US",
    HKD: "zh-HK",
    JPY: "ja-JP",
  };
  const currencyMap: Record<string, string> = {
    CNY: "CNY",
    USD: "USD",
    HKD: "HKD",
    JPY: "JPY",
  };
  return new Intl.NumberFormat(locales[currency] ?? "en-US", {
    style: "currency",
    currency: currencyMap[currency] ?? currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatLargeNumber(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

export function formatPercent(value: number, signed: boolean = true): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function cnColor(value: number): string {
  if (value > 0) return "text-bull";
  if (value < 0) return "text-bear";
  return "text-muted-foreground";
}

export function cnBgColor(value: number): string {
  if (value > 0) return "bg-bull/10 text-bull";
  if (value < 0) return "bg-bear/10 text-bear";
  return "bg-muted text-muted-foreground";
}

export { sanitizeHtml, sanitizeErrorMessage } from "./utils/sanitize";
