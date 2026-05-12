"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/dashboard/Header";
import { RunHistory } from "@/components/dashboard/RunHistory";
import type { Run } from "@/types";

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    try {
      const response = await fetch("/api/runs");
      if (!response.ok) throw new Error("Failed to fetch runs");
      const data = await response.json();
      setRuns(data.runs);
    } catch (error) {
      console.error("Error fetching runs:", error);
    }
  };

  const handleSelectRun = (runId: string) => {
    window.location.href = `/runs/${runId}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold text-foreground mb-6">Run History</h1>
          <div className="h-[calc(100vh-200px)] border border-border rounded-lg overflow-hidden">
            <RunHistory
              runs={runs}
              filter={filter}
              onFilterChange={setFilter}
              onSelectRun={handleSelectRun}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
