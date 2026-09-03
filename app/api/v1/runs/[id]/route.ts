import { NextRequest, NextResponse } from "next/server";
import { getRunById, updateRun } from "@/lib/db";
import { getBearerToken, verifyApiKey } from "@/lib/api-keys";
import { runAlertEvaluation } from "@/lib/alerts";
import { validateRunId } from "@/lib/validation";

/**
 * PATCH /api/v1/runs/:id
 * Updates a run (e.g. mark it completed or failed).
 * Auth: Authorization: Bearer <api_key>
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const status = record.status;
  if (status !== "completed" && status !== "failed") {
    return NextResponse.json(
      { error: 'status must be "completed" or "failed"' },
      { status: 400 }
    );
  }
  const finalOutput = typeof record.final_output === "string" ? record.final_output.slice(0, 200_000) : null;
  const errorMessage = typeof record.error_message === "string" ? record.error_message.slice(0, 20_000) : null;

  const existing = await getRunById(runId.value, userId);
  if (!existing) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  await updateRun(runId.value, userId, {
    status,
    final_output: finalOutput,
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  });

  // Evaluate alert rules in the background when a run completes/fails.
  void runAlertEvaluation(userId, null);

  return NextResponse.json({ ok: true });
}