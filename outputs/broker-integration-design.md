# QuantumStock 券商持仓一键接入设计文档

## 1. 背景与目标

当前 QuantumStock 的投资组合模块完全基于 localStorage 手动输入持仓。用户需要逐只输入股票代码、数量、成本价，体验繁琐且容易出错。

**目标**: 实现 QMT (迅投) 量化交易接口对接，用户一键同步券商真实持仓数据。

## 2. 技术架构

```
┌──────────────┐     xtquant      ┌──────────────────┐    HTTP POST    ┌─────────────────────┐
│  券商QMT终端  │ ←──────────────→ │ 本地Python脚本   │ ──────────────→ │ QuantumStock 应用   │
│  (国金/华泰)  │                  │ (qmt_sync.py)    │  localhost:3001  │ /api/portfolio/sync │
└──────────────┘                  └──────────────────┘                  └─────────┬───────────┘
                                                                                │
                                                                         ┌──────▼──────┐
                                                                         │ localStorage │
                                                                         │ (持仓展示)   │
                                                                         └─────────────┘
```

## 3. 实现清单

### 3.1 API 端点
**文件**: `src/app/api/portfolio/sync/route.ts`

- **POST** `/api/portfolio/sync` — 接收 QMT 推送的持仓数据
  - Body: `{ token?, account?, cash?, positions: [{symbol, name, quantity, avgCost, market, currency}] }`
  - 校验数据格式，返回 `{ success, received, positions, cash, timestamp }`
  - 可选 Token 认证（环境变量 `QMT_SYNC_TOKEN`）

- **GET** `/api/portfolio/sync` — 健康检查
  - 返回 `{ success: true, service, version, timestamp }`

### 3.2 Python 同步脚本
**文件**: `scripts/qmt_sync.py`

- 使用 `xtquant` 连接 QMT 终端
- 获取持仓: `trader.query_stock_positions(account)`
- 获取资金: `trader.query_stock_asset(account)`
- HTTP POST 推送到 `http://127.0.0.1:{port}/api/portfolio/sync`
- 支持:
  - `--interval 300` 定时同步
  - `--port 3001` 指定端口
  - `--token xxx` 认证Token
  - `--qmt-path` 自定义QMT路径

### 3.3 前端同步面板
**文件**: `src/components/portfolio/QMTSyncPanel.tsx`

- 同步状态指示: 未连接/已连接/同步中/错误
- 配置: 端口、Token
- 下载Python脚本按钮
- 最近同步时间显示
- 使用说明（4步引导）

### 3.4 存储层
**文件**: `src/lib/storage/broker-config.ts`

- `quantumstock:broker-config` — 同步配置（Token、端口、最后同步时间）
- `quantumstock:portfolio:broker-positions` — QMT 推送的持仓快照
- 与现有手动持仓共存，支持来源切换

### 3.5 持仓页集成
**文件**: `src/app/portfolio/page.tsx`

- 新增"券商同步"按钮，点击展开 QMTSyncPanel
- 同步成功后自动替换持仓列表
- 修复 `dayPnl` 计算公式（市值×涨跌幅%，非旧错误公式）

## 4. 数据流

```
1. 用户在券商APP开通QMT权限 → 登录QMT终端
2. 用户运行: python scripts/qmt_sync.py --interval 300
3. Python脚本连接QMT → 获取持仓+资金 → POST localhost:3001/api/portfolio/sync
4. API校验数据 → 返回成功
5. 持仓页"检查同步状态" → 读取localStorage中QMT推送的数据
6. 自动替换持仓列表 → 实时价格通过Sina API刷新
```

## 5. 安全设计

| 层面 | 措施 |
|------|------|
| 传输 | 仅 localhost HTTP，不暴露到公网 |
| 认证 | 可选Token（env QMT_SYNC_TOKEN） |
| 凭证 | QMT登录凭证仅在Python脚本本地，不传入应用 |
| 数据 | 持仓数据仅存localStorage，不上传服务器 |
| 回退 | 支持断开QMT同步，恢复手动持仓 |

## 6. 支持的券商

QMT (迅投QMT) 支持以下券商:
- 国金证券
- 华泰证券
- 中泰证券
- 国信证券
- 中信建投
- 其他支持QMT的券商

用户需在对应券商开通QMT权限（通常要求资金门槛50万+）。

## 7. 降级方案

- **QMT不可用**: 保留手动添加持仓功能（现有逻辑不变）
- **同步失败**: 显示错误信息+重试按钮，不影响现有持仓
- **xtquant未安装**: 脚本提示安装命令
- **QMT未登录**: 脚本提示用户登录QMT终端

## 8. 后续扩展

- **CSV导入**: 作为QMT的补充方案，支持从券商APP导出CSV导入
- **多账户**: 支持同时同步多个QMT账户
- **交易信号**: 扩展API支持推送交易信号回QMT执行
- **实时行情**: 通过QMT获取Level-2行情数据
