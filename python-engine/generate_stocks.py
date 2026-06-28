"""
Generate full A-share stock database from AKShare.
Run once to create src/data/a-stocks.json
Usage: python3 generate_stocks.py
"""

import json
import sys
import os

def main():
    try:
        import akshare as ak
    except ImportError:
        print("AKShare not installed. Run: pip3 install akshare --break-system-packages")
        sys.exit(1)

    print("Fetching A-share stock list from AKShare...")

    try:
        # Get all A-share stocks
        df = ak.stock_zh_a_spot_em()
        print(f"Got {len(df)} stocks from AKShare")

        stocks = []
        for _, row in df.iterrows():
            code = str(row["代码"])
            name = str(row["名称"])
            # Skip B-shares and indices
            if code.startswith("9") or len(code) != 6:
                continue

            market = "SSE" if code.startswith("6") else "SZSE"
            stocks.append({
                "symbol": code,
                "name": name,
                "market": market,
                "currency": "CNY",
            })

        # Write to JSON
        out_dir = os.path.join(os.path.dirname(__file__), "..", "src", "data")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "a-stocks.json")

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(stocks, f, ensure_ascii=False)

        print(f"✅ Written {len(stocks)} stocks to {out_path}")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
