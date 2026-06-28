/**
 * Database Setup Guide — QuantumStock Prisma Integration (P1-1)
 *
 * ## Quick Start (PostgreSQL via Docker)
 *
 * ```bash
 * # 1. Start PostgreSQL
 * docker run -d --name quantumstock-db \
 *   -e POSTGRES_USER=quantum \
 *   -e POSTGRES_PASSWORD=secret \
 *   -e POSTGRES_DB=quantumstock \
 *   -p 5432:5432 \
 *   postgres:16-alpine
 *
 * # 2. Configure .env.local
 * echo 'DATABASE_URL="postgresql://quantum:secret@localhost:5432/quantumstock?schema=public"' >> .env.local
 *
 * # 3. Generate Prisma Client + Push schema
 * npm run db:generate
 * npm run db:push
 *
 * # 4. Restart dev server
 * npm run dev
 * ```
 *
 * ## Behavior Without Database
 *
 * If `DATABASE_URL` is not set, the app automatically falls back to
 * localStorage for Watchlist/Alert persistence. This preserves the
 * existing local-only experience.
 *
 * ## Migrated Models
 *
 * | Model | Status | Repository |
 * |-------|--------|------------|
 * | User | ✅ Auto-created (anonymous) | lib/db/repositories/watchlist.ts |
 * | Watchlist | ✅ Default watchlist per user | lib/db/repositories/watchlist.ts |
 * | WatchlistItem | ✅ CRUD operations | lib/db/repositories/watchlist.ts |
 * | Alert | ✅ CRUD operations | lib/db/repositories/alerts.ts |
 * | Stock | ✅ Auto-upserted on add | lib/db/repositories/watchlist.ts |
 *
 * ## Remaining Models (Future Work)
 *
 * - Portfolio / Position / PortfolioHistory
 * - AnalysisReport
 * - Strategy / BacktestResult
 * - Quote (historical price cache)
 * - Financial
 * - ApiKey (server-side encrypted storage)
 */

export {};
