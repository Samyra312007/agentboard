"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/dashboard/Header";
import { RunHistory } from "@/components/dashboard/RunHistory";
import type { Run } from "@/types";

const PAGE_SIZE = 50;

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");

  useEffect(() => {
    fetchRuns(0, false);
  }, []);

  const fetchRuns = async (pageOffset: number, append: boolean) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/runs?limit=${PAGE_SIZE}&offset=${pageOffset}`);
      if (!response.ok) throw new Error("Failed to fetch runs");
      const data = await response.json();
      setRuns((prev) => (append ? [...prev, ...data.runs] : data.runs));
      setTotal(data.total);
      setOffset(pageOffset + data.runs.length);
    } catch (error) {
      console.error("Error fetching runs:", error);
    } finally {
      setLoading(false);
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
          {offset < total && (
            <button
              onClick={() => fetchRuns(offset, true)}
              disabled={loading}
              className="mt-4 w-full py-2 text-sm text-primary border border-border rounded-md hover:bg-border/50 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : `Load more (${offset} of ${total})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
