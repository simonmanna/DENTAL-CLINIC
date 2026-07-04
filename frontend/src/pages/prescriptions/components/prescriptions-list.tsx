// src/components/prescriptions/prescriptions-list.tsx
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, RefreshCw, Eye, ClipboardCheck, Trash2, AlertCircle, Loader2,
  ClipboardList, X, ArrowUpDown, Ban, MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  PRESCRIPTION_STATUS, PRESCRIPTION_STATUS_VALUES,
  type Prescription, type PrescriptionFilters, type PrescriptionStatus,
  type PrescriptionListResponse,
} from "@/types/prescription";
import { prescriptionApi } from "@/services/prescription-api";

// ─── Constants ─────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc",  label: "Oldest first" },
  { value: "prescriptionCode:asc",  label: "Code (A–Z)" },
  { value: "prescriptionCode:desc", label: "Code (Z–A)" },
  { value: "status:asc",  label: "Status (A–Z)" },
  { value: "validUntil:asc",  label: "Expiring soonest" },
  { value: "validUntil:desc", label: "Expiring latest" },
] as const;

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

const STATUS_FILTER_VALUES = ["ALL", ...PRESCRIPTION_STATUS_VALUES] as const;
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

// ─── Helpers ───────────────────────────────────────────────────────────────

const formatDate = (dateString?: string) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const formatDateRange = (dateString?: string) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
};

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("ellipsis");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

// ─── Status badge ──────────────────────────────────────────────────────────

export function PrescriptionStatusBadge({ status }: { status: PrescriptionStatus }) {
  const config: Record<PrescriptionStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    [PRESCRIPTION_STATUS.ACTIVE]:    { variant: "default",     label: "Active" },
    [PRESCRIPTION_STATUS.DISPENSED]: { variant: "secondary",   label: "Dispensed" },
    [PRESCRIPTION_STATUS.CANCELLED]: { variant: "destructive", label: "Cancelled" },
    [PRESCRIPTION_STATUS.EXPIRED]:   { variant: "outline",     label: "Expired" },
  };
  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Main list component ───────────────────────────────────────────────────

