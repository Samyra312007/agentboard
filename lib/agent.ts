import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import type { Run, Step, Tool, SSEEvent, RunSummary } from "@/types";
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

      const messages: any[] = [];

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
          let toolCalls: any[] = [];
          let finishReason = "stop";

          // Use the OpenAI client for all models for robust stream handling
          const stream = await this.client.chat.completions.create({
            model: this.run.model,
            messages: messages as any,
            stream: true,
            temperature: isSeedOSS ? 1.1 : (this.run.model.includes("mistral") ? 0.15 : 1),
            max_tokens: this.run.model.includes("mistral") ? 2048 : (isSeedOSS ? 8192 : 4096),
            // Tools are omitted for NVIDIA reasoning models for now to avoid complexity
            tools: !isNVIDIA && tools.length > 0 ? tools.map(t => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as any,
              },
            })) : undefined,
            tool_choice: !isNVIDIA ? "auto" : undefined,
            // @ts-ignore - extra_body is supported by the SDK
            extra_body: isSeedOSS ? { thinking_budget: -1 } : undefined,
          } as any);

          for await (const chunk of stream) {
            const delta = (chunk as any).choices[0]?.delta;
            if (!delta) continue;
            
            if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
            if (delta.content) fullContent += delta.content;
            
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { ...tc, function: { ...tc.function } };
                } else {
                  if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                }
              }
            }
            if ((chunk as any).choices[0].finish_reason) finishReason = (chunk as any).choices[0].finish_reason;
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
                content: displayOutput
              }),
              error_message: null,
              latency_ms: llmLatency,
              tokens_used: 0,
              created_at: new Date(llmStepStart).toISOString(),
              completed_at: new Date().toISOString(),
            },
          });

          const assistantMessage: any = { role: "assistant", content: fullContent };
          if (toolCalls.length > 0) {
            assistantMessage.tool_calls = toolCalls.filter(tc => tc.function?.name);
          }
          messages.push(assistantMessage);

          if (toolCalls.length > 0 && assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            // ... (Tool calling logic remains the same)
            // Note: Currently toolCalls will only be populated in non-NVIDIA path
            for (const toolCall of assistantMessage.tool_calls) {
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
                  content: JSON.stringify(result.output) 
                });
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
                  content: JSON.stringify({ error: "Tool execution failed" }) 
                });
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
