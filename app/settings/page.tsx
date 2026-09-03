"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";

interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);

  const loadKeys = () => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/settings/api-keys");
      if (!response.ok) throw new Error("Failed to load API keys");
      const data = await response.json();
      if (!cancelled) setKeys(data.keys);
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load API keys");
    });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => loadKeys(), []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to create API key");
      }
      const data = await response.json();
      setCreatedKey({ name: data.name, key: data.key });
      setName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this API key? Agents using it will immediately lose access.")) return;
    try {
      const response = await fetch(`/api/settings/api-keys?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete API key");
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete API key");
    }
  };

  const handleCopy = () => {
    if (!createdKey) return;
    void navigator.clipboard.writeText(createdKey.key);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              API keys let external agents report traces to AgentBoard via the{" "}
              <code className="text-primary">/api/v1</code> ingestion API.
            </p>
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {createdKey && (
            <div className="border border-primary/40 bg-primary/5 rounded-lg p-4 space-y-3">
              <p className="text-sm text-foreground">
                Your new key <span className="font-medium">{createdKey.name}</span>. Copy it now —
                it will never be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground">
                  {createdKey.key}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreatedKey(null)}
              >
                Done
              </Button>
            </div>
          )}

          <form onSubmit={handleCreate} className="bg-card border border-border rounded-lg p-4 flex gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production agent"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button type="submit" disabled={creating || !name.trim()} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {creating ? "Creating..." : "Create key"}
            </Button>
          </form>

          <div className="bg-card border border-border rounded-lg divide-y divide-border">
            {keys.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No API keys yet. Create one to start instrumenting your agents.
              </div>
            )}
            {keys.map((key) => (
              <div key={key.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code>{key.prefix}…</code> · created{" "}
                      {new Date(key.created_at).toLocaleDateString()}
                      {key.last_used_at && ` · last used ${new Date(key.last_used_at).toLocaleString()}`}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(key.id)}
                  className="text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}