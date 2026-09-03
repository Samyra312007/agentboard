import { describe, expect, it, vi } from "vitest";

// lib/alerts.ts guards itself with `server-only`, which throws outside
// React Server Component resolution — neutralize it for unit tests.
vi.mock("server-only", () => ({}));

import {
  extractMetricValue,
  isInCooldown,
  ruleMatches,
} from "../alerts";
import { computeStats } from "../analytics";
import type { Run } from "@/types";

function makeRun(overrides: Partial<Run>): Run {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    user_id: "user-1",
    task: "task",
    model: "gpt-4o",
    max_steps: 5,
    status: "completed",
    total_steps: 3,
    total_tokens: 2_000_000,
    total_latency_ms: 5_000,
    failure_count: 0,
    final_output: null,
    error_message: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("extractMetricValue", () => {
  it("extracts failure rate as 100 - success rate", () => {
    const stats = computeStats([makeRun({ status: "failed" }), makeRun({})]);
    expect(extractMetricValue("failure_rate", stats)).toBeCloseTo(50);
  });

  it("extracts average latency and estimated cost", () => {
    const stats = computeStats([makeRun({ status: "completed", total_latency_ms: 4_000 })]);
    expect(extractMetricValue("avg_latency", stats)).toBe(4_000);
    expect(extractMetricValue("cost", stats)).toBeGreaterThan(0);
  });
});

describe("ruleMatches", () => {
  it("compares with gt and gte", () => {
    expect(ruleMatches("gt", 51, 50)).toBe(true);
    expect(ruleMatches("gt", 50, 50)).toBe(false);
    expect(ruleMatches("gte", 50, 50)).toBe(true);
    expect(ruleMatches("gte", 49, 50)).toBe(false);
  });
});

describe("isInCooldown", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");

  it("returns false when never fired", () => {
    expect(isInCooldown(null, 60, now)).toBe(false);
  });

  it("returns true within the window and false after it", () => {
    const fired = new Date(now - 30 * 60_000).toISOString();
    expect(isInCooldown(fired, 60, now)).toBe(true);

    const old = new Date(now - 90 * 60_000).toISOString();
    expect(isInCooldown(old, 60, now)).toBe(false);
  });
});