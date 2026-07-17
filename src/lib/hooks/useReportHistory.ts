"use client";

import { useSyncExternalStore } from "react";
import {
  getReportHistory,
  subscribeReportHistory,
  type ReportHistoryItem,
} from "@/lib/storage/report-history";

const SERVER_SNAPSHOT: ReportHistoryItem[] = [];

/**
 * useReportHistory — reactive view over the localStorage-backed AI analysis
 * report history. Updates automatically on save/delete/clear, SSR-safe.
 */
export function useReportHistory(): ReportHistoryItem[] {
  return useSyncExternalStore(
    subscribeReportHistory,
    getReportHistory,
    () => SERVER_SNAPSHOT
  );
}
