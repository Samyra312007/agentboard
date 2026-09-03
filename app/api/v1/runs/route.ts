import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createRun } from "@/lib/db";
import { getBearerToken, verifyApiKey } from "@/lib/api-keys";
import { validateIngestRun } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

// Abuse protection: max 60 ingested runs per minute per API key.
const INGEST_RATE_LIMIT = { max: 60, windowMs: 60_000 };

/**
 * POST /api/v1/runs
 * Creates a new run on behalf of the API-key owner.
 * Auth: Authorization: Bearer <api_key>
 */
export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const userId = await verifyApiKey(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const limiter = rateLimit(`ingest:${userId}`, INGEST_RATE_LIMIT.max, INGEST_RATE_LIMIT.windowMs);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${limiter.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const validation = validateIngestRun(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { task, model } = validation.value;

  try {
    const run = await createRun(
      {
        id: uuidv4(),
        task,
        model,
        max_steps: 0,
        final_output: null,
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      },
      userId
    );

    return NextResponse.json({ run_id: run.id, status: "running" }, { status: 201 });
  } catch (error) {
    console.error("Error creating ingested run:", error);
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }
}