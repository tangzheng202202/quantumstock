# QuantumStock 系统全量审计报告

**审计日期**: 2026-06-28
**审计范围**: 全部 9 个页面、10 个 API 路由、4 个数据源、11 个 UI 组件
**项目路径**: `/Users/mac/Documents/Claude/Projects/AI链/quantumstock/`

---

## 1. 模块依赖关系图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          客户端页面 (9个)                                │
│                                                                         │
│  /(仪表盘)    /stock/[symbol](个股)    /ai-analysis(AI分析)             │
│  /screener    /backtest               /portfolio(持仓)                 │
│  /alerts      /industry-chain         /settings(设置)                  │
└──────┬──────────────────────────────────────────────────────────────────┘
       │ fetch / import
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     数据服务层 (src/lib/data/)                          │
│                                                                         │
│  market.ts ──→ fetchQuotes/fetchIndices/searchStocks (高层封装)         │
│  sina.ts ────→ Sina Finance API (核心数据源: A/港/美股行情+K线)         │
│  eastmoney.ts → EastMoney API (板块+K线+财务)                           │
│  yahoo.ts ───→ Yahoo Finance (美股兜底, 中国不可达)                     │
│  proxy.ts ───→ Python引擎代理 (已弃用)                                  │
└──────┬──────────────────────────────────────────────────────────────────┘
       │ HTTP
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Next.js API Routes (10个)                            │
│                                                                         │
│  /api/market (代理)        /api/market/quotes    /api/market/indices   │
│  /api/market/search        /api/market/ticker     /api/market/sectors   │
│  /api/market/ohlcv         /api/market/financials                       │
│  /api/ai/analyze           /api/ai/test-key                             │
└──────┬──────────────────────────────────────────────────────────────────┘
       │ HTTP / SDK
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      外部数据源 / AI 服务                                │
│                                                                         │
│  Sina Finance ─── hq.sinajs.cn (实时行情+K线, 无需Key)                 │
│  EastMoney ────── push2.eastmoney.com (板块+财务+K线, 无需Key)         │
│  Yahoo Finance ── query1.finance.yahoo.com (美股, 中国被墙)            │
│  DeepSeek ─────── api.deepseek.com (AI分析, 需Key)                     │
│  Anthropic ────── api.anthropic.com (AI分析, 需Key)                    │
│  OpenAI ───────── api.openai.com (AI分析, 需Key)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 页面 → API 调用矩阵

| 页面 | 调用的 API | 数据源 |
|------|-----------|--------|
| / (仪表盘) | /api/market/quotes, /api/market/indices, /api/market/sectors | Sina, EastMoney |
| /stock/[symbol] | /api/market/quotes, /api/market/ohlcv | Sina, EastMoney |
| /ai-analysis | /api/market/search, /api/ai/analyze | Sina, AI SDKs |
| /screener | /api/market/search, /api/market/quotes, /api/market/financials | Sina, EastMoney |
| /backtest | /api/market/ohlcv | Sina, EastMoney |
| /portfolio | /api/market/quotes | Sina |
| /alerts | /api/market/quotes | Sina |
| /industry-chain | /api/market/sectors, /api/ai/analyze | EastMoney, AI SDKs |
| /settings | /api/ai/test-key | AI SDKs |

---

## 2. 发现的问题

| # | 严重度 | 问题 | 位置 | 状态 |
|---|--------|------|------|------|
| 1 | **Critical** | page.tsx 编译失败（WatchlistStrip未导入+变量未定义） | src/app/page.tsx | ✅ 已修复 |
| 2 | Medium | `proxy.ts` Python引擎代理已弃用但仍存在 | src/lib/data/proxy.ts | 待清理 |
| 3 | Medium | `AIQuickInsight.tsx` 内容是硬编码假洞察 | src/components/dashboard/ | 待改进 |
| 4 | Low | `yahoo.ts` 在中国被墙，兜底实际不可达 | src/lib/data/yahoo.ts | 保留作参考 |
| 5 | Low | `dayPnl` 计算公式逻辑错误 | src/app/portfolio/page.tsx:134 | 待修复 |
| 6 | Low | 涨幅榜/跌幅榜点击无跳转 | src/app/page.tsx | ✅ 已修复 |
| 7 | Info | 未使用的 import (StockInfo等) | src/app/page.tsx | ✅ 已清理 |

### 问题 #5 详解：dayPnl 计算错误

