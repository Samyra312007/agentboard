import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createRun } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { validateCreateRun } from "@/lib/validation";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Abuse protection: max 10 agent runs per minute per client IP.
const RUN_RATE_LIMIT = { max: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const validation = validateCreateRun(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const limiter = rateLimit(
    `agent-run:${getClientIp(request)}`,
    RUN_RATE_LIMIT.max,
    RUN_RATE_LIMIT.windowMs
  );
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${limiter.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfterSeconds) } }
    );
  }

  const { task, model, maxSteps } = validation.value;

  try {
    const run = await createRun(
      {
        id: uuidv4(),
        task,
        model,
        max_steps: maxSteps,
        final_output: null,
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      },
      user.id
    );

    return NextResponse.json({
      run_id: run.id,
      status: "started",
    });
  } catch (error) {
    console.error("Error creating run:", error);
    return NextResponse.json(
      { error: "Failed to create run" },
      { status: 500 }
    );
  }
}