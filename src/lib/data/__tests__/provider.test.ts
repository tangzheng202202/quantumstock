import { describe, it, expect } from "vitest";
import { providerRegistry, type MarketDataProvider } from "@/lib/data/provider";

function makeProvider(id: string, opts: Partial<MarketDataProvider> & { fail?: boolean; empty?: boolean } = {}) {
  const p: MarketDataProvider = {
    id,
    label: id,
    capabilities: opts.capabilities ?? ["quotes"],
    priority: opts.priority ?? 10,
    getQuotes: opts.getQuotes ?? (() => {
      if (opts.fail) return Promise.reject(new Error("boom"));
      return Promise.resolve(opts.empty ? [] : ([{ x: id }] as any));
    }),
    ...opts,
  } as MarketDataProvider;
  return p;
}

// Fresh registry per test via a private class re-instance — export uses singleton,
// so we exercise behavior through isolated instances instead.
import { providerRegistry as _unused } from "@/lib/data/provider";
void _unused;

describe("provider registry failover", () => {
  it("prefers higher priority provider", async () => {
    const reg = newPrivateRegistry();
    reg.register(makeProvider("low", { priority: 10 }));
    reg.register(makeProvider("high", { priority: 50 }));
    const r = await reg.call("quotes", p => p.getQuotes!([]));
    expect(r?.provider).toBe("high");
  });

  it("falls over to lower priority on failure", async () => {
    const reg = newPrivateRegistry();
    reg.register(makeProvider("primary", { priority: 50, fail: true }));
    reg.register(makeProvider("backup", { priority: 10 }));
    const r = await reg.call("quotes", p => p.getQuotes!([]));
    expect(r?.provider).toBe("backup");
  });

  it("opens circuit breaker after consecutive failures and skips provider", async () => {
    const reg = newPrivateRegistry();
    reg.register(makeProvider("flaky", { priority: 50, fail: true }));
    reg.register(makeProvider("stable", { priority: 10 }));

    // Exhaust failures to trip the breaker (threshold 5)
    for (let i = 0; i < 5; i++) {
      const r = await reg.call("quotes", p => p.getQuotes!([]));
      expect(r?.provider).toBe("stable");
    }
    const health = reg.health().find(h => h.id === "flaky");
    expect(health?.breaker).toBe("open");
    expect(health?.health).toBeLessThan(0.5);
  });

  it("treats empty results as soft failure when requireNonEmpty", async () => {
    const reg = newPrivateRegistry();
    reg.register(makeProvider("empty", { priority: 50, empty: true }));
    reg.register(makeProvider("full", { priority: 10 }));
    const r = await reg.call("quotes", p => p.getQuotes!([]), { requireNonEmpty: true });
    expect(r?.provider).toBe("full");
  });

  it("returns null when all providers fail", async () => {
    const reg = newPrivateRegistry();
    reg.register(makeProvider("a", { fail: true }));
    reg.register(makeProvider("b", { fail: true }));
    const r = await reg.call("quotes", p => p.getQuotes!([]));
    expect(r).toBeNull();
  });

  it("ignores providers lacking the capability method", async () => {
    const reg = newPrivateRegistry();
    reg.register({ id: "noimpl", label: "x", capabilities: ["quotes"], priority: 99 } as MarketDataProvider);
    reg.register(makeProvider("impl", { priority: 1 }));
    const r = await reg.call("quotes", p => p.getQuotes!([]));
    expect(r?.provider).toBe("impl");
  });

  it("health score starts at 1 and drops on failures", async () => {
    const reg = newPrivateRegistry();
    reg.register(makeProvider("p", { fail: true }));
    expect(reg.health()[0].health).toBe(1);
    await reg.call("quotes", p => p.getQuotes!([])).catch(() => {});
    await reg.call("quotes", p => p.getQuotes!([])).catch(() => {});
    expect(reg.health()[0].health).toBeLessThan(1);
  });
});

// Helper: build a fresh registry instance (class not exported; use the module's
// constructor indirectly via Object.create on the singleton's prototype chain).
function newPrivateRegistry(): any {
  const proto = Object.getPrototypeOf(providerRegistry);
  const reg = Object.create(proto);
  // Re-init private fields (providers map) via constructor semantics
  Object.defineProperty(reg, "providers", {
    value: new Map(),
    writable: true,
    configurable: true,
  });
  return reg;
}
void makeProvider;
