/**
 * AI Analysis Report History — localStorage persistence.
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

export function getReportHistory(): ReportHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list;
  } catch {
    return [];
  }
}

export function saveReport(report: ReportHistoryItem): void {
  try {
    const list = getReportHistory();
    // Remove duplicate (same symbol + same time)
    const idx = list.findIndex(r => r.id === report.id);
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(report);
    // Keep max MAX_HISTORY items
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {}
}

export function deleteReport(id: string): void {
  try {
    const list = getReportHistory().filter(r => r.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {}
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}
