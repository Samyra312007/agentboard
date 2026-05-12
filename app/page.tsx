"use client";

import { useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { RunForm } from "@/components/dashboard/RunForm";
import { LiveTrace } from "@/components/dashboard/LiveTrace";
import type { RunSummary } from "@/types";

export default function Home() {
  const [runId, setRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunSummary, setCurrentRunSummary] = useState<RunSummary | null>(null);

  const handleRunSubmit = async (data: { task: string; model: string; maxSteps: number }) => {
    try {
      setIsRunning(true);
      setRunId(null);
      setCurrentRunSummary(null);

      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to start run");
      }

      const result = await response.json();
      setRunId(result.run_id);
    } catch (error) {
      console.error("Error starting run:", error);
      setIsRunning(false);
      alert("Failed to start run. Please check your OpenAI API key.");
    }
  };

  const handleComplete = (summary: RunSummary) => {
    setCurrentRunSummary(summary);
    setIsRunning(false);
  };

  const handleViewFullRun = () => {
    if (runId) {
      window.location.href = `/runs/${runId}`;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <RunForm onSubmit={handleRunSubmit} isRunning={isRunning} />
          {runId && (
            <div className="h-[600px] border border-border rounded-lg overflow-hidden">
              <LiveTrace
                runId={runId}
                onComplete={handleComplete}
                viewFullRun={handleViewFullRun}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
