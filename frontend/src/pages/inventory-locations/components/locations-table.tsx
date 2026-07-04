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
                        className="bg-green-100 text-green-800 hover:bg-green-100"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    {location.isDefault && (
                      <Badge
                        variant="outline"
                        className="border-blue-500 text-blue-600"
                      >
                        Default
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="flex items-center gap-2">
                  <Button
                    title="Edit Details"
                    className="mx-1 h-6 w-8 rounded-md bg-amber-500 p-0 text-white hover:bg-amber-600 shadow-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(location);
                    }}
                  >
                    <Pencil size={16} strokeWidth={3} />
                  </Button>

                  <Button
                    title="Delete"
                    className="h-6 w-8 rounded-md bg-red-600 p-0 text-white hover:bg-red-700 shadow-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(location);
                    }}
                  >
                    <Trash2 size={16} strokeWidth={3} />
                  </Button>
                </TableCell>

                {/* <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(location)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(location)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell> */}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
