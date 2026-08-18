"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";

interface MigrationData {
  watchlist: unknown[];
  alerts: unknown[];
  portfolio: unknown;
}

function collectLocalData(): MigrationData | null {
  const data: MigrationData = { watchlist: [], alerts: [], portfolio: null };
  let hasData = false;

  try {
    const wl = localStorage.getItem("quantumstock:watchlist");
    if (wl) { data.watchlist = JSON.parse(wl); hasData = true; }
  } catch {}
  try {
    const alerts = localStorage.getItem("quantumstock:alerts:rules");
    if (alerts) { data.alerts = JSON.parse(alerts); hasData = true; }
  } catch {}
  try {
    const pos = localStorage.getItem("quantumstock:portfolio:positions");
    const cash = localStorage.getItem("quantumstock:portfolio:cash");
    if (pos) {
      data.portfolio = { positions: JSON.parse(pos), cash: cash ? parseFloat(cash) : null };
      hasData = true;
    }
  } catch {}

  return hasData ? data : null;
}

export function MigrationDialog() {
  const [localData, setLocalData] = useState<MigrationData | null>(null);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "migrating" | "done" | "error">("idle");
  const [results, setResults] = useState<{ watchlist: number; alerts: number; positions: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const data = collectLocalData();
    if (data) {
      setLocalData(data);
      setShow(true);
    }
  }, []);

  const handleMigrate = async () => {
    if (!localData) return;
    setStatus("migrating");

    try {
      const res = await fetch("/api/user/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localData),
      });
      const j = await res.json();

      if (j.success) {
        setResults(j.stats);
        setStatus("done");
        // Clear migrated localStorage data
        localStorage.removeItem("quantumstock:watchlist");
        localStorage.removeItem("quantumstock:alerts:rules");
        localStorage.removeItem("quantumstock:portfolio:positions");
        localStorage.removeItem("quantumstock:portfolio:cash");

        // Auto-dismiss after 3s on success
        setTimeout(() => setShow(false), 3000);
      } else {
        setErrorMsg(j.error ?? "迁移失败");
        setStatus("error");
      }
    } catch {
      setErrorMsg("网络错误，请稍后重试");
      setStatus("error");
    }
  };

  const handleSkip = () => {
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg">
            {status === "done" ? "数据迁移完成" : "检测到本地数据"}
          </CardTitle>
          <CardDescription>
            {status === "done"
              ? "你的自选股、预警和持仓已迁移到云端账户"
              : "你在未登录状态下添加的自选股、预警和持仓数据可以导入到当前账户"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "done" && results ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                自选股: {results.watchlist} 只
              </div>
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                预警: {results.alerts} 条
              </div>
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                持仓: {results.positions} 只
              </div>
            </div>
          ) : status === "error" ? (
            <div className="rounded-lg bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{errorMsg}</p>
            </div>
          ) : status === "migrating" ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">正在迁移数据...</span>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              {localData?.watchlist.length ? <p>- 自选股: {localData.watchlist.length} 只</p> : null}
              {localData?.alerts.length ? <p>- 预警: {localData.alerts.length} 条</p> : null}
              {localData?.portfolio ? <p>- 持仓数据</p> : null}
            </div>
          )}

          {status === "idle" && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleMigrate}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                导入到账户 <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleSkip}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-all"
              >
                跳过（数据将丢失）
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="flex gap-3 pt-2">
              <button onClick={handleMigrate} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium">
                重试
              </button>
              <button onClick={handleSkip} className="flex-1 rounded-lg border px-4 py-2.5 text-sm">
                跳过
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
