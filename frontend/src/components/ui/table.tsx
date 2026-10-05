import * as React from "react";
import { cn } from "../../lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Pins the header while the body scrolls. Needs a height-bounded wrapper. */
  stickyHeader?: boolean;
  containerClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, stickyHeader, containerClassName, ...props }, ref) => (
    <div
      className={cn(
        "scrollbar-slim relative w-full overflow-auto",
        containerClassName,
      )}
    >
      <table
        ref={ref}
        data-sticky={stickyHeader ? "" : undefined}
        className={cn(
          "w-full caption-bottom border-separate border-spacing-0 text-[13px]",
          className,
        )}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "[&_th]:bg-muted/60 [table[data-sticky]_&_th]:sticky [table[data-sticky]_&_th]:top-0 [table[data-sticky]_&_th]:z-10",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child_td]:border-b-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-border bg-muted/40 font-semibold [&_td]:py-2.5",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "transition-colors hover:bg-primary-muted/40 data-[state=selected]:bg-primary-muted/60",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

interface CellProps {
  /** Right-aligns and tabular-locks figures so decimal points line up. */
  numeric?: boolean;
}

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & CellProps
>(({ className, numeric, ...props }, ref) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      "h-9 border-b border-border px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.045em] text-muted-foreground",
      "[&:has([role=checkbox])]:w-10 [&:has([role=checkbox])]:pr-0",
      numeric && "text-right",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & CellProps
>(({ className, numeric, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "border-b border-border/70 px-3 py-2 align-middle",
      "[&:has([role=checkbox])]:pr-0",
      numeric && "text-right font-medium tabular-nums",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-3 text-[12.5px] text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};
