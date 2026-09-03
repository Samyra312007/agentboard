"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Bell, Plus, Trash2 } from "lucide-react";

interface Rule {
  id: string;
  name: string;
  metric: "failure_rate" | "avg_latency" | "cost";
  operator: "gt" | "gte";
  threshold: number;
  window_minutes: number;
  channels: { type: "email" | "webhook"; target: string }[];
  enabled: boolean;
  created_at: string;
}

interface Event {
  id: string;
  message: string;
  fired_at: string;
  channels: { type: string; target: string }[];
}

const METRIC_LABELS: Record<Rule["metric"], string> = {
  failure_rate: "Failure rate (%)",
  avg_latency: "Average latency (ms)",
  cost: "Est. cost (USD)",
};

const OPERATOR_LABELS: Record<Rule["operator"], string> = {
  gt: "is greater than",
  gte: "is at least",
};

export default function AlertsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [metric, setMetric] = useState<Rule["metric"]>("failure_rate");
  const [operator, setOperator] = useState<Rule["operator"]>("gt");
  const [threshold, setThreshold] = useState("10");
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [email, setEmail] = useState("");
  const [webhook, setWebhook] = useState("");

  const load = () => {
    let cancelled = false;
    (async () => {
      const [rulesRes, eventsRes] = await Promise.all([
        fetch("/api/settings/alert-rules"),
        fetch("/api/settings/alert-events?limit=25"),
      ]);
      if (!rulesRes.ok || !eventsRes.ok) throw new Error("Failed to load alerts");
      const rulesData = await rulesRes.json();
      const eventsData = await eventsRes.json();
      if (!cancelled) {
        setRules(rulesData.rules);
        setEvents(eventsData.events);
      }
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load alerts");
    });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => load(), []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const channels: { type: "email" | "webhook"; target: string }[] = [];
      if (email.trim()) channels.push({ type: "email", target: email.trim() });
      if (webhook.trim()) channels.push({ type: "webhook", target: webhook.trim() });

      const response = await fetch("/api/settings/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          metric,
          operator,
          threshold: Number(threshold),
          window_minutes: windowMinutes,
          channels,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to create rule");
      }
      setName("");
      setThreshold("10");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this alert rule?")) return;
    try {
      const response = await fetch(`/api/settings/alert-rules?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete rule");
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Alerts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rules are evaluated when a run finishes. Email delivery needs{" "}
              <code className="text-primary">RESEND_API_KEY</code> configured; webhooks work
              out of the box.
            </p>
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleCreate} className="bg-card border border-border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> New rule
            </h2>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. High failure rate"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Metric</label>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as Rule["metric"])}
                  className="w-full px-2 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {(Object.keys(METRIC_LABELS) as Rule["metric"][]).map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Condition</label>
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as Rule["operator"])}
                  className="w-full px-2 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="gt">greater than</option>
                  <option value="gte">at least</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Threshold</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Window</label>
                <select
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(Number(e.target.value))}
                  className="w-full px-2 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={360}>6 hours</option>
                  <option value={1440}>24 hours</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Notify email (optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ops@yourcompany.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Webhook URL (optional)
                </label>
                <input
                  type="url"
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                  placeholder="https://hooks.example.com/agentboard"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={saving || !name.trim() || (!email.trim() && !webhook.trim())}
            >
              {saving ? "Creating..." : "Create rule"}
            </Button>
          </form>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">Rules</h2>
            <div className="bg-card border border-border rounded-lg divide-y divide-border">
              {rules.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No alert rules yet.
                </div>
              )}
              {rules.map((rule) => (
                <div key={rule.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {METRIC_LABELS[rule.metric]} {OPERATOR_LABELS[rule.operator]}{" "}
                      {rule.threshold} over {rule.window_minutes} min ·{" "}
                      {rule.channels.map((c) => c.type).join(", ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(rule.id)}
                    className="text-muted-foreground hover:text-danger shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">History</h2>
            <div className="bg-card border border-border rounded-lg divide-y divide-border">
              {events.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No alerts fired yet.
                </div>
              )}
              {events.map((event) => (
                <div key={event.id} className="p-4">
                  <p className="text-sm text-foreground">{event.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(event.fired_at).toLocaleString()} ·{" "}
                    {event.channels.map((c) => c.type).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}