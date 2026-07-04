"use client";

import { useState } from "react";
import { Plus, LayoutList, Network, Search, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useLocations,
  useLocationTree,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "@/hooks/use-locations";
import { Location } from "../../types/location";
import { LocationForm } from "./components/location-form";
import { LocationTreeView } from "./components/location-tree-view";
import { LocationsTable } from "./components/locations-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil, Check, Trash2, PlusCircle } from "lucide-react";


export default function LocationsPage() {
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingParentId, setPendingParentId] = useState<string | undefined>(
    undefined,
  );
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(
    null,
  );
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    null,
  );

  const { data: locations, isLoading: isLoadingList } = useLocations({
    search: searchQuery,
  });
  const { data: treeData, isLoading: isLoadingTree } = useLocationTree();

  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation();
  const deleteMutation = useDeleteLocation();

  const handleCreate = async (values: any) => {
    try {
      await createMutation.mutateAsync({
        ...values,
        parentId: pendingParentId,
      });
      setIsCreateOpen(false);
      setPendingParentId(undefined);
      toast.success("Location created successfully");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to create location");
    }
  };

  const handleUpdate = async (values: any) => {
    if (!editingLocation) return;
    try {
      await updateMutation.mutateAsync({ id: editingLocation.id, ...values });
      setEditingLocation(null);
      toast.success("Location updated successfully");
    } catch (error: any) {
      toast.error("Failed to update location");
    }
  };

  const handleDelete = async () => {
    if (!deletingLocation) return;
    try {
      await deleteMutation.mutateAsync(deletingLocation.id);
      if (selectedLocation?.id === deletingLocation.id)
        setSelectedLocation(null);
      setDeletingLocation(null);
      toast.success("Location deleted successfully");
    } catch (error: any) {
      toast.error("Failed to delete location");
    }
  };

  return (
    <div className="container mx-auto p-2 space-y-2 max-w-[1600px]">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Inventory Locations
          </h1>
          <p className="text-muted-foreground">
            Orchestrate your clinical storage hierarchy and supply distribution.
          </p>
        </div>
        <Button
          title="New"
          className="rounded-md bg-blue-700 p-4 text-white hover:bg-blue-800 shadow-sm"
           onClick={() => {
            setPendingParentId(undefined);
            setIsCreateOpen(true);
          }}
        >
          <PlusCircle
            className="mr-2 h-5 w-5"
            fill="white" // Makes the "inside" white
            stroke="#3c8dbc" // Makes the plus sign the blue color of the button
            strokeWidth={2.5}
          /> New Location
        </Button>

        {/* <Button
          onClick={() => {
            setPendingParentId(undefined);
            setIsCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Add Root Location
        </Button> */}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-1">
        {/* Navigation & Tree Panel */}
        <Card className="lg:col-span-8 shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <Tabs
                value={viewMode}
                onValueChange={(v) => setViewMode(v as "tree" | "list")}
                className="w-full sm:w-auto"
              >
                <TabsList>
                  <TabsTrigger value="tree" className="gap-2">
                    <Network className="h-4 w-4" /> Tree
                  </TabsTrigger>
                  <TabsTrigger value="list" className="gap-2">
                    <LayoutList className="h-4 w-4" /> List
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoadingTree || isLoadingList ? (
              <div className="h-96 flex flex-col items-center justify-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                <p className="text-sm text-muted-foreground">
                  Syncing hierarchy...
                </p>
              </div>
            ) : viewMode === "tree" ? (
              <LocationTreeView
                locations={treeData || []}
                selectedId={selectedLocation?.id}
                onSelect={setSelectedLocation}
                onEdit={setEditingLocation}
                onDelete={setDeletingLocation}
                onAddChild={(id) => {
                  setPendingParentId(id);
                  setIsCreateOpen(true);
                }}
              />
            ) : (
              <LocationsTable
                locations={locations || []}
                onEdit={setEditingLocation}
                onDelete={setDeletingLocation}
                onView={setSelectedLocation}
              />
            )}
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <aside className="lg:col-span-4">
          <Card className="sticky top-6 shadow-md border-primary/10">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="h-4 w-4 text-primary" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {selectedLocation ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold">
                        {selectedLocation.name}
                      </h3>
                      <Badge variant="secondary" className="mt-1 capitalize">
                        {selectedLocation.type.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLocation(selectedLocation)}
                    >
                      Edit
                    </Button>
                  </div>

                  <div className="grid gap-3 p-4 bg-muted/30 rounded-lg text-sm">
                    {[
                      ["Address", selectedLocation.address],
                      ["Phone", selectedLocation.phone],
                      ["Email", selectedLocation.email],
                    ].map(
                      ([label, val]) =>
                        val && (
                          <div
                            key={label}
                            className="flex justify-between border-b border-muted last:border-0 pb-2 last:pb-0"
                          >
                            <span className="text-muted-foreground">
                              {label}
                            </span>
                            <span className="font-medium">{val}</span>
                          </div>
                        ),
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 text-center">
                      <span className="text-2xl font-bold text-primary">
                        {selectedLocation._count?.inventoryStocks || 0}
                      </span>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Inventory
                      </p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 text-center">
                      <span className="text-2xl font-bold text-primary">
                        {selectedLocation._count?.drugStocks || 0}
                      </span>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Medical Items
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center space-y-4">
                  <Network className="h-12 w-12 mx-auto opacity-10" />
                  <p className="text-sm text-muted-foreground px-6">
                    Select a storage node to view active stock and management
                    options.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Forms & Dialogs */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {pendingParentId ? "Add Sub-location" : "Create Root Location"}
            </DialogTitle>
          </DialogHeader>
          <LocationForm
            onSubmit={handleCreate}
            isLoading={createMutation.isPending}
            initialParentId={pendingParentId}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingLocation}
        onOpenChange={(open) => !open && setEditingLocation(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update {editingLocation?.name}</DialogTitle>
          </DialogHeader>
          {editingLocation && (
            <LocationForm
              location={editingLocation}
              onSubmit={handleUpdate}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingLocation}
        onOpenChange={(open) => !open && setDeletingLocation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanent Action</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deletingLocation?.name}</strong>? This cannot be
              undone.
              {(deletingLocation?._count?.children ?? 0) > 0 && (
                <span className="block mt-2 font-semibold text-destructive">
                  Error: This location contains sub-locations.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abort</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              disabled={
                deleteMutation.isPending ||
                (deletingLocation?._count?.children ?? 0) > 0
              }
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
