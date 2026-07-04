import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Star,
  StarOff,
  Search,
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  Grid3X3,
  List,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { conditionsApi, Condition, ConditionCategory, CreateConditionDto } from "@/lib/api/conditions";
import { Skeleton } from "@/components/ui/skeleton";

// Category display configuration
const CATEGORY_LABELS: Record<ConditionCategory, string> = {
  CARIES: "Caries",
  PERIODONTAL: "Periodontal",
  PULPAL: "Pulpal",
  PERIAPICAL: "Periapical",
  FRACTURE: "Fracture",
  EROSION_ATTRITION: "Erosion/Attrition",
  DEVELOPMENTAL: "Developmental",
  NEOPLASTIC: "Neoplastic",
  TRAUMATIC: "Traumatic",
  RESTORATIVE: "Restorative",
  OTHER: "Other",
};

const AREA_LABELS: Record<string, string> = {
  Tooth: "Tooth",
  Root: "Root",
  Arch: "Arch",
  Quadrant: "Quadrant",
  "Soft Tissue": "Soft Tissue",
};

const AREA_VARIANTS: Record<string, string> = {
  Tooth: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Root: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Arch: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Quadrant: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Soft Tissue": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
};

type ViewMode = "all" | "favourites" | "system" | "custom";

export function ConditionsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | null>(null);
  const [formData, setFormData] = useState<Partial<CreateConditionDto>>({
    name: "",
    description: "",
    snodentCode: "",
    snomedCtCode: "",
    icd10Code: "",
    icd10Term: "",
    category: "OTHER",
    affectedArea: "Tooth",
    isToothSpecific: true,
    requiresSurface: false,
    isFavourite: false,
  });

  // Queries
// In your ConditionsPage component, update the useQuery:

