"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Brain,
  Search,
  BarChart3,
  Briefcase,
  Network,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/",
    label: "仪表盘",
    icon: LayoutDashboard,
    description: "市场概览",
  },
  {
    href: "/ai-analysis",
    label: "AI分析",
    icon: Brain,
    description: "智能分析",
  },
  {
    href: "/screener",
    label: "筛选器",
    icon: Search,
    description: "条件选股",
  },
  {
    href: "/backtest",
    label: "策略回测",
    icon: BarChart3,
    description: "量化回测",
  },
  {
    href: "/portfolio",
    label: "投资组合",
    icon: Briefcase,
    description: "持仓管理",
  },
  {
    href: "/industry-chain",
    label: "产业链",
    icon: Network,
    description: "供应链分析",
  },
  {
    href: "/alerts",
    label: "预警",
    icon: Bell,
    description: "智能预警",
  },
  {
    href: "/settings",
    label: "设置",
    icon: Settings,
    description: "系统设置",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 z-40",
        collapsed ? "w-[68px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <TrendingUp className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm">QuantumStock</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-auto py-3">
        <ul className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <div className="flex flex-col">
                      <span>{item.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.description}
                      </span>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground",
            "hover:bg-accent hover:text-accent-foreground transition-all",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>收起菜单</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
