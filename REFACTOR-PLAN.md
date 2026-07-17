# QuantumStock 全面重构方案

> 版本：v1.0　　日期：2025-12-10　　目标：可交付使用的**生产级**水平
> 策略：**渐进式重构**，每个阶段独立可验证、可部署，全程保持现有功能不受影响。

---

## 一、现状架构诊断

### 1.1 技术栈与分层

| 层 | 技术 | 现状 |
|---|---|---|
| 框架 | Next.js 15 (App Router) + React 19 + TS | 全部为 CSR（`'use client'`），未利用 SSR/SSG/流式 |
| UI | TailwindCSS + shadcn/ui | 组件库完整，但页面级组件臃肿 |
| 数据 | 新浪/东方财富/雅虎 三源 | 直接裸 fetch，缓存不统一，已建的 `CacheService` 未被使用 |
| AI | Claude/GPT/DeepSeek/MiniMax 统一客户端 | 较完善，`runMultiModelAnalysis` 是全站最成熟模块 |
| 回测 | 纯 TS 引擎 + 4 策略 | 纯函数、可测性好（42 测试全过） |
| 数据库 | Prisma + PostgreSQL | **Schema 已定义 14 模型，但代码 0 处引用**（未接线） |
| 存储 | localStorage | API Key / 自选股 / 报告历史全部落浏览器，有安全隐患 |

### 1.2 技术债务清单（按优先级）

| 编号 | 类别 | 问题 | 位置 | 严重度 |
|---|---|---|---|---|
| ~~D1~~ | 安全 | ~~API Key 用 `btoa` Base64 存 localStorage~~ ✅ **已修复（Phase 6）**：AES-256-GCM 加密 + HttpOnly Cookie 服务端化存储，JS 不可读 | `lib/server/api-keys.ts` | ~~🔴~~ ✅ |
| ~~D2~~ | 安全 | ~~CORS 配置 `*`，缺少 CSP / 安全响应头~~ ✅ **已修复（Phase 6）**：CSP/X-Frame-Options/HSTS 等全套响应头 | `next.config.ts` | ~~🔴~~ ✅ |
| D3 | 架构 | 已建的 `CacheService`（TTL+SWR）**未被任何数据模块使用**，各模块自造碎片缓存 | `lib/cache/index.ts` vs `lib/data/*` | 🟡 中 |
| D4 | 架构 | `eastmoney.ts` 211 行单文件聚合 6 大职责（板块/轮动/K线/财务/成分股/全A） | `lib/data/eastmoney.ts` | 🟡 中 |
| D5 | 类型 | 全站 **15+ 处 `any`**，集中在 ticker/portfolio 路由与数据结构 | `api/market/ticker`, `api/portfolio/sync` 等 | 🟡 中 |
| D6 | 后端 | API 无统一响应格式、无 zod 校验、无统一错误处理中间件 | `app/api/**` | 🟡 中 |
| D7 | 后端 | Prisma 数据库完全未接线（用户/自选股/组合/报告均无持久化） | `prisma/schema.prisma` | 🟡 中 |
| D8 | 前端 | 页面级组件臃肿（dashboard/stock 详情/ai-analysis 单文件数百行），缺自定义 hooks 抽离 | `app/page.tsx` 等 | 🟢 低 |
| D9 | 前端 | 30s 轮询 + 全量重渲染，无增量更新/骨架屏精细化 | `app/page.tsx` | 🟢 低 |
| D10 | 测试 | 仅 lib 纯函数有测试，**API 路由与组件 0 覆盖** | `src/__tests__` | 🟡 中 |
| D11 | 功能 | `AIQuickInsight` 为硬编码占位；筛选器导出按钮未实现；portfolio 当日盈亏已计算未展示 | 组件层 | 🟡 中 |
| D12 | 前端 | 遗留页面沿用 "fetch-in-effect" 模式，不满足 React Compiler 规则 `react-hooks/set-state-in-effect`（13 处，已降级为 warn）。新增代码已改用订阅/派生状态模式（`useWatchlistQuotes`、`useReportHistory`）；遗留页面待迁移至 SWR / TanStack Query 后恢复 error 级 | `app/**/page.tsx` 等 9 个文件 | 🟢 低 |

---

## 二、重构总体目标

