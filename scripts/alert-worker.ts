/**
 * alert-worker — 预警调度 worker（Phase 2）。
 *
 * 职责：
 *   1. 加载所有 enabled 且未触发的 Alert 规则
 *   2. 批量拉取涉及 symbol 的实时行情（failover 链）
 *   3. 评估条件（price_above / price_below / change_up / change_down）
 *   4. 触发：置 isTriggered、写 params.lastPrice/lastChecked，POST 通知到 ALERT_WEBHOOK_URL（可选）
 *
 * 运行方式：
 *   tsx scripts/alert-worker.ts            # 单次扫描
 *   ALERT_WORKER_LOOP=60 tsx scripts/alert-worker.ts   # 每 60s 循环（容器/进程守护）
 *
 * 生产建议：由 cron 或容器 sidecar 拉起；循环模式用于单机部署。
 */

import { PrismaClient } from "@prisma/client";
import { getQuotesWithFailover } from "../src/lib/data/providers";

const prisma = new PrismaClient();

interface EvalResult {
  alertId: string;
  symbol: string;
  name: string;
  type: string;
  value: number;
  price: number;
  changePercent: number;
}

function evaluate(type: string, threshold: number, price: number, changePercent: number): boolean {
  switch (type) {
    case "price_above": return price > threshold;
    case "price_below": return price < threshold;
    case "change_up": return changePercent > threshold;
    case "change_down": return changePercent < -Math.abs(threshold);
    default: return false;
  }
}

async function scanOnce(): Promise<EvalResult[]> {
  const alerts = await prisma.alert.findMany({
    where: { isEnabled: true, isTriggered: false },
    take: 500,
  });
  if (alerts.length === 0) return [];

  // Distinct symbols via params.symbol (repository stores symbol in params Json)
  const symbolOf = (a: { params: unknown }) => (a.params as any)?.symbol ?? (a.params as any)?.code;
  const symbols = [...new Set(alerts.map(symbolOf).filter(Boolean))] as string[];

  const quotesResult = await getQuotesWithFailover(symbols.slice(0, 50)).catch(() => null);
  if (!quotesResult) {
    console.warn("[alert-worker] quote providers unavailable this cycle");
    return [];
  }

  const quoteBySymbol = new Map<string, { price: number; changePercent: number }>();
  for (const t of quotesResult.data as any[]) {
    const sym = t?.stock?.symbol;
    if (sym) quoteBySymbol.set(sym, { price: t.quote?.close ?? 0, changePercent: t.quote?.changePercent ?? 0 });
  }

  const triggered: EvalResult[] = [];
  const now = new Date();

  for (const a of alerts) {
    const sym = symbolOf(a);
    const q = sym ? quoteBySymbol.get(sym) : undefined;
    if (!q || q.price <= 0) continue;

    const params = (a.params ?? {}) as Record<string, unknown>;
    const alertType = (params.type as string) ?? a.type;
    const threshold = typeof params.value === "number" ? (params.value as number) : (a.value ?? 0);

    if (evaluate(alertType, threshold, q.price, q.changePercent)) {
      await prisma.alert.update({
        where: { id: a.id },
        data: {
          isTriggered: true,
          triggeredAt: now,
          params: { ...params, lastPrice: q.price, lastChecked: now.toISOString() },
        },
      });
      triggered.push({
        alertId: a.id,
        symbol: sym ?? "?",
        name: String((params as any).name ?? sym ?? ""),
        type: alertType,
        value: threshold,
        price: q.price,
        changePercent: q.changePercent,
      });
    }
  }

  return triggered;
}

async function notify(events: EvalResult[]): Promise<void> {
  const hook = process.env.ALERT_WEBHOOK_URL;
  for (const e of events) {
    const text = `⚠️ 预警触发：${e.name}(${e.symbol}) 现价 ${e.price}（${e.changePercent >= 0 ? "+" : ""}${e.changePercent}%），规则 ${e.type} @ ${e.value}`;
    console.log(`[alert-worker] ${text}`);
    if (hook) {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "alert.triggered", ...e, text }),
        signal: AbortSignal.timeout(5000),
      }).catch(err => console.warn("[alert-worker] webhook failed:", err));
    }
  }
}

async function main() {
  const loopSeconds = parseInt(process.env.ALERT_WORKER_LOOP ?? "0");
  do {
    try {
      const events = await scanOnce();
      if (events.length > 0) await notify(events);
      console.log(`[alert-worker] scan done, ${events.length} triggered @ ${new Date().toISOString()}`);
    } catch (e) {
      console.error("[alert-worker] cycle error:", e);
    }
    if (loopSeconds > 0) await new Promise(r => setTimeout(r, loopSeconds * 1000));
  } while (loopSeconds > 0);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
