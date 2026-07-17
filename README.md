# QuantumStock — AI 量化分析平台

基于 stocks.mastersgo.cc（"股市挖掘机"）的逆向工程，重新设计的更完善的 AI 驱动多市场量化分析平台。

> **文档中心**：[架构文档](docs/ARCHITECTURE.md) · [API 契约](docs/API.md) · [部署指南](docs/DEPLOYMENT.md) · [重构计划与债务清单](REFACTOR-PLAN.md)
>
> **质量状态**：`tsc` 0 错误 · ESLint 0 错误 · 115 测试全绿 · 生产构建通过（2026-07 全面重构后）

## 核心能力

- **AI 多模型分析** — 同时调用 Claude/GPT/DeepSeek/MiniMax 对比分析个股
- **产业链智能分析** — "卖铲子"识别、供应链上下游追踪
- **实时市场仪表盘** — 全球指数、板块热力图、资金流向监控
- **高级筛选器** — 技术面+基本面+AI 智能条件组合选股
- **量化策略回测** — 内置经典策略模板，可视化回测结果
- **投资组合管理** — 持仓跟踪、风险指标、业绩归因
- **智能预警系统** — 价格/指标/资金流向多维度预警

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 15 (App Router) + TypeScript |
| 样式 | TailwindCSS + shadcn/ui |
| 图表 | TradingView Lightweight Charts + Recharts |
| 数据库 | PostgreSQL (Prisma ORM) |
| 缓存 | Redis |
| AI 网关 | Next.js API Routes |
| 量化引擎 | Python FastAPI (numpy/pandas) |
| 数据源 | AKShare / yfinance / CCXT |

## 快速开始

### 前置条件
- Node.js 20+
- pnpm (推荐)
- PostgreSQL 16+ (或 SQLite 用于开发)
- Python 3.11+ (量化引擎)

### 安装

```bash
# 克隆项目
git clone <your-repo-url>
cd quantumstock

# 安装前端依赖
pnpm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入 API 密钥

# 初始化数据库
pnpm db:generate
pnpm db:push

# 启动开发服务器
pnpm dev
```

### 启动 Python 量化引擎（可选）

```bash
cd python-engine
pip install -r requirements.txt
python main.py
```

访问 http://localhost:3000

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # 根布局 (含侧边栏)
│   ├── page.tsx            # 市场仪表盘
│   ├── ai-analysis/        # AI 分析页面
│   ├── screener/           # 高级筛选器
│   ├── backtest/           # 策略回测
│   ├── portfolio/          # 投资组合
│   ├── industry-chain/     # 产业链分析
│   ├── alerts/             # 智能预警
│   ├── settings/           # 系统设置
│   └── api/                # API 路由
├── components/
│   ├── ui/                 # 基础 UI 组件
│   ├── layout/             # 布局组件
│   └── dashboard/          # 仪表盘组件
├── lib/
│   ├── ai/                 # AI 模型客户端
│   ├── data/               # 数据获取层
│   ├── indicators/         # 技术指标库
│   └── utils.ts            # 工具函数
└── types/                  # TypeScript 类型定义
```

## 核心特性详解

### 1. 多模型 AI 分析引擎

```typescript
// 支持同时调用多个 AI 模型对比分析
const models = ["claude-opus-4", "gpt-4o", "deepseek-v3"];
const skills = ["technical-master", "fundamental-deep", "shovel-seller"];
const results = await runMultiModelAnalysis(stock, models, skills);
```

### 2. 可插拔技能系统

6 个内置分析技能：
- 📈 技术分析大师 — MACD/RSI/布林带/形态识别
- 💰 基本面深度挖掘 — ROE/杜邦分析/估值对比
- ⛏️ 卖铲子识别 — 产业链工具供应商分析
- 🔥 游资动向追踪 — 资金流向与筹码分布
- 🛡️ 风险评估师 — 多维风险量化
- 📊 财报解读专家 — 财报质量分析

### 3. 量化回测引擎

内置策略：双均线、海龟交易、动量策略、均值回归
- 可视化策略配置
- 完整回测指标（夏普/索提诺/卡尔玛比率）
- 权益曲线与交易记录

## 与原项目的对比改进

| 维度 | 原项目 (stocks.mastersgo.cc) | QuantumStock 改进 |
|------|------|------|
| 架构 | 单页应用 | Next.js 全栈，SSR/ISR |
| 前端框架 | 传统方式 | React 19 + RSC |
| UI 质量 | 基础 | shadcn/ui 专业组件 |
| 数据层 | 单一数据源 | 多源聚合+缓存策略 |
| 回测 | 未知 | Python 专业化引擎 |
| 产业链 | 技能形式 | 独立可视化模块 |
| 组合管理 | 未知 | 完整持仓+风险分析 |
| 移动端 | 未知 | 响应式设计 |
| 类型安全 | 未知 | 全 TypeScript |

## 开发路线

- [x] 架构设计与文档
- [x] 项目脚手架 + UI 框架
- [x] 市场仪表盘
- [x] AI 分析页面
- [x] 筛选器页面
- [x] 回测页面
- [x] 投资组合页面
- [x] 产业链分析页面
- [x] 预警系统页面
- [x] 设置页面
- [x] API 路由
- [x] Python 量化引擎骨架
- [ ] 真实数据源接入
- [ ] AI 模型 API 对接
- [ ] 用户认证系统

## License

MIT
