/**
 * AI Analysis Report History — localStorage persistence with subscription
 * support so React can consume it via useSyncExternalStore.
 */

const HISTORY_KEY = "quantumstock:ai-reports";
const MAX_HISTORY = 50;

export interface ReportHistoryItem {
  id: string;
  symbol: string;
  name: string;
  market: string;
  models: string[];
  skills: string[];
  content: string;
  createdAt: string;
}

// --- Snapshot cache -------------------------------------------------------
// useSyncExternalStore requires getSnapshot to return a stable reference
// until the underlying data actually changes, so we cache by raw string.
let cachedRaw: string | null | undefined;
let cachedList: ReportHistoryItem[] = [];

function parse(raw: string | null): ReportHistoryItem[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function getReportHistory(): ReportHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw === cachedRaw) return cachedList;
    cachedRaw = raw;
    cachedList = parse(raw);
    return cachedList;
  } catch {
    // SSR / storage unavailable
    return cachedList;
  }
}

// --- Subscription ---------------------------------------------------------
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to history changes; returns an unsubscribe function. */
export function subscribeReportHistory(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function persist(list: ReportHistoryItem[]): void {
  const raw = JSON.stringify(list);
  localStorage.setItem(HISTORY_KEY, raw);
  cachedRaw = raw;
  cachedList = list;
  emitChange();
}

// --- Mutations ------------------------------------------------------------
export function saveReport(report: ReportHistoryItem): void {
  try {
    // filter() creates a fresh array so the cached snapshot is never mutated.
    const list = getReportHistory().filter((r) => r.id !== report.id);
    list.unshift(report);
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    persist(list);
  } catch {}
}

export function deleteReport(id: string): void {
  try {
    persist(getReportHistory().filter((r) => r.id !== id));
  } catch {}
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    cachedRaw = null;
    cachedList = [];
    emitChange();
  } catch {}
}
