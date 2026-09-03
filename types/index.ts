export type RunStatus = 'running' | 'completed' | 'failed';
export type StepStatus = 'running' | 'success' | 'error';
export type StepType = 'llm_call' | 'tool_call' | 'final_answer';

export interface Run {
  id: string;
  user_id: string | null;
  task: string;
  model: string;
  max_steps: number;
  status: RunStatus;
  total_steps: number;
  total_tokens: number;
  total_latency_ms: number;
  failure_count: number;
  final_output: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Step {
  id: string;
  run_id: string;
  step_number: number;
  type: StepType;
  status: StepStatus;
  tool_name: string | null;
  input: string;
  output: string | null;
  error_message: string | null;
  latency_ms: number | null;
  tokens_used: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface RunWithSteps extends Run {
  steps: Step[];
}

export interface SSEEvent {
  type: 'step' | 'complete' | 'error';
  data: Step | RunSummary | ErrorPayload;
}

export interface RunSummary {
  run_id: string;
  status: RunStatus;
  total_steps: number;
  total_tokens: number;
  total_latency_ms: number;
  failure_count: number;
  final_output: string | null;
}

export interface ErrorPayload {
  run_id: string;
  error: string;
}

export interface CreateRunRequest {
  task: string;
  model: string;
  maxSteps: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  latency_ms: number;
}
