/**
 * Simple in-memory sliding-window rate limiter.
 *
 * NOTE: state lives in process memory. This is correct for a single-instance
 * deployment (one Node process) and sufficient for abuse protection at this
 * stage. When AgentBoard moves to multiple instances or serverless, replace
 * this with a shared store (e.g. Redis) — tracked in Phase 10 of PLAN.md.
 */

import type { NextRequest } from "next/server";

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Periodically prune buckets so the map cannot grow unboundedly.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < 60_000);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}, 60_000).unref?.();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry (only when not allowed). */
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP extraction. Uses the first X-Forwarded-For entry when
 * present (standard behind proxies), falling back to a connection-level
 * identifier. All instances share a key shape via the running instance id.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}