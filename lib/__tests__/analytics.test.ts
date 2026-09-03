import { describe, expect, it } from "vitest";
import type { Run } from "@/types";
import { computeStats, runsToCsv } from "../analytics";
import { estimateCostBlended } from "../models";

function makeRun(overrides: Partial<Run>): Run {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    user_id: "user-1",
    task: "task",
    model: "gpt-4o",
    max_steps: 5,
    status: "completed",
    total_steps: 3,
    total_tokens: 1_000_000,
    total_latency_ms: 10_000,
    failure_count: 0,
    final_output: null,
    error_message: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeStats", () => {
  it("computes summary metrics", () => {
    const stats = computeStats([
      makeRun({ status: "completed" }),
      makeRun({ status: "completed" }),
      makeRun({ status: "failed" }),
      makeRun({ status: "running" }),
    ]);

    expect(stats.total_runs).toBe(4);
    expect(stats.completed_runs).toBe(2);
    expect(stats.failed_runs).toBe(1);
    expect(stats.running_runs).toBe(1);
    expect(stats.success_rate).toBeCloseTo(66.67, 1);
    expect(stats.total_tokens).toBe(4_000_000);
    expect(stats.avg_latency_ms).toBe(10_000);
  });

  it("estimates cost using blended pricing", () => {
    const stats = computeStats([makeRun({ model: "gpt-4o" })]);
    const expected = estimateCostBlended("gpt-4o", 1_000_000);
    expect(stats.estimated_cost_usd).toBeCloseTo(expected);
    expect(stats.cost_per_model[0]).toMatchObject({
      model: "gpt-4o",
      runs: 1,
    });
  });

  it("returns zero success rate when there are no finished runs", () => {
    const stats = computeStats([
      makeRun({ status: "running", total_latency_ms: 0 }),
    ]);
    expect(stats.success_rate).toBe(0);
    expect(stats.avg_latency_ms).toBe(0);
  });

  it("buckets runs by day for the last 30 days", () => {
    const stats = computeStats([makeRun({ created_at: new Date().toISOString() })]);
    expect(stats.daily.length).toBe(30);
    const today = stats.daily[stats.daily.length - 1];
    expect(today.count).toBe(1);
    expect(today.tokens).toBe(1_000_000);
  });

  it("tracks failures by model", () => {
    const stats = computeStats([
      makeRun({ status: "failed", model: "gpt-4o" }),
      makeRun({ status: "failed", model: "gpt-4o" }),
      makeRun({ status: "completed", model: "llama-3.3-70b-versatile" }),
    ]);
    expect(stats.failures_by_model).toEqual([
      { model: "gpt-4o", failed_runs: 2 },
    ]);
  });
});

describe("runsToCsv", () => {
  it("emits a header row and one row per run", () => {
    const csv = runsToCsv([makeRun({ task: "Hello, world" })]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("id,created_at,completed_at");
    expect(lines.length).toBe(2);
    // Commas inside the task are escaped with quotes.
    expect(lines[1]).toContain('"Hello, world"');
  });

  it("escapes quotes and newlines", () => {
    const csv = runsToCsv([makeRun({ error_message: 'said "hi"\nnext line' })]);
    expect(csv).toContain('"said ""hi""\nnext line"');
  });

  it("returns only the header for an empty list", () => {
    const csv = runsToCsv([]);
    expect(csv.split("\n").length).toBe(1);
  });
});