const { data: conditions = [], isLoading } = useQuery({
  queryKey: ["conditions"],
  queryFn: async () => {
    console.log("Fetching conditions...");
    const result = await conditionsApi.list({ isActive: true });
    console.log("Conditions received:", result);
    return result;
  },
});


  const createMutation = useMutation({
    mutationFn: (dto: CreateConditionDto) => conditionsApi.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conditions"] });
      toast.success("Condition created successfully");
      resetFormAndClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to create condition");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateConditionDto> }) =>
      conditionsApi.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conditions"] });
      toast.success("Condition updated successfully");
      resetFormAndClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to update condition");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => conditionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conditions"] });
      toast.success("Condition deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to delete condition");
    },
  });

  const toggleFavouriteMutation = useMutation({
    mutationFn: (id: string) => conditionsApi.toggleFavourite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conditions"] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to update favourite");
    },
  });

  // Filtering logic
  const filteredConditions = useMemo(() => {
    let filtered = conditions;

    // Apply view mode filter
    switch (viewMode) {
      case "favourites":
        filtered = filtered.filter((c) => c.isFavourite);
        break;
      case "system":
        filtered = filtered.filter((c) => c.isSystem);
        break;
      case "custom":
        filtered = filtered.filter((c) => !c.isSystem);
        break;
      default:
        break;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.icd10Code?.toLowerCase().includes(query) ||
          c.snodentCode?.toLowerCase().includes(query) ||
          c.snomedCtCode?.toLowerCase().includes(query) ||
          c.icd10Term?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [conditions, viewMode, searchQuery]);

  const favouriteCount = conditions.filter((c) => c.isFavourite).length;

  const resetFormAndClose = () => {
    setIsDialogOpen(false);
    setEditingCondition(null);
    setFormData({
      name: "",
      description: "",
      snodentCode: "",
      snomedCtCode: "",
      icd10Code: "",
      icd10Term: "",
      category: "OTHER",
      affectedArea: "Tooth",
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
    });
  };

  const handleEdit = (condition: Condition) => {
    setEditingCondition(condition);
    setFormData({
      name: condition.name,
      description: condition.description || "",
      snodentCode: condition.snodentCode || "",
      snomedCtCode: condition.snomedCtCode || "",
      icd10Code: condition.icd10Code || "",
      icd10Term: condition.icd10Term || "",
      category: condition.category,
      affectedArea: condition.affectedArea || "Tooth",
      isToothSpecific: condition.isToothSpecific,
      requiresSurface: condition.requiresSurface,
      isFavourite: condition.isFavourite,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (condition: Condition) => {
    if (!condition.isSystem && window.confirm(`Delete "${condition.name}"? This action cannot be undone.`)) {
      deleteMutation.mutate(condition.id);
    } else if (condition.isSystem) {
      toast.error("System conditions cannot be deleted");
    }
  };

  const handleSubmit = () => {
    if (!formData.name?.trim()) {
      toast.error("Condition name is required");
      return;
    }

    const submitData: CreateConditionDto = {
      name: formData.name.trim(),
      description: formData.description || undefined,
      snodentCode: formData.snodentCode || undefined,
      snomedCtCode: formData.snomedCtCode || undefined,
      icd10Code: formData.icd10Code || undefined,
      icd10Term: formData.icd10Term || undefined,
      codingSystem: formData.codingSystem,
      category: formData.category!,
      affectedArea: formData.affectedArea,
      isToothSpecific: formData.isToothSpecific ?? true,
      requiresSurface: formData.requiresSurface ?? false,
      isFavourite: formData.isFavourite ?? false,
    };

    if (editingCondition) {
      updateMutation.mutate({ id: editingCondition.id, dto: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  if (isLoading) {
    return <ConditionsPageSkeleton />;
  }

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="border-b sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between px-4 py-2">
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
              className="w-auto"
            >
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-3">
                  All
                </TabsTrigger>
                <TabsTrigger value="favourites" className="text-xs px-3">
                  Favourites
                </TabsTrigger>
                <TabsTrigger value="system" className="text-xs px-3">
                  System
                </TabsTrigger>
                <TabsTrigger value="custom" className="text-xs px-3">
                  Custom
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search condition or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <Button size="sm" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add condition
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead className="w-[90px]">SNODENT</TableHead>
                <TableHead className="w-[100px]">SNOMED CT</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[80px]">ICD-10</TableHead>
                <TableHead className="min-w-[180px]">ICD-10 Terminology</TableHead>
                <TableHead className="w-[90px]">Area</TableHead>
                <TableHead className="w-[50px] text-center">Fav</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConditions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No conditions match your search
                  </TableCell>
                </TableRow>
              ) : (
                filteredConditions.map((condition) => (
                  <TableRow key={condition.id} className="group">
                    <TableCell className="font-mono text-xs">
                      {!condition.isSystem && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-2" />
                      )}
                      {condition.snodentCode || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {condition.snomedCtCode || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={condition.isFavourite ? "font-medium" : ""}>
                          {condition.name}
                        </span>
                        {!condition.isSystem && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Custom
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {CATEGORY_LABELS[condition.category]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-blue-600 dark:text-blue-400">
                      {condition.icd10Code || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {condition.icd10Term || "—"}
                    </TableCell>
                    <TableCell>
                      {condition.affectedArea && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${AREA_VARIANTS[condition.affectedArea] || AREA_VARIANTS.Tooth}`}
                        >
                          {AREA_LABELS[condition.affectedArea] || condition.affectedArea}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleFavouriteMutation.mutate(condition.id)}
                          >
                            {condition.isFavourite ? (
                              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                            ) : (
                              <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {condition.isFavourite ? "Remove from favourites" : "Add to favourites"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(condition)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(condition)}
                              disabled={condition.isSystem}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {condition.isSystem ? "Cannot delete system condition" : "Delete"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground bg-muted/30">
          <span>
            {filteredConditions.length} of {conditions.length} conditions
          </span>
          <span>
            <span className="font-medium text-foreground">{favouriteCount}</span> favourites
          </span>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingCondition ? "Edit condition" : "Add condition"}
              </DialogTitle>
              <DialogDescription>
                {editingCondition
                  ? "Modify the condition details below."
                  : "Create a new condition for the catalog."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Description / name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Dental caries"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="snodent">SNODENT code</Label>
                <Input
                  id="snodent"
                  value={formData.snodentCode}
                  onChange={(e) => setFormData({ ...formData, snodentCode: e.target.value })}
                  placeholder="100227D"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="snomed">SNOMED CT code</Label>
                <Input
                  id="snomed"
                  value={formData.snomedCtCode}
                  onChange={(e) => setFormData({ ...formData, snomedCtCode: e.target.value })}
                  placeholder="109600001"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="icd10">ICD-10 code</Label>
                <Input
                  id="icd10"
                  value={formData.icd10Code}
                  onChange={(e) => setFormData({ ...formData, icd10Code: e.target.value })}
                  placeholder="K02.9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="icd10term">ICD-10 terminology</Label>
                <Input
                  id="icd10term"
                  value={formData.icd10Term}
                  onChange={(e) => setFormData({ ...formData, icd10Term: e.target.value })}
                  placeholder="Dental caries, unspecified"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v: ConditionCategory) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="area">Affected area</Label>
                <Select
                  value={formData.affectedArea}
                  onValueChange={(v) => setFormData({ ...formData, affectedArea: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AREA_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-2">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="favourite"
                      checked={formData.isFavourite}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, isFavourite: !!checked })
                      }
                    />
                    <Label htmlFor="favourite" className="text-sm font-normal cursor-pointer">
                      Mark as favourite
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="surface"
                      checked={formData.requiresSurface}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, requiresSurface: !!checked })
                      }
                    />
                    <Label htmlFor="surface" className="text-sm font-normal cursor-pointer">
                      Requires surface selection
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetFormAndClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingCondition
                    ? "Save changes"
                    : "Save condition"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// Skeleton loader component
function ConditionsPageSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-4 py-2 flex justify-between">
        <div className="flex gap-1">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="p-4">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-8 w-[90px]" />
              <Skeleton className="h-8 w-[100px]" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 w-[80px]" />
              <Skeleton className="h-8 w-[180px]" />
              <Skeleton className="h-8 w-[90px]" />
              <Skeleton className="h-8 w-[50px]" />
              <Skeleton className="h-8 w-[80px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ConditionsPage;