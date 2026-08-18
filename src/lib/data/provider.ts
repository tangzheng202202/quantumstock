/**
 * MarketDataProvider — 统一行情数据源抽象（Phase 2 数据地基）。
 *
 * 所有数据源（Sina / EastMoney / AKShare / Python engine / 未来 CCXT）实现同一接口，
 * 由 ProviderRegistry 统一调度：
 *   - 按能力（capability）选择 provider，声明优先级
 *   - 内置熔断器：连续失败 N 次后 open（拒绝流量）cooling 秒后半开试探
 *   - 健康分：基于滚动成功率，供监控与自动降序
 *   - 自动 failover：高优先级 provider 熔断/失败时依次降级
 */

import type { MarketIndex, TickerData, StockInfo } from "@/types";

// ---- Capabilities ----

export type DataCapability =
  | "quotes"      // 实时行情
  | "indices"     // 指数
  | "ohlcv"       // K线历史
  | "search"      // 标的搜索
  | "financials"  // 基本面/财务
  | "sectors";    // 板块/热力图

export interface ProviderContext {
  /** 请求来源（用于日志/追踪） */
  requestId?: string;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly capabilities: readonly DataCapability[];
  /** 数字越大优先级越高（同 capability 内） */
  readonly priority: number;
  readonly label: string;

  getQuotes?(symbols: string[], ctx?: ProviderContext): Promise<TickerData[]>;
  getIndices?(ctx?: ProviderContext): Promise<MarketIndex[]>;
  search?(query: string, ctx?: ProviderContext): Promise<StockInfo[]>;
}

// ---- Circuit breaker ----

type BreakerState = "closed" | "open" | "half-open";

interface Breaker {
  failures: number;
  openedAt: number;
  state: BreakerState;
}

const BREAKER_THRESHOLD = 5;      // 连续失败次数 → open
const BREAKER_COOLDOWN_MS = 30_000; // open → half-open 冷却
const BREAKER_HALF_OPEN_MAX = 1;  // half-open 允许的试探请求数

class CircuitBreaker {
  private b: Breaker = { failures: 0, openedAt: 0, state: "closed" };
  private halfOpenInflight = 0;

  /** Returns true if the call may proceed. */
  allow(): boolean {
    const { state } = this.b;
    if (state === "closed") return true;
    if (state === "open") {
      if (Date.now() - this.b.openedAt >= BREAKER_COOLDOWN_MS) {
        this.b.state = "half-open";
        this.halfOpenInflight = 0;
      } else {
        return false;
      }
    }
    if (this.b.state === "half-open") {
      if (this.halfOpenInflight >= BREAKER_HALF_OPEN_MAX) return false;
      this.halfOpenInflight++;
      return true;
    }
    return true;
  }

  recordSuccess(): void {
    this.b = { failures: 0, openedAt: 0, state: "closed" };
    this.halfOpenInflight = 0;
  }

  recordFailure(): void {
    this.b.failures++;
    if (this.b.state === "half-open" || this.b.failures >= BREAKER_THRESHOLD) {
      this.b.state = "open";
      this.b.openedAt = Date.now();
      this.halfOpenInflight = 0;
    }
  }

  snapshot(): { state: BreakerState; failures: number } {
    return { state: this.b.state, failures: this.b.failures };
  }
}

// ---- Health score (rolling success rate) ----

class HealthScore {
  private window: boolean[] = [];
  private static readonly WINDOW = 20;

  record(ok: boolean): void {
    this.window.push(ok);
    if (this.window.length > HealthScore.WINDOW) this.window.shift();
  }

  /** 0..1, defaults to 1 when no samples. */
  value(): number {
    if (this.window.length === 0) return 1;
    return this.window.filter(Boolean).length / this.window.length;
  }
}

export interface ProviderHealth {
  id: string;
  breaker: BreakerState;
  failures: number;
  health: number; // 0..1
}

// ---- Registry ----

class ProviderRegistry {
  private providers = new Map<string, { p: MarketDataProvider; breaker: CircuitBreaker; health: HealthScore }>();

  register(p: MarketDataProvider): void {
    if (this.providers.has(p.id)) return;
    this.providers.set(p.id, { p, breaker: new CircuitBreaker(), health: new HealthScore() });
  }

  list(): MarketDataProvider[] {
    return [...this.providers.values()].map(e => e.p);
  }

  health(): ProviderHealth[] {
    return [...this.providers.values()].map(({ p, breaker, health }) => {
      const snap = breaker.snapshot();
      return {
        id: p.id,
        breaker: snap.state,
        failures: snap.failures,
        health: health.value(),
      };
    });
  }

  /**
   * Execute a capability call with failover:
   * try providers in (priority desc, health desc) order; skip open breakers;
   * return the first successful non-empty result; track health/breaker per provider.
   */
  async call<T>(
    capability: DataCapability,
    invoke: (p: MarketDataProvider) => Promise<T>,
    opts: { requireNonEmpty?: boolean } = {}
  ): Promise<{ data: T; provider: string } | null> {
    const entries = [...this.providers.values()]
      .filter(e => e.p.capabilities.includes(capability) && typeof (e.p as any)[methodName(capability)] === "function")
      .sort((a, b) => b.p.priority - a.p.priority || b.health.value() - a.health.value());

    for (const entry of entries) {
      const { p, breaker, health } = entry;
      if (!breaker.allow()) continue;

      try {
        const data = await invoke(p);
        const ok = !opts.requireNonEmpty || (Array.isArray(data) ? data.length > 0 : data != null);
        if (ok) {
          breaker.recordSuccess();
          health.record(true);
          return { data, provider: p.id };
        }
        // Non-empty required but got empty: treat as soft failure, keep trying next
        health.record(false);
        breaker.recordFailure();
      } catch {
        breaker.recordFailure();
        health.record(false);
      }
    }
    return null;
  }
}

function methodName(cap: DataCapability): string {
  switch (cap) {
    case "quotes": return "getQuotes";
    case "indices": return "getIndices";
    case "search": return "search";
    default: return cap;
  }
}

export const providerRegistry = new ProviderRegistry();
