#!/bin/bash
cd "/Users/mac/Documents/Claude/Projects/AI链/quantumstock" || exit 1
set -a
source <(grep -E '^(DATABASE_URL|DB_PASSWORD)=' .env.local)
set +a
exec ./node_modules/.bin/tsx scripts/kline-ingest.ts --resume --delay-ms=250
