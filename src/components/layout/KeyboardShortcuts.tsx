"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SHORTCUTS: Record<string, { path: string; description: string }> = {
  "KeyD": { path: "/", description: "仪表盘" },
  "KeyA": { path: "/ai-analysis", description: "AI分析" },
  "KeyS": { path: "/screener", description: "筛选器" },
  "KeyB": { path: "/backtest", description: "回测" },
  "KeyP": { path: "/portfolio", description: "持仓" },
  "KeyC": { path: "/industry-chain", description: "产业链" },
};

/** Global keyboard shortcuts: Alt+Key to navigate. */
export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!e.altKey) return;

      const shortcut = SHORTCUTS[e.code];
      if (shortcut) {
        e.preventDefault();
        router.push(shortcut.path);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}