export function PrescriptionsList() {
  const [filters, setFilters] = useState<PrescriptionFilters>({
    page: 1,
    limit: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const [searchTerm, setSearchTerm] = useState("");
  // Date filter inputs — "YYYY-MM-DD" strings from <input type="date">.
  // Converted to ISO with proper day boundaries (local start-of-day / end-of-day)
  // before being pushed to filters.dateFrom / dateTo.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [updateNotes, setUpdateNotes] = useState("");

  const queryClient = useQueryClient();

  // Debounce search input → filter (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        search: searchTerm.trim() || undefined,
        page: 1,
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Date range → filter. Auto-swaps if user picks from > to.
  // `from` is anchored at start of local day, `to` at end of local day,
  // so picking "2026-06-22" → "2026-06-22" returns the full day in local time.
  useEffect(() => {
    let fromStr = dateFrom;
    let toStr = dateTo;
    if (fromStr && toStr && fromStr > toStr) {
      // user typed them in reverse — swap so the filter still makes sense
      [fromStr, toStr] = [toStr, fromStr];
    }
    const fromISO = fromStr
      ? new Date(`${fromStr}T00:00:00.000`).toISOString()
      : undefined;
    const toISO = toStr
      ? new Date(`${toStr}T23:59:59.999`).toISOString()
      : undefined;
    setFilters((prev) => {
      if (prev.dateFrom === fromISO && prev.dateTo === toISO) return prev;
      return { ...prev, dateFrom: fromISO, dateTo: toISO, page: 1 };
    });
  }, [dateFrom, dateTo]);

  // Fetch list
  const { data, isLoading, isFetching, isError, refetch } =
    useQuery<PrescriptionListResponse>({
      queryKey: ["prescriptions", filters],
      queryFn: () => prescriptionApi.list(filters),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    });

  const prescriptions = data?.data ?? [];
  const meta = data?.meta;

  // ─── Mutations ──────────────────────────────────────────────────────────

  const dispenseMutation = useMutation({
    mutationFn: ({ id, dispensedBy }: { id: string; dispensedBy: string }) =>
      prescriptionApi.dispense(id, dispensedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      toast.success("Prescription dispensed");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to dispense"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => prescriptionApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      toast.success("Prescription deleted");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; notes?: string; dispensedBy?: string } }) =>
      prescriptionApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      toast.success("Prescription updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update"),
  });

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleStatusFilter = (value: string) => {
    const v = value as StatusFilter;
    setFilters((prev) => ({
      ...prev,
      status: v === "ALL" ? undefined : (v as PrescriptionStatus),
      page: 1,
    }));
  };

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split(":") as [
      PrescriptionFilters["sortBy"], PrescriptionFilters["sortOrder"],
    ];
    setFilters((prev) => ({ ...prev, sortBy, sortOrder, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    if (!meta) return;
    const clamped = Math.max(1, Math.min(meta.totalPages, newPage));
    setFilters((prev) => ({ ...prev, page: clamped }));
  };

  const handlePageSizeChange = (newLimit: number) => {
    setFilters((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
    setFilters((prev) => ({
      page: 1,
      limit: prev.limit ?? 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    }));
  };

  const handleClearDates = () => {
    setDateFrom("");
    setDateTo("");
  };

  const handleView = (rx: Prescription) => {
    setSelectedPrescription(rx);
    setUpdateNotes(rx.notes || "");
  };

  const handleDispense = (rx: Prescription) => {
    if (window.confirm(`Dispense prescription ${rx.prescriptionCode}?`)) {
      dispenseMutation.mutate({
        id: rx.id,
        // TODO: read from auth context (req.user.staffId on the backend)
        dispensedBy: "Current User",
      });
    }
  };

  const handleDelete = (rx: Prescription) => {
    if (window.confirm(`Delete prescription ${rx.prescriptionCode}? This cannot be undone.`)) {
      deleteMutation.mutate(rx.id);
    }
  };

  const handleCancel = (rx: Prescription) => {
    if (window.confirm(`Cancel prescription ${rx.prescriptionCode}?`)) {
      updateMutation.mutate({ id: rx.id, data: { status: "CANCELLED" } });
    }
  };

  const handleSaveNotes = () => {
    if (!selectedPrescription) return;
    updateMutation.mutate({
      id: selectedPrescription.id,
      data: { notes: updateNotes },
    });
  };

  // ─── Derived ────────────────────────────────────────────────────────────

  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.dateFrom || filters.dateTo ||
    filters.patientId || filters.visitId || filters.dentistId
  );
  const currentSortValue = `${filters.sortBy ?? "createdAt"}:${filters.sortOrder ?? "desc"}`;

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6 flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          Failed to load prescriptions. Please try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header / filters ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Prescriptions
              </CardTitle>
              <CardDescription>
                {isLoading
                  ? "Loading…"
                  : meta
                    ? `${meta.total.toLocaleString()} total`
                    : "—"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by code, patient, or drug…"
                className="pl-9 pr-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Status */}
            <Select
              value={(filters.status as StatusFilter) ?? "ALL"}
              onValueChange={handleStatusFilter}
            >
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "ALL"
                      ? "All statuses"
                      : s.charAt(0) + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Label
                  htmlFor="rx-date-from"
                  className="text-xs text-muted-foreground whitespace-nowrap"
                >
                  From
                </Label>
                <Input
                  id="rx-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  className="w-[150px]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label
                  htmlFor="rx-date-to"
                  className="text-xs text-muted-foreground whitespace-nowrap"
                >
                  To
                </Label>
                <Input
                  id="rx-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  className="w-[150px]"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearDates}
                  aria-label="Clear date filter"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Sort */}
            <Select value={currentSortValue} onValueChange={handleSortChange}>
              <SelectTrigger className="w-full lg:w-[200px]">
                <ArrowUpDown className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Code</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Drugs</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead>Prescriber</TableHead>
                <TableHead className="w-[120px]">Valid until</TableHead>
                <TableHead className="w-[140px]">Created</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : prescriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <ClipboardList className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                    <div className="font-medium text-muted-foreground">
                      No prescriptions found
                    </div>
                    {hasActiveFilters ? (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleClearFilters}
                        className="mt-2"
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-1">
                        Prescriptions are created from a patient visit.
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                prescriptions.map((rx) => (
                  <TableRow key={rx.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-sm">
                      {rx.prescriptionCode}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {rx.patient
                          ? `${rx.patient.firstName} ${rx.patient.lastName}`
                          : <span className="text-muted-foreground">Unknown</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {rx.patient?.patientCode ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm max-w-[220px] truncate">
                        {rx.items.length > 0
                          ? rx.items.map((i) => i.drug.name).join(", ")
                          : <span className="text-muted-foreground">No items</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {rx.items.length} item{rx.items.length !== 1 ? "s" : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <PrescriptionStatusBadge status={rx.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {rx.dentist ? (
                        `Dr. ${rx.dentist.firstName} ${rx.dentist.lastName}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateRange(rx.validUntil)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(rx.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Open actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleView(rx)}>
                            <Eye className="mr-2 h-4 w-4" /> View details
                          </DropdownMenuItem>
                          {rx.status === PRESCRIPTION_STATUS.ACTIVE && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleDispense(rx)}
                                disabled={dispenseMutation.isPending}
                              >
                                <ClipboardCheck className="mr-2 h-4 w-4" /> Dispense
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => handleCancel(rx)}
                                disabled={updateMutation.isPending}
                              >
                                <Ban className="mr-2 h-4 w-4" /> Cancel prescription
                              </DropdownMenuItem>
                            </>
                          )}
                          {rx.status !== PRESCRIPTION_STATUS.DISPENSED && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => handleDelete(rx)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Pagination footer ────────────────────────────────────────── */}
      {meta && meta.total > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Showing{" "}
              <span className="font-medium text-foreground">
                {((meta.page - 1) * meta.limit) + 1}–
                {Math.min(meta.page * meta.limit, meta.total)}
              </span>{" "}
              of <span className="font-medium text-foreground">{meta.total.toLocaleString()}</span>
            </span>
            <div className="flex items-center gap-2">
              <span>Rows:</span>
              <Select
                value={String(meta.limit)}
                onValueChange={(v) => handlePageSizeChange(Number(v))}
              >
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {meta.totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={(e) => {
                      e.preventDefault();
                      handlePageChange(meta.page - 1);
                    }}
                    className={cn(
                      meta.page <= 1 && "pointer-events-none opacity-50",
                    )}
                  />
                </PaginationItem>
                {getPageNumbers(meta.page, meta.totalPages).map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`e-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === meta.page}
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(p);
                        }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    onClick={(e) => {
                      e.preventDefault();
                      handlePageChange(meta.page + 1);
                    }}
                    className={cn(
                      meta.page >= meta.totalPages &&
                        "pointer-events-none opacity-50",
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      {/* ── View / details dialog ────────────────────────────────────── */}
      <Dialog
        open={!!selectedPrescription}
        onOpenChange={(open) => {
          if (!open) setSelectedPrescription(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedPrescription && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono">{selectedPrescription.prescriptionCode}</span>
                  <PrescriptionStatusBadge status={selectedPrescription.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Patient</Label>
                    <div className="font-medium">
                      {selectedPrescription.patient
                        ? `${selectedPrescription.patient.firstName} ${selectedPrescription.patient.lastName}`
                        : "Unknown"}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {selectedPrescription.patient?.patientCode}
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Prescriber</Label>
                    <div className="font-medium">
                      {selectedPrescription.dentist
                        ? `Dr. ${selectedPrescription.dentist.firstName} ${selectedPrescription.dentist.lastName}`
                        : "Not assigned"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Visit</Label>
                    <div>{selectedPrescription.visit?.visitCode ?? "—"}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valid until</Label>
                    <div>{formatDate(selectedPrescription.validUntil)}</div>
                  </div>
                  {selectedPrescription.dispensedAt && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Dispensed</Label>
                      <div>
                        {formatDate(selectedPrescription.dispensedAt)}
                        {selectedPrescription.dispensedBy &&
                          ` · by ${selectedPrescription.dispensedBy}`}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-muted-foreground mb-2 block">
                    Prescribed Items
                  </Label>
                  <div className="border rounded-md divide-y">
                    {selectedPrescription.items.map((item) => (
                      <div key={item.id} className="p-3 text-sm">
                        <div className="font-medium">{item.drug.name}</div>
                        <div className="text-muted-foreground">
                          {item.drug.strength} {item.drug.form}
                        </div>
                        <div className="mt-1">
                          <strong>Sig:</strong>{" "}
                          {item.instructions || item.dosage}
                          {item.frequency && ` • ${item.frequency}`}
                          {item.duration && ` • ${item.duration}`}
                        </div>
                        <div className="text-muted-foreground">
                          Qty: {item.quantity}
                          {item.refills ? ` • Refills: ${item.refills}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedPrescription.status === PRESCRIPTION_STATUS.ACTIVE && (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="rx-notes">Notes</Label>
                      <Textarea
                        id="rx-notes"
                        value={updateNotes}
                        onChange={(e) => setUpdateNotes(e.target.value)}
                        placeholder="Add notes…"
                        rows={3}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleDispense(selectedPrescription)}
                        disabled={dispenseMutation.isPending}
                      >
                        {dispenseMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <ClipboardCheck className="h-4 w-4 mr-2" />
                        )}
                        Dispense
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateMutation.mutate({
                            id: selectedPrescription.id,
                            data: { notes: updateNotes },
                          });
                        }}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Save notes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateMutation.mutate({
                            id: selectedPrescription.id,
                            data: { status: "CANCELLED" },
                          });
                          setSelectedPrescription(null);
                        }}
                        disabled={updateMutation.isPending}
                      >
                        <Ban className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
