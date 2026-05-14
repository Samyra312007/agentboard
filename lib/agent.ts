import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import type { Run, Step, Tool, SSEEvent, RunSummary } from "@/types";
import { tools, getToolByName } from "./tools";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.GROQAPI_KEY,
  baseURL: process.env.OPENAI_API_KEY ? undefined : "https://api.groq.com/openai/v1",
});

export interface TraceEmitter {
  emit(event: SSEEvent): Promise<void> | void;
}

export class AgentRunner {
  private run: Run;
  private stepNumber: number;
  private emitter: TraceEmitter;
  private totalTokens: number;
  private totalLatency: number;
  private failureCount: number;

  constructor(run: Run, emitter: TraceEmitter) {
    this.run = run;
    this.stepNumber = 0;
    this.emitter = emitter;
    this.totalTokens = 0;
    this.totalLatency = 0;
    this.failureCount = 0;
  }

  async execute(): Promise<void> {
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are a helpful AI assistant with access to tools. Use the provided tools to answer the user's request efficiently. Provide a clear final answer once you have gathered all necessary information.`,
        },
        {
          role: "user",
          content: this.run.task,
        },
      ];

      while (this.stepNumber < this.run.max_steps) {
        this.stepNumber++;

        // LLM Call step
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
          const response = await openai.chat.completions.create({
            model: this.run.model,
            messages,
            tools: tools.length > 0 ? tools.map(t => ({
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as any,
              },
            })) : undefined,
            tool_choice: "auto",
          });

          const llmLatency = Date.now() - llmStepStart;
          const tokensUsed = response.usage?.total_tokens || 0;
          this.totalTokens += tokensUsed;
          this.totalLatency += llmLatency;

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
              output: JSON.stringify({ model: this.run.model, finish_reason: response.choices[0].finish_reason }),
              error_message: null,
              latency_ms: llmLatency,
              tokens_used: tokensUsed,
              created_at: new Date(llmStepStart).toISOString(),
              completed_at: new Date().toISOString(),
            },
          });

          const message = response.choices[0].message;
          messages.push(message);

          // Check if tool call
          if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
              if (toolCall.type !== 'function') continue;

              this.stepNumber++;

              const toolStepId = uuidv4();
              const toolStepStart = Date.now();
              const toolName = toolCall.function.name;
              const toolArgs = JSON.parse(toolCall.function.arguments);

              const tool = getToolByName(toolName);
              if (!tool) {
                throw new Error(`Unknown tool: ${toolName}`);
              }

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
                const toolLatency = result.latency_ms;
                this.totalLatency += toolLatency;

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
                    latency_ms: toolLatency,
                    tokens_used: null,
                    created_at: new Date(toolStepStart).toISOString(),
                    completed_at: new Date().toISOString(),
                  },
                });

                if (!result.success) {
                  this.failureCount++;
                }

                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(result.output),
                });
              } catch (error) {
                const toolLatency = Date.now() - toolStepStart;
                this.totalLatency += toolLatency;
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
                    latency_ms: toolLatency,
                    tokens_used: null,
                    created_at: new Date(toolStepStart).toISOString(),
                    completed_at: new Date().toISOString(),
                  },
                });

                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
                });
              }
            }
          } else if (message.content) {
            // Final answer
            this.stepNumber++;
            const finalStepId = uuidv4();
            const finalStepStart = Date.now();

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
                output: JSON.stringify({ answer: message.content }),
                error_message: null,
                latency_ms: 0,
                tokens_used: 0,
                created_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              },
            });

            // Emit completion
            const summary: RunSummary = {
              run_id: this.run.id,
              status: "completed",
              total_steps: this.stepNumber,
              total_tokens: this.totalTokens,
              total_latency_ms: this.totalLatency,
              failure_count: this.failureCount,
              final_output: message.content,
            };

            await this.emitter.emit({
              type: "complete",
              data: summary,
            });

            return;
          }
        } catch (error) {
          const llmLatency = Date.now() - llmStepStart;
          this.failureCount++;

          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error("LLM call failed:", errorMessage);

          // Check if this is a function calling error
          if (errorMessage.includes("function calling") || errorMessage.includes("tool") || errorMessage.includes("400")) {
            // If function calling fails, try without tools
            try {
              console.log("Retrying without function calling...");
              const simpleResponse = await openai.chat.completions.create({
                model: this.run.model,
                messages,
                tools: undefined,
                tool_choice: "none",
              });

              const simpleLatency = Date.now() - llmStepStart;
              const tokensUsed = simpleResponse.usage?.total_tokens || 0;
              this.totalTokens += tokensUsed;
              this.totalLatency += simpleLatency;

              await this.emitter.emit({
                type: "step",
                data: {
                  id: llmStepId,
                  run_id: this.run.id,
                  step_number: this.stepNumber,
                  type: "llm_call",
                  status: "success",
                  tool_name: null,
                  input: JSON.stringify({ messages_count: messages.length, note: "Function calling disabled" }),
                  output: JSON.stringify({ model: this.run.model, finish_reason: simpleResponse.choices[0].finish_reason }),
                  error_message: null,
                  latency_ms: simpleLatency,
                  tokens_used: tokensUsed,
                  created_at: new Date(llmStepStart).toISOString(),
                  completed_at: new Date().toISOString(),
                },
              });

              const message = simpleResponse.choices[0].message;
              messages.push(message);

              // If we get a response without tools, treat it as final answer
              if (message.content) {
                this.stepNumber++;
                const finalStepId = uuidv4();
                const finalStepStart = Date.now();

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
                    output: JSON.stringify({ answer: message.content, note: "Direct response (function calling unavailable)" }),
                    error_message: null,
                    latency_ms: 0,
                    tokens_used: 0,
                    created_at: new Date().toISOString(),
                    completed_at: new Date().toISOString(),
                  },
                });

                const summary: RunSummary = {
                  run_id: this.run.id,
                  status: "completed",
                  total_steps: this.stepNumber,
                  total_tokens: this.totalTokens,
                  total_latency_ms: this.totalLatency,
                  failure_count: this.failureCount,
                  final_output: message.content,
                };

                await this.emitter.emit({
                  type: "complete",
                  data: summary,
                });

                return;
              }
            } catch (retryError) {
              // Retry also failed, use original error
              console.error("Retry without function calling also failed:", retryError);
            }
          }

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
              error_message: errorMessage,
              latency_ms: llmLatency,
              tokens_used: null,
              created_at: new Date(llmStepStart).toISOString(),
              completed_at: new Date().toISOString(),
            },
          });

          await this.emitter.emit({
            type: "error",
            data: {
              run_id: this.run.id,
              error: errorMessage,
            },
          });

          return;
        }
      }

      // Max steps reached
      const summary: RunSummary = {
        run_id: this.run.id,
        status: "completed",
        total_steps: this.stepNumber,
        total_tokens: this.totalTokens,
        total_latency_ms: this.totalLatency,
        failure_count: this.failureCount,
        final_output: "Max steps reached",
      };

      await this.emitter.emit({
        type: "complete",
        data: summary,
      });
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
