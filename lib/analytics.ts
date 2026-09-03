import type { Run } from "@/types";
import { estimateCostBlended } from "./models";

/**
 * Pure analytics aggregation. Kept free of I/O so it is unit-testable;
 * route handlers feed it runs fetched from the DB.
 */

export interface DailyPoint {
  date: string;
  count: number;
  tokens: number;
}

export interface RunStats {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  running_runs: number;
  /** Completed ÷ (completed + failed), 0–100. */
  success_rate: number;
  /** Average total latency over runs that recorded any latency. */
  avg_latency_ms: number;
  total_tokens: number;
  estimated_cost_usd: number;
  /** Last 30 days, oldest first (UTC dates). */
  daily: DailyPoint[];
  cost_per_model: { model: string; runs: number; cost_usd: number }[];
  failures_by_model: { model: string; failed_runs: number }[];
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function last30Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function computeStats(runs: Run[]): RunStats {
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const runningRuns = runs.filter((r) => r.status === "running").length;

  const successRate =
    completedRuns + failedRuns > 0
      ? (completedRuns / (completedRuns + failedRuns)) * 100
      : 0;

  const latencyValues = runs
    .map((r) => r.total_latency_ms)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgLatencyMs =
    latencyValues.length > 0
      ? latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length
      : 0;

  const totalTokens = runs.reduce((acc, r) => acc + (r.total_tokens || 0), 0);
  const estimatedCostUsd = runs.reduce(
    (acc, r) => acc + estimateCostBlended(r.model, r.total_tokens || 0),
    0
  );

  // Daily buckets for the last 30 days.
  const days = last30Days();
  const dayMap = new Map<string, { count: number; tokens: number }>();
  for (const day of days) dayMap.set(day, { count: 0, tokens: 0 });
  for (const run of runs) {
    const key = toDateKey(run.created_at);
    const bucket = dayMap.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.tokens += run.total_tokens || 0;
    }
  }
  const daily: DailyPoint[] = days.map((date) => {
    const bucket = dayMap.get(date)!;
    return { date, count: bucket.count, tokens: bucket.tokens };
  });

  // Cost and failures per model.
  const costByModel = new Map<string, { runs: number; cost: number }>();
  const failuresByModel = new Map<string, number>();
  for (const run of runs) {
    const entry = costByModel.get(run.model) ?? { runs: 0, cost: 0 };
    entry.runs += 1;
    entry.cost += estimateCostBlended(run.model, run.total_tokens || 0);
    costByModel.set(run.model, entry);

    if (run.status === "failed") {
      failuresByModel.set(run.model, (failuresByModel.get(run.model) ?? 0) + 1);
    }
  }

  const costPerModel = [...costByModel.entries()]
    .map(([model, v]) => ({ model, runs: v.runs, cost_usd: v.cost }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const failuresByModelList = [...failuresByModel.entries()]
    .map(([model, failedRuns]) => ({ model, failed_runs: failedRuns }))
    .sort((a, b) => b.failed_runs - a.failed_runs);

  return {
    total_runs: totalRuns,
    completed_runs: completedRuns,
    failed_runs: failedRuns,
    running_runs: runningRuns,
    success_rate: successRate,
    avg_latency_ms: avgLatencyMs,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCostUsd,
    daily,
    cost_per_model: costPerModel,
    failures_by_model: failuresByModelList,
  };
}

/** Formats a run history row as CSV (RFC 4180-ish escaping). */
export function runsToCsv(runs: Run[]): string {
  const header = [
    "id",
    "created_at",
    "completed_at",
    "status",
    "model",
    "total_steps",
    "total_tokens",
    "total_latency_ms",
    "failure_count",
    "task",
    "error_message",
    "final_output",
  ];

  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const rows = runs.map((r) =>
    [
      r.id,
      r.created_at,
      r.completed_at,
      r.status,
      r.model,
      r.total_steps,
      r.total_tokens,
      r.total_latency_ms,
      r.failure_count,
      r.task,
      r.error_message,
      r.final_output,
    ]
      .map(escape)
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}