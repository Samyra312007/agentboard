"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { StepCard } from "@/components/dashboard/StepCard";
import { StepDetail } from "@/components/dashboard/StepDetail";
import { RunSummary } from "@/components/dashboard/RunSummary";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, RotateCcw } from "lucide-react";
import type { RunWithSteps, Step } from "@/types";

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  const [run, setRun] = useState<RunWithSteps | null>(null);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [displaySteps, setDisplaySteps] = useState<Step[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/runs?id=${runId}`);
      if (!response.ok) throw new Error("Failed to fetch run");
      const data = await response.json();
      if (!cancelled) {
        setRun(data);
        setDisplaySteps(data.steps);
      }
    })().catch((error) => console.error("Error fetching run:", error));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const handleReplay = () => {
    if (!run) return;
    setIsReplaying(true);
    setDisplaySteps([]);
    setSelectedStep(null);

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex >= run.steps.length) {
        clearInterval(interval);
        setIsReplaying(false);
        return;
      }

      setDisplaySteps((prev) => [...prev, run.steps[stepIndex]]);
      stepIndex++;
    }, 500);
  };

  if (!run) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto p-6">
          <div className="text-center text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/runs")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReplay}
              disabled={isReplaying}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {isReplaying ? "Replaying..." : "Replay"}
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">{run.task}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{run.model}</span>
                <span>•</span>
                <span>{new Date(run.created_at).toLocaleString()}</span>
              </div>
            </div>

            <RunSummary
              status={run.status}
              totalSteps={run.total_steps}
              totalTokens={run.total_tokens}
              totalLatencyMs={run.total_latency_ms}
              failureCount={run.failure_count}
            />

            <div className="h-[600px] border border-border rounded-lg overflow-hidden flex">
              <div className="flex-1 flex flex-col">
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {displaySteps.map((step) => (
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
          </div>
        </div>
      </div>
    </div>
  );
}
