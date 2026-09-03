/**
 * AgentBoard SDK — report AI agent traces to AgentBoard.
 *
 * Works in Node.js 18+ and modern browsers. Uses the global `fetch`.
 */

export interface RunInput {
  task: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export type StepStatus = "running" | "success" | "error";

export interface StepInput {
  /** Optional client-generated UUID; omit to let the server assign one. */
  id?: string;
  step_number: number;
  type: string;
  status?: StepStatus;
  tool_name?: string | null;
  input?: unknown;
  output?: unknown;
  error_message?: string | null;
  latency_ms?: number;
  tokens_used?: number;
  created_at?: string;
}

export interface CompleteRunInput {
  status: "completed" | "failed";
  final_output?: string;
  error_message?: string;
}

export class AgentBoardError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AgentBoardError";
  }
}

export interface AgentBoardClientOptions {
  apiKey: string;
  /**
   * Base URL of the AgentBoard instance. Defaults to the
   * AGENTBOARD_BASE_URL env var, then http://localhost:3000.
   */
  baseUrl?: string;
}

function defaultBaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.AGENTBOARD_BASE_URL) {
    return process.env.AGENTBOARD_BASE_URL;
  }
  return "http://localhost:3000";
}

function randomUuid(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // Fallback for environments without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class AgentBoardClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: AgentBoardClientOptions) {
    if (!options.apiKey) throw new AgentBoardError("apiKey is required", 0);
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/$/, "");
  }

  /**
   * Creates a run and returns its id. The run starts in "running" state.
   */
  async createRun(input: RunInput): Promise<string> {
    const body = await this.request<{ run_id: string }>("/api/v1/runs", {
      method: "POST",
      body: JSON.stringify({
        task: input.task,
        ...(input.model ? { model: input.model } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    });
    return body.run_id;
  }

  /**
   * Reports a single step for a run.
   */
  async reportStep(runId: string, step: StepInput): Promise<void> {
    await this.request<{ ok: boolean }>(`/api/v1/runs/${runId}/steps`, {
      method: "POST",
      body: JSON.stringify(serializeStep(step)),
    });
  }

  /**
   * Marks a run completed or failed.
   */
  async completeRun(runId: string, input: CompleteRunInput): Promise<void> {
    await this.request<{ ok: boolean }>(`/api/v1/runs/${runId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: input.status,
        ...(input.final_output !== undefined ? { final_output: input.final_output } : {}),
        ...(input.error_message !== undefined ? { error_message: input.error_message } : {}),
      }),
    });
  }

  /**
   * Convenience wrapper: creates a run and returns a buffered RunReporter
   * that auto-flushes steps and finalizes the run on `end()`.
   */
  async startRun(
    input: RunInput,
    opts: { autoFlushEvery?: number } = {}
  ): Promise<RunReporter> {
    const runId = await this.createRun(input);
    return new RunReporter(this, runId, opts.autoFlushEvery ?? 10);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new AgentBoardError(
        `AgentBoard request failed: ${error instanceof Error ? error.message : "network error"}`,
        0
      );
    }

    if (!response.ok) {
      let message = `AgentBoard request failed (HTTP ${response.status})`;
      try {
        const data = (await response.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        // Non-JSON error body — keep the generic message.
      }
      throw new AgentBoardError(message, response.status);
    }

    return (await response.json()) as T;
  }
}

function serializeStep(step: StepInput): Record<string, unknown> {
  return {
    ...(step.id ? { id: step.id } : {}),
    step_number: step.step_number,
    type: step.type,
    status: step.status ?? "running",
    ...(step.tool_name !== undefined ? { tool_name: step.tool_name } : {}),
    ...(step.input !== undefined ? { input: stringify(step.input) } : {}),
    ...(step.output !== undefined ? { output: stringify(step.output) } : {}),
    ...(step.error_message !== undefined ? { error_message: step.error_message } : {}),
    ...(step.latency_ms !== undefined ? { latency_ms: step.latency_ms } : {}),
    ...(step.tokens_used !== undefined ? { tokens_used: step.tokens_used } : {}),
    ...(step.created_at !== undefined ? { created_at: step.created_at } : {}),
  };
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Buffered run reporter with automatic flushing.
 *
 * Steps accumulate in a buffer; the buffer is flushed when it reaches
 * `autoFlushEvery` entries or when `flush()` / `end()` is called.
 */
export class RunReporter {
  private readonly buffer: StepInput[] = [];
  private readonly autoFlushEvery: number;
  private pendingFlush: Promise<void> | null = null;
  private ended = false;

  constructor(
    private readonly client: AgentBoardClient,
    public readonly runId: string,
    autoFlushEvery: number
  ) {
    this.autoFlushEvery = Math.max(1, autoFlushEvery);
  }

  /** Queues a step; auto-flushes when the buffer reaches its threshold. */
  trackStep(step: StepInput): void {
    if (this.ended) throw new AgentBoardError("Run already ended", 0);
    this.buffer.push({ ...step, id: step.id ?? randomUuid() });
    if (this.buffer.length >= this.autoFlushEvery) {
      void this.flush();
    }
  }

  /** Sends all buffered steps to AgentBoard. Safe to call repeatedly. */
  async flush(): Promise<void> {
    if (this.pendingFlush) return this.pendingFlush;
    if (this.buffer.length === 0) return;

    const steps = this.buffer.splice(0, this.buffer.length);
    this.pendingFlush = (async () => {
      try {
        for (const step of steps) {
          await this.client.reportStep(this.runId, step);
        }
      } finally {
        this.pendingFlush = null;
      }
    })();
    return this.pendingFlush;
  }

  /** Flushes remaining steps and marks the run completed/failed. */
  async end(input?: CompleteRunInput): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    await this.flush();
    await this.client.completeRun(this.runId, input ?? { status: "completed" });
  }
}