1. **安全达标**：消除 D1/D2，API Key 服务端化，加 CSP 与安全头。
2. **后端规范**：统一 API 响应契约 + zod 校验 + 统一错误处理 + 缓存统一。
3. **类型安全**：消除全部 `any`，`tsc --noEmit` 零错误且收紧 `strict`。
4. **前端现代化**：组件拆分 + hooks 抽离 + 状态管理统一 + 响应式与性能优化。
5. **测试覆盖**：核心业务（数据层/回测/指标/API 路由）单测 + 集成测试。
6. **工程一致**：ESLint/Prettier 统一，关键模块补 JSDoc 与文档。

---

## 三、分阶段实施计划（每阶段独立可验证）

> **每阶段验收门槛（Definition of Done）**：
> `npm run typecheck` 零错误 + `npm run test` 全绿 + `npm run lint` 通过 + 功能手动冒烟正常。

### 阶段 1：数据层重构（缓存统一 + 模块拆分）
- 将 `CacheService` 接入 `sina.ts` / `yahoo.ts` / `eastmoney.ts`，替换碎片缓存。
- 拆分 `eastmoney.ts` → `data/eastmoney/{sectors,kline,financials,screener,index}.ts`，统一出口。
- 三源统一实现 `MarketDataProvider` 接口，便于降级与扩展。
- 不改动任何 API 路由签名与前端调用，**纯内部重构**。
- ✅ 验证：现有 42 测试 + 新增数据层单测全绿。

### 阶段 2：API 层规范化
- 新建 `lib/api/{response,errors,validation}.ts`：
  - 统一响应 `{ code, data, message, traceId }`
  - 自定义 `AppError` 体系（参数错/上游错/限流/超时）
  - zod schema 校验所有 query/body
  - `withApiHandler` 高阶包装（错误捕获 + 日志 + traceId）
- 逐个改造 13 个 API 路由，**保持 URL 与前端入参不变**。
- ✅ 验证：新增 API 路由单测（mock 上游）+ 现有测试全绿。

### 阶段 3：类型安全强化
- 补齐 `types/index.ts`：新浪/东财/雅虎原始返回类型、portfolio 同步类型。
- 消除全部 `any`（含 `(info as any)`），改为精确类型或 `unknown`+类型守卫。
- ✅ 验证：`tsc --noEmit` 在更严格配置下零错误。

### 阶段 4：前端组件与状态管理重构
- 抽离自定义 hooks：`useQuotes` / `useIndices` / `useKLine` / `useAIAnalysis`（SWR 风格 + 轮询 + 缓存）。
- 拆分臃肿页面为「容器组件 + 展示组件」，列表项 `React.memo`。
- 引入轻量状态管理（zustand）统一 watchlist/设置/AI Key 状态，替代散落 localStorage 直读。
- 响应式与性能：骨架屏、增量更新、虚拟滚动（长列表）、`next/image`、懒加载重型图表。
- ✅ 验证：核心组件快照测试 + 手动响应式冒烟（移动/桌面）。

### 阶段 5：测试体系扩充
- 数据层：三源解析/降级/缓存命中 单测。
- API 层：路由 handler 集成测试（mock 上游 fetch）。
- 回测/指标：补充边界与回归测试。
- 组件：关键交互组件渲染测试。
- 接入覆盖率阈值（如 lib ≥ 80%）。
- ✅ 验证：`npm run test:coverage` 达标。

### 阶段 6：安全加固 + 文档 + 终验
- 安全：API Key 迁移服务端环境变量 + 前端仅存掩码；加 CSP/X-Frame-Options 等安全头；收紧 CORS。
- 功能补全：`AIQuickInsight` 对接真实 AI API；筛选器导出 CSV 落地。
- 文档：架构图、API 契约文档、数据流说明、部署运维手册。
- 终验：全量测试 + `next build` 通过 + Lighthouse 性能/可访问性基线。
- ✅ 验证：达到生产可交付 checklist。

---

## 四、风险与保障

| 风险 | 保障措施 |
|---|---|
| 重构破坏现有功能 | 每阶段仅内部重构、不改外部契约；每阶段提交前全量测试 + 冒烟 |
| 测试不足导致回归 | 阶段1/2 先补测试再改实现，红-绿-重构 |
| 安全改造影响可用性 | API Key 迁移提供灰度：环境变量优先，localStorage 兜底过渡一版 |
| 进度不可控 | 每阶段独立分支 + 独立验证，可随时安全交付中间态 |

---

## 五、执行顺序与依赖

```
阶段1(数据层) ─┬─> 阶段2(API层) ─> 阶段3(类型) ─> 阶段4(前端) ─> 阶段6(安全+终验)
              └─> 阶段5(测试) 贯穿全程，与1-4并行增量补测试
```

**立即从阶段 1 开始。**
