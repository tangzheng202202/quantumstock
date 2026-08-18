# QuantumStock 解构报告与商业级重构蓝图

> 评审日期：2026-08-18 ｜ 范围：全仓（Next.js 15 前端 ~11k 行 TS/TSX + Python FastAPI 引擎 440 行 + Prisma + Docker）
> 方法：逐文件证据审查，每个问题标注 `file:line`，按 P0/P1/P2 分级。

---

## 一、项目解构

### 1.1 现状架构

```
Next.js 15 (App Router, ~29 route/page 文件)
 ├─ src/app/api/*        # BFF：market 数据聚合、ai 分析（流式）、portfolio 同步
 ├─ src/lib/
 │   ├─ ai/client.ts     # 多模型注册表 + Prompt 构造（Claude/GPT/DeepSeek/MiniMax）
 │   ├─ backtest/engine.ts # 客户端回测引擎（T+1、涨跌停、印花税、手数——这是全仓质量最高的模块）
 │   ├─ cache/index.ts   # 进程内 TTL + stale-while-revalidate
 │   ├─ data/{sina,eastmoney,market,fetch}.ts  # 数据源适配
 │   └─ db/repositories/* # Prisma 仓储层
 ├─ src/components/*     # dashboard / chart / layout（shadcn/ui + TradingView LWC + Recharts）
 └─ prisma/schema.prisma # PostgreSQL
python-engine/main.py    # FastAPI：Sina 实时行情 + AKShare 指数 + numpy 指标
scripts/qmt_sync.py      # QMT(迅投) 本地持仓同步
docker-compose.yml       # postgres + redis + app
```

### 1.2 真实完成度（对照 README 宣称）

| README 宣称能力 | 实际状态 | 证据 |
|---|---|---|
| AI 多模型分析 | ✅ 基本可用，但密钥由前端明文携带 | `src/app/api/ai/analyze/route.ts:52-65` 接受 `body.apiKeys` |
| 实时市场仪表盘 | ⚠️ 半可用：股票池仅写死 ~40 只 | 修复前 `python-engine/main.py:48-62` SINA_MAP 硬编码 |
| 量化策略回测 | ✅ 客户端引擎质量高（18 个测试全绿） | `src/lib/backtest/engine.ts:1-14`，无 mock |
| 投资组合管理 | ⚠️ 依赖 QMT 本地客户端，无券商级对接 | `scripts/qmt_sync.py` |
| Redis 缓存 | ❌ 宣称但未接入：实际是进程内 Map | `src/lib/cache/index.ts:9`；docker-compose 里 redis 无人消费 |
| 产业链智能分析 | ⚠️ 前端页面存在，数据多为静态/演示 | `src/app/industry-chain/page.tsx` |
| 智能预警系统 | ⚠️ 表结构有、调度/推送链路不完整 | `src/lib/db/repositories/alerts.ts` |

---

## 二、问题清单（按严重度）

### P0 — 安全与正确性（上线阻断）

1. **客户端 API Key 随请求明文流转**。`src/app/api/ai/analyze/route.ts:52`、`analyze-stream/route.ts:45`：前端把各家 LLM 密钥放 body 发给后端，密钥经手浏览器、可能进日志/历史记录（`src/lib/storage/report-history.ts`）。商业产品必须：密钥只存服务端（KMS/Vault 加密落库），前端只发 `keyId`。
2. **Python 引擎 CORS 全开 + TLS 校验关闭**。`main.py:24` `allow_origins=["*"]` 且 `allow_credentials=True`（这组合本身非法，浏览器会拒绝 credentials）；`main.py:111-113` `ssl.CERT_NONE`。→ **本次已修复**。
3. **股票宇宙硬编码 ~40 只**，全市场 5000+ 标的不可查。→ **本次已修复**：改为规则映射（6→sh、0/3→sz、5 位→hk、字母→gb_）。
4. **AI 接口无限流/无配额**。任何登录用户可无限触发多模型并发分析，直接打穿成本。无 rate limit、无 token 计量、无余额熔断。
5. **前端伪造数据**。`ai-analysis/page.tsx:528` 用 `Math.random()` 伪造"置信度 75-90%"，向用户呈现假的可信度——金融产品的致命信任问题。→ **本次已修复**。
6. **合规缺位**：无风险提示体系、无"非投资建议"披露框架、无数据源授权（Sina/东财接口商用授权风险）、无用户协议/隐私政策。

### P1 — 架构与可扩展性

