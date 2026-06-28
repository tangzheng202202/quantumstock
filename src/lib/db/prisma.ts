import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client singleton.
 *
 * Usage pattern:
 * - If DATABASE_URL is configured: use real database
 * - Otherwise: throw on import (callers should fall back to localStorage)
 *
 * In development, Next.js HMR can create multiple PrismaClient instances.
 * The global cache prevents connection pool exhaustion.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  (process.env.DATABASE_URL
    ? new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
      })
    : null);

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}

/** Whether the database is available (DATABASE_URL set + client initialized). */
export const hasDatabase = prisma !== null;
