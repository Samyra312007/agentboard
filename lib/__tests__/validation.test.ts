import { describe, expect, it } from "vitest";
import {
  parsePagination,
  validateApiKeyName,
  validateCreateRun,
  validateIngestRun,
  validateIngestStep,
  validateMaxSteps,
  validateModel,
  validateRunId,
  validateTask,
} from "../validation";

describe("validateTask", () => {
  it("accepts and trims valid tasks", () => {
    expect(validateTask("  hello world  ")).toEqual({ ok: true, value: "hello world" });
  });

  it("rejects non-strings and empty tasks", () => {
    expect(validateTask(123).ok).toBe(false);
    expect(validateTask("").ok).toBe(false);
    expect(validateTask("   ").ok).toBe(false);
  });

  it("enforces the length limit", () => {
    expect(validateTask("x".repeat(4000)).ok).toBe(true);
    expect(validateTask("x".repeat(4001)).ok).toBe(false);
  });
});

describe("validateModel", () => {
  it("accepts known models", () => {
    expect(validateModel("gpt-4o")).toEqual({ ok: true, value: "gpt-4o" });
  });

  it("rejects unknown models and non-strings", () => {
    expect(validateModel("not-a-model").ok).toBe(false);
    expect(validateModel(42).ok).toBe(false);
  });
});

describe("validateMaxSteps", () => {
  it("accepts integers in range", () => {
    expect(validateMaxSteps(1)).toEqual({ ok: true, value: 1 });
    expect(validateMaxSteps(50)).toEqual({ ok: true, value: 50 });
    expect(validateMaxSteps("7")).toEqual({ ok: true, value: 7 });
  });

  it("rejects out-of-range and fractional values", () => {
    expect(validateMaxSteps(0).ok).toBe(false);
    expect(validateMaxSteps(51).ok).toBe(false);
    expect(validateMaxSteps(2.5).ok).toBe(false);
  });
});

describe("validateRunId", () => {
  it("accepts valid UUIDs", () => {
    expect(validateRunId("123e4567-e89b-12d3-a456-426614174000").ok).toBe(true);
  });

  it("rejects invalid ids", () => {
    expect(validateRunId("not-a-uuid").ok).toBe(false);
    expect(validateRunId("123e4567-e89b-12d3-a456-42661417400").ok).toBe(false);
    expect(validateRunId(42).ok).toBe(false);
  });
});

describe("validateCreateRun", () => {
  it("validates a full payload with defaults", () => {
    const result = validateCreateRun({ task: "Do a thing" });
    expect(result).toEqual({
      ok: true,
      value: { task: "Do a thing", model: "llama-3.3-70b-versatile", maxSteps: 10 },
    });
  });

  it("accepts explicit model and maxSteps", () => {
    const result = validateCreateRun({ task: "x", model: "gpt-4o", maxSteps: 5 });
    expect(result).toEqual({ ok: true, value: { task: "x", model: "gpt-4o", maxSteps: 5 } });
  });

  it("rejects invalid payloads", () => {
    expect(validateCreateRun(null).ok).toBe(false);
    expect(validateCreateRun("task").ok).toBe(false);
    expect(validateCreateRun({}).ok).toBe(false);
    expect(validateCreateRun({ task: "", model: "gpt-4o", maxSteps: 5 }).ok).toBe(false);
    expect(validateCreateRun({ task: "x", model: "bogus", maxSteps: 5 }).ok).toBe(false);
    expect(validateCreateRun({ task: "x", maxSteps: 100 }).ok).toBe(false);
  });
});

describe("validateApiKeyName", () => {
  it("accepts trimmed names within the limit", () => {
    expect(validateApiKeyName("  Production agent ")).toEqual({
      ok: true,
      value: "Production agent",
    });
  });

  it("rejects empty and oversized names", () => {
    expect(validateApiKeyName("").ok).toBe(false);
    expect(validateApiKeyName("   ").ok).toBe(false);
    expect(validateApiKeyName("x".repeat(51)).ok).toBe(false);
    expect(validateApiKeyName(42).ok).toBe(false);
  });
});

describe("validateIngestRun", () => {
  it("accepts a minimal payload with defaults", () => {
    expect(validateIngestRun({ task: "Do a thing" })).toEqual({
      ok: true,
      value: { task: "Do a thing", model: "unknown", metadata: null },
    });
  });

  it("accepts explicit model and metadata", () => {
    const result = validateIngestRun({
      task: "x",
      model: "my-custom-model",
      metadata: { env: "prod" },
    });
    expect(result).toEqual({
      ok: true,
      value: { task: "x", model: "my-custom-model", metadata: { env: "prod" } },
    });
  });

  it("rejects invalid payloads", () => {
    expect(validateIngestRun(null).ok).toBe(false);
    expect(validateIngestRun({}).ok).toBe(false);
    expect(validateIngestRun({ task: "" }).ok).toBe(false);
  });
});

describe("validateIngestStep", () => {
  it("accepts a minimal step", () => {
    const result = validateIngestStep({ step_number: 1, type: "llm_call" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({
      step_number: 1,
      type: "llm_call",
      status: "running",
      latency_ms: null,
      tokens_used: null,
      created_at: null,
    });
  });

  it("accepts a full step with all fields", () => {
    const result = validateIngestStep({
      id: "123e4567-e89b-12d3-a456-426614174000",
      step_number: 3,
      type: "tool_call",
      status: "success",
      tool_name: "web_search",
      input: "{}",
      output: "{}",
      latency_ms: 120,
      tokens_used: 42,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: "success",
      latency_ms: 120,
      tokens_used: 42,
    });
  });

  it("rejects invalid steps", () => {
    expect(validateIngestStep({}).ok).toBe(false);
    expect(validateIngestStep({ step_number: 0, type: "x" }).ok).toBe(false);
    expect(validateIngestStep({ step_number: 1.5, type: "x" }).ok).toBe(false);
    expect(validateIngestStep({ step_number: 1, type: "" }).ok).toBe(false);
    expect(validateIngestStep({ step_number: 1, type: "x", status: "bogus" }).ok).toBe(false);
    expect(validateIngestStep({ step_number: 1, type: "x", latency_ms: -5 }).ok).toBe(false);
    expect(validateIngestStep({ step_number: 1, type: "x", tokens_used: -1 }).ok).toBe(false);
    expect(validateIngestStep({ step_number: 1, type: "x", created_at: "not-a-date" }).ok).toBe(false);
  });
});

describe("parsePagination", () => {
  it("applies defaults", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({
      limit: 50,
      offset: 0,
      status: undefined,
    });
  });

  it("parses valid params", () => {
    expect(parsePagination(new URLSearchParams("limit=10&offset=20&status=failed"))).toEqual({
      limit: 10,
      offset: 20,
      status: "failed",
    });
  });

  it("clamps invalid values", () => {
    expect(parsePagination(new URLSearchParams("limit=999")).limit).toBe(100);
    expect(parsePagination(new URLSearchParams("limit=-3")).limit).toBe(1);
    expect(parsePagination(new URLSearchParams("limit=abc")).limit).toBe(50);
    expect(parsePagination(new URLSearchParams("offset=-5")).offset).toBe(0);
    expect(parsePagination(new URLSearchParams("status=bogus")).status).toBe(undefined);
  });
});