7. **进程内缓存 = 多副本不可用**。`src/lib/cache/index.ts` 每个 Next.js 实例一份 Map，水平扩容即失效；redis 服务在 compose 里空转。
8. **双图表库并存**（lightweight-charts + recharts，`package.json`），打包体积和心智负担双倍。
9. **回测在客户端执行**：数据全量下发浏览器、无法防篡改、无法做组合级回测/参数寻优。引擎应下沉到 Python（vectorbt/backtrader 生态），前端只消费结果。
10. **数据层单点**：Sina 为主、AKShare 备份，但无统一的 Provider 抽象（重试、熔断、降级、监控埋点散落各处）。
11. **无服务端鉴权边界**：Clerk 登录存在，但 market/ai API 对登录用户无差异化限额，`middleware.ts` 保护范围未覆盖所有路由。
12. **测试覆盖失衡**：回测引擎 18 测、utils 14 测，而 AI 路由、数据适配层（sina/eastmoney 解析）零测试。

### P2 — 工程化

13. 双锁文件并存（`package-lock.json` + `pnpm-lock.yaml`）。
14. `docker-compose.yml` 默认密码 `secret`。→ **本次已修复**（改为必填 `${DB_PASSWORD:?}`）。
15. Python 引擎无依赖锁、无 lint/test、`__pycache__` 入库。
16. a-stocks.json（静态全量清单）与数据库 stock 表双份事实源，无同步机制。

---

## 三、同类项目对比

| 维度 | QuantumStock | TradingView(商业标杆) | OpenBB (开源标杆) | 果仁/聚宽(国内) |
|---|---|---|---|---|
| 数据 | Sina/AKShare 免费 API，无授权 | 自有+交易所授权 | 多 provider 插件 | 自有授权 |
| 回测 | 浏览器端，正确性好 | 服务端，毫秒级 | Python 本地，专业 | 服务端， tick 级 |
| AI 分析 | 多模型并行，差异化亮点 | AI 指标(付费) | 无(接 LLM 需自建) | 弱 |
| 多用户/计费 | Clerk 登录，无计费 | 完整订阅体系 | 单机 | 完整 |
| 部署 | docker-compose 三件套 | — | pip/Docker | — |

**定位判断**：该项目的差异化资产是「多模型对比分析 + 中文市场约束的回测引擎 + 国内数据源直连」。对标商业级，最短路径不是补齐 TradingView 的全功能，而是收敛成——**面向中文散户/独立研究员的 AI 研究工作台（SaaS）**。

---

## 四、商业级重构蓝图（Target Architecture）

```
                     ┌────────────── Edge (CDN + WAF) ──────────────┐
用户 ── HTTPS ──────▶│  Next.js 15 前端（瘦身：只保留 lightweight-charts）│
                     └───────┬──────────────────────┬───────────────┘
                             │ tRPC/REST            │ SSE (AI 流)
                     ┌───────▼──────────────────────▼───────────────┐
                     │        API Gateway (限流/鉴权/计量)            │
                     │  - Clerk session → 内部 quota 体系             │
                     │  - 每用户 token 计量 → 计费事件流               │
                     └──┬──────────┬──────────┬──────────┬──────────┘
                        │          │          │          │
                 ┌──────▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼─────┐
                 │ Data Svc │ │ AI Svc  │ │Backtest│ │ Alert   │
                 │ Provider │ │ 网关:密钥 │ │ Svc    │ │ Worker  │
                 │ 抽象+熔断 │ │ 只在服务端│ │Python  │ │ (cron + │
                 │ sina/em/ │ │ 逐模型预算│ │vectorbt│ │  push)  │
                 │ akshare/ │ └─────────┘ └────────┘ └─────────┘
                 │ ccxt     │      │            │
                 └────┬─────┘      ▼            ▼
                      │      Postgres(事实) + Redis(热数据/队列)
                      └──▶ ClickHouse/DuckDB(OLAP: K线/因子)
```

### 阶段路线图

**Phase 1 — 止血（1-2 周，全部完成 ✅ 2026-08-18）**
- [x] 移除 `Math.random()` 假置信度
- [x] Python 引擎：CORS 白名单化、去 TLS 旁路、全市场符号映射
- [x] compose 默认弱口令改必填
- [x] AI 路由限流：`src/lib/rate-limit`（滑动窗口，10/分钟 + 60/小时，按 Clerk userId 或 IP；8 个单测），接入 analyze + analyze-stream + keys
- [x] 密钥服务端化（P0-1 根治）：
  - 新增 `POST/GET/DELETE /api/ai/keys`（BYOK 托管，AES-256-GCM 加密落库，明文永不回传）
  - Prisma `ApiKey` 表新增 `keyEnc` 列 + 迁移 SQL
  - `src/lib/ai/resolve-keys.ts`：env 优先 → 用户加密密钥解密填充
  - analyze / analyze-stream 拒绝请求体明文密钥（400 + 迁移指引）
  - 前端三个页面停止发送/存储明文密钥；settings 页改为服务端托管 + 旧 localStorage 密钥一次性迁移后擦除
