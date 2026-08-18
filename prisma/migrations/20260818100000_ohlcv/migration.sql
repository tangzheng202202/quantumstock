-- OHLCV K-line persistence (Phase 2).
-- Design note: at ~5k symbols × 250 bars/yr ≈ 1.25M rows/yr, PostgreSQL with the
-- (symbol, interval, date) unique key + descending index is sufficient; ClickHouse
-- deferred until row volume justifies it (10M+).

CREATE TABLE "OhlcvBar" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OhlcvBar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OhlcvBar_symbol_interval_date_key" ON "OhlcvBar"("symbol", "interval", "date");

CREATE INDEX "OhlcvBar_symbol_interval_date_idx" ON "OhlcvBar"("symbol", "interval", "date" DESC);
