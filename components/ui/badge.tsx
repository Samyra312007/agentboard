import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "danger" | "running";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
        {
          "bg-border text-foreground": variant === "default",
          "bg-primary/20 text-primary": variant === "success",
          "bg-warning/20 text-warning": variant === "warning",
          "bg-danger/20 text-danger": variant === "danger",
          "bg-warning/20 text-warning animate-pulse": variant === "running",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
