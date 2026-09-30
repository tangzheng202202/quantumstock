# QuantumStock 部署指南

## 1. 环境要求

- Node.js ≥ 20（推荐 22）
- pnpm 10.34.6（仓库与 CI 固定版本）
- 构建无需在线数据库；启用持久化功能时需 PostgreSQL 和 `DATABASE_URL`

## 2. 环境变量

认证有两个明确模式：本地 `pnpm dev` 默认绑定 `127.0.0.1`，两项 Clerk 密钥都留空时仅作为匿名原型运行；用户数据迁移和数据库 BYOK 仍要求登录。配置真实的 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 与 `CLERK_SECRET_KEY` 后，Clerk 中间件保护工作台与 API（登录、注册、健康检查及各自验令牌的 QMT 同步和运维看板除外）。生产环境缺少任何一项密钥或仍填示例值时返回 503，不开放匿名模式。公钥需在构建时传入；密钥有效性及真实登录仍须在目标环境验收。

`/api/portfolio/sync` 是独立的 QMT 机器端点，不使用浏览器 Clerk 会话。POST 必须配置至少 32 字符的 `QMT_SYNC_TOKEN` 并在请求体提供相同令牌，否则返回 503/401；GET 仅用于连通性检查。此端点可在其他页面因 Clerk 配置不完整而关闭时响应，部署时也需限制网络来源。当前 POST **仅校验并回显持仓，不持久化，也不会更新网页持仓**；真实同步仍需设计存储和账户映射。

`/api/ops/dashboard` 可由 Clerk 管理员会话访问，或用至少 32 字符的 `OPS_DASHBOARD_TOKEN` 独立认证。机器调用把令牌放在 `Authorization: Bearer` 请求头；查询参数 `token` 不再生效。无令牌且未配置管理员邮箱时返回 503；配置后未通过认证返回 401。此端点也可在 Clerk 配置不完整时凭令牌访问，应在反向代理层限制来源并使用 HTTPS。

复制 `.env.example` → `.env.local`：

| 变量 | 必需 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` 等 `*_API_KEY` | 否 | 服务端 AI key（团队部署推荐；实际选取顺序见下） |
| `KEY_ENCRYPTION_SECRET` | 多实例必需 | 设置页用户 key 的 cookie 加密密钥。`openssl rand -hex 32` 生成。单实例不配时进程随机兜底（重启后用户需重配 key） |
| `ENCRYPTION_KEY` | 启用数据库 BYOK 时必需 | 数据库内用户 API key 的独立加密密钥，至少 32 字符；不能用 cookie 密钥代替 |
| `DATABASE_URL` / `REDIS_URL` | 否 | 启用数据库持久化和 Redis 缓存时配置 |

使用 Docker Compose 时，还须在被 Git 忽略的 `.env` 中设置强随机且 URL 安全的
`DB_PASSWORD`（例如 `openssl rand -hex 32`），它会同时进入 PostgreSQL 密码和连接 URL。

> AI key 可来自服务端环境变量、设置页的加密 HttpOnly cookie，或登录用户的数据库 BYOK；分析请求体中的明文 key 会被拒绝。普通分析接口按 **cookie > env > 数据库 BYOK 补缺** 选取；流式分析接口按 **env > 数据库 BYOK 补缺** 选取，目前不读取设置页 cookie。
> 个人使用可在「设置 → AI模型」页配置 cookie key；多设备数据库 BYOK 还须登录并配置数据库及 `ENCRYPTION_KEY`。

## 3. 构建与启动

```bash
pnpm install --frozen-lockfile
pnpm db:generate  # 类型检查和构建前生成 Prisma Client
pnpm build        # 含 ESLint 检查（0 error 门禁）
pnpm start        # 生产模式，默认 :3000
```

## 4. 质量门禁（每次提交前）

```bash
pnpm db:generate           # 干净安装后必须先生成 Prisma Client
pnpm typecheck             # 类型检查 —— 必须 0 错误
pnpm lint                  # ESLint —— 必须 0 错误（warn 清单见下）
pnpm test                  # Vitest —— 必须全绿（本地实跑 182 用例）
pnpm test:coverage         # 覆盖率（核心逻辑模块阈值 70%）
pnpm build                 # 生产构建 —— 必须通过
```

当前本地实跑 ESLint 为 0 error、75 warning；warning 暂不阻塞构建。

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
| Vercel | 配置路径存在，线上未验证 | env 在控制台配置；需验证认证、行情数据与真实请求 |
| 自托管 Node | 本地 standalone 已启动，线上未验证 | 需前置 HTTPS 反向代理并验证认证、数据库和数据源 |
| Docker | 配置已修复，镜像/数据库部署待验证 | 构建时传入需要的 `NEXT_PUBLIC_*` 变量；运行 `node server.js`。数据库初始化需独立执行 |
| 多实例 | ⚠️ | **必须配置 `KEY_ENCRYPTION_SECRET`**（所有实例共享），否则用户 key 跨实例失效 |

Compose 默认仅把 app、PostgreSQL、Redis 和可选 Python 引擎绑定到宿主机 `127.0.0.1`。公网访问须另配带认证和 HTTPS 的反向代理；数据库和无认证的 Redis 不应直接暴露。

仓库已有版本化 Prisma migration 文件，但本轮未验证它们与当前 schema 一致，也未验证空库和既有库升级路径。生产启用持久化前须审阅迁移并分别验证这两条路径；不要在应用启动时直接运行 `db push`。

## 7. 数据源网络要求

- 新浪财经 / 东方财富：**需中国大陆可直连**（境外部署可能受限）
- Yahoo Finance：国内不可达，自动降级（美股兜底源，失败不影响主流程）

## 8. 监控建议

- 所有 API 响应携带 `x-trace-id`，接入日志系统后可全链路追踪。
- 服务端错误统一经 `withApiHandler` 记录 `[api:路由名] traceId=...`。
