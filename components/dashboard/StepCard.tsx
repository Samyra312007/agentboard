import { formatMs, formatTokens } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, ChevronRight } from "lucide-react";
import type { Step } from "@/types";

interface StepCardProps {
  step: Step;
  onClick: () => void;
}

export function StepCard({ step, onClick }: StepCardProps) {
  const getIcon = () => {
    switch (step.status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-warning" />;
      case "success":
        return <Check className="h-4 w-4 text-primary" />;
      case "error":
        return <X className="h-4 w-4 text-danger" />;
    }
  };

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

  const getBorderColor = () => {
    if (step.status === "error") return "border-l-4 border-l-danger";
    if (step.type === "final_answer") return "border-l-4 border-l-primary";
    return "";
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

  const getSubtitle = () => {
    if (step.type === "llm_call") {
      return step.status === "running" ? "thinking..." : "completed";
    }
    if (step.type === "tool_call") {
      return step.tool_name || "unknown tool";
    }
    if (step.type === "final_answer") {
      return "Task completed";
    }
    return "";
  };

  return (
    <div
      onClick={onClick}
      className={`
        p-4 bg-card border border-border rounded-md cursor-pointer
        hover:bg-border/50 transition-colors
        ${getBorderColor()}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getIcon()}
          <span className="text-sm font-medium text-foreground">
            Step {step.step_number}
          </span>
          <span className="text-sm text-muted-foreground">
            {getTypeLabel()}
          </span>
          <Badge variant={getStatusVariant()} className="text-xs">
            {step.status}
          </Badge>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{getSubtitle()}</span>
        {step.status === "success" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {step.latency_ms && <span>{formatMs(step.latency_ms)}</span>}
            {step.tokens_used && <span>{formatTokens(step.tokens_used)} tokens</span>}
          </div>
        )}
      </div>
      {step.error_message && (
        <div className="mt-2 text-sm text-danger">{step.error_message}</div>
      )}
    </div>
  );
}
