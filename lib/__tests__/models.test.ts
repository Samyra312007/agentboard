import { describe, expect, it } from "vitest";
import {
  estimateCost,
  getModel,
  isKnownModel,
  MODEL_IDS,
  MODEL_REGISTRY,
} from "../models";

describe("model registry", () => {
  it("exposes all known models", () => {
    expect(MODEL_IDS.length).toBeGreaterThan(0);
    for (const id of MODEL_IDS) {
      expect(isKnownModel(id)).toBe(true);
      expect(getModel(id)).toBeDefined();
    }
  });

  it("rejects unknown models", () => {
    expect(isKnownModel("not-a-model")).toBe(false);
    expect(getModel("not-a-model")).toBeUndefined();
  });

  it("defines pricing for every model", () => {
    for (const model of Object.values(MODEL_REGISTRY)) {
      expect(model.costPer1MPrompt).toBeGreaterThanOrEqual(0);
      expect(model.costPer1MCompletion).toBeGreaterThanOrEqual(0);
      expect(["openai", "groq", "nvidia"]).toContain(model.provider);
    }
  });
});

describe("estimateCost", () => {
  it("computes prompt and completion costs", () => {
    expect(estimateCost("gpt-4o", 1_000_000, 0)).toBeCloseTo(2.5);
    expect(estimateCost("gpt-4o", 0, 1_000_000)).toBeCloseTo(10);
    expect(estimateCost("gpt-4o", 1_000_000, 1_000_000)).toBeCloseTo(12.5);
  });

  it("returns zero for unknown models", () => {
    expect(estimateCost("bogus", 1_000_000, 1_000_000)).toBe(0);
  });

  it("returns zero for zero tokens", () => {
    expect(estimateCost("llama-3.3-70b-versatile", 0, 0)).toBe(0);
  });
});