import * as React from "react";
import {
  Eye, Pencil, Trash2, Printer, Download, CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Row action buttons used in every list/table — one look across the app.
 *
 * Colour carries meaning, so pick the tone by what the action does:
 *   view    → open / view details      (primary)
 *   edit    → edit / modify            (warning)
 *   delete  → delete / void / cancel   (danger)
 *   success → approve / pay / bill     (success)
 *   info    → print / download / misc  (info)
 *   neutral → anything secondary       (slate)
 *
 * Use labelled buttons (the default) where the column has room, like the
 * Visits list. Use `iconOnly` in dense tables, like Drug Inventory — the label
 * then becomes the tooltip and the accessible name, so it is never lost.
 */
export type ActionTone = "view" | "edit" | "delete" | "success" | "info" | "neutral";

const TONE: Record<ActionTone, string> = {
  view: "bg-primary text-primary-foreground hover:bg-primary/90",
  edit: "bg-warning text-warning-foreground hover:bg-warning/90",
  delete: "bg-danger text-danger-foreground hover:bg-danger/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
  info: "bg-info text-info-foreground hover:bg-info/90",
  neutral: "bg-muted-foreground text-background hover:bg-muted-foreground/90",
};

const DEFAULT_ICON: Record<ActionTone, LucideIcon> = {
  view: Eye,
  edit: Pencil,
  delete: Trash2,
  success: CheckCircle2,
  info: Printer,
  neutral: Download,
};

export interface ActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  tone: ActionTone;
  /** Visible text, or the tooltip + accessible name when `iconOnly`. */
  label: string;
  icon?: LucideIcon;
  iconOnly?: boolean;
  loading?: boolean;
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ tone, label, icon, iconOnly, loading, className, disabled, title, onClick, ...props }, ref) => {
    const Icon = icon ?? DEFAULT_ICON[tone];
    return (
      <button
        ref={ref}
        type="button"
        title={title ?? label}
        aria-label={iconOnly ? label : undefined}
        disabled={disabled || loading}
        onClick={(e) => {
          // Rows are usually clickable too; an action must not also open the row.
          e.stopPropagation();
          onClick?.(e);
        }}
        className={cn(
          "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md text-xs font-semibold shadow-sm",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:pointer-events-none disabled:opacity-50",
          iconOnly ? "w-7" : "px-2.5",
          TONE[tone],
          className,
        )}
        {...props}
      >
        {loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
        ) : (
          <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        )}
        {!iconOnly && <span>{label}</span>}
      </button>
    );
  },
);
ActionButton.displayName = "ActionButton";

/** Right-aligned group for a row's actions. Stops clicks reaching a clickable row. */
export function RowActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-end gap-1.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
