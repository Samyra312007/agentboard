import { describe, expect, it } from "vitest";
import { evaluateExpression, ExpressionError } from "../math";

describe("evaluateExpression", () => {
  it("evaluates basic arithmetic", () => {
    expect(evaluateExpression("2 + 3")).toBe(5);
    expect(evaluateExpression("10 - 4")).toBe(6);
    expect(evaluateExpression("6 * 7")).toBe(42);
    expect(evaluateExpression("10 / 4")).toBe(2.5);
    expect(evaluateExpression("7 % 3")).toBe(1);
  });

  it("respects operator precedence and parentheses", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("2 + 3 * 4 ^ 2")).toBe(50);
    expect(evaluateExpression("100 - 20 - 30")).toBe(50);
  });

  it("handles unary minus and exponentiation", () => {
    expect(evaluateExpression("-5 + 3")).toBe(-2);
    expect(evaluateExpression("2 * -3")).toBe(-6);
    expect(evaluateExpression("2 ^ 10")).toBe(1024);
    expect(evaluateExpression("-(4 + 2)")).toBe(-6);
  });

  it("handles decimals and whitespace", () => {
    expect(evaluateExpression("1.5 + 2.5")).toBe(4);
    expect(evaluateExpression("  2 + 2  ")).toBe(4);
  });

  it("rejects division by zero", () => {
    expect(() => evaluateExpression("1 / 0")).toThrow(ExpressionError);
    expect(() => evaluateExpression("1 % 0")).toThrow(ExpressionError);
  });

  it("rejects malformed input", () => {
    expect(() => evaluateExpression("1.2.3")).toThrow(ExpressionError);
    expect(() => evaluateExpression("a + 1")).toThrow(ExpressionError);
    expect(() => evaluateExpression("2 +")).toThrow(ExpressionError);
    expect(() => evaluateExpression("2 3")).toThrow(ExpressionError);
    expect(() => evaluateExpression("(")).toThrow(ExpressionError);
    expect(() => evaluateExpression("")).toThrow(ExpressionError);
    expect(() => evaluateExpression("   ")).toThrow(ExpressionError);
  });

  it("enforces hard limits on expression size", () => {
    const longExpression = Array.from({ length: 60 }, () => "1").join("+");
    expect(() => evaluateExpression(longExpression)).toThrow(/too many tokens/);

    const manyOperands = Array.from({ length: 33 }, () => "1").join("+");
    expect(() => evaluateExpression(manyOperands)).toThrow(/too many operands/);

    expect(() => evaluateExpression("1+".repeat(101) + "1")).toThrow(/characters/);
  });

  it("never evaluates non-numeric constructs", () => {
    expect(() => evaluateExpression("process.exit()")).toThrow(ExpressionError);
    expect(() => evaluateExpression("globalThis")).toThrow(ExpressionError);
    expect(() => evaluateExpression("1;2")).toThrow(ExpressionError);
  });
});