/**
 * Model registry — single source of truth for the models AgentBoard can run.
 *
 * Used by API validation (allowlist), the agent runner (provider selection),
 * the UI (model dropdown) and cost analytics (per-model pricing).
 *
 * Costs are USD per 1M tokens and are estimates for common provider tiers;
 * adjust them to match your provider pricing.
 */

export type ProviderId = "openai" | "groq" | "nvidia";

export interface ModelDefinition {
  id: string;
  label: string;
  provider: ProviderId;
  /** Model emits reasoning/thinking content deltas. */
  reasoning?: boolean;
  /** Default max completion tokens for this model. */
  maxCompletionTokens: number;
  /** Default sampling temperature. */
  temperature: number;
  /** Estimated USD per 1M prompt tokens. */
  costPer1MPrompt: number;
  /** Estimated USD per 1M completion tokens. */
  costPer1MCompletion: number;
}

export const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  "llama-3.3-70b-versatile": {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B (Groq)",
    provider: "groq",
    maxCompletionTokens: 4096,
    temperature: 1,
    costPer1MPrompt: 0.59,
    costPer1MCompletion: 0.79,
  },
  "gpt-4o": {
    id: "gpt-4o",
    label: "GPT-4o (OpenAI)",
    provider: "openai",
    maxCompletionTokens: 4096,
    temperature: 1,
    costPer1MPrompt: 2.5,
    costPer1MCompletion: 10,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    label: "GPT-4o mini (OpenAI)",
    provider: "openai",
    maxCompletionTokens: 4096,
    temperature: 1,
    costPer1MPrompt: 0.15,
    costPer1MCompletion: 0.6,
  },
  "minimaxai/minimax-m2.7": {
    id: "minimaxai/minimax-m2.7",
    label: "MiniMax M2.7 (NVIDIA)",
    provider: "nvidia",
    maxCompletionTokens: 8192,
    temperature: 1,
    costPer1MPrompt: 0.3,
    costPer1MCompletion: 1.0,
  },
  "mistralai/mistral-large-3-675b-instruct-2512": {
    id: "mistralai/mistral-large-3-675b-instruct-2512",
    label: "Mistral Large 3 (NVIDIA)",
    provider: "nvidia",
    maxCompletionTokens: 2048,
    temperature: 0.15,
    costPer1MPrompt: 2.0,
    costPer1MCompletion: 6.0,
  },
  "bytedance/seed-oss-36b-instruct": {
    id: "bytedance/seed-oss-36b-instruct",
    label: "Seed OSS 36B (NVIDIA)",
    provider: "nvidia",
    reasoning: true,
    maxCompletionTokens: 8192,
    temperature: 1.1,
    costPer1MPrompt: 0,
    costPer1MCompletion: 0,
  },
};

export const MODEL_IDS: string[] = Object.keys(MODEL_REGISTRY);

export function getModel(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY[id];
}

export function isKnownModel(id: string): boolean {
  return id in MODEL_REGISTRY;
}

/** Estimated cost of a run in USD given token usage. */
export function estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
  const model = getModel(modelId);
  if (!model) return 0;
  return (
    (promptTokens / 1_000_000) * model.costPer1MPrompt +
    (completionTokens / 1_000_000) * model.costPer1MCompletion
  );
}

/**
 * Estimated cost from a combined token count (runs only store totals),
 * using the average of prompt and completion pricing. Estimates only —
 * exact split would require per-run prompt/completion columns.
 */
export function estimateCostBlended(modelId: string, totalTokens: number): number {
  const model = getModel(modelId);
  if (!model) return 0;
  const blended = (model.costPer1MPrompt + model.costPer1MCompletion) / 2;
  return (totalTokens / 1_000_000) * blended;
}