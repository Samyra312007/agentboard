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