"""
QuantumStock Python Engine
Uses Sina Finance (国内可直连) for real-time quotes + AKShare for indices/history.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import numpy as np
from datetime import datetime, timedelta
import logging
import time
import threading
import urllib.request
import json
import re
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="QuantumStock Engine", version="1.1.0")

_allowed_origins = [o.strip() for o in os.environ.get("QS_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_allowed_origins, allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["*"])

# ==================== Cache ====================

_cache: Dict[str, tuple[Any, float]] = {}
_cache_lock = threading.Lock()

def cache_get(key: str, ttl: float = 30) -> Optional[Any]:
    with _cache_lock:
        if key in _cache:
            value, ts = _cache[key]
            if time.time() - ts < ttl:
                return value
            del _cache[key]
    return None

def cache_set(key: str, value: Any):
    with _cache_lock:
        _cache[key] = (value, time.time())

# ==================== Sina Finance API ====================
# Sina's API is free, requires no token, works from China without VPN.
# Format: http://hq.sinajs.cn/list=sh600519,sz300750,hk00700,gb_aapl

def to_sina_code(symbol: str) -> Optional[str]:
    """Map ANY internal symbol to Sina's code format — no hardcoded stock list.

    Rules:
      - 6-digit numeric starting with 6 → sh (SSE, incl. STAR 688)
      - 6-digit numeric starting with 0/3 → sz (SZSE, incl. ChiNext 300/301)
      - 5-digit numeric → hk (HKEX)
      - alphabetic ticker → gb_<lower> (US)
    """
    s = symbol.strip()
    if s.isdigit():
        if len(s) == 6:
            return ("sh" if s[0] == "6" else "sz") + s
        if len(s) == 5:
            return "hk" + s
    elif s.isascii() and s.isalpha() and 1 <= len(s) <= 6:
        return "gb_" + s.lower()
    return None

KNOWN_STOCKS = [
    {"symbol": "600519", "name": "贵州茅台", "market": "SSE", "sector": "白酒", "currency": "CNY"},
    {"symbol": "300750", "name": "宁德时代", "market": "SZSE", "sector": "新能源汽车", "currency": "CNY"},
    {"symbol": "000858", "name": "五粮液", "market": "SZSE", "sector": "白酒", "currency": "CNY"},
    {"symbol": "601398", "name": "工商银行", "market": "SSE", "sector": "银行", "currency": "CNY"},
    {"symbol": "688981", "name": "中芯国际", "market": "SSE", "sector": "半导体", "currency": "CNY"},
    {"symbol": "300059", "name": "东方财富", "market": "SZSE", "sector": "券商", "currency": "CNY"},
    {"symbol": "002594", "name": "比亚迪", "market": "SZSE", "sector": "新能源汽车", "currency": "CNY"},
    {"symbol": "600036", "name": "招商银行", "market": "SSE", "sector": "银行", "currency": "CNY"},
    {"symbol": "601318", "name": "中国平安", "market": "SSE", "sector": "保险", "currency": "CNY"},
    {"symbol": "000001", "name": "平安银行", "market": "SZSE", "sector": "银行", "currency": "CNY"},
    {"symbol": "688981", "name": "中芯国际", "market": "SSE", "sector": "半导体", "currency": "CNY"},
    {"symbol": "AAPL", "name": "Apple Inc.", "market": "NASDAQ", "sector": "消费电子", "currency": "USD"},
    {"symbol": "TSLA", "name": "Tesla Inc.", "market": "NASDAQ", "sector": "新能源汽车", "currency": "USD"},
    {"symbol": "NVDA", "name": "NVIDIA Corp.", "market": "NASDAQ", "sector": "AI芯片", "currency": "USD"},
    {"symbol": "MSFT", "name": "Microsoft Corp.", "market": "NASDAQ", "sector": "云计算", "currency": "USD"},
    {"symbol": "GOOGL", "name": "Alphabet Inc.", "market": "NASDAQ", "sector": "互联网", "currency": "USD"},
    {"symbol": "AMZN", "name": "Amazon.com", "market": "NASDAQ", "sector": "电商", "currency": "USD"},
    {"symbol": "META", "name": "Meta Platforms", "market": "NASDAQ", "sector": "社交媒体", "currency": "USD"},
    {"symbol": "TSM", "name": "台积电", "market": "NYSE", "sector": "半导体制造", "currency": "USD"},
    {"symbol": "AMD", "name": "AMD", "market": "NASDAQ", "sector": "半导体", "currency": "USD"},
    {"symbol": "00700", "name": "腾讯控股", "market": "HKEX", "sector": "互联网", "currency": "HKD"},
    {"symbol": "09988", "name": "阿里巴巴", "market": "HKEX", "sector": "互联网", "currency": "HKD"},
]

AK_INDICES = [
    {"id": "SSE", "name": "上证指数", "ak_code": "sh000001"},
    {"id": "SZSE", "name": "深证成指", "ak_code": "sz399001"},
    {"id": "CSI300", "name": "沪深300", "ak_code": "sh000300"},
    {"id": "GEM", "name": "创业板指", "ak_code": "sz399006"},
    {"id": "HSI", "name": "恒生指数", "ak_code": None},  # AKShare doesn't have HSI realtime easily
    {"id": "SPX", "name": "标普500", "ak_code": None},
    {"id": "NDX", "name": "纳斯达克", "ak_code": None},
    {"id": "BTC", "name": "比特币", "ak_code": None},
]


def _from_sina_code(sn_code: str) -> str:
    """Inverse of to_sina_code: strip sh/sz/hk/gb_ prefix."""
    low = sn_code.lower()
    for prefix in ("sh", "sz", "hk", "gb_"):
        if low.startswith(prefix):
            return sn_code[len(prefix):].upper() if prefix == "gb_" else sn_code[len(prefix):]
    return sn_code


def _sina_fetch(sina_codes: List[str]) -> Dict[str, Any]:
    """Fetch real-time quotes from Sina Finance API.
    Returns: dict mapping internal_symbol -> {open, high, low, close, volume, change, changePercent}
    """
    url = f"http://hq.sinajs.cn/list={','.join(sina_codes)}"
    req = urllib.request.Request(url, headers={
        "Referer": "https://finance.sina.com.cn",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    })

    resp = urllib.request.urlopen(req, timeout=10)  # http endpoint; TLS ctx not needed
    text = resp.read().decode("gbk", errors="replace")

    results = {}
    for line in text.strip().split("\n"):
        if not line.strip() or "=" not in line:
            continue
        match = re.match(r'var hq_str_(\w+)="(.+)"', line)
        if not match:
            continue
        sn_code = match.group(1)
        data = match.group(2)
        if not data or data == '""':
            continue

        # Recover the internal symbol from the sina code
        internal_sym = _from_sina_code(sn_code)

        fields = data.split(",")
        try:
            # Sina format depends on market:
            # A-share: name, open, prevClose, price, high, low, bid, ask, volume, amount, ...
            # HK: name, open, prevClose, high, low, price, ...
            # US: name, price, change%, change, bid, ask, high, low, open, prevClose, volume, ...

            sn_type = sn_code[:2]  # sh, sz, hk, gb

            if sn_type in ("sh", "sz"):
                # A-share format
                name = fields[0]
                open_p = float(fields[1]) if fields[1] else 0
                prev_close = float(fields[2]) if fields[2] else 0
                price = float(fields[3]) if fields[3] else 0
                high = float(fields[4]) if fields[4] else 0
                low = float(fields[5]) if fields[5] else 0
                volume = int(float(fields[8])) if fields[8] else 0
                amount = float(fields[9]) if fields[9] else 0
                change = price - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0

                results[internal_sym] = {
                    "name": name, "open": open_p, "high": high, "low": low,
                    "close": price, "volume": volume, "amount": amount,
                    "change": round(change, 2), "changePercent": round(change_pct, 2),
                }

            elif sn_type == "hk":
                # HK stock format
                name = fields[1]
                open_p = float(fields[2]) if fields[2] else 0
                prev_close = float(fields[3]) if fields[3] else 0
                high = float(fields[4]) if fields[4] else 0
                low = float(fields[5]) if fields[5] else 0
                price = float(fields[6]) if fields[6] else 0
                volume = int(float(fields[12])) if fields[12] else 0
                change = price - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0

                results[internal_sym] = {
                    "name": name, "open": open_p, "high": high, "low": low,
                    "close": price, "volume": volume, "amount": volume * price,
                    "change": round(change, 2), "changePercent": round(change_pct, 2),
                }

            elif sn_type == "gb":
                # US stock format
                name = fields[0]
                price = float(fields[1]) if fields[1] else 0
                change_pct = float(fields[2]) if fields[2] else 0
                change = float(fields[3]) if fields[3] else 0
                high = float(fields[6]) if fields[6] else 0
                low = float(fields[7]) if fields[7] else 0
                open_p = float(fields[8]) if fields[8] else 0
                prev_close = float(fields[9]) if fields[9] else price
                volume = int(float(fields[10])) if fields[10] else 0

                results[internal_sym] = {
                    "name": name, "open": open_p, "high": high, "low": low,
                    "close": price, "volume": volume, "amount": volume * price,
                    "change": round(change, 2), "changePercent": round(change_pct, 2),
                }

        except (IndexError, ValueError) as e:
            logger.warning(f"Parse error for {sn_code}: {e}")
            continue

    return results


def _fetch_indices_akshare():
    """Fetch A-share indices using AKShare (domestic API, no rate limit issues)."""
    try:
        import akshare as ak
        # Get realtime index data
        df = ak.stock_zh_index_spot_em()
        results = {}
        for _, row in df.iterrows():
            code = str(row["代码"])
            name = str(row["名称"])
            price = float(row["最新价"]) if row.get("最新价") and str(row["最新价"]) != "nan" else 0
            change = float(row["涨跌额"]) if row.get("涨跌额") and str(row["涨跌额"]) != "nan" else 0
            change_pct = float(row["涨跌幅"]) if row.get("涨跌幅") and str(row["涨跌幅"]) != "nan" else 0

            results[code] = {
                "name": name, "price": price, "change": change, "changePercent": change_pct,
            }
        return results
    except ImportError:
        logger.warning("AKShare not installed")
        return {}
    except Exception as e:
        logger.warning(f"AKShare index fetch failed: {e}")
        return {}


def _fetch_indices_sina():
    """Fetch major indices from Sina."""
    sina_index_codes = [
        ("sh000001", "上证指数", "SSE"),
        ("sz399001", "深证成指", "SZSE"),
        ("sz399006", "创业板指", "GEM"),
    ]
    try:
        return _sina_fetch([c[0] for c in sina_index_codes])
    except Exception:
        return {}


# ==================== API Endpoints ====================

@app.get("/market/quotes")
async def get_quotes(symbols: str = Query(default="")):
    """Batch fetch real-time quotes from Sina Finance."""
    sym_list = ([s.strip() for s in symbols.split(",") if s.strip()][:50]
                if symbols else [s["symbol"] for s in KNOWN_STOCKS[:10]])

    cache_key = f"q:{','.join(sorted(sym_list))}"
    cached = cache_get(cache_key, ttl=3)  # 3s cache — Sina updates every 3-5s
    if cached:
        return {"success": True, "data": cached, "meta": {"source": "sina", "cached": True}}

    # Resolve sina codes
    sina_codes = [c for c in (to_sina_code(s) for s in sym_list) if c]

    try:
        data = _sina_fetch(sina_codes)
        results = []
        for sym in sym_list:
            stock_info = next((s for s in KNOWN_STOCKS if s["symbol"] == sym), None)
            if not stock_info:
                stock_info = {"symbol": sym, "name": sym, "market": "UNKNOWN", "currency": "CNY"}

            qd = data.get(sym, {})
            price = qd.get("close", 0)
            change = qd.get("change", 0)
            change_pct = qd.get("changePercent", 0)

            results.append({
                "stock": stock_info,
                "quote": {
                    "timestamp": int(time.time() * 1000),
                    "open": round(qd.get("open", price), 2),
                    "high": round(qd.get("high", price), 2),
                    "low": round(qd.get("low", price), 2),
                    "close": round(price, 2),
                    "volume": qd.get("volume", 0),
                    "amount": qd.get("amount", 0),
                    "change": round(change, 2),
                    "changePercent": round(change_pct, 2),
                },
                "updatedAt": int(time.time() * 1000),
            })

        if results:
            cache_set(cache_key, results)
        return {"success": True, "data": results, "meta": {"source": "sina", "cached": False}}

    except Exception as e:
        logger.error(f"Sina quotes failed: {e}")
        raise HTTPException(status_code=502, detail=f"Sina API error: {e}")


@app.get("/market/indices")
async def get_indices():
    """Fetch indices from AKShare (A-shares) + Sina (others)."""
    cached = cache_get("indices", ttl=30)
    if cached:
        return {"success": True, "data": cached, "meta": {"source": "akshare+sina", "cached": True}}

    results = []

    # 1. Try AKShare for A-share indices
    ak_data = _fetch_indices_akshare()
    mapping = {
        "sh000001": "SSE", "sz399001": "SZSE", "sh000300": "CSI300", "sz399006": "GEM",
    }
    for code, idx_id in mapping.items():
        if code in ak_data:
            d = ak_data[code]
            results.append({
                "id": idx_id, "name": d["name"],
                "value": d["price"], "change": d["change"],
                "changePercent": d["changePercent"], "market": idx_id,
            })

    if not results:
        # Fallback: Sina for SSE/SZSE/GEM
        sina_data = _fetch_indices_sina()
        sina_map = {"sh000001": ("SSE", "上证指数"), "sz399001": ("SZSE", "深证成指"), "sz399006": ("GEM", "创业板指")}
        for code, (idx_id, name) in sina_map.items():
            if code in sina_data:
                d = sina_data[code]
                results.append({
                    "id": idx_id, "name": name,
                    "value": d.get("close", 0), "change": d.get("change", 0),
                    "changePercent": d.get("changePercent", 0), "market": idx_id,
                })

    if not results:
        raise HTTPException(status_code=502, detail="All index sources failed")

    cache_set("indices", results)
    return {"success": True, "data": results, "meta": {"source": "akshare+sina", "cached": False}}


@app.get("/market/search")
async def search_stocks(q: str = Query(default="")):
    if not q:
        return {"success": True, "data": KNOWN_STOCKS[:20]}
    ql = q.lower()
    results = [s for s in KNOWN_STOCKS if
        ql in s["symbol"].lower() or ql in s["name"].lower() or
        (s.get("nameCn", "")).lower().find(ql) >= 0]
    return {"success": True, "data": results[:20]}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


# ==================== Models ====================

class OHLCV(BaseModel):
    timestamp: str; open: float; high: float; low: float; close: float; volume: float

class BacktestRequest(BaseModel):
    strategy: str; data: List[OHLCV]; params: Dict[str, Any] = {}
    initial_capital: float = 1e6; commission: float = 0.0003; slippage: float = 0.001

# ==================== Indicators ====================

@app.post("/indicators/sma")
def compute_sma(data: List[float], period: int = 20):
    if len(data) < period: raise HTTPException(400, f"Need {period} points")
    r = [None] * (period-1)
    for i in range(period-1, len(data)): r.append(float(np.mean(data[i-period+1:i+1])))
    return {"values": r}

@app.post("/indicators/ema")
def compute_ema(data: List[float], period: int = 20):
    a = np.array(data, float); alpha = 2/(period+1); e = np.zeros_like(a)
    e[period-1] = np.mean(a[:period])
    for i in range(period, len(a)): e[i] = a[i]*alpha + e[i-1]*(1-alpha)
    e[:period-1] = np.nan
    return {"values": e.tolist()}

@app.post("/indicators/rsi")
def compute_rsi(data: List[float], period: int = 14):
    a = np.array(data, float); d = np.diff(a)
    g, l = np.where(d>0,d,0), np.where(d<0,-d,0)
    ag, al = np.zeros_like(a), np.zeros_like(a)
    ag[period] = np.mean(g[:period]); al[period] = np.mean(l[:period])
    for i in range(period+1,len(a)):
        ag[i] = (ag[i-1]*(period-1)+g[i-1])/period
        al[i] = (al[i-1]*(period-1)+l[i-1])/period
    rsi = np.zeros_like(a)
    for i in range(period, len(a)):
        rsi[i] = 100 if al[i]==0 else 100-(100/(1+ag[i]/al[i]))
    rsi[:period] = np.nan
    return {"values": rsi.tolist()}

# ==================== Backtest (Phase 3: full engine in backtest.py) ====================

from backtest import (
    BacktestRequest as FullBacktestRequest,
    MarketConstraints as BtMarketConstraints,
    A_SHARE_MAIN, A_SHARE_GEM, UNRESTRICTED,
)

def _constraints_for(symbol: str) -> BtMarketConstraints:
    """Infer market constraints from symbol (same rules as frontend)."""
    if symbol and len(symbol) == 6 and symbol.isdigit():
        if symbol.startswith("688") or symbol.startswith("300") or symbol.startswith("301"):
            return A_SHARE_GEM
        return A_SHARE_MAIN
    return UNRESTRICTED

@app.post("/backtest/v2")
def run_backtest_v2(req: FullBacktestRequest):
    """Full backtest engine: 4 strategies + A-share constraints (T+1/涨跌停/印花税/整手).

    Request: { bars, strategyId, params, initialCapital?, commission?, market?, slippagePct? }
    Falls back to UNRESTRICTED constraints when market omitted (front end can pass
    inferred constraints via /backtest/v2/constraints).
    """
    try:
        return {"success": True, "data": run_backtest_full(req)}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("backtest v2 failed")
        raise HTTPException(500, f"backtest error: {e}")

from backtest import run_backtest as run_backtest_full

@app.get("/backtest/v2/constraints")
def backtest_constraints(symbol: str = Query(default="")):
    return {"success": True, "data": _constraints_for(symbol).model_dump()}


# ==================== K-line (Phase 2 backfill path) ====================
# Node-side fetch is blocked by some proxy/TUN setups; the engine's urllib
# path connects directly. Sina's kline endpoints now reject scripted access
# and EastMoney is blocked by the local proxy, so we use Tencent's ifzq
# fqkline API (verified reachable, no auth, proper JSON).

@app.get("/market/kline")
def get_kline(symbol: str = Query(...), days: int = Query(default=250, ge=10, le=1000)):
    """Daily forward-adjusted K-line bars from Tencent. Symbol: 6-digit code."""
    if not symbol.isdigit() or len(symbol) != 6:
        raise HTTPException(400, "symbol must be a 6-digit A-share code")

    sina_code = to_sina_code(symbol)  # e.g. sz000001 / sh600519 — same prefix scheme as Tencent
    if not sina_code:
        raise HTTPException(400, f"cannot resolve symbol: {symbol}")

    cache_key = f"k:{symbol}:{days}"
    cached = cache_get(cache_key, ttl=300)
    if cached:
        return {"success": True, "data": cached, "meta": {"source": "tencent", "cached": True}}

    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={sina_code},day,,,{min(days, 800)},qfq"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        text = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", errors="replace")
        j = json.loads(text)
        # Response shape: data.{code}.{day|qfqday}: [[date, open, close, high, low, volume], ...]
        node = j.get("data", {}).get(sina_code, {})
        rows = node.get("qfqday") or node.get("day") or []
        if not rows:
            raise HTTPException(502, "no kline data")

        bars = []
        for r in rows:
            # date, open, close, high, low, volume
            bars.append({
                "date": r[0],
                "timestamp": int(datetime.strptime(r[0], "%Y-%m-%d").timestamp() * 1000),
                "open": float(r[1]), "close": float(r[2]),
                "high": float(r[3]), "low": float(r[4]),
                "volume": int(float(r[5])),
            })
        cache_set(cache_key, bars)
        return {"success": True, "data": bars, "meta": {"source": "tencent", "cached": False}}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"kline fetch failed for {symbol}: {e}")
        raise HTTPException(502, f"kline fetch failed: {e}")

def _bt_dual(closes, req):
    fp, sp = req.params.get("fastPeriod",10), req.params.get("slowPeriod",30)
    f, s = np.full(len(closes), np.nan), np.full(len(closes), np.nan)
    for i in range(sp-1, len(closes)):
        f[i] = np.mean(closes[i-fp+1:i+1]); s[i] = np.mean(closes[i-sp+1:i+1])
    cap, pos, eq, tr = req.initial_capital, 0, [req.initial_capital], []
    for i in range(sp, len(closes)):
        p = closes[i]
        if f[i-1]<=s[i-1] and f[i]>s[i] and pos==0:
            q = cap*0.95/p; pos = q; cap -= q*p*(1+req.commission)
            tr.append({"dt": req.data[i].timestamp, "t": "buy", "px": float(p), "q": float(q)})
        elif f[i-1]>=s[i-1] and f[i]<s[i] and pos>0:
            cap += pos*p*(1-req.commission)
            tr.append({"dt": req.data[i].timestamp, "t": "sell", "px": float(p), "q": float(pos)})
            pos = 0
        eq.append(cap+pos*p)
    if pos>0: cap += pos*closes[-1]*(1-req.commission); eq[-1]=cap
    ea = np.array(eq); rr = np.diff(ea)/ea[:-1]; tr_ret = (ea[-1]-req.initial_capital)/req.initial_capital
    pk = np.maximum.accumulate(ea); dd = (ea-pk)/pk
    sr = float(np.mean(rr)/np.std(rr)*np.sqrt(252)) if np.std(rr)>0 else 0
    return {"total_return": float(tr_ret*100), "annual_return": float(tr_ret*252/len(closes)*100),
            "max_drawdown": float(np.min(dd)*100), "sharpe_ratio":float(sr),
            "total_trades":len(tr), "trades": tr,
            "equity_curve": [{"date": req.data[min(i,len(req.data)-1)].timestamp, "value":float(v)} for i,v in enumerate(eq)]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
