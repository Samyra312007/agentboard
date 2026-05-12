import { timeAgo, formatTokens, formatMs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight } from "lucide-react";
import type { Run } from "@/types";

interface RunHistoryProps {
  runs: Run[];
  filter: "all" | "success" | "failed";
  onFilterChange: (filter: "all" | "success" | "failed") => void;
  onSelectRun: (runId: string) => void;
}

export function RunHistory({ runs, filter, onFilterChange, onSelectRun }: RunHistoryProps) {
  const filteredRuns = runs.filter((run) => {
    if (filter === "all") return true;
    if (filter === "success") return run.status === "completed";
    if (filter === "failed") return run.status === "failed";
    return true;
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "failed":
        return "danger";
      case "running":
        return "running";
      default:
        return "default";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex gap-2">
          {(["all", "success", "failed"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "ghost"}
              size="sm"
              onClick={() => onFilterChange(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {filteredRuns.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No runs found
            </div>
          ) : (
            filteredRuns.map((run) => (
              <div
                key={run.id}
                className="p-4 bg-card border border-border rounded-md hover:bg-border/50 transition-colors cursor-pointer"
                onClick={() => onSelectRun(run.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {run.task}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <Badge variant={getStatusVariant(run.status)} className="text-xs">
                        {run.status}
                      </Badge>
                      <span>{run.total_steps} steps</span>
                      <span>{formatTokens(run.total_tokens)} tokens</span>
                      <span>{formatMs(run.total_latency_ms)}</span>
                      <span>{timeAgo(run.created_at)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
