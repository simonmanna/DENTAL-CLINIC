import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Eye, Pencil, Trash2, Power } from "lucide-react";
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
              ? "bg-green-500 hover:bg-green-600"
              : "bg-gray-500"
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
              ? "border-red-500 text-red-500"
              : "border-sky-500 text-sky-500"
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
          <div className="flex items-center gap-1">
            <Button
            title="View Details"
              className="h-6 w-8 rounded-md bg-sky-600 p-0 text-white hover:bg-sky-700 shadow-sm"
              onClick={() => onView(drug)}
            >
              <Eye size={16} strokeWidth={3} />
            </Button>

            {/* Edit */}
            <Button
            title="Edit Details"
              className="h-6 w-8 rounded-md bg-amber-500 p-0 text-white hover:bg-amber-600 shadow-sm"
              onClick={() => onEdit(drug)}
            >
              <Pencil size={16} strokeWidth={3} />
            </Button>
            {/* <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggleActive(drug)}
            >
              <Power
                className={`h-4 w-4 ${
                  drug.isActive ? "text-orange-500" : "text-green-500"
                }`}
              />
            </Button> */}
            {/* <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDelete(drug)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button> */}
          </div>
        );
      },
    },
  ];
}
