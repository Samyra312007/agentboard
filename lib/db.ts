import { getSupabase } from "./server/supabase";
import type { Run, Step, RunWithSteps } from "@/types";

/**
 * Database layer — the ONLY place that talks to Supabase.
 *
 * Multi-tenancy: every function takes an explicit `userId` and scopes its
 * query to that user. The service-role client bypasses RLS, so ownership is
 * enforced here in application code; RLS (see supabase/migrations) is the
 * defense-in-depth second layer for any future user-scoped client.
 */

// Run functions
export async function createRun(
  run: Omit<
    Run,
    "user_id" | "total_steps" | "total_tokens" | "total_latency_ms" | "failure_count" | "status"
  >,
  userId: string
): Promise<Run> {
  const supabase = getSupabase();
  const newRun: Run = {
    ...run,
    user_id: userId,
    total_steps: 0,
    total_tokens: 0,
    total_latency_ms: 0,
    failure_count: 0,
    status: "running",
  };

  const { error } = await supabase.from("runs").insert(newRun);

  if (error) {
    console.error("Error creating run in Supabase:", error);
    throw error;
  }

  return newRun;
}

export async function getRunById(id: string, userId: string): Promise<Run | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("Error fetching run from Supabase:", error);
    throw error;
  }

  return data as Run;
}

export interface GetRunsOptions {
  userId: string;
  limit?: number;
  offset?: number;
  status?: "all" | "completed" | "failed" | "running";
}

export async function getAllRuns(options: GetRunsOptions): Promise<{ runs: Run[]; total: number }> {
  const supabase = getSupabase();
  const { userId, limit = 50, offset = 0, status } = options;

  let query = supabase
    .from("runs")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching all runs from Supabase:", error);
    throw error;
  }

  return { runs: data as Run[], total: count ?? (data as Run[]).length };
}

export async function updateRun(
  id: string,
  userId: string,
  updates: Partial<Omit<Run, "id" | "user_id">>
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("runs")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Error updating run in Supabase:", error);
    throw error;
  }
}

export async function deleteRun(id: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("runs")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Error deleting run from Supabase:", error);
    throw error;
  }
}

// Step functions
export async function createStep(
  step: Omit<Step, "status" | "output" | "latency_ms" | "tokens_used" | "completed_at" | "error_message">
): Promise<Step> {
  const supabase = getSupabase();
  const newStep: Step = {
    ...step,
    status: "running",
    output: null,
    latency_ms: null,
    tokens_used: null,
    completed_at: null,
    error_message: null,
  };

  const { error } = await supabase.from("steps").insert(newStep);

  if (error) {
    console.error("Error creating step in Supabase:", error);
    throw error;
  }

  return newStep;
}

/**
 * Steps belong to a run; ownership is enforced by the caller having already
 * resolved the run via getRunById(userId). Never call this with an
 * unverified run id.
 */
export async function getStepsByRunId(run_id: string): Promise<Step[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("steps")
    .select("*")
    .eq("run_id", run_id)
    .order("step_number", { ascending: true });

  if (error) {
    console.error("Error fetching steps from Supabase:", error);
    throw error;
  }

  return data as Step[];
}

export async function updateStep(id: string, updates: Partial<Omit<Step, "id">>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("steps")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Error updating step in Supabase:", error);
    throw error;
  }
}

export async function getRunWithSteps(id: string, userId: string): Promise<RunWithSteps | null> {
  const run = await getRunById(id, userId);
  if (!run) return null;

  const steps = await getStepsByRunId(id);
  return { ...run, steps };
}