import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getRunById, createStep, updateStep, getStepsByRunId } from "@/lib/db";
import type { Step } from "@/types";
import { getBearerToken, verifyApiKey } from "@/lib/api-keys";
import { validateRunId, validateIngestStep } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

// Abuse protection: max 600 ingested steps per minute per API key.
const STEP_RATE_LIMIT = { max: 600, windowMs: 60_000 };

/**
 * POST /api/v1/runs/:id/steps
 * Reports a step for a run owned by the API key.
 * Auth: Authorization: Bearer <api_key>
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const userId = await verifyApiKey(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const { id } = await context.params;
  const runId = validateRunId(id);
  if (!runId.ok) {
    return NextResponse.json({ error: runId.error }, { status: 400 });
  }

  const limiter = rateLimit(`ingest-steps:${userId}`, STEP_RATE_LIMIT.max, STEP_RATE_LIMIT.windowMs);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${limiter.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfterSeconds) } }
    );
  }

  // Ownership: the run must exist and belong to the key's user.
  const run = await getRunById(runId.value, userId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const validation = validateIngestStep(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const step = validation.value;
  const stepId = step.id ?? uuidv4();

  try {
    if (step.id) {
      // Upsert: update the step if it already exists for this run.
      const existingSteps = await getStepsByRunId(runId.value);
      const existing = existingSteps.find((s) => s.id === step.id);
      if (existing) {
        await updateStep(step.id, {
          step_number: step.step_number,
          type: step.type as Step["type"],
          status: step.status,
          tool_name: step.tool_name,
          input: step.input ?? "",
          output: step.output,
          error_message: step.error_message,
          latency_ms: step.latency_ms,
          tokens_used: step.tokens_used,
          completed_at: step.status === "running" ? null : new Date().toISOString(),
        });
        return NextResponse.json({ ok: true, id: step.id });
      }
    }

    await createStep({
      id: stepId,
      run_id: runId.value,
      step_number: step.step_number,
      type: step.type as Step["type"],
      tool_name: step.tool_name,
      input: step.input ?? "",
      output: step.output,
      error_message: step.error_message,
      latency_ms: step.latency_ms,
      tokens_used: step.tokens_used,
      created_at: step.created_at ?? new Date().toISOString(),
      completed_at: step.status === "running" ? null : new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, id: stepId }, { status: 201 });
  } catch (error) {
    console.error("Error ingesting step:", error);
    return NextResponse.json({ error: "Failed to create step" }, { status: 500 });
  }
}