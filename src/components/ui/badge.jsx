import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({ className, variant = "default", ...props }) {
  const variants = {
    default: "border-border bg-background text-foreground",
    primary: "bg-primary/10 text-foreground border-primary/20",
    success: "bg-success/10 text-foreground border-success/20",
    warning: "bg-warning/10 text-foreground border-warning/20",
    danger: "bg-destructive/10 text-foreground border-destructive/20",
    info: "bg-info/10 text-foreground border-info/20",
    reserved: "bg-reserved/10 text-foreground border-reserved/20",
    muted: "bg-muted/10 text-foreground border-muted/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  );
}

export { Badge };

