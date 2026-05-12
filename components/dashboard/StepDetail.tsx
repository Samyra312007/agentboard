import { formatMs, formatTokens } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";
import type { Step } from "@/types";
import { Button } from "@/components/ui/button";

interface StepDetailProps {
  step: Step | null;
  onClose: () => void;
}

export function StepDetail({ step, onClose }: StepDetailProps) {
  if (!step) return null;

  const getStatusVariant = () => {
    switch (step.status) {
      case "running":
        return "running";
      case "success":
        return "success";
      case "error":
        return "danger";
      default:
        return "default";
    }
  };

  const getTypeLabel = () => {
    switch (step.type) {
      case "llm_call":
        return "LLM Call";
      case "tool_call":
        return "Tool Call";
      case "final_answer":
        return "Final Answer";
    }
  };

  return (
    <div className="w-full h-full bg-card border-l border-border flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            Step {step.step_number}
          </span>
          <span className="text-sm text-muted-foreground">
            — {getTypeLabel()}
          </span>
          <Badge variant={getStatusVariant()}>{step.status}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        {step.tool_name && (
          <div className="mb-4">
            <div className="text-sm text-muted-foreground mb-1">Tool</div>
            <div className="text-sm font-medium text-foreground">{step.tool_name}</div>
          </div>
        )}

        <div className="mb-4">
          <div className="text-sm text-muted-foreground mb-1">Timestamp</div>
          <div className="text-sm text-foreground">{new Date(step.created_at).toLocaleString()}</div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Latency</div>
            <div className="text-sm text-foreground">
              {step.latency_ms ? formatMs(step.latency_ms) : "—"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Tokens</div>
            <div className="text-sm text-foreground">
              {step.tokens_used ? formatTokens(step.tokens_used) : "—"}
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="mb-4">
          <div className="text-sm font-medium text-foreground mb-2">Input</div>
          <pre className="text-xs text-muted-foreground bg-background p-3 rounded border border-border overflow-auto">
            {JSON.stringify(JSON.parse(step.input), null, 2)}
          </pre>
        </div>

        {step.output && (
          <>
            <Separator className="my-4" />
            <div className="mb-4">
              <div className="text-sm font-medium text-foreground mb-2">Output</div>
              <pre className="text-xs text-muted-foreground bg-background p-3 rounded border border-border overflow-auto">
                {JSON.stringify(JSON.parse(step.output), null, 2)}
              </pre>
            </div>
          </>
        )}

        {step.error_message && (
          <>
            <Separator className="my-4" />
            <div className="mb-4">
              <div className="text-sm font-medium text-danger mb-2">Error</div>
              <pre className="text-xs text-danger bg-background p-3 rounded border border-danger/30 overflow-auto">
                {step.error_message}
              </pre>
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  );
}
