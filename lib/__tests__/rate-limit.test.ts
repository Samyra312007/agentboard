import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "../rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max requests within the window", () => {
    expect(rateLimit("key-a", 2, 1000).allowed).toBe(true);
    expect(rateLimit("key-a", 2, 1000).allowed).toBe(true);
    expect(rateLimit("key-a", 2, 1000).allowed).toBe(false);
  });

  it("reports a retry-after when blocked", () => {
    rateLimit("key-b", 1, 60_000);
    const result = rateLimit("key-b", 1, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("resets after the window elapses", () => {
    rateLimit("key-c", 1, 1000);
    expect(rateLimit("key-c", 1, 1000).allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit("key-c", 1, 1000).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    rateLimit("key-d", 1, 1000);
    expect(rateLimit("key-d", 1, 1000).allowed).toBe(false);
    expect(rateLimit("key-e", 1, 1000).allowed).toBe(true);
  });
});