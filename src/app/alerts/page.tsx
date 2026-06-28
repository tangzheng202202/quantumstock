"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  TrendingUp,
  Volume2,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react";

interface AlertRule {
  id: string;
  type: "price_above" | "price_below" | "change_up" | "change_down";
  symbol: string;
  name: string;
  value: number;        // price threshold OR change % threshold
  isEnabled: boolean;
  isTriggered: boolean;
  triggeredAt: string | null;
  lastChecked: string | null;
  lastPrice: number | null;
  createdAt: string;
}

const STORAGE_KEY = "quantumstock:alerts:rules";

/** Send a browser notification for triggered alerts. */
function sendNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(perm => {
      if (perm === "granted") new Notification(title, { body, icon: "/favicon.ico" });
    });
  }
}

const ALERT_TYPE_META: Record<AlertRule["type"], { label: string; icon: typeof Bell; color: string }> = {
  price_above: { label: "价格上穿", icon: TrendingUp, color: "text-bull" },
  price_below: { label: "价格下穿", icon: TrendingUp, color: "text-bear" },
  change_up: { label: "涨幅超过", icon: TrendingUp, color: "text-bull" },
  change_down: { label: "跌幅超过", icon: TrendingUp, color: "text-bear" },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newAlert, setNewAlert] = useState({
    symbol: "",
    type: "price_above" as AlertRule["type"],
    value: "",
  });

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setAlerts(JSON.parse(stored));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  }, [alerts, loading]);

  // Check all enabled alerts against live prices
  const checkAlerts = useCallback(async () => {
    if (alerts.length === 0) return;
    setChecking(true);
    const enabled = alerts.filter(a => a.isEnabled);
    if (enabled.length === 0) {
      setChecking(false);
      return;
    }

    const symbols = [...new Set(enabled.map(a => a.symbol))];
    try {
      const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
      if (!res.ok) return;
      const j = await res.json();
      if (!j.success) return;
      const tickers: any[] = j.data;

      const now = new Date().toISOString();
      setAlerts(prev => prev.map(a => {
        if (!a.isEnabled) return a;
        const t = tickers.find(t => t.stock.symbol === a.symbol);
        if (!t) return a;

        const price = t.quote.close as number;
        const changePct = t.quote.changePercent as number;
        let triggered = a.isTriggered;

        switch (a.type) {
          case "price_above":
            if (price >= a.value && !a.isTriggered) { triggered = true; sendNotification(a.name || a.symbol, `价格上穿 ${a.value} → 当前 ${price.toFixed(2)}`); }
            else if (price < a.value) triggered = false;
            break;
          case "price_below":
            if (price <= a.value && !a.isTriggered) { triggered = true; sendNotification(a.name || a.symbol, `价格下穿 ${a.value} → 当前 ${price.toFixed(2)}`); }
            else if (price > a.value) triggered = false;
            break;
          case "change_up":
            if (changePct >= a.value && !a.isTriggered) { triggered = true; sendNotification(a.name || a.symbol, `涨幅达到 ${a.value}% → 当前 ${changePct.toFixed(2)}%`); }
            else if (changePct < a.value) triggered = false;
            break;
          case "change_down":
            if (changePct <= -a.value && !a.isTriggered) { triggered = true; sendNotification(a.name || a.symbol, `跌幅达到 ${a.value}% → 当前 ${changePct.toFixed(2)}%`); }
            else if (changePct > -a.value) triggered = false;
            break;
        }

        return {
          ...a,
          isTriggered: triggered,
          lastPrice: price,
          lastChecked: now,
          triggeredAt: triggered && !a.isTriggered ? now : a.triggeredAt,
        };
      }));
    } catch (e) {
      console.warn("[alerts] check failed", e);
    } finally {
      setChecking(false);
    }
  }, [alerts]);

  // Auto-check every 60 seconds
  useEffect(() => {
    if (loading || alerts.length === 0) return;
    checkAlerts();
    const t = setInterval(checkAlerts, 60000);
    return () => clearInterval(t);
  }, [checkAlerts, loading, alerts.length]);

  const addAlert = async () => {
    const symbol = newAlert.symbol.trim().toUpperCase();
    const value = parseFloat(newAlert.value);
    if (!symbol || !value) return;

    // Try to fetch real name
    let name = symbol;
    try {
      const res = await fetch(`/api/market/quotes?symbols=${symbol}`);
      if (res.ok) {
        const j = await res.json();
        if (j.success && j.data?.[0]) name = j.data[0].stock.name;
      }
    } catch {}

    const rule: AlertRule = {
      id: crypto.randomUUID(),
      type: newAlert.type,
      symbol,
      name,
      value,
      isEnabled: true,
      isTriggered: false,
      triggeredAt: null,
      lastChecked: null,
      lastPrice: null,
      createdAt: new Date().toISOString(),
    };
    setAlerts(prev => [...prev, rule]);
    setNewAlert({ symbol: "", type: "price_above", value: "" });
    setShowForm(false);
  };

  const removeAlert = (id: string) => setAlerts(prev => prev.filter(a => a.id !== id));
  const toggleAlert = (id: string) =>
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isEnabled: !a.isEnabled, isTriggered: false } : a));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const triggeredCount = alerts.filter(a => a.isTriggered && a.isEnabled).length;
  const enabledCount = alerts.filter(a => a.isEnabled).length;

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">智能预警</h1>
          <p className="text-sm text-muted-foreground mt-1">
            价格预警、涨跌幅预警 · 共 {alerts.length} 条 · 启用 {enabledCount} · 触发 {triggeredCount}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={checkAlerts}
            disabled={checking || alerts.length === 0}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            立即检查
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> {showForm ? "取消" : "新建预警"}
          </button>
        </div>
      </div>

      {/* Triggered alerts banner */}
      {triggeredCount > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium text-warning">
                {triggeredCount} 条预警已触发！
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New alert form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>新建预警</CardTitle>
            <CardDescription>选择股票代码、预警类型和阈值</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="股票代码 (如 600519)"
                value={newAlert.symbol}
                onChange={e => setNewAlert({ ...newAlert, symbol: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <select
                value={newAlert.type}
                onChange={e => setNewAlert({ ...newAlert, type: e.target.value as AlertRule["type"] })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="price_above">价格上穿</option>
                <option value="price_below">价格下穿</option>
                <option value="change_up">涨幅超过(%)</option>
                <option value="change_down">跌幅超过(%)</option>
              </select>
              <input
                type="number"
                step="0.01"
                placeholder={newAlert.type.startsWith("change") ? "百分比 (如 5)" : "价格 (如 1500)"}
                value={newAlert.value}
                onChange={e => setNewAlert({ ...newAlert, value: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <button
              onClick={addAlert}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-all"
            >
              创建预警
            </button>
          </CardContent>
        </Card>
      )}

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <BellOff className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">暂无预警规则</p>
            <p className="text-xs text-muted-foreground mt-1">点击「新建预警」开始监控你的股票</p>
            <p className="text-[10px] text-muted-foreground/70 mt-2">
              系统每60秒自动检查价格，触发后会在顶部显示提示
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => {
            const meta = ALERT_TYPE_META[a.type];
            const Icon = meta.icon;
            return (
              <Card key={a.id} className={cn(
                "transition-all",
                a.isTriggered && a.isEnabled && "border-warning/50 bg-warning/5",
                !a.isEnabled && "opacity-60"
              )}>
                <CardContent className="py-3 flex items-center gap-4">
                  <Icon className={cn("h-5 w-5", meta.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{a.symbol}</span>
                      <span className="text-sm">{a.name}</span>
                      {a.isTriggered && a.isEnabled && (
                        <span className="rounded-full bg-warning/10 text-warning px-1.5 py-0.5 text-[10px] font-medium">
                          已触发
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {meta.label} <span className="font-mono font-medium text-foreground">{a.value}</span>
                      {a.type.startsWith("change") && "%"}
                      {a.lastPrice != null && (
                        <span className="ml-3">现价: <span className="font-mono">{a.lastPrice.toFixed(2)}</span></span>
                      )}
                      {a.lastChecked && (
                        <span className="ml-3">检查于 {new Date(a.lastChecked).toLocaleTimeString()}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleAlert(a.id)}
                    className="text-muted-foreground hover:text-primary transition-all"
                    title={a.isEnabled ? "禁用" : "启用"}
                  >
                    {a.isEnabled ? <ToggleRight className="h-6 w-6 text-primary" /> : <ToggleLeft className="h-6 w-6" />}
                  </button>
                  <button
                    onClick={() => removeAlert(a.id)}
                    className="text-muted-foreground hover:text-destructive transition-all"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        预警规则保存在浏览器本地。需保持页面打开才会自动检查。
      </p>
    </div>
  );
}
