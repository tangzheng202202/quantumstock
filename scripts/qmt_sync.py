#!/usr/bin/env python3
"""
QuantumStock QMT 持仓同步脚本

功能：
  通过 xtquant 连接 QMT 终端，获取实时持仓数据，
  HTTP POST 推送到 QuantumStock 应用。

使用前提：
  1. 已在支持 QMT 的券商（国金/华泰/中泰等）开通 QMT 权限
  2. QMT 终端已登录并运行中
  3. 已安装 xtquant 库: pip install xtquant

用法：
  python qmt_sync.py                          # 单次同步
  python qmt_sync.py --interval 300           # 每5分钟自动同步
  python qmt_sync.py --port 3001 --token xxx  # 指定端口和认证Token
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def get_qmt_positions():
    """通过 xtquant 获取 QMT 账户持仓"""
    try:
        from xtquant import xttrader, xtdata
    except ImportError:
        log("ERROR: xtquant 未安装。请运行: pip install xtquant")
        sys.exit(1)

    # QMT 终端默认路径（用户需根据实际安装路径修改）
    qmt_path = r"C:\国金QMT交易端\userdata_mini"
    session_id = 123456

    log("正在连接 QMT 终端...")
    trader = xttrader.XtQuantTrader(qmt_path, session_id)

    try:
        trader.start()
        if not trader.connect():
            log("ERROR: 无法连接 QMT 终端，请确认 QMT 已登录运行")
            sys.exit(1)

        account = xttrader.StockAccount()
        log("QMT 连接成功，正在获取持仓...")

        # 获取持仓明细
        positions = trader.query_stock_positions(account)
        if not positions:
            log("WARNING: 当前账户无持仓")
            return [], 0, ""

        result = []
        for pos in positions:
            # pos 字段: stock_account, volume, can_use_volume, open_price, market_value, profit, profit_rate
            if pos.volume == 0:
                continue  # 跳过零持仓

            # 获取股票名称
            symbol = pos.stock_code
            tick = xtdata.get_full_tick([symbol])
            name = tick.get(symbol, {}).get('name', symbol) if tick else symbol

            # 判断市场
            if symbol.startswith('6') or symbol.startswith('688'):
                market = 'SSE'
                currency = 'CNY'
            elif symbol.startswith('0') or symbol.startswith('3'):
                market = 'SZSE'
                currency = 'CNY'
            elif symbol.startswith('5'):
                market = 'HKEX'
                currency = 'HKD'
            else:
                market = 'SSE'
                currency = 'CNY'

            result.append({
                'symbol': symbol,
                'name': name,
                'quantity': int(pos.volume),
                'availableQuantity': int(pos.can_use_volume),
                'avgCost': float(pos.open_price) if pos.open_price > 0 else 0,
                'market': market,
                'currency': currency,
            })

        # 获取可用资金
        assets = trader.query_stock_asset(account)
        cash = float(assets.cash) if assets else 0
        account_id = assets.account_id if assets else "unknown"

        log(f"获取到 {len(result)} 只持仓, 可用资金: {cash:.2f}")
        return result, cash, account_id

    finally:
        trader.stop()

def push_to_app(positions, cash, account, port, token):
    """推送持仓数据到 QuantumStock 应用"""
    url = f"http://127.0.0.1:{port}/api/portfolio/sync"

    payload = {
        'positions': positions,
        'cash': cash,
        'account': account,
    }
    if token:
        payload['token'] = token

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            if result.get('success'):
                log(f"✓ 同步成功: {result.get('received', 0)} 只持仓已推送到 QuantumStock")
                return True
            else:
                log(f"✗ 同步失败: {result.get('error', 'unknown')}")
                return False
    except urllib.error.URLError as e:
        log(f"✗ 连接失败: {e.reason} (确认 QuantumStock 运行在 localhost:{port})")
        return False
    except Exception as e:
        log(f"✗ 同步异常: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='QuantumStock QMT 持仓同步')
    parser.add_argument('--port', type=int, default=3001, help='QuantumStock 应用端口 (默认 3001)')
    parser.add_argument('--token', type=str, default='', help='认证 Token (可选)')
    parser.add_argument('--interval', type=int, default=0, help='自动同步间隔秒数 (0=单次)')
    parser.add_argument('--qmt-path', type=str, default='', help='QMT userdata_mini 路径')
    args = parser.parse_args()

    log("=" * 50)
    log("QuantumStock QMT 持仓同步脚本")
    log(f"目标: http://127.0.0.1:{args.port}")
    log(f"模式: {'自动同步 (每{}秒)' if args.interval > 0 else '单次同步'}")
    log("=" * 50)

    while True:
        try:
            positions, cash, account = get_qmt_positions()
            push_to_app(positions, cash, account, args.port, args.token)
        except Exception as e:
            log(f"同步异常: {e}")

        if args.interval <= 0:
            break

        log(f"下次同步: {args.interval} 秒后...")
        time.sleep(args.interval)

    log("同步结束")

if __name__ == '__main__':
    main()
