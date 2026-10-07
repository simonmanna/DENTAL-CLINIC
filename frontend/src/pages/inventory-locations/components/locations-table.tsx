"use client";

import { Location } from "@/types/location";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Trash2, MapPin } from "lucide-react";
import { ActionButton, RowActions } from "@/components/ui/action-button";
import { Eye, Pencil, Check, PlusCircle } from "lucide-react";


interface LocationsTableProps {
  locations: Location[];
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => void;
  onView: (location: Location) => void;
}

const typeLabels: Record<string, string> = {
  MAIN_CLINIC: "Main Clinic",
  BRANCH: "Branch",
  STORAGE: "Storage",
  PHARMACY: "Pharmacy",
  LAB: "Laboratory",
  RECEPTION: "Reception",
  WAREHOUSE: "Warehouse",
  MOBILE_UNIT: "Mobile Unit",
  STORE: "Store",
  CLINIC: "Clinic",
  DISPENSARY: "Dispensary",
};

export function LocationsTable({
  locations,
  onEdit,
  onDelete,
  onView,
}: LocationsTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center h-32 text-muted-foreground"
              >
                No locations found
              </TableCell>
            </TableRow>
          ) : (
            locations.map((location) => (
              <TableRow
                key={location.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onView(location)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        marginLeft: `${location.level * 16}px`,
                        backgroundColor:
                          location.level === 0 ? "#3b82f6" : "#6b7280",
                      }}
                    />
                    <div>
                      <div className="font-medium">{location.name}</div>
                      {location.address && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {location.address}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {typeLabels[location.type] || location.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <span className="font-medium">
                      {location._count?.inventoryStocks || 0}
                    </span>{" "}
                    <span className="text-muted-foreground">inventory</span>
                    {" • "}
                    <span className="font-medium">
                      {location._count?.drugStocks || 0}
                    </span>{" "}
                    <span className="text-muted-foreground">drugs</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {location.isActive ? (
                      <Badge
                        variant="default"
                        className="bg-success-muted text-success hover:bg-success-muted"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    {location.isDefault && (
                      <Badge
                        variant="outline"
                        className="border-primary/60 text-primary"
                      >
                        Default
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <RowActions className="justify-start">
                    <ActionButton iconOnly tone="edit" label={`Edit ${location.name}`} onClick={() => onEdit(location)} />
                    <ActionButton iconOnly tone="delete" label={`Delete ${location.name}`} onClick={() => onDelete(location)} />
                  </RowActions>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
