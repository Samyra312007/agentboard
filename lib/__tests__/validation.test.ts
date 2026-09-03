import { describe, expect, it } from "vitest";
import {
  parsePagination,
  validateCreateRun,
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