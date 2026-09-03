/**
 * API input validation helpers.
 *
 * Every public API route validates its input through these helpers and
 * returns a consistent 400 error envelope on failure.
 */

import { isKnownModel } from "./models";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateTask(task: unknown): ValidationResult<string> {
  if (typeof task !== "string") {
    return { ok: false, error: "task must be a string" };
  }
  const trimmed = task.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "task must not be empty" };
  }
  if (trimmed.length > 4000) {
    return { ok: false, error: "task must be at most 4000 characters" };
  }
  return { ok: true, value: trimmed };
}

export function validateModel(model: unknown): ValidationResult<string> {
  if (typeof model !== "string" || !isKnownModel(model)) {
    return { ok: false, error: "model must be one of the supported model ids" };
  }
  return { ok: true, value: model };
}

export function validateMaxSteps(maxSteps: unknown): ValidationResult<number> {
  const value = typeof maxSteps === "number" ? maxSteps : Number(maxSteps);
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    return { ok: false, error: "maxSteps must be an integer between 1 and 50" };
  }
  return { ok: true, value };
}

export function validateRunId(runId: unknown): ValidationResult<string> {
  if (typeof runId !== "string" || !UUID_RE.test(runId)) {
    return { ok: false, error: "run_id must be a valid UUID" };
  }
  return { ok: true, value: runId };
}

export interface CreateRunInput {
  task: string;
  model: string;
  maxSteps: number;
}

export function validateCreateRun(body: unknown): ValidationResult<CreateRunInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const record = body as Record<string, unknown>;

  const task = validateTask(record.task);
  if (!task.ok) return task;

  const model = validateModel(record.model ?? "llama-3.3-70b-versatile");
  if (!model.ok) return model;

  const maxSteps = validateMaxSteps(record.maxSteps ?? 10);
  if (!maxSteps.ok) return maxSteps;

  return { ok: true, value: { task: task.value, model: model.value, maxSteps: maxSteps.value } };
}

export interface PaginationInput {
  limit: number;
  offset: number;
  status: "all" | "completed" | "failed" | "running" | undefined;
}

// ---------------------------------------------------------------------------
// Public ingestion API (Phase 5)
// ---------------------------------------------------------------------------

export function validateApiKeyName(name: unknown): ValidationResult<string> {
  if (typeof name !== "string") {
    return { ok: false, error: "name must be a string" };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "name must not be empty" };
  }
  if (trimmed.length > 50) {
    return { ok: false, error: "name must be at most 50 characters" };
  }
  return { ok: true, value: trimmed };
}

export interface IngestRunInput {
  task: string;
  model: string;
  metadata: Record<string, unknown> | null;
}

export function validateIngestRun(body: unknown): ValidationResult<IngestRunInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const record = body as Record<string, unknown>;

  const task = validateTask(record.task);
  if (!task.ok) return task;

  const model =
    typeof record.model === "string" && record.model.trim().length > 0
      ? record.model.trim().slice(0, 200)
      : "unknown";

  const metadata =
    typeof record.metadata === "object" && record.metadata !== null
      ? (record.metadata as Record<string, unknown>)
      : null;

  return { ok: true, value: { task: task.value, model, metadata } };
}

export interface IngestStepInput {
  id: string | null;
  step_number: number;
  type: string;
  status: "running" | "success" | "error";
  tool_name: string | null;
  input: string | null;
  output: string | null;
  error_message: string | null;
  latency_ms: number | null;
  tokens_used: number | null;
  created_at: string | null;
}

const MAX_FIELD_LENGTH = 200_000;
const MAX_ERROR_LENGTH = 20_000;

function optionalString(
  value: unknown,
  field: string,
  maxLength: number
): ValidationResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  if (value.length > maxLength) {
    return { ok: false, error: `${field} must be at most ${maxLength} characters` };
  }
  return { ok: true, value };
}

export function validateIngestStep(body: unknown): ValidationResult<IngestStepInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const record = body as Record<string, unknown>;

  if (record.id !== undefined && record.id !== null) {
    const id = validateRunId(record.id);
    if (!id.ok) return { ok: false, error: "id must be a valid UUID" };
  }

  const stepNumber = Number(record.step_number);
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 10_000) {
    return { ok: false, error: "step_number must be an integer between 1 and 10000" };
  }

  if (typeof record.type !== "string" || record.type.trim().length === 0) {
    return { ok: false, error: "type must be a non-empty string" };
  }
  const type = record.type.trim().slice(0, 50);

  const status = (record.status ?? "running") as "running" | "success" | "error";
  if (status !== "running" && status !== "success" && status !== "error") {
    return { ok: false, error: 'status must be "running", "success" or "error"' };
  }

  const toolName = optionalString(record.tool_name, "tool_name", 100);
  if (!toolName.ok) return toolName;
  const input = optionalString(record.input, "input", MAX_FIELD_LENGTH);
  if (!input.ok) return input;
  const output = optionalString(record.output, "output", MAX_FIELD_LENGTH);
  if (!output.ok) return output;
  const errorMessage = optionalString(record.error_message, "error_message", MAX_ERROR_LENGTH);
  if (!errorMessage.ok) return errorMessage;

  let latency: number | null = null;
  if (record.latency_ms !== undefined && record.latency_ms !== null) {
    latency = Number(record.latency_ms);
    if (!Number.isInteger(latency) || latency < 0) {
      return { ok: false, error: "latency_ms must be a non-negative integer" };
    }
  }

  let tokens: number | null = null;
  if (record.tokens_used !== undefined && record.tokens_used !== null) {
    tokens = Number(record.tokens_used);
    if (!Number.isInteger(tokens) || tokens < 0) {
      return { ok: false, error: "tokens_used must be a non-negative integer" };
    }
  }

  let createdAt: string | null = null;
  if (record.created_at !== undefined && record.created_at !== null) {
    if (typeof record.created_at !== "string" || Number.isNaN(Date.parse(record.created_at))) {
      return { ok: false, error: "created_at must be a valid ISO timestamp" };
    }
    createdAt = new Date(record.created_at).toISOString();
  }

  return {
    ok: true,
    value: {
      id: typeof record.id === "string" ? record.id : null,
      step_number: stepNumber,
      type,
      status,
      tool_name: toolName.value,
      input: input.value,
      output: output.value,
      error_message: errorMessage.value,
      latency_ms: latency,
      tokens_used: tokens,
      created_at: createdAt,
    },
  };
}

export function parsePagination(params: URLSearchParams): PaginationInput {
  const rawLimit = Number(params.get("limit") ?? "50");
  const rawOffset = Number(params.get("offset") ?? "0");
  const status = params.get("status");

  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const offset = Number.isInteger(rawOffset) ? Math.max(rawOffset, 0) : 0;

  let parsedStatus: PaginationInput["status"];
  if (status === "completed" || status === "failed" || status === "running" || status === "all") {
    parsedStatus = status;
  }

  return { limit, offset, status: parsedStatus };
}