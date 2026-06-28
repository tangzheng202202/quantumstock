"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Moon, Sun, Bell, User } from "lucide-react";
import { useTheme } from "next-themes";
import { searchStocks } from "@/lib/data/market";
import type { StockInfo } from "@/types";

export function Header() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [hints, setHints] = useState<StockInfo[]>([]);
  const [showHints, setShowHints] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    router.push(`/stock/${encodeURIComponent(q)}`);
    setShowHints(false);
  };

  // Real-time search hints (P0-2)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (searchQuery.trim().length < 2) { setHints([]); setShowHints(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const results = await searchStocks(searchQuery.trim());
        setHints(results.slice(0, 5));
        setShowHints(results.length > 0);
      } catch { setHints([]); }
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [searchQuery]);

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-6">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="搜索股票代码或名称... (如 600519, AAPL, 00700)"
          className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm
            outline-none ring-offset-background placeholder:text-muted-foreground/60
            focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {/* Search hints dropdown */}
        {showHints && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg z-50 max-h-60 overflow-auto">
            {hints.map((h) => (
              <button
                key={h.symbol}
                onClick={() => { router.push(`/stock/${h.symbol}`); setShowHints(false); setSearchQuery(""); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-all text-left"
              >
                <span className="font-mono font-medium">{h.symbol}</span>
                <span className="flex-1 truncate">{h.name}</span>
                <span className="text-[10px] text-muted-foreground">{h.market}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Market Status */}
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs">
          <span className="flex h-2 w-2 rounded-full bg-success" />
          <span className="text-muted-foreground">A股</span>
          <span className="font-medium text-success">交易中</span>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs ml-2">
          <span className="flex h-2 w-2 rounded-full bg-muted-foreground" />
          <span className="text-muted-foreground">美股</span>
          <span className="font-medium text-muted-foreground">已收盘</span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="ml-2 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </button>

        {/* Notifications */}
        <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-destructive" />
        </button>

        {/* User */}
        <button className="ml-1 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
