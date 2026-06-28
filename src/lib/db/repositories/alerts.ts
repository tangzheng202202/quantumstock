/**
 * Alert Repository — database-backed with localStorage fallback.
 *
 * NOTE: The Prisma Alert model uses `type`, `condition`, `value`, `params` (Json),
 * `indicator` fields. This repository adapts the simple AlertRecord interface
 * to the database schema.
 */

import { prisma, hasDatabase } from "../prisma";
import { getAnonymousUserId } from "./watchlist";

export interface AlertRecord {
  id: string;
  symbol: string;
  name: string;
  type: "price_above" | "price_below" | "change_up" | "change_down";
  value: number;
  isEnabled: boolean;
  isTriggered: boolean;
  lastPrice?: number;
  lastChecked?: string;
  triggeredAt?: string;
  createdAt: string;
}

const LOCAL_KEY = "quantumstock:alerts:rules";

/** Get all alerts. */
export async function getAlerts(): Promise<AlertRecord[]> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return getLocalAlerts();
  }

  try {
    const userId = getAnonymousUserId();
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    const alerts = await prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return alerts.map((a: any) => {
      const params = a.params as any;
      return {
        id: a.id,
        symbol: params?.symbol ?? "",
        name: params?.name ?? "",
        type: a.type as AlertRecord["type"],
        value: a.value ?? 0,
        isEnabled: a.isEnabled,
        isTriggered: a.isTriggered,
        triggeredAt: a.triggeredAt?.toISOString(),
        createdAt: a.createdAt.toISOString(),
      };
    });
  } catch (e) {
    console.warn("[alerts] DB failed, falling back to localStorage:", e);
    return getLocalAlerts();
  }
}

/** Create a new alert. */
export async function createAlert(data: Omit<AlertRecord, "id" | "createdAt">): Promise<AlertRecord> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return createLocalAlert(data);
  }

  try {
    const userId = getAnonymousUserId();
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    const alert = await prisma.alert.create({
      data: {
        userId,
        type: data.type,
        condition: "above", // mapped from type
        value: data.value,
        params: { symbol: data.symbol, name: data.name } as any,
        isEnabled: data.isEnabled,
        isTriggered: false,
      },
    });

    return {
      ...data,
      id: alert.id,
      createdAt: alert.createdAt.toISOString(),
    };
  } catch (e) {
    console.warn("[alerts] DB create failed, falling back to localStorage:", e);
    return createLocalAlert(data);
  }
}

/** Update an alert. */
export async function updateAlert(id: string, updates: Partial<AlertRecord>): Promise<void> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return updateLocalAlert(id, updates);
  }

  try {
    await prisma.alert.update({
      where: { id },
      data: {
        isEnabled: updates.isEnabled,
        isTriggered: updates.isTriggered,
        triggeredAt: updates.triggeredAt ? new Date(updates.triggeredAt) : undefined,
      },
    });
  } catch (e) {
    console.warn("[alerts] DB update failed, falling back to localStorage:", e);
    return updateLocalAlert(id, updates);
  }
}

/** Delete an alert. */
export async function deleteAlert(id: string): Promise<void> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return deleteLocalAlert(id);
  }

  try {
    await prisma.alert.delete({ where: { id } });
  } catch (e) {
    console.warn("[alerts] DB delete failed, falling back to localStorage:", e);
    return deleteLocalAlert(id);
  }
}

// ===== localStorage fallback =====

function getLocalAlerts(): AlertRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAlerts(alerts: AlertRecord[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(alerts));
  } catch {}
}

function createLocalAlert(data: Omit<AlertRecord, "id" | "createdAt">): AlertRecord {
  const alert: AlertRecord = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const alerts = getLocalAlerts();
  alerts.unshift(alert);
  saveLocalAlerts(alerts);
  return alert;
}

function updateLocalAlert(id: string, updates: Partial<AlertRecord>): void {
  const alerts = getLocalAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx >= 0) {
    alerts[idx] = { ...alerts[idx], ...updates };
    saveLocalAlerts(alerts);
  }
}

function deleteLocalAlert(id: string): void {
  const alerts = getLocalAlerts().filter((a) => a.id !== id);
  saveLocalAlerts(alerts);
}
