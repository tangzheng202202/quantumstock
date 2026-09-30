# QuantumStock API 契约

> 多数业务路由遵循统一响应契约并携带 `x-trace-id`；流式分析、密钥测试、QMT 同步、运维看板和认证门控有独立响应。

## 统一响应格式

**成功**（HTTP 200）

```json
{
  "success": true,
  "data": {},
  "meta": { "timestamp": 1784312227182, "source": "sina|eastmoney|mock", "traceId": "..." }
}
```

**失败**（HTTP 4xx/5xx）

```json
{
  "success": false,
  "error": "人类可读错误消息",
  "code": "VALIDATION_ERROR | NOT_FOUND | UPSTREAM_ERROR | TIMEOUT | RATE_LIMITED | INTERNAL_ERROR",
  "meta": { "traceId": "...", "timestamp": 1784312227182 }
}
```

入参校验失败一律 `400 VALIDATION_ERROR`，由 zod schema 统一产生。

---

## 行情数据 /api/market

| 路由 | 方法 | 参数 | 说明 |
|---|---|---|---|
| `/api/market` | GET | — | 聚合仪表盘（指数+行情） |
| `/api/market/quotes` | GET | `symbols`（逗号分隔，必填） | 批量实时行情 |
| `/api/market/indices` | GET | — | 大盘指数 |
| `/api/market/search` | GET | `q`（必填，≤50 字符） | 股票搜索（代码/名称） |
| `/api/market/ticker` | GET | `symbol`（必填） | 单票详情（含 detectMarket） |
| `/api/market/ohlcv` | GET | `symbol`, `interval`(1m/5m/15m/30m/60m/daily/weekly/monthly), `range`(1d/5d/1mo/3mo/6mo/1y/2y/5y/max) | K 线 |
| `/api/market/sectors` | GET | `dimension`（change 等） | 行业板块/轮动 |
| `/api/market/sector-stocks` | GET | `code`（板块代码，必填） | 板块成分股 |
| `/api/market/financials` | GET | `symbol`（6 位 A 股） | 财务快照（PE/PB/ROE/市值） |
| `/api/market/screener` | GET | `screenerQuerySchema`（市场/指标/区间/limit） | 全 A 筛选 |

**symbol 规范**：A 股 6 位数字；港股 5 位数字；美股字母代码。
`symbolSchema` 统一校验，非法输入 400。

## AI /api/ai

### `POST /api/ai/analyze`

多模型分析。请求体：

```json
{
  "stock": { "symbol": "600519", "name": "贵州茅台", "market": "SSE", "currency": "CNY" },
  "models": ["deepseek-v4-flash"],
  "skills": [],
  "focusAreas": [],
  "customPrompt": ""
}
```

**API Key 解析顺序**：① 设置页加密 HttpOnly Cookie → ② 服务端环境变量 → ③ 数据库 BYOK 补缺。请求体 `apiKeys` 明文密钥会被拒绝；流式分析接口目前只读取环境变量与数据库 BYOK。
全部缺失时 `503`，`error` 指引配置途径，`configured` 列出可用模型名称。
自动注入实时行情/财务/K 线上下文（`buildMarketContext`）。

### `POST /api/ai/test-key`

`{ "provider": "deepseek", "key?": "sk-..." }` — 省略 `key` 时测试 cookie 中已保存的 key。
返回 `{ valid: boolean, error?: string }`（独立契约，不走统一格式）。

## 用户 Key 管理 /api/settings/keys

| 方法 | 请求体 | 响应 data | 副作用 |
|---|---|---|---|
| GET | — | `{ providers: { deepseek: { configured, masked }, ... } }` | — |
| PUT | `{ keys: { deepseek: "sk-..." \| "" } }` | 同上 | 写加密 HttpOnly cookie；`""` 删除该 provider |
| DELETE | — | 同上（全 false） | 过期 cookie |

- 响应**永不包含 key 本体**，只有 `masked: "sk-...尾4位"`。
- key 格式服务端二次校验（`validateKeyFormat`），不合法 400。

## 组合同步 /api/portfolio/sync

⚠️ **独立扁平契约**（被外部 QMT Python 脚本消费，**不要改为统一响应形状**）。
请求体经 zod `syncBodySchema` 校验（positions 数组：symbol/quantity/avgCost 等）。
POST 还要求服务端配置至少 32 字符的 `QMT_SYNC_TOKEN`，并在请求体提供相同的 `token`；未配置返回 503，缺失或不匹配返回 401。QMT 脚本默认从同名环境变量读取令牌，缺令牌会在连接券商终端前退出。
当前响应只确认接收并回显规范化持仓；服务端不持久化，脚本也没有把回显写入网页。不能将 HTTP 200 当成应用持仓已同步。

---

## 错误码 → HTTP 状态映射

| code | HTTP | 触发 |
|---|---|---|
| VALIDATION_ERROR | 400 | zod 校验失败 |
| NOT_FOUND | 404 | 资源不存在 |
| UPSTREAM_ERROR | 502 | 数据源（新浪/东财/AI）失败 |
| TIMEOUT | 504 | 上游超时 |
| RATE_LIMITED | 429 | 触发限流 |
| INTERNAL_ERROR | 500 | 未捕获异常 |
