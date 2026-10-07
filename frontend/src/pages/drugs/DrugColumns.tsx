import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";
import { ActionButton, RowActions } from "@/components/ui/action-button";
import type { Drug } from "../../types/drug.types";
import { formatPrice } from "../../types/drug.types";

interface ColumnProps {
  onEdit: (drug: Drug) => void;
  onView: (drug: Drug) => void;
  onDelete: (drug: Drug) => void;
  onToggleActive: (drug: Drug) => void;
}

export function getDrugColumns({
  onEdit,
  onView,
  onDelete,
  onToggleActive,
}: ColumnProps): ColumnDef<Drug>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Drug Name
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.name}</span>
          {row.original.genericName && (
            <span className="text-xs text-muted-foreground italic">
              {row.original.genericName}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => {
        const cat = row.original.category;
        return cat ? (
          <Badge
            variant="outline"
            style={{
              borderColor: cat.color ?? "#ccc",
              color: cat.color ?? "#666",
            }}
          >
            {cat.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      accessorKey: "inventoryItem",
      header: "Inventory",
      cell: ({ row }) => {
        const item = row.original.inventoryItem;
        if (!item)
          return (
            <span className="text-muted-foreground text-xs">Unlinked</span>
          );
        return (
          <div className="flex flex-col">
            <span className="font-medium text-xs">{item.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {item.itemCode} • Qty: {item.quantity}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "strength",
      header: "Strength",
      cell: ({ row }) => (
        <span className="text-xs">{row.original.strength ?? "—"}</span>
      ),
    },
    {
      accessorKey: "sellPrice",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Price
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold">
          {formatPrice(row.original.sellPrice)}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          className={
            row.original.isActive
              ? "bg-success hover:bg-success"
              : "bg-muted-foreground"
          }
        >
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      accessorKey: "requiresPrescription",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={
            row.original.requiresPrescription
              ? "border-danger/60 text-danger"
              : "border-primary/60 text-primary"
          }
        >
          {row.original.requiresPrescription ? "Rx" : "OTC"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const drug = row.original;
        return (
          <RowActions className="justify-start">
            <ActionButton iconOnly tone="view" label={`View ${drug.name}`} onClick={() => onView(drug)} />
            <ActionButton iconOnly tone="edit" label={`Edit ${drug.name}`} onClick={() => onEdit(drug)} />
          </RowActions>
        );
      },
    },
  ];
}