- [x] 全站风险披露组件（2026-08-18 完成）：`components/compliance/RiskDisclosure.tsx`，紧凑版挂 layout 全局页脚，report 版挂每份 AI 分析报告尾部（含生成时间戳与"AI 可能产生幻觉内容"警示）— **Phase 1 全部关账 ✅**

**Phase 2 — 数据地基（进行中，2026-08-18 首批完成）**
- [x] 统一 `MarketDataProvider` 接口（`src/lib/data/provider.ts`）：capability 声明 + 优先级 + 熔断器（5 连败 open / 30s 冷却半开试探）+ 滚动健康分（20 窗口成功率）+ 自动 failover
- [x] Provider 注册（`src/lib/data/providers.ts`）：python-engine(45) → sina(40) → local-db 搜索；quotes/indices 路由已接入 failover 链，mock 兜底显式打 `degraded: true` 标记
- [x] 缓存后端可插拔（`src/lib/cache/index.ts` 重写）：memory 默认（SWR 保留）/ REDIS_URL 设置且装有 ioredis 时自动切 Redis（cache-aside，故障静默降级 memory）；公共 API 不变，全部调用点零改动
- [x] Stock universe 单一事实源：`scripts/sync-stock-universe.ts`（`npm run db:sync-universe`）全量 upsert a-stocks.json → Stock 表，快照中消失的标的自动置 `isActive=false`；建议 cron 每日 18:00 跑
- [x] Provider 层 7 个单测（failover/熔断/健康分/空结果软失败）；全仓测试通过
- [x] K 线持久化（OLAP-lite，Postgres）：`OhlcvBar` 模型（unique symbol+interval+date，date 降序索引）+ 迁移；`ohlcv-store.ts` DB-first 读 + 自动 live 回填 + 批量 upsert；`/api/market/ohlcv` 路由已切换，meta.source 标注 db/db+backfill/live
  - **设计偏离说明**：路线图原写 ClickHouse/DuckDB，按量级测算（5000 标的×250 bar/年≈125 万行/年）Postgres 足够，ClickHouse 推迟到 1000 万行以上再引入
  - 已实测 live 路径：600519 拉到含当日的真实日线
- [x] K 线回填 worker：`npm run kline:ingest`（全量/--symbols/--limit，300ms 限速）
- [x] 预警调度 worker：`npm run alerts:worker`（单次或 ALERT_WORKER_LOOP 循环；评估 price_above/below、change_up/down；触发置位 + ALERT_WEBHOOK_URL 推送；行情走 failover 链）
- [x] 删除 recharts 依赖（代码中已无 import，纯 package.json 清理，-120KB gzip 打包体积）
- [x] OhlcvStore 单测 5 个（无 DB 降级路径、契约映射）；全仓 **77/77** 测试通过
- [ ] `loadStockDatabase` 改为 DB 优先、JSON 兜底（需 DATABASE_URL 环境实测）
- [ ] Redis 队列（预警/K 线 ingest 从循环脚本升级为队列任务，需生产 Redis）

**Phase 2 — 数据地基（3-4 周）**
- 统一 `MarketDataProvider` 接口（quote/ohlcv/financials/search），sina/eastmoney/akshare 实现为可替换 adapter，带重试+熔断+健康分
- K 线入 ClickHouse（或起步用 DuckDB 文件），告别"每次现场拉全量历史"
- Redis 真正接管缓存与队列（替换进程内 Map），worker 处理预警调度
- stock universe 单一事实源：DB 表 + 每日同步任务，删除 a-stocks.json 双份

**Phase 3 — 引擎下沉（首批完成 ✅ 2026-08-18）**
- [x] 服务端回测引擎 `python-engine/backtest.py`：TS 引擎语义完整移植（4 策略 + T+1/涨跌停/印花税/佣金/滑点/整手），纯 numpy 实现
  - **设计偏离说明**：路线图原写 vectorbt，实际选择纯 numpy——vectorbt 重依赖 ~200MB 且事件循环语义与 TS 引擎不一致；待参数寻优工作负载出现再评估
  - 新端点 `POST /backtest/v2`（全约束权威结果）+ `GET /backtest/v2/constraints?symbol=`（按代码推断主板/创业板科创板/无约束）
  - 旧 `/backtest/run` 保留（只有 dual_ma、无约束），标记为 deprecated
