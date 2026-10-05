import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
        // Tonal status set — low-contrast fills so a dense table of badges
        // stays readable instead of turning into a row of saturated blocks.
        success: "border-success/25 bg-success-muted text-success",
        warning: "border-warning/25 bg-warning-muted text-warning",
        danger: "border-danger/25 bg-danger-muted text-danger",
        info: "border-info/25 bg-info-muted text-info",
        neutral: "border-border bg-muted text-muted-foreground",
        // Solid counterparts for when a status must carry visual weight
        "success-solid": "border-transparent bg-success text-success-foreground",
        "warning-solid": "border-transparent bg-warning text-warning-foreground",
        "danger-solid": "border-transparent bg-danger text-danger-foreground",
        "info-solid": "border-transparent bg-info text-info-foreground",
      },
      size: {
        default: "",
        sm: "px-1.5 py-0 text-[10.5px] leading-[18px]",
        lg: "px-2.5 py-1 text-[12.5px]",
      },
      dot: { true: "pl-1.5", false: "" },
    },
    defaultVariants: { variant: "default", size: "default", dot: false },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Omit<VariantProps<typeof badgeVariants>, "dot"> {
  /** Leading status dot — lets state read without relying on color alone. */
  dot?: boolean;
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size, dot: !!dot }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70"
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
