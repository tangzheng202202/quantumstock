# QuantumStock 架构文档

> 最后更新：Phase 6 重构完成后。本文档描述当前（重构后）的系统架构。

## 1. 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 框架 | Next.js 15 (App Router) + React 19 | 全栈一体，页面静态化 + API 路由动态化 |
| 语言 | TypeScript（strict + noImplicitReturns + noFallthroughCasesInSwitch） | 全站类型安全 |
| UI | TailwindCSS + shadcn/ui + lucide-react | 亮/暗/系统三主题 |
| 状态 | zustand v5（响应式本地状态）+ useSyncExternalStore | localStorage 持久化 |
| 校验 | zod v3 | API 入参统一校验 |
| 数据源 | 新浪财经 / 东方财富 / Yahoo Finance | 多源兜底 |
| 测试 | Vitest + Testing Library (jsdom) + coverage-v8 | 115 用例 |
| 质量 | ESLint 9 扁平配置 (eslint-config-next) | 0 error 门禁 |

## 2. 分层结构

```
src/
├── app/                    # 页面（静态化）与 API 路由（动态）
│   ├── api/
│   │   ├── market/         # 行情数据 API（10 个路由）
│   │   ├── ai/             # AI 分析与 Key 测试
│   │   ├── settings/keys/  # 用户 AI Key 管理（加密 cookie）
│   │   └── portfolio/sync/ # QMT 外部脚本同步入口（扁平契约，勿改形状）
│   └── */page.tsx          # 12 个页面
├── components/
│   ├── ui/                 # shadcn 基础组件
│   ├── dashboard/          # 仪表盘组件（memo 化的 StatCard/TickerRow 等）
│   ├── chart/              # K 线图（lightweight-charts）
│   └── layout/             # 布局
└── lib/
    ├── api/                # API 基础设施 ★
    │   ├── handler.ts      #   withApiHandler：traceId + 统一错误捕获
    │   ├── response.ts     #   apiSuccess/apiError 统一响应契约
    │   ├── errors.ts       #   AppError 错误族（Validation/NotFound/Upstream/...）
    │   └── validation.ts   #   validate() + 各路由 zod schema
    ├── cache/              # 统一 CacheService（TTL + stale-while-revalidate）
    ├── data/               # 数据源层 ★
    │   ├── sina.ts         #   新浪（A/HK/US 实时行情、指数、搜索）
    │   ├── yahoo.ts        #   Yahoo（美股兜底，国内不可达）
    │   └── eastmoney/      #   东财（按职责拆分 5 模块 + shared + barrel）
    │       ├── shared.ts   #     secid 解析、请求头、行类型
    │       ├── sectors.ts  #     行业板块/轮动/成分股
    │       ├── kline.ts    #     K 线
    │       ├── financials.ts#    A 股财务快照
    │       └── screener.ts #     全 A 筛选
    ├── hooks/              # 数据 hooks ★
    │   ├── usePolling.ts   #   可见性感知轮询
    │   ├── useQuotes.ts / useMarketStats.ts / useWatchlistQuotes.ts
    │   └── useReportHistory.ts  # localStorage ↔ useSyncExternalStore
    ├── stores/             # zustand store（watchlist，SSR 安全）
    ├── server/             # 服务端专用 ★
    │   └── api-keys.ts     #   AES-256-GCM 加解密 + HttpOnly cookie
    ├── storage/            # 客户端持久化门面（api-keys → 服务端代理）
    ├── indicators/         # 技术指标纯函数（MA/EMA/MACD/RSI/...）
    ├── backtest/           # 回测引擎
    └── ai/                 # 多模型 AI 客户端
```

★ = 本次重构新建/重写的核心层。

## 3. 关键设计

### 3.1 API 请求生命周期

```
请求 → withApiHandler（生成 traceId）
     → validate(zod schema) —— 失败抛 ValidationError(400)
     → 数据层（cache.get(key, ttl, fetcher)）
     → apiSuccess(data, meta)   { success:true, data, meta:{timestamp, source?, traceId} }
异常 → apiError(error, traceId) { success:false, error, code, meta:{traceId} }
响应头统一携带 x-trace-id 便于全链路排查。
```

### 3.2 缓存策略（CacheService）

- 进程内 Map，TTL + **stale-while-revalidate**：过期后先返回旧值，后台刷新。
- 键命名空间隔离防串：`sina:` / `yahoo:` / `em_`。
- 请求拒绝不缓存（避免把瞬时故障固化）。

### 3.3 前端数据流

- 页面组件 → 数据 hooks（`useQuotes`/`useWatchlistQuotes`/...）→ `/api/*`。
- 自选股：zustand store（`quantumstock:watchlist` localStorage），组件订阅 store，
  **订阅回调**驱动刷新（符合 React Compiler `set-state-in-effect` 规则）。
- 报告历史：localStorage + 订阅发布 → `useSyncExternalStore`（快照引用稳定）。
- 遗留页面（D12）仍是 fetch-in-effect，待迁移 SWR/TanStack Query。

### 3.4 安全模型（D1/D2 已修复）

- **API Key**：AES-256-GCM 加密存 HttpOnly Cookie（`qs_ai_keys`，SameSite=Strict，
  Path=/api）。客户端只能看到「已配置 + sk-...尾号」，永远读不到 key 本体。
  服务端解析顺序：env 环境变量 > cookie > 请求体（兼容外部脚本）。
- **响应头**：CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy /
  Permissions-Policy / HSTS(生产)。
- **错误脱敏**：analyze 路由对错误消息中的 key 模式统一掩码。

### 3.5 数据源容错

| 市场 | 主源 | 兜底 |
|---|---|---|
| A 股/港股 | 新浪 | 东财 |
| 美股 | 新浪 | Yahoo（国内不可达，预期降级） |
| 板块/财务/筛选 | 东财 | 无（mock 兜底，meta.source 标识） |

## 4. 已知技术债（详见 REFACTOR-PLAN.md §1.2）

- **D7**：Prisma schema 已定义但未接线（无持久化数据库）。
- **D11**：`AIQuickInsight` 占位、筛选器导出未实现、组合当日盈亏未展示。
- **D12**：13 处遗留 fetch-in-effect（lint warn），待迁移数据获取库。
