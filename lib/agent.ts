import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import type { Run, SSEEvent } from "@/types";
import { tools, getToolByName } from "./tools";

function getClientForModel(model: string): OpenAI {
  if (model.includes("minimax") || model.includes("mistral") || model.includes("seed-oss")) {
    let apiKey: string | undefined;
    if (model.includes("minimax")) {
      apiKey = process.env.MINIMAX_API_KEY;
    } else if (model.includes("mistral")) {
      apiKey = process.env.MISTRAL_API_KEY;
    } else if (model.includes("seed-oss")) {
      apiKey = process.env.BYTEDANCE_API_KEY;
    }
    return new OpenAI({
      apiKey: apiKey?.trim() || "missing_key",
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
  }

  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY.trim(),
    });
  }

  return new OpenAI({
    apiKey: (process.env.GROQAPI_KEY || "").trim(),
    baseURL: "https://api.groq.com/openai/v1",
  });
}

export interface TraceEmitter {
  emit(event: SSEEvent): Promise<void> | void;
}

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatChunk = OpenAI.Chat.Completions.ChatCompletionChunk;

/** A tool call accumulated across streaming deltas. */
interface AccumulatedToolCall {
  id: string;
  type: "function";
  index: number;
  function: { name?: string; arguments: string };
}

export class AgentRunner {
  private run: Run;
  private stepNumber: number;
  private emitter: TraceEmitter;
  private totalTokens: number;
  private totalLatency: number;
  private failureCount: number;
  private client: OpenAI;

  constructor(run: Run, emitter: TraceEmitter) {
    this.run = run;
    this.stepNumber = 0;
    this.emitter = emitter;
    this.totalTokens = 0;
    this.totalLatency = 0;
    this.failureCount = 0;
    this.client = getClientForModel(run.model);
  }

  async execute(): Promise<void> {
    try {
      // Robust detection of NVIDIA hosted models
      const isNVIDIA = this.run.model.includes("minimax") ||
                      this.run.model.includes("mistral") ||
                      this.run.model.includes("seed-oss");
      const isSeedOSS = this.run.model.includes("seed-oss");

      // Base system prompt
      const systemPrompt = `You are a helpful AI assistant. Use the provided tools to answer the user's request if needed. Provide a clear final answer once you have gathered all necessary information.`;

      const messages: ChatMessage[] = [];

      if (isNVIDIA) {
        // NVIDIA models strictly require prompt in 'user' role for many reasoning tasks
        messages.push({
          role: "user",
          content: `${systemPrompt}\n\nTask: ${this.run.task}`,
        });
      } else {
        messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: this.run.task });
      }

