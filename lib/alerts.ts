import "server-only";
import { getSupabase } from "./server/supabase";
import { optionalEnv } from "./server/env";
import { getAllUserRuns } from "./db";
import type { Run } from "@/types";
import { computeStats, type RunStats } from "./analytics";

/**
 * Alert engine.
 *
 * Rules are evaluated whenever one of the user's runs finishes: the runs
 * created inside the rule's rolling window are aggregated and the metric is
 * compared against the threshold. A rule never re-fires within its own
 * window (cooldown).
 */

export type AlertMetric = "failure_rate" | "avg_latency" | "cost";
export type AlertOperator = "gt" | "gte";

export interface AlertChannel {
  type: "email" | "webhook";
  target: string;
}

export interface AlertRule {
  id: string;
  user_id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  window_minutes: number;
  channels: AlertChannel[];
  enabled: boolean;
  created_at: string;
}

export interface AlertEvent {
  id: string;
  rule_id: string | null;
  metric: AlertMetric;
  value: number;
  threshold: number;
  message: string;
  channels: AlertChannel[];
  fired_at: string;
}

// ---------------------------------------------------------------------------
// Pure evaluation helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Extracts the metric value for a rule from aggregated stats. */
export function extractMetricValue(metric: AlertMetric, stats: RunStats): number {
  switch (metric) {
    case "failure_rate":
      return 100 - stats.success_rate;
    case "avg_latency":
      return stats.avg_latency_ms;
    case "cost":
      return stats.estimated_cost_usd;
  }
}

/** Threshold comparison. */
export function ruleMatches(operator: AlertOperator, value: number, threshold: number): boolean {
  return operator === "gt" ? value > threshold : value >= threshold;
}

/** Returns true when the rule should fire given its last fired time. */
export function isInCooldown(lastFiredAt: string | null, windowMinutes: number, now: number): boolean {
  if (!lastFiredAt) return false;
  const elapsedMs = now - Date.parse(lastFiredAt);
  return elapsedMs < windowMinutes * 60_000;
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

export async function listAlertRules(userId: string): Promise<AlertRule[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error listing alert rules:", error);
    throw error;
  }
  return (data as AlertRule[]) ?? [];
}

export async function createAlertRule(
  userId: string,
  rule: Omit<AlertRule, "id" | "user_id" | "created_at" | "enabled"> & { enabled?: boolean }
): Promise<AlertRule> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("alert_rules")
    .insert({ ...rule, user_id: userId, enabled: rule.enabled ?? true })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating alert rule:", error);
    throw error;
  }
  return data as AlertRule;
}

export async function deleteAlertRule(id: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("alert_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Error deleting alert rule:", error);
    throw error;
  }
}

export async function listAlertEvents(userId: string, limit = 50): Promise<AlertEvent[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("alert_events")
    .select("*")
    .eq("user_id", userId)
    .order("fired_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error listing alert events:", error);
    throw error;
  }
  return (data as AlertEvent[]) ?? [];
}

async function lastFiredForRule(ruleId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("alert_events")
    .select("fired_at")
    .eq("rule_id", ruleId)
    .order("fired_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.fired_at ?? null;
}

async function recordEvent(
  userId: string,
  event: Omit<AlertEvent, "id" | "fired_at">
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("alert_events").insert({
    user_id: userId,
    rule_id: event.rule_id,
    metric: event.metric,
    value: event.value,
    threshold: event.threshold,
    message: event.message,
    channels: event.channels,
  });
  if (error) console.error("Error recording alert event:", error);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

const RESEND_URL = "https://api.resend.com/emails";
const WEBHOOK_TIMEOUT_MS = 5_000;

export async function deliverAlert(
  channels: AlertChannel[],
  message: string,
  toEmail: string | null
): Promise<void> {
  await Promise.allSettled(
    channels.map((channel) => {
      if (channel.type === "webhook") return deliverWebhook(channel.target, message);
      if (channel.type === "email" && toEmail) return deliverEmail(toEmail, message);
      return Promise.resolve();
    })
  );
}

async function deliverEmail(to: string, message: string): Promise<void> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("[alerts] RESEND_API_KEY not configured — skipping email alert");
    return;
  }
  const from = optionalEnv("ALERT_EMAIL_FROM") ?? "AgentBoard Alerts <onboarding@resend.dev>";

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "🚨 AgentBoard alert",
      html: `<div style="font-family: sans-serif; max-width: 560px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="margin-top: 0;">AgentBoard alert</h2>
        <p style="color: #334155; line-height: 1.6;">${escapeHtml(message)}</p>
      </div>`,
    }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Email delivery failed (HTTP ${response.status})`);
  }
}

async function deliverWebhook(target: string, message: string): Promise<void> {
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "agentboard.alert",
      message,
      sent_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Webhook delivery failed (HTTP ${response.status})`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Evaluation entry point — call whenever a run finishes.
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper for route handlers: fetches the user's runs and
 * evaluates all rules. Never throws.
 */
export async function runAlertEvaluation(
  userId: string,
  userEmail: string | null
): Promise<void> {
  try {
    const allRuns = await getAllUserRuns(userId);
    await evaluateAlertsForUser(userId, userEmail, allRuns);
  } catch (error) {
    console.error("Alert evaluation failed:", error);
  }
}

/**
 * Evaluates all enabled rules for the user against the runs created in the
 * last `window_minutes`, firing (and recording) any that match and are not
 * in cooldown. Never throws — alerting must not break the calling flow.
 */
export async function evaluateAlertsForUser(
  userId: string,
  userEmail: string | null,
  allRuns: Run[]
): Promise<void> {
  try {
    const rules = await listAlertRules(userId);
    const enabled = rules.filter((r) => r.enabled && r.channels.length > 0);
    if (enabled.length === 0) return;

    const now = Date.now();

    for (const rule of enabled) {
      const windowStart = new Date(now - rule.window_minutes * 60_000);
      const windowRuns = allRuns.filter(
        (r) => Date.parse(r.created_at) >= windowStart.getTime()
      );
      if (windowRuns.length === 0) continue;

      const stats = computeStats(windowRuns);
      const value = extractMetricValue(rule.metric, stats);
      if (!ruleMatches(rule.operator, value, rule.threshold)) continue;

      const lastFired = await lastFiredForRule(rule.id);
      if (isInCooldown(lastFired, rule.window_minutes, now)) continue;

      const message = buildAlertMessage(rule, value);
      await recordEvent(userId, {
        rule_id: rule.id,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        message,
        channels: rule.channels,
      });
      await deliverAlert(rule.channels, message, userEmail);
    }
  } catch (error) {
    console.error("Alert evaluation failed:", error);
  }
}

function buildAlertMessage(rule: AlertRule, value: number): string {
  const metricLabel: Record<AlertMetric, string> = {
    failure_rate: "failure rate",
    avg_latency: "average latency",
    cost: "estimated cost",
  };
  const unit = rule.metric === "avg_latency" ? "ms" : rule.metric === "cost" ? " USD" : "%";
  return (
    `Rule "${rule.name}" triggered: ${metricLabel[rule.metric]} is ` +
    `${value.toFixed(2)}${unit}, which ${rule.operator === "gt" ? "exceeds" : "meets"} ` +
    `the threshold of ${rule.threshold}${unit} over the last ${rule.window_minutes} minutes.`
  );
}