// src/pages/inventory/StockOutPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
    Plus, ArrowDownToLine, Package, TrendingDown,
    Calendar, Search, Filter, X, ChevronDown,
    AlertCircle, Loader2, RefreshCw, Eye,
    Trash2, ClipboardList, MapPin,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

import { api as API } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
    id: string;
    name: string;
    type: string;
}

interface InventoryItemStock {
    id: string;
    name: string;
    itemCode: string;
    unit: string;
    unitCost: number;
    availableQty: number;
    batchTracking: boolean;
    category?: { id: string; name: string; color?: string };
}

interface Batch {
    id: string;
    batchNumber: string | null;
    quantity: number;
    expiryDate: string | null;
    receivedAt: string | null;
}

interface StockOutLineItem {
    _key: string; // local UUID for React key
    inventoryItemId: string;
    itemName: string;
    unit: string;
    unitCost: number;
    availableQty: number;
    quantity: number;
    distributionStrategy: 'FEFO' | 'FIFO' | 'MANUAL';
    selectedBatchNumber?: string;
    batchTracking: boolean;
    batches: Batch[];
    loadingBatches: boolean;
    notes?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    GENERAL_USE: 'General Use',
    CLINIC_PROCEDURE: 'Clinic Procedure',
    TRAINING: 'Training',
    DAMAGED: 'Damaged',
    SAMPLE: 'Sample',
    EXPIRED_MINOR: 'Minor Expiry',
    TRANSFER_INFORMAL: 'Informal Transfer',
    OTHER: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
    GENERAL_USE: 'bg-sky-100 text-sky-800',
    CLINIC_PROCEDURE: 'bg-blue-100 text-blue-800',
    TRAINING: 'bg-purple-100 text-purple-800',
    DAMAGED: 'bg-red-100 text-red-800',
    SAMPLE: 'bg-amber-100 text-amber-800',
    EXPIRED_MINOR: 'bg-orange-100 text-orange-800',
    TRANSFER_INFORMAL: 'bg-teal-100 text-teal-800',
    OTHER: 'bg-gray-100 text-gray-700',
};