      while (this.stepNumber < this.run.max_steps) {
        this.stepNumber++;

        const llmStepId = uuidv4();
        const llmStepStart = Date.now();

        await this.emitter.emit({
          type: "step",
          data: {
            id: llmStepId,
            run_id: this.run.id,
            step_number: this.stepNumber,
            type: "llm_call",
            status: "running",
            tool_name: null,
            input: JSON.stringify({ messages_count: messages.length }),
            output: null,
            error_message: null,
            latency_ms: null,
            tokens_used: null,
            created_at: new Date().toISOString(),
            completed_at: null,
          },
        });

        try {
          let fullContent = "";
          let fullReasoning = "";
          const toolCalls: AccumulatedToolCall[] = [];
          let finishReason: ChatChunk["choices"][number]["finish_reason"] = "stop";

          // Use the OpenAI client for all models for robust stream handling
          const stream = await this.client.chat.completions.create({
            model: this.run.model,
            messages,
            stream: true,
            temperature: isSeedOSS ? 1.1 : (this.run.model.includes("mistral") ? 0.15 : 1),
            max_tokens: this.run.model.includes("mistral") ? 2048 : (isSeedOSS ? 8192 : 4096),
            // Tools are omitted for NVIDIA reasoning models for now to avoid complexity
            tools: !isNVIDIA && tools.length > 0 ? tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })) : undefined,
            tool_choice: !isNVIDIA ? "auto" : undefined,
            // NVIDIA Seed-OSS reasoning models accept thinking_budget as a top-level param
            ...(isSeedOSS ? { thinking_budget: -1 } : {}),
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);

          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            const delta = choice?.delta as
              | (OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
                  reasoning_content?: string;
                })
              | undefined;
            if (!delta) continue;

            if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
            if (delta.content) fullContent += delta.content;

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCalls[tc.index];
                if (!existing) {
                  toolCalls[tc.index] = {
                    id: tc.id ?? `call_${uuidv4()}`,
                    type: "function",
                    index: tc.index,
                    function: {
                      name: tc.function?.name,
                      arguments: tc.function?.arguments ?? "",
                    },
                  };
                } else {
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                }
              }
            }
            if (choice?.finish_reason) finishReason = choice.finish_reason;
          }

          const llmLatency = Date.now() - llmStepStart;
          this.totalLatency += llmLatency;

          let displayOutput = fullContent;
          if (fullReasoning) {
            displayOutput = `> Reasoning: ${fullReasoning}\n\n${fullContent}`;
          }

          await this.emitter.emit({
            type: "step",
            data: {
              id: llmStepId,
              run_id: this.run.id,
              step_number: this.stepNumber,
              type: "llm_call",
              status: "success",
              tool_name: null,
              input: JSON.stringify({ messages_count: messages.length }),
              output: JSON.stringify({
                model: this.run.model,
                finish_reason: finishReason,
                content: displayOutput,
              }),
              error_message: null,
              latency_ms: llmLatency,
              tokens_used: 0,
              created_at: new Date(llmStepStart).toISOString(),
              completed_at: new Date().toISOString(),
            },
          });

          const completedToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall[] =
            toolCalls
              .filter((tc) => tc.function?.name)
              .map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.function!.name!,
                  arguments: tc.function!.arguments ?? "",
                },
              }));

          const assistantMessage: ChatMessage = {
            role: "assistant",
            content: fullContent,
            ...(completedToolCalls.length > 0 ? { tool_calls: completedToolCalls } : {}),
          };
          messages.push(assistantMessage);

          if (completedToolCalls.length > 0) {
            // Tool calling is only populated in the non-NVIDIA path
            for (const toolCall of completedToolCalls) {
              this.stepNumber++;
              const toolStepId = uuidv4();
              const toolStepStart = Date.now();
              const toolName = toolCall.function.name;
              const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
              const tool = getToolByName(toolName);

              if (!tool) throw new Error(`Unknown tool: ${toolName}`);

              await this.emitter.emit({
                type: "step",
                data: {
                  id: toolStepId,
                  run_id: this.run.id,
                  step_number: this.stepNumber,
                  type: "tool_call",
                  status: "running",
                  tool_name: toolName,
                  input: JSON.stringify(toolArgs),
                  output: null,
                  error_message: null,
                  latency_ms: null,
                  tokens_used: null,
                  created_at: new Date().toISOString(),
                  completed_at: null,
                },
              });

              try {
                const result = await tool.execute(toolArgs);
                this.totalLatency += result.latency_ms;
                await this.emitter.emit({
                  type: "step",
                  data: {
                    id: toolStepId,
                    run_id: this.run.id,
                    step_number: this.stepNumber,
                    type: "tool_call",
                    status: result.success ? "success" : "error",
                    tool_name: toolName,
                    input: JSON.stringify(toolArgs),
                    output: JSON.stringify(result.output),
                    error_message: result.error || null,
                    latency_ms: result.latency_ms,
                    tokens_used: null,
                    created_at: new Date(toolStepStart).toISOString(),
                    completed_at: new Date().toISOString(),
                  },
                });

                if (!result.success) this.failureCount++;
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify(result.output),
                } as ChatMessage);
              } catch (error) {
                this.failureCount++;
                await this.emitter.emit({
                  type: "step",
                  data: {
                    id: toolStepId,
                    run_id: this.run.id,
                    step_number: this.stepNumber,
                    type: "tool_call",
                    status: "error",
                    tool_name: toolName,
                    input: JSON.stringify(toolArgs),
                    output: null,
                    error_message: error instanceof Error ? error.message : "Unknown error",
                    latency_ms: Date.now() - toolStepStart,
                    tokens_used: null,
                    created_at: new Date(toolStepStart).toISOString(),
                    completed_at: new Date().toISOString(),
                  },
                });
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify({ error: "Tool execution failed" }),
                } as ChatMessage);
              }
            }
          } else if (fullContent || fullReasoning) {
            // Final answer
            this.stepNumber++;
            const finalStepId = uuidv4();
            await this.emitter.emit({
              type: "step",
              data: {
                id: finalStepId,
                run_id: this.run.id,
                step_number: this.stepNumber,
                type: "final_answer",
                status: "success",
                tool_name: null,
                input: JSON.stringify({}),
                output: JSON.stringify({ answer: displayOutput }),
                error_message: null,
                latency_ms: 0,
                tokens_used: 0,
                created_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              },
            });

            await this.emitter.emit({
              type: "complete",
              data: {
                run_id: this.run.id,
                status: "completed",
                total_steps: this.stepNumber,
                total_tokens: this.totalTokens,
                total_latency_ms: this.totalLatency,
                failure_count: this.failureCount,
                final_output: displayOutput,
              },
            });
            return;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error("LLM call failed:", errorMessage);

          await this.emitter.emit({
            type: "step",
            data: {
              id: llmStepId,
              run_id: this.run.id,
              step_number: this.stepNumber,
              type: "llm_call",
              status: "error",
              tool_name: null,
              input: JSON.stringify({ messages_count: messages.length }),
              output: null,
              error_message: `Provider Error: ${errorMessage}`,
              latency_ms: Date.now() - llmStepStart,
              tokens_used: null,
              created_at: new Date(llmStepStart).toISOString(),
              completed_at: new Date().toISOString(),
            },
          });

          await this.emitter.emit({
            type: "error",
            data: { run_id: this.run.id, error: errorMessage },
          });
          return;
        }
      }
    } catch (error) {
      await this.emitter.emit({
        type: "error",
        data: {
          run_id: this.run.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
}