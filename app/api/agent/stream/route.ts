import { NextRequest } from "next/server";
import { getRunById, updateRun, createStep, updateStep, getStepsByRunId } from "@/lib/db";
import { AgentRunner, type TraceEmitter } from "@/lib/agent";
import type { SSEEvent, RunSummary, Step, ErrorPayload } from "@/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("run_id");

  if (!runId) {
    return new Response("Missing run_id parameter", { status: 400 });
  }

  const run = getRunById(runId);
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  // If run is already finished, just return the current steps and close
  if (run.status === "completed" || run.status === "failed") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send existing steps
        const steps = getStepsByRunId(runId);
        for (const step of steps) {
          const data = `event: step\ndata: ${JSON.stringify(step)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        
        // Send completion event
        const summary: RunSummary = {
          run_id: run.id,
          status: run.status as any,
          total_steps: run.total_steps,
          total_tokens: run.total_tokens,
          total_latency_ms: run.total_latency_ms,
          failure_count: run.failure_count,
          final_output: run.final_output,
        };
        const completeData = `event: complete\ndata: ${JSON.stringify(summary)}\n\n`;
        controller.enqueue(encoder.encode(completeData));
        controller.close();
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // For Nginx
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emitter: TraceEmitter = {
        emit: (event: SSEEvent) => {
          const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(data));
        },
      };

      // Update run status to running if it's not already
      if (run.status !== "running") {
        updateRun(runId, { status: "running" });
      }

      try {
        // Save each step to database as it's emitted
        const originalEmit = emitter.emit.bind(emitter);
        emitter.emit = (event: SSEEvent) => {
          if (event.type === "step") {
            const step = event.data as Step;
            if (step.status === "running") {
              // Create new step
              createStep(step);
            } else {
              // Update existing step
              updateStep(step.id, {
                status: step.status,
                output: step.output,
                error_message: step.error_message,
                latency_ms: step.latency_ms,
                tokens_used: step.tokens_used,
                completed_at: step.completed_at,
              });
            }

            // Update run totals
            if (step.status === "success" || step.status === "error") {
              const currentRun = getRunById(runId);
              if (currentRun) {
                updateRun(runId, {
                  total_steps: currentRun.total_steps + 1,
                  total_tokens: currentRun.total_tokens + (step.tokens_used || 0),
                  total_latency_ms: currentRun.total_latency_ms + (step.latency_ms || 0),
                  failure_count: currentRun.failure_count + (step.status === "error" ? 1 : 0),
                });
              }
            }
          } else if (event.type === "complete") {
            const summary = event.data as RunSummary;
            updateRun(runId, {
              status: summary.status,
              total_steps: summary.total_steps,
              total_tokens: summary.total_tokens,
              total_latency_ms: summary.total_latency_ms,
              failure_count: summary.failure_count,
              final_output: summary.final_output,
              completed_at: new Date().toISOString(),
            });
          } else if (event.type === "error") {
            const errorPayload = event.data as ErrorPayload;
            updateRun(runId, {
              status: "failed",
              error_message: errorPayload.error,
              completed_at: new Date().toISOString(),
            });
          }

          originalEmit(event);
        };

        // Run the agent
        const runner = new AgentRunner(run, emitter);
        await runner.execute();

        // Close the stream
        controller.close();
      } catch (error) {
        console.error("Error in stream:", error);
        updateRun(runId, {
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          completed_at: new Date().toISOString(),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