```typescript
// 当前代码 (错误):
const dayPnl = pricedPositions.reduce(
  (s, p) => s + p.pnl * (p.dayChange / 100 / (p.pnlPercent || 1)), 0
);
// 问题: p.pnl * (dayChange / pnlPercent) 没有物理意义
// 正确应为: p.marketValue * p.dayChange / 100 (市值 × 今日涨跌幅)
```

---

## 3. 数据链路连通性

| 数据类型 | 数据源 | 状态 | 备注 |
|----------|--------|------|------|
| A股实时行情 | Sina `hq.sinajs.cn` | ✅ 可用 | 无需Key, 3秒缓存 |
| A股K线 | Sina `money.finance.sina.com.cn` | ✅ 可用 | 日/周/月K |
| 港股行情 | Sina `hq.sinajs.cn` (hk前缀) | ✅ 可用 | 5位代码 |
| 美股行情 | Sina `hq.sinajs.cn` (gb_前缀) | ✅ 可用 | 字段已修正 |
| 港股/美股K线 | EastMoney `push2his.eastmoney.com` | ✅ 可用 | 116/105 secid |
| 板块涨跌 | EastMoney `push2.eastmoney.com` | ✅ 可用 | ~100个行业板块 |
| A股财务(PE/ROE) | EastMoney `push2.eastmoney.com` | ✅ 可用 | 字段已验证 |
| 股票搜索 | 本地JSON + Sina名称解析 | ✅ 可用 | 5000+ A股 |
| AI分析 | DeepSeek/Claude/OpenAI | ⚠️ 需Key | Key可从前端传入 |
| Yahoo兜底 | Yahoo Finance | ❌ 不可达 | 中国被墙, 代码保留 |

---

## 4. 存储架构

| 存储 | 位置 | 用途 |
|------|------|------|
| `quantumstock:watchlist` | localStorage | 自选股列表 (symbol/name/market) |
| `quantumstock:api-keys` | localStorage | AI API Keys (base64编码) |
| `quantumstock:portfolio:positions` | localStorage | 持仓列表 (symbol/qty/cost) |
| `quantumstock:portfolio:cash` | localStorage | 现金余额 |
| `quantumstock:alerts` | localStorage | 预警规则 |

---

## 5. 可用性评估

| 功能 | 状态 | 验证方式 |
|------|------|----------|
| 侧边栏导航(8链接) | ✅ | 浏览器点击测试 |
| Header搜索框 | ✅ | 输入代码→Enter跳转 |
| AI分析页搜索 | ✅ | 全市场搜索(支持A股/港/美) |
| 个股详情+K线 | ✅ | lightweight-charts蜡烛图 |
| 自选股添加/展示 | ✅ | 详情页☆→首页统一卡片 |
| 筛选器+PE/ROE | ✅ | EastMoney真实数据 |
| 策略回测 | ✅ | 4策略纯客户端计算 |
| 持仓管理 | ✅ | localStorage+实时报价 |
| 预警系统 | ✅ | 4类型+60秒轮询 |
| 产业链分析 | ✅ | 4条链+真实股票+AI洞察 |
| API Key保存 | ✅ | base64编码+测试连接 |
| AI分析结果 | ✅ | 复制/导出/重新分析 |

---

## 6. 架构合理性评估

### 优点
- ✅ **数据源策略合理**: Sina(核心)+EastMoney(补充), 均免费且中国可达
- ✅ **缓存设计**: 每个数据源都有 TTL 缓存(3s~5min), 避免重复请求
- ✅ **降级策略**: API 失败时 fallback 到 mock 数据, 不致白屏
- ✅ **类型安全**: TypeScript 严格模式, tsc --noEmit 通过
- ✅ **错误边界**: 全局 ErrorBoundary + 各组件 try/catch
- ✅ **客户端计算**: 回测引擎纯客户端, 无服务端依赖

### 改进建议
- ⚠️ **清理死代码**: proxy.ts 已弃用应移除或标注 @deprecated
- ⚠️ **AI快讯应接真实API**: AIQuickInsight 当前硬编码3条假洞察
- ⚠️ **Yahoo兜底应移除**: 中国不可达, 增加代码复杂度但无实际价值
- ⚠️ **portfolio dayPnl 修复**: 计算公式有逻辑错误
- ⚠️ **持仓来源标记**: 当前无法区分手动输入和未来QMT同步的持仓
