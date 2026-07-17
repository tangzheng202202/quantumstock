# QuantumStock 部署指南

## 1. 环境要求

- Node.js ≥ 20（推荐 22）
- pnpm 9+（**必须使用 pnpm**，CI 为 `pnpm install --frozen-lockfile`）
- 无数据库依赖（Prisma 未接线，D7）

## 2. 环境变量

复制 `.env.example` → `.env.local`：

| 变量 | 必需 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` 等 `*_API_KEY` | 否 | 服务端 AI key（**优先级最高**，团队部署推荐） |
| `KEY_ENCRYPTION_SECRET` | 多实例必需 | 设置页用户 key 的 cookie 加密密钥。`openssl rand -hex 32` 生成。单实例不配时进程随机兜底（重启后用户需重配 key） |
| `DATABASE_URL` / `REDIS_URL` | 否 | 预留（未接线） |

> AI key 有三种提供方式，服务端解析顺序：**env > 加密 cookie > 请求体**。
> 个人使用直接在「设置 → AI模型」页配置即可（AES-256-GCM 加密存储）。

## 3. 构建与启动

```bash
pnpm install --frozen-lockfile
pnpm build        # 含 ESLint 检查（0 error 门禁）
pnpm start        # 生产模式，默认 :3000
```

## 4. 质量门禁（每次提交前）

```bash
pnpm exec tsc --noEmit     # 类型检查 —— 必须 0 错误
pnpm lint                  # ESLint —— 必须 0 错误（warn 清单见下）
pnpm test                  # Vitest —— 必须全绿（当前 115 用例）
pnpm test:coverage         # 覆盖率（核心逻辑模块阈值 70%）
pnpm build                 # 生产构建 —— 必须通过
```

当前 lint warn 存量（不阻塞，已登记技术债）：
- `set-state-in-effect` ×13（D12：遗留 fetch-in-effect，待迁移数据获取库）
- `no-explicit-any` ×28（主要在未接线的 db/repositories 与遗留页面）

## 5. 安全检查清单

- [x] CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy
- [x] HSTS（生产自动启用）
- [x] API Key 加密 cookie 存储（HttpOnly + SameSite=Strict）
- [x] 错误消息 key 脱敏（analyze 路由）
- [x] API 入参 zod 校验（防注入/畸形）
- [ ] HTTPS 终结（由反向代理/平台负责）

## 6. 部署形态

| 形态 | 适配 | 注意事项 |
|---|---|---|
| Vercel | ✅ 开箱即用 | env 在控制台配置；HSTS 自动 |
| 自托管 Node | ✅ `pnpm start` | 建议前置 Nginx 终结 HTTPS |
| Docker | ✅ 需自建镜像 | `next build && next start`，无外部服务依赖 |
| 多实例 | ⚠️ | **必须配置 `KEY_ENCRYPTION_SECRET`**（所有实例共享），否则用户 key 跨实例失效 |

## 7. 数据源网络要求

- 新浪财经 / 东方财富：**需中国大陆可直连**（境外部署可能受限）
- Yahoo Finance：国内不可达，自动降级（美股兜底源，失败不影响主流程）

## 8. 监控建议

- 所有 API 响应携带 `x-trace-id`，接入日志系统后可全链路追踪。
- 服务端错误统一经 `withApiHandler` 记录 `[api:路由名] traceId=...`。
