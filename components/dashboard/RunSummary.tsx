import { formatMs, formatTokens } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface RunSummaryProps {
  status: "running" | "completed" | "failed";
  totalSteps: number;
  totalTokens: number;
  totalLatencyMs: number;
  failureCount: number;
}

export function RunSummary({
  status,
  totalSteps,
  totalTokens,
  totalLatencyMs,
  failureCount,
}: RunSummaryProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-card border border-border rounded-md">
      <Badge variant={status === "running" ? "running" : status === "completed" ? "success" : "danger"}>
        {status.toUpperCase()}
      </Badge>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{totalSteps} steps</span>
        <span>{formatTokens(totalTokens)} tokens</span>
        <span>{formatMs(totalLatencyMs)}</span>
        {failureCount > 0 && (
          <span className="text-danger">{failureCount} ✗</span>
        )}
      </div>
    </div>
  );
}