- [x] 前端 `server-client.ts`：优先调 Python 引擎，引擎不可达时自动降级本地 TS 引擎；回测结果页显示引擎来源标识（"Python 服务端（权威）" / "本地降级引擎"）
- [x] 测试：pytest 11 个（策略运行/T+1 无同日买卖/整手约束/指标一致性）+ E2E 实测（真实茅台日线 → uvicorn → /backtest/v2，与本地直跑结果逐位一致）
- [x] AI 分析结构化输出（zod schema 校验）— 未做，留待 Phase 3 第二批
- [ ] 回测任务异步化（大参数寻优走任务队列 + SSE 进度）— 与 Phase 2 Redis 队列合并实施

**Phase 4 — 商业化（首批完成 ✅ 2026-08-18，commit daefb252）**
- [x] 计量地基：`UsageEvent` 表 + `src/lib/observability/usage.ts`——每次模型调用记账（fire-and-forget），静态 PRICING 表估成本，未知模型记 $0（不造假数字）；`usageSummary(days)` 聚合喂看板
- [x] 运维看板 `GET /api/ops/dashboard?days=30`：用量汇总 + provider 健康分 + 缓存状态；ADMIN_EMAILS/OPS_DASHBOARD_TOKEN 授权，未配置默认 503 关闭；dev 无 Clerk 时 auth() 容错。实测：无配置 503、错 token 401
- [x] 免责声明（RiskDisclosure 组件，Phase 1 已落地）
- [ ] 配额执行（免费档 N 次/日，基于 UsageEvent 即可实现，待定价决策）
- [ ] Stripe/微信支付接入（待商户资质）
- [ ] 合规包完善（用户协议/隐私政策文本）
- [ ] OpenTelemetry 全链路（当前为结构化日志 + ops 看板，够用为止）

---

## 五、本次已实施的变更（诚实清单）

| # | 变更 | 文件 | 验证 |
|---|---|---|---|
| 1 | 删除硬编码 40 只股票映射，改为规则函数 `to_sina_code()`，支持全部 A股/港股/美股 | `python-engine/main.py` | 单测断言 6 类符号通过 |
| 2 | quotes 上限 15→50 | 同上 | 语法检查通过 |
| 3 | CORS `*` → `QS_ALLOWED_ORIGINS` 环境变量白名单（默认 localhost:3000） | 同上 | 语法检查通过 |
| 4 | 移除 `ssl.CERT_NONE` TLS 旁路 | 同上 | 语法检查通过 |
| 5 | 删除 `Math.random()` 假置信度 | `src/app/ai-analysis/page.tsx:528` | tsc --noEmit 通过 |
| 6 | compose 默认密码改为必填环境变量 | `docker-compose.yml` | grep 验证 |
| 7 | 前端回归 | — | vitest 57/57 通过，tsc 通过 |

**未做（待用户决策后继续）**：ClickHouse 数据层、回测服务端化、计费与合规包、全站风险披露组件——见路线图 Phase 2-4。

### 追加：Phase 1 第二批变更（2026-08-18，限流 + 密钥服务端化）

| # | 变更 | 文件 | 验证 |
|---|---|---|---|
| 8 | 新增限流器（滑动窗口，userId/IP 键控，内存实现、接口可换 Redis 后端） | `src/lib/rate-limit/index.ts` | 8 个单测 |
| 9 | analyze + analyze-stream 接入限流（10/分、60/时，429 + Retry-After） | 两个 route.ts | tsc 通过 |
| 10 | 拒绝请求体明文 API Key（400 + 迁移指引） | `analyze/route.ts` | tsc 通过 |
| 11 | 服务端密钥解析：env 优先 → DB 加密密钥 | `src/lib/ai/resolve-keys.ts`（新） | tsc 通过 |
| 12 | BYOK 托管端点 GET/POST/DELETE（AES-256-GCM，含限流与鉴权） | `api/ai/keys/route.ts`（新） | tsc 通过 |
| 13 | Prisma `ApiKey.keyEnc` 列 + 迁移 SQL | `schema.prisma`、`migrations/20260818090000_apikey_enc/` | prisma generate 通过 |
| 14 | 前端密钥层重写为服务端托管；一次性迁移旧 localStorage 密钥并擦除；明文不再落浏览器 | `lib/storage/api-keys.ts` + settings/ai-analysis/industry-chain 页面 | tsc + vitest 65/65 |
| 15 | .env.example 增加 QS_ALLOWED_ORIGINS | `.env.example` | — |

**运维注意**：启用 BYOK 需要设置 `ENCRYPTION_KEY`（≥32 字符）并执行 `prisma migrate deploy`；未设置时 analyze 自动降级为 env-only 模式。