// ─── Utility ─────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n: number) =>
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockOutPage() {
    const [records, setRecords] = useState<any[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const [stats, setStats] = useState<any>(null);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState('');
    const [filterLocation, setFilterLocation] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [page, setPage] = useState(1);

    // Dialogs
    const [createOpen, setCreateOpen] = useState(false);
    const [detailRecord, setDetailRecord] = useState<any>(null);

    // ── Load data ────────────────────────────────────────────────────────────

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await API.get('/stock-out', {
                params: {
                    page,
                    limit: 20,
                    ...(search && { search }),
                    ...(filterLocation && { locationId: filterLocation }),
                    ...(filterCategory && { category: filterCategory }),
                },
            });
            setRecords(data.data ?? []);
            setMeta(data.meta ?? { total: 0, page: 1, totalPages: 1 });
        } catch (e) {
            console.error('[StockOut] fetchRecords failed:', e);
        } finally {
            setLoading(false);
        }
    }, [page, search, filterLocation, filterCategory]);

    const fetchStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const { data } = await API.get('/stock-out/stats', {
                params: filterLocation ? { locationId: filterLocation } : {},
            });
            setStats(data);
        } catch (e) {
            console.error('[StockOut] fetchStats failed:', e);
            setStats(null);
        } finally {
            setStatsLoading(false);
        }
    }, [filterLocation]);

    const fetchLocations = async () => {
        try {
            const { data } = await API.get('/locations');

            let locationsArray: Location[] = [];
            if (Array.isArray(data)) {
                locationsArray = data;
            } else if (data?.data && Array.isArray(data.data)) {
                locationsArray = data.data;
            } else if (data?.locations && Array.isArray(data.locations)) {
                locationsArray = data.locations;
            } else {
                console.error('[StockOut] Unexpected locations response format:', data);
            }

            setLocations(locationsArray);
            console.log('[StockOut] locations loaded:', locationsArray.length);
        } catch (error) {
            console.error('[StockOut] Failed to fetch locations:', error);
            setLocations([]);
        }
    };

    useEffect(() => {
        fetchLocations();
    }, []);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const handleCreated = () => {
        setCreateOpen(false);
        fetchRecords();
        fetchStats();
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <TooltipProvider>
            <div className="flex flex-col gap-6 p-1 min-h-screen bg-gray-50">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 px-2">
                            {/* <ArrowDownToLine className="h-6 w-6 text-sky-600" /> */}
                            Stock Out
                        </h1>
                        <p className="text-sm text-gray-500 mt-0.5 px-2">
                            Record stock removals from inventory
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { fetchRecords(); fetchStats(); }}
                            className="gap-1.5"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setCreateOpen(true)}
                            className="gap-1.5 bg-sky-600 hover:bg-sky-700"
                        >
                            <Plus className="h-4 w-4" />
                            New Stock Out
                        </Button>
                    </div>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                        icon={<ClipboardList className="h-5 w-5 text-sky-600" />}
                        label="Total Records"
                        value={statsLoading ? '—' : String(stats?.totalRecords ?? 0)}
                        bg="bg-sky-50"
                    />
                    <StatCard
                        icon={<TrendingDown className="h-5 w-5 text-red-500" />}
                        label="Total Value Out"
                        value={statsLoading ? '—' : fmt(stats?.totalValue ?? 0)}
                        bg="bg-red-50"
                    />
                    <StatCard
                        icon={<Calendar className="h-5 w-5 text-amber-600" />}
                        label="This Month"
                        value={statsLoading ? '—' : fmt(stats?.monthlyValue ?? 0)}
                        bg="bg-amber-50"
                    />
                    <StatCard
                        icon={<Package className="h-5 w-5 text-purple-600" />}
                        label="Today's Records"
                        value={statsLoading ? '—' : String(stats?.todayCount ?? 0)}
                        bg="bg-purple-50"
                    />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-1">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search by code, reason, item…"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="pl-9 h-9 text-sm border-gray-200"
                        />
                    </div>

                    <Select
                        value={filterLocation || 'ALL'}
                        onValueChange={(v) => { setFilterLocation(v === 'ALL' ? '' : v); setPage(1); }}
                    >
                        <SelectTrigger className="h-9 w-[180px] text-sm">
                            <MapPin className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                            <SelectValue placeholder="All locations" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Locations</SelectItem>
                            {Array.isArray(locations) && locations.map((l) => (
                                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select
                        value={filterCategory || 'ALL'}
                        onValueChange={(v) => { setFilterCategory(v === 'ALL' ? '' : v); setPage(1); }}
                    >
                        <SelectTrigger className="h-9 w-[160px] text-sm">
                            <Filter className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Categories</SelectItem>
                            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {(search || filterLocation || filterCategory) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSearch(''); setFilterLocation(''); setFilterCategory(''); setPage(1); }}
                            className="h-9 gap-1 text-gray-500"
                        >
                            <X className="h-3.5 w-3.5" /> Clear
                        </Button>
                    )}
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50 border-b border-gray-200">
                                <TableHead className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Code</TableHead>
                                <TableHead className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Location</TableHead>
                                <TableHead className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Category</TableHead>
                                <TableHead className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Items</TableHead>
                                <TableHead className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Reason</TableHead>
                                <TableHead className="font-semibold text-gray-700 text-xs uppercase tracking-wider text-right">Value</TableHead>
                                <TableHead className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Date</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-12">
                                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                                    </TableCell>
                                </TableRow>
                            ) : records.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-14 text-gray-400">
                                        <ArrowDownToLine className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No stock out records found</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                records.map((rec) => (
                                    <TableRow
                                        key={rec.id}
                                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        onClick={() => setDetailRecord(rec)}
                                    >
                                        <TableCell>
                                            <span className="font-mono text-sm font-medium text-sky-700">
                                                {rec.outCode}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-gray-700">{rec.location?.name}</span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[rec.category] ?? 'bg-gray-100 text-gray-700'}`}>
                                                {CATEGORY_LABELS[rec.category] ?? rec.category}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                {rec.items?.slice(0, 2).map((item: any) => (
                                                    <span key={item.id} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                        {item.itemName}
                                                    </span>
                                                ))}
                                                {(rec.items?.length ?? 0) > 2 && (
                                                    <span className="text-xs text-gray-400">+{rec.items.length - 2}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-gray-500 truncate max-w-[140px] block">
                                                {rec.reason ?? '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className="font-medium text-sm text-gray-900">
                                                {fmt(rec.totalValue ?? 0)}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-gray-500">
                                                {rec.createdAt ? format(new Date(rec.createdAt), 'dd MMM yyyy') : '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={(e) => { e.stopPropagation(); setDetailRecord(rec); }}
                                                    >
                                                        <Eye className="h-3.5 w-3.5 text-gray-400" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>View details</TooltipContent>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {meta.totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                            <span className="text-xs text-gray-500">
                                {meta.total} records · Page {meta.page} of {meta.totalPages}
                            </span>
                            <div className="flex gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => p - 1)}
                                    className="h-7 text-xs"
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= meta.totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="h-7 text-xs"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Dialog */}
            <CreateStockOutDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                locations={locations}
                onSuccess={handleCreated}
            />

            {/* Detail Sheet */}
            <StockOutDetailSheet
                record={detailRecord}
                open={!!detailRecord}
                onClose={() => setDetailRecord(null)}
            />
        </TooltipProvider>
    );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
    icon, label, value, bg,
}: { icon: React.ReactNode; label: string; value: string; bg: string }) {
    return (
        <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${bg}`}>{icon}</div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">{label}</p>
                        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

function CreateStockOutDialog({
    open,
    onOpenChange,
    locations,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    locations: Location[];
    onSuccess: () => void;
}) {
    const [locationId, setLocationId] = useState('');
    const [category, setCategory] = useState('GENERAL_USE');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<StockOutLineItem[]>([]);
    const [availableStock, setAvailableStock] = useState<InventoryItemStock[]>([]);
    const [stockLoading, setStockLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [itemSearch, setItemSearch] = useState('');
    const [showItemPicker, setShowItemPicker] = useState(false);

    // Load stock when location changes
    useEffect(() => {
        if (!locationId) { setAvailableStock([]); return; }
        setStockLoading(true);
        API.get(`/stock-out/location-stock/${locationId}`)
            .then((r) => setAvailableStock(Array.isArray(r.data) ? r.data : []))
            .catch(console.error)
            .finally(() => setStockLoading(false));
        setItems([]);
    }, [locationId]);

    // Filter items not already in the list
    const filteredStock = availableStock.filter(
        (s) =>
            !items.find((i) => i.inventoryItemId === s.id) &&
            s.name.toLowerCase().includes(itemSearch.toLowerCase()),
    );

    const addItem = async (stock: InventoryItemStock) => {
        const key = uid();
        const newItem: StockOutLineItem = {
            _key: key,
            inventoryItemId: stock.id,
            itemName: stock.name,
            unit: stock.unit,
            unitCost: stock.unitCost,
            availableQty: stock.availableQty,
            quantity: 1,
            distributionStrategy: 'FEFO',
            batchTracking: stock.batchTracking,
            batches: [],
            loadingBatches: false,
        };
        setItems((prev) => [...prev, newItem]);
        setItemSearch('');
        setShowItemPicker(false);

        // Pre-load batches if batch-tracked (for MANUAL option)
        if (stock.batchTracking) {
            setItems((prev) =>
                prev.map((i) => (i._key === key ? { ...i, loadingBatches: true } : i)),
            );
            try {
                const { data } = await API.get(`/stock-out/batches/${stock.id}`, {
                    params: { locationId },
                });
                setItems((prev) =>
                    prev.map((i) =>
                        i._key === key
                            ? { ...i, batches: data.batches ?? [], loadingBatches: false }
                            : i,
                    ),
                );
            } catch {
                setItems((prev) =>
                    prev.map((i) => (i._key === key ? { ...i, loadingBatches: false } : i)),
                );
            }
        }
    };

    const updateItem = (key: string, patch: Partial<StockOutLineItem>) => {
        setItems((prev) => prev.map((i) => (i._key === key ? { ...i, ...patch } : i)));
    };

    const removeItem = (key: string) => {
        setItems((prev) => prev.filter((i) => i._key !== key));
    };

    const totalValue = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

    const validate = (): string[] => {
        const errs: string[] = [];
        if (!locationId) errs.push('Please select a location.');
        if (items.length === 0) errs.push('Add at least one item.');
        for (const item of items) {
            if (item.quantity <= 0) errs.push(`"${item.itemName}": quantity must be > 0.`);
            if (item.quantity > item.availableQty)
                errs.push(`"${item.itemName}": only ${item.availableQty} ${item.unit} available.`);
            if (item.distributionStrategy === 'MANUAL' && !item.selectedBatchNumber)
                errs.push(`"${item.itemName}": select a batch for MANUAL strategy.`);
        }
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        if (errs.length > 0) { setErrors(errs); return; }
        setErrors([]);
        setSubmitting(true);

        try {
            const payload = {
                locationId,
                category,
                reason: reason || undefined,
                notes: notes || undefined,
                items: items.map((i) => ({
                    inventoryItemId: i.inventoryItemId,
                    itemName: i.itemName,
                    unit: i.unit,
                    unitCost: i.unitCost,
                    quantity: i.quantity,
                    distributionStrategy: i.distributionStrategy,
                    selectedBatchNumber: i.selectedBatchNumber,
                    notes: i.notes,
                })),
            };

            await API.post('/stock-out', payload);

            // Reset
            setLocationId('');
            setCategory('GENERAL_USE');
            setReason('');
            setNotes('');
            setItems([]);
            onSuccess();
        } catch (err: any) {
            const msg = err?.response?.data?.message ?? err?.message ?? 'Network error. Please try again.';
            setErrors([msg]);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                        <ArrowDownToLine className="h-5 w-5 text-sky-600" />
                        New Stock Out
                    </DialogTitle>
                </DialogHeader>

                <div className="px-6 py-4 space-y-5">
                    {/* Location + Category */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-gray-700">
                                Location <span className="text-red-500">*</span>
                            </Label>
                            <Select value={locationId} onValueChange={setLocationId}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Select location…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {locations.map((l) => (
                                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-gray-700">Category</Label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Reason */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-700">Reason</Label>
                        <Input
                            placeholder="e.g. Clinic demonstration, Staff training, Used in procedure…"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="h-9"
                        />
                    </div>

                    {/* Items */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium text-gray-700">
                                Items <span className="text-red-500">*</span>
                            </Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowItemPicker(true)}
                                disabled={!locationId || stockLoading}
                                className="h-7 gap-1.5 text-xs"
                            >
                                {stockLoading
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Plus className="h-3 w-3" />}
                                Add Item
                            </Button>
                        </div>

                        {/* Item picker dropdown */}
                        {showItemPicker && (
                            <div className="border border-gray-200 rounded-lg bg-white shadow-lg p-3 space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <Input
                                        autoFocus
                                        placeholder="Search items…"
                                        value={itemSearch}
                                        onChange={(e) => setItemSearch(e.target.value)}
                                        className="pl-8 h-8 text-sm"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                                    {filteredStock.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-3 text-center">
                                            {itemSearch ? 'No items match your search' : 'No items with stock available'}
                                        </p>
                                    ) : (
                                        filteredStock.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => addItem(s)}
                                                className="w-full flex items-center justify-between px-2 py-2 hover:bg-sky-50 rounded text-left transition-colors group"
                                            >
                                                <div>
                                                    <span className="text-sm font-medium text-gray-800 group-hover:text-sky-700">
                                                        {s.name}
                                                    </span>
                                                    <span className="text-xs text-gray-400 ml-2">{s.itemCode}</span>
                                                    {s.batchTracking && (
                                                        <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                            Batch
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                                                    {s.availableQty} {s.unit}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                                <div className="flex justify-end pt-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowItemPicker(false)}
                                        className="h-7 text-xs text-gray-500"
                                    >
                                        Close
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Line items */}
                        {items.length > 0 && (
                            <div className="space-y-2">
                                {items.map((item) => (
                                    <LineItemRow
                                        key={item._key}
                                        item={item}
                                        onChange={(patch) => updateItem(item._key, patch)}
                                        onRemove={() => removeItem(item._key)}
                                    />
                                ))}
                            </div>
                        )}

                        {items.length === 0 && locationId && !showItemPicker && (
                            <div className="border border-dashed border-gray-200 rounded-lg py-8 text-center">
                                <Package className="h-6 w-6 text-gray-300 mx-auto mb-1.5" />
                                <p className="text-sm text-gray-400">No items added yet</p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowItemPicker(true)}
                                    className="mt-2 text-sky-600 text-xs"
                                >
                                    + Add an item
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-700">Notes</Label>
                        <Textarea
                            placeholder="Additional notes (optional)…"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="text-sm resize-none"
                            rows={2}
                        />
                    </div>

                    {/* Total */}
                    {items.length > 0 && (
                        <div className="flex justify-between items-center bg-sky-50 border border-sky-100 rounded-lg px-4 py-3">
                            <span className="text-sm font-medium text-sky-700">
                                Total Stock Value Out
                            </span>
                            <span className="text-lg font-bold text-sky-900">{fmt(totalValue)}</span>
                        </div>
                    )}

                    {/* Errors */}
                    {errors.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-1">
                            <div className="flex items-center gap-1.5 text-red-700 text-sm font-medium">
                                <AlertCircle className="h-4 w-4" />
                                Please fix the following:
                            </div>
                            {errors.map((e, i) => (
                                <p key={i} className="text-sm text-red-600 ml-5">• {e}</p>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={submitting}
                        className="text-sm"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || items.length === 0}
                        className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-sm"
                    >
                        {submitting ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</>
                        ) : (
                            <><ArrowDownToLine className="h-3.5 w-3.5" /> Confirm Stock Out</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Line Item Row ────────────────────────────────────────────────────────────

function LineItemRow({
    item,
    onChange,
    onRemove,
}: {
    item: StockOutLineItem;
    onChange: (patch: Partial<StockOutLineItem>) => void;
    onRemove: () => void;
}) {
    const isOverQty = item.quantity > item.availableQty;
    const isBadQty = item.quantity <= 0;

    return (
        <div className={`border rounded-lg p-3 space-y-2 transition-colors ${isOverQty || isBadQty ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
            {/* Item name + remove */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{item.itemName}</span>
                        {item.batchTracking && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                Batch tracked
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-400">
                        Available: {item.availableQty} {item.unit} · {fmt(item.unitCost)}/{item.unit}
                    </span>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                    onClick={onRemove}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Controls row */}
            <div className="grid grid-cols-3 gap-2">
                {/* Quantity */}
                <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Quantity</Label>
                    <Input
                        type="number"
                        min={0.001}
                        step={0.001}
                        max={item.availableQty}
                        value={item.quantity}
                        onChange={(e) => onChange({ quantity: parseFloat(e.target.value) || 0 })}
                        className={`h-8 text-sm ${isOverQty || isBadQty ? 'border-red-300 focus:ring-red-200' : ''}`}
                    />
                    {isOverQty && (
                        <p className="text-xs text-red-500">Exceeds available stock</p>
                    )}
                </div>

                {/* Strategy */}
                <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Strategy</Label>
                    <Select
                        value={item.distributionStrategy}
                        onValueChange={(v: any) =>
                            onChange({ distributionStrategy: v, selectedBatchNumber: undefined })
                        }
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="FEFO">FEFO (Soonest Expiry)</SelectItem>
                            <SelectItem value="FIFO">FIFO (Oldest First)</SelectItem>
                            {item.batchTracking && <SelectItem value="MANUAL">Manual Batch</SelectItem>}
                        </SelectContent>
                    </Select>
                </div>

                {/* Manual batch selector */}
                {item.distributionStrategy === 'MANUAL' && item.batchTracking && (
                    <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Select Batch</Label>
                        {item.loadingBatches ? (
                            <div className="h-8 flex items-center">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                            </div>
                        ) : (
                            <Select
                                value={item.selectedBatchNumber ?? ''}
                                onValueChange={(v) => onChange({ selectedBatchNumber: v || undefined })}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Choose batch…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {item.batches.map((b) => (
                                        <SelectItem key={b.id} value={b.batchNumber ?? 'DEFAULT'}>
                                            <span>
                                                {b.batchNumber ?? 'DEFAULT'} · {b.quantity} units
                                                {b.expiryDate && (
                                                    <span className="text-gray-400 ml-1">
                                                        (exp {format(new Date(b.expiryDate), 'MMM yyyy')})
                                                    </span>
                                                )}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                )}
            </div>

            {/* Item-level notes */}
            <Input
                placeholder="Item notes (optional)"
                value={item.notes ?? ''}
                onChange={(e) => onChange({ notes: e.target.value || undefined })}
                className="h-7 text-xs border-gray-200"
            />
        </div>
    );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function StockOutDetailSheet({
    record,
    open,
    onClose,
}: {
    record: any;
    open: boolean;
    onClose: () => void;
}) {
    if (!record) return null;

    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader className="pb-4 border-b border-gray-100">
                    <SheetTitle className="flex items-center gap-2">
                        <ArrowDownToLine className="h-4 w-4 text-sky-600" />
                        {record.outCode}
                    </SheetTitle>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[record.category] ?? 'bg-gray-100 text-gray-700'}`}>
                            {CATEGORY_LABELS[record.category] ?? record.category}
                        </span>
                        <span className="text-xs text-gray-400">
                            {record.createdAt ? format(new Date(record.createdAt), 'dd MMM yyyy, HH:mm') : ''}
                        </span>
                    </div>
                </SheetHeader>

                <div className="space-y-5 py-4">
                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Location</p>
                            <p className="mt-0.5 text-gray-800">{record.location?.name ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Value</p>
                            <p className="mt-0.5 font-semibold text-gray-900">{fmt(record.totalValue ?? 0)}</p>
                        </div>
                        {record.reason && (
                            <div className="col-span-2">
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Reason</p>
                                <p className="mt-0.5 text-gray-800">{record.reason}</p>
                            </div>
                        )}
                        {record.notes && (
                            <div className="col-span-2">
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Notes</p>
                                <p className="mt-0.5 text-gray-600 text-sm">{record.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Items */}
                    <div>
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Items</p>
                        <div className="space-y-2">
                            {record.items?.map((item: any) => (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{item.itemName}</p>
                                        <p className="text-xs text-gray-400">
                                            {item.distributionStrategy} · {item.unit}
                                            {item.batchNumber && ` · Batch: ${item.batchNumber}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-gray-900">
                                            {item.quantity} {item.unit}
                                        </p>
                                        <p className="text-xs text-gray-400">{fmt(item.totalCost)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Ledger entries */}
                    {record.ledgerEntries?.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                                Ledger Entries
                            </p>
                            <div className="space-y-1.5">
                                {record.ledgerEntries.map((entry: any) => (
                                    <div
                                        key={entry.id}
                                        className="flex items-center justify-between text-xs bg-red-50 border border-red-100 rounded px-2.5 py-2"
                                    >
                                        <div>
                                            <span className="font-mono text-red-700">{entry.ledgerCode}</span>
                                            {entry.batch?.batchNumber && (
                                                <span className="ml-2 text-gray-500">· {entry.batch.batchNumber}</span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="text-red-600 font-medium">
                                                {entry.quantityChange} {entry.location?.name ?? ''}
                                            </span>
                                            <span className="text-gray-400 ml-2">
                                                {entry.quantityBefore} → {entry.quantityAfter}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
