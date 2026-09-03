import { useState, useEffect, useRef } from "react";
import { StepCard } from "./StepCard";
import { StepDetail } from "./StepDetail";
import { RunSummary } from "./RunSummary";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Step, RunSummary as RunSummaryType } from "@/types";

interface LiveTraceProps {
  runId: string;
  onComplete: (summary: RunSummaryType) => void;
  viewFullRun?: () => void;
}

export function LiveTrace({ runId, onComplete, viewFullRun }: LiveTraceProps) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [summary, setSummary] = useState<RunSummaryType | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Update ref when onComplete changes
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // NOTE: consumers should render <LiveTrace key={runId} ... /> so state
  // resets naturally on runId changes (remount) instead of via effect.

  useEffect(() => {
    if (isComplete || !runId) return;

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log(`Starting stream for run ${runId}`);
    const eventSource = new EventSource(`/api/agent/stream?run_id=${runId}`);
    eventSourceRef.current = eventSource;

    const handleStep = (event: Event) => {
      const step = JSON.parse((event as MessageEvent).data) as Step;
      setSteps((prev) => {
        const existingIndex = prev.findIndex((s) => s.id === step.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = step;
          return updated;
        }
        return [...prev, step];
      });
    };

    const handleComplete = (event: Event) => {
      const runSummary = JSON.parse((event as MessageEvent).data) as RunSummaryType;
      console.log("Stream complete received");
      setSummary(runSummary);
      setIsComplete(true);
      onCompleteRef.current(runSummary);
      eventSource.close();
    };

    const handleError = (event: Event) => {
      if (event instanceof MessageEvent) {
        console.error("Server error event:", event.data);
      }
      
      // Connection closure by server or network error
      console.log("Stream connection closed or error.");
      setIsComplete(true);
      eventSource.close();
    };

    eventSource.addEventListener("step", handleStep);
    eventSource.addEventListener("complete", handleComplete);
    eventSource.addEventListener("error", handleError);

    return () => {
      console.log("Cleaning up stream");
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [runId, isComplete]);

  const currentSummary: RunSummaryType = summary || {
    run_id: runId,
    status: steps.some((s) => s.status === "running") ? "running" : "completed",
    total_steps: steps.length,
    total_tokens: steps.reduce((acc, s) => acc + (s.tokens_used || 0), 0),
    total_latency_ms: steps.reduce((acc, s) => acc + (s.latency_ms || 0), 0),
    failure_count: steps.filter((s) => s.status === "error").length,
    final_output: null,
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border">
          <RunSummary
            status={currentSummary.status}
            totalSteps={currentSummary.total_steps}
            totalTokens={currentSummary.total_tokens}
            totalLatencyMs={currentSummary.total_latency_ms}
            failureCount={currentSummary.failure_count}
          />
          {isComplete && viewFullRun && (
            <button
              onClick={viewFullRun}
              className="mt-2 text-sm text-primary hover:underline"
            >
              View Full Run →
            </button>
          )}
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2">
            {steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                onClick={() => setSelectedStep(step)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
      {selectedStep && (
        <div className="w-[35%] border-l border-border">
          <StepDetail step={selectedStep} onClose={() => setSelectedStep(null)} />
        </div>
      )}
    </div>
  );
}
