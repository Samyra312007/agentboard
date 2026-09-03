"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import type { RunStats } from "@/lib/analytics";
import { Download } from "lucide-react";

function BarChart({
  points,
  valueKey,
  label,
}: {
  points: { date: string; count: number; tokens: number }[];
  valueKey: "count" | "tokens";
  label: string;
}) {
  const max = Math.max(...points.map((p) => p[valueKey]), 1);
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-foreground mb-4">{label}</h3>
      <div className="flex items-end gap-[3px] h-32">
        {points.map((p) => (
          <div
            key={p.date}
            title={`${p.date}: ${p[valueKey].toLocaleString()}`}
            className="flex-1 bg-primary/70 hover:bg-primary rounded-sm transition-colors"
            style={{ height: `${Math.max((p[valueKey] / max) * 100, 2)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/runs/stats");
      if (!response.ok) throw new Error("Failed to load analytics");
      const data = await response.json();
      if (!cancelled) setStats(data);
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto p-6 text-center text-danger">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto p-6 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const activeRuns = stats.completed_runs + stats.failed_runs;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Across all {stats.total_runs} runs in the last 30 days
              </p>
            </div>
            <a
              href="/api/runs/export"
              className="inline-flex items-center gap-2 text-sm text-primary border border-border rounded-md px-3 py-2 hover:bg-border/50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Total runs" value={String(stats.total_runs)} />
            <StatCard
              label="Success rate"
              value={`${stats.success_rate.toFixed(1)}%`}
              sub={`${stats.completed_runs} completed · ${stats.failed_runs} failed`}
            />
            <StatCard
              label="Avg latency"
              value={stats.avg_latency_ms > 0 ? `${Math.round(stats.avg_latency_ms)}ms` : "—"}
            />
            <StatCard label="Total tokens" value={stats.total_tokens.toLocaleString()} />
            <StatCard
              label="Est. cost"
              value={`$${stats.estimated_cost_usd.toFixed(2)}`}
              sub="Blended prompt/completion rates"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BarChart points={stats.daily} valueKey="count" label="Runs per day" />
            <BarChart points={stats.daily} valueKey="tokens" label="Tokens per day" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Cost by model (est.)</h3>
              {stats.cost_per_model.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {stats.cost_per_model.map((m) => (
                    <div key={m.model} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate pr-2">{m.model}</span>
                      <span className="text-muted-foreground shrink-0">
                        {m.runs} runs · ${m.cost_usd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Failures by model</h3>
              {stats.failures_by_model.length === 0 ? (
                <p className="text-sm text-muted-foreground">No failures 🎉</p>
              ) : (
                <div className="space-y-2">
                  {stats.failures_by_model.map((m) => (
                    <div key={m.model} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate pr-2">{m.model}</span>
                      <span className="text-danger shrink-0">{m.failed_runs} failed</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {activeRuns > 0
              ? `${stats.running_runs} run(s) still in progress are included in totals but not in the success rate.`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}