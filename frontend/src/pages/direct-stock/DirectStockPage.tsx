import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, ArrowDownToLine, ArrowUpFromLine, Package,
  Calendar, Search, Filter, X, ChevronDown,
  AlertCircle, Loader2, RefreshCw, Clock, TrendingDown, TrendingUp,
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
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';

import { api as API } from '@/lib/api/client';
import type {
  LocationStockItem, BatchInfo, HistoryTransaction, DirectStockStats,
} from '@/services/direct-stock.api';
import {
  directStockIn, directStockOut, getHistory, getDirectStockStats,
  getDirectStockLocationStock, getDirectStockBatches,
} from '@/services/direct-stock.api';

interface Location { id: string; name: string; type: string; }

const REFERENCE_TYPES = ['DIRECT_STOCK_IN', 'DIRECT_STOCK_OUT'];

export default function DirectStockPage() {
  const [activeTab, setActiveTab] = useState('in');
  const [locations, setLocations] = useState<Location[]>([]);
  const [stats, setStats] = useState<DirectStockStats | null>(null);

  // Stock In form state
  const [inLocationId, setInLocationId] = useState('');
  const [inNotes, setInNotes] = useState('');
  const [inItems, setInItems] = useState<Array<{ inventoryItemId: string; itemName: string; unit: string; quantity: number; unitCost: number; batchNumber: string; expiryDate: string }>>([]);
  const [inSubmitting, setInSubmitting] = useState(false);
  const [inSearches, setInSearches] = useState<Record<number, string>>({});
  const [inSearchResults, setInSearchResults] = useState<Record<number, LocationStockItem[]>>({});
  const [inBatchInfo, setInBatchInfo] = useState<Record<string, { batchTracking: boolean; batches: BatchInfo[] }>>({});
  const [showInItemPicker, setShowInItemPicker] = useState(false);
  const [inItemSearch, setInItemSearch] = useState('');
  const [inAllItems, setInAllItems] = useState<LocationStockItem[]>([]);

  // Stock Out form state
  const [outLocationId, setOutLocationId] = useState('');
  const [outNotes, setOutNotes] = useState('');
  const [outItems, setOutItems] = useState<Array<{ inventoryItemId: string; itemName: string; unit: string; quantity: number; unitCost: number; batchTracking: boolean; distributionStrategy: string; selectedBatchNumber: string; availableQty: number }>>([]);
  const [outSubmitting, setOutSubmitting] = useState(false);
  const [outLocationStock, setOutLocationStock] = useState<LocationStockItem[]>([]);
  const [showOutItemPicker, setShowOutItemPicker] = useState(false);
  const [outAvailableBatches, setOutAvailableBatches] = useState<Record<string, { batchTracking: boolean; batches: BatchInfo[] }>>({});
  const [outItemSearch, setOutItemSearch] = useState('');

  // History state
  const [history, setHistory] = useState<HistoryTransaction[]>([]);
  const [historyMeta, setHistoryMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({ search: '', locationId: '', type: '' as string, startDate: '', endDate: '' });

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  // ── Load locations once ──────────────────────────────────────────────────
  useEffect(() => {
    API.get<Location[]>('/locations')
      .then((r) => setLocations(r.data))
      .catch(() => {});
    loadStats();
  }, []);

  useEffect(() => { if (activeTab === 'history') loadHistory(historyPage); }, [activeTab, historyPage]);

  function showFeedback(type: 'success' | 'error', message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function loadStats() {
    try {
      const s = await getDirectStockStats();
      setStats(s);
    } catch {}
  }

  // ── Stock In: load items when picking ────────────────────────────────────
  useEffect(() => {
    if (!showInItemPicker) return;
    API.get<LocationStockItem[]>('/inventory?limit=500&isActive=true')
      .then((r) => {
        if (Array.isArray(r.data)) setInAllItems(r.data);
        else if (r.data && Array.isArray((r.data as any).data)) setInAllItems((r.data as any).data);
      })
      .catch(() => {});
  }, [showInItemPicker]);

  async function fetchItemBatchInfo(itemId: string) {
    if (!inLocationId || inBatchInfo[itemId]) return;
    try {
      const data = await getDirectStockBatches(itemId, inLocationId);
      setInBatchInfo((prev) => ({ ...prev, [itemId]: data }));
    } catch {}
  }

  function addInItem(item: LocationStockItem) {
    setInItems((prev) => [...prev, {
      inventoryItemId: item.id,
      itemName: item.name,
      unit: item.unit,
      quantity: 1,
      unitCost: item.unitCost || 0,
      batchNumber: '',
      expiryDate: '',
    }]);
    fetchItemBatchInfo(item.id);
    setShowInItemPicker(false);
    setInItemSearch('');
  }

  function removeInItem(idx: number) {
    setInItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateInItem(idx: number, field: string, value: any) {
    setInItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleStockIn() {
    if (!inLocationId) { showFeedback('error', 'Select a location'); return; }
    if (inItems.length === 0) { showFeedback('error', 'Add at least one item'); return; }
    setInSubmitting(true);
    try {
      await directStockIn({
        locationId: inLocationId,
        items: inItems.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          batchNumber: it.batchNumber || undefined,
          expiryDate: it.expiryDate || undefined,
          itemName: it.itemName,
          unit: it.unit,
        })),
        notes: inNotes || undefined,
      });
      showFeedback('success', `Stock in recorded successfully`);
      setInItems([]);
      setInNotes('');
      loadStats();
    } catch (err: any) {
      showFeedback('error', err?.response?.data?.message || 'Stock in failed');
    } finally {
      setInSubmitting(false);
    }
  }

  // ── Stock Out ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!outLocationId) { setOutLocationStock([]); return; }
    getDirectStockLocationStock(outLocationId)
      .then(setOutLocationStock)
      .catch(() => {});
  }, [outLocationId]);

  async function fetchOutBatchInfo(itemId: string) {
    if (!outLocationId) return;
    try {
      const data = await getDirectStockBatches(itemId, outLocationId);
      setOutAvailableBatches((prev) => ({ ...prev, [itemId]: data }));
    } catch {}
  }

  function addOutItem(item: LocationStockItem) {
    setOutItems((prev) => [...prev, {
      inventoryItemId: item.id,
      itemName: item.name,
      unit: item.unit,
      quantity: 1,
      unitCost: item.unitCost || 0,
      batchTracking: item.batchTracking,
      distributionStrategy: 'FEFO',
      selectedBatchNumber: '',
      availableQty: item.availableQty,
    }]);
    if (item.batchTracking) fetchOutBatchInfo(item.id);
    setShowOutItemPicker(false);
    setOutItemSearch('');
  }

  function removeOutItem(idx: number) {
    setOutItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateOutItem(idx: number, field: string, value: any) {
    setOutItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleStockOut() {
    if (!outLocationId) { showFeedback('error', 'Select a location'); return; }
    if (outItems.length === 0) { showFeedback('error', 'Add at least one item'); return; }
    setOutSubmitting(true);
    try {
      await directStockOut({
        locationId: outLocationId,
        items: outItems.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          quantity: it.quantity,
          distributionStrategy: it.batchTracking ? (it.distributionStrategy as any) : undefined,
          selectedBatchNumber: it.selectedBatchNumber || undefined,
          itemName: it.itemName,
          unitCost: it.unitCost,
        })),
        notes: outNotes || undefined,
      });
      showFeedback('success', `Stock out recorded successfully`);
      setOutItems([]);
      setOutNotes('');
      loadStats();
      // Refresh location stock
      getDirectStockLocationStock(outLocationId).then(setOutLocationStock);
    } catch (err: any) {
      showFeedback('error', err?.response?.data?.message || 'Stock out failed');
    } finally {
      setOutSubmitting(false);
    }
  }

  // ── History ──────────────────────────────────────────────────────────────
  async function loadHistory(pg?: number) {
    const page = pg ?? historyPage;
    setHistoryLoading(true);
    try {
      const result = await getHistory({
        search: historyFilters.search || undefined,
        locationId: historyFilters.locationId || undefined,
        type: (historyFilters.type as any) || undefined,
        startDate: historyFilters.startDate || undefined,
        endDate: historyFilters.endDate || undefined,
        page,
        limit: 20,
      });
      setHistory(result.data);
      setHistoryMeta({ ...result.meta, page });
    } catch {}
    setHistoryLoading(false);
  }

  function applyHistoryFilters() {
    setHistoryPage(1);
    loadHistory(1);
  }

  const inFilteredItems = inAllItems.filter(
    (i) => !inItemSearch || i.name.toLowerCase().includes(inItemSearch.toLowerCase()) || i.itemCode.toLowerCase().includes(inItemSearch.toLowerCase()),
  );

  const outFilteredStock = outLocationStock.filter(
    (i) => !outItemSearch || i.name.toLowerCase().includes(outItemSearch.toLowerCase()) || i.itemCode.toLowerCase().includes(outItemSearch.toLowerCase()),
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Direct Stock Movements</h1>
          <p className="text-muted-foreground">Quick stock in & out without purchase orders or categories</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => { loadStats(); if (activeTab === 'history') loadHistory(); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div className={`p-3 rounded-md text-sm ${feedback.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {feedback.message}
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Stock In Value</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-green-600">KES {stats.totalInValue.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Stock Out Value</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-red-600">KES {stats.totalOutValue.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Today In</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.todayIn} entries</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Today Out</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.todayOut} entries</p></CardContent>
          </Card>
        </div>
      )}

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="in" className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Stock In</TabsTrigger>
          <TabsTrigger value="out" className="flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4" /> Stock Out</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2"><Clock className="h-4 w-4" /> History</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════
           TAB: STOCK IN
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="in" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Direct Stock In</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Select value={inLocationId} onValueChange={setInLocationId}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input value={inNotes} onChange={(e) => setInNotes(e.target.value)} placeholder="e.g. Supplier drop-off" />
                </div>
              </div>

              {/* Items table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button size="sm" variant="outline" disabled={!inLocationId} onClick={() => setShowInItemPicker(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                </div>
                {inItems.length === 0 ? (
                  <div className="border rounded-md p-8 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No items added yet. Click "Add Item" to start.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="w-24">Qty</TableHead>
                          <TableHead className="w-28">Unit Cost</TableHead>
                          <TableHead className="w-28">Total</TableHead>
                          <TableHead className="w-36">Batch #</TableHead>
                          <TableHead className="w-28">Expiry</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inItems.map((item, idx) => {
                          const bi = inBatchInfo[item.inventoryItemId];
                          const needsBatch = bi?.batchTracking;
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{item.itemName}</TableCell>
                              <TableCell>
                                <Input type="number" min={0.001} step="any" value={item.quantity}
                                  onChange={(e) => updateInItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="h-8 w-20" />
                              </TableCell>
                              <TableCell>
                                <Input type="number" min={0} step="any" value={item.unitCost}
                                  onChange={(e) => updateInItem(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                                  className="h-8 w-24" />
                              </TableCell>
                              <TableCell className="text-right">{(item.quantity * item.unitCost).toFixed(2)}</TableCell>
                              <TableCell>
                                {needsBatch ? (
                                  <Input value={item.batchNumber}
                                    onChange={(e) => updateInItem(idx, 'batchNumber', e.target.value)}
                                    placeholder="Required" className="h-8 w-32" />
                                ) : (
                                  <span className="text-xs text-muted-foreground">N/A</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {needsBatch ? (
                                  <Input type="date" value={item.expiryDate}
                                    onChange={(e) => updateInItem(idx, 'expiryDate', e.target.value)}
                                    className="h-8 w-28" />
                                ) : (
                                  <span className="text-xs text-muted-foreground">N/A</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeInItem(idx)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setInItems([]); setInNotes(''); }}>Clear</Button>
                <Button onClick={handleStockIn} disabled={inSubmitting || inItems.length === 0 || !inLocationId}>
                  {inSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</> : <><ArrowDownToLine className="h-4 w-4 mr-1" /> Record Stock In</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
           TAB: STOCK OUT
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="out" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Direct Stock Out</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Select value={outLocationId} onValueChange={setOutLocationId}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input value={outNotes} onChange={(e) => setOutNotes(e.target.value)} placeholder="e.g. Used in procedure" />
                </div>
              </div>

              {/* Items table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button size="sm" variant="outline" disabled={!outLocationId} onClick={() => setShowOutItemPicker(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                </div>
                {outItems.length === 0 ? (
                  <div className="border rounded-md p-8 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No items added yet. Click "Add Item" to start.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="w-24">Avail</TableHead>
                          <TableHead className="w-24">Qty</TableHead>
                          <TableHead className="w-28">Strategy</TableHead>
                          <TableHead className="w-32">Batch</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {outItems.map((item, idx) => {
                          const bi = outAvailableBatches[item.inventoryItemId];
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{item.itemName}</TableCell>
                              <TableCell>
                                <span className={`text-sm ${item.availableQty < item.quantity ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}>
                                  {item.availableQty}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Input type="number" min={0.001} max={item.availableQty} step="any" value={item.quantity}
                                  onChange={(e) => updateOutItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                  className={`h-8 w-20 ${item.quantity > item.availableQty ? 'border-red-500' : ''}`} />
                              </TableCell>
                              <TableCell>
                                {item.batchTracking ? (
                                  <Select value={item.distributionStrategy} onValueChange={(v) => updateOutItem(idx, 'distributionStrategy', v)}>
                                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="FEFO">FEFO</SelectItem>
                                      <SelectItem value="FIFO">FIFO</SelectItem>
                                      <SelectItem value="MANUAL">Manual</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : <span className="text-xs text-muted-foreground">DEFAULT</span>}
                              </TableCell>
                              <TableCell>
                                {item.batchTracking && item.distributionStrategy === 'MANUAL' && bi?.batches ? (
                                  <Select value={item.selectedBatchNumber} onValueChange={(v) => updateOutItem(idx, 'selectedBatchNumber', v)}>
                                    <SelectTrigger className="h-8"><SelectValue placeholder="Select batch" /></SelectTrigger>
                                    <SelectContent>
                                      {bi.batches.map((b) => (
                                        <SelectItem key={b.id} value={b.batchNumber ?? ''}>
                                          {b.batchNumber} ({b.quantity} left)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{item.batchTracking ? 'Auto' : 'N/A'}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeOutItem(idx)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setOutItems([]); setOutNotes(''); }}>Clear</Button>
                <Button onClick={handleStockOut} disabled={outSubmitting || outItems.length === 0 || !outLocationId}>
                  {outSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</> : <><ArrowUpFromLine className="h-4 w-4 mr-1" /> Record Stock Out</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
           TAB: HISTORY
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <Input placeholder="Search..." value={historyFilters.search}
                    onChange={(e) => setHistoryFilters((f) => ({ ...f, search: e.target.value }))} />
                </div>
                <div>
                  <Select value={historyFilters.locationId} onValueChange={(v) => setHistoryFilters((f) => ({ ...f, locationId: v }))}>
                    <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">All locations</SelectItem>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={historyFilters.type} onValueChange={(v) => setHistoryFilters((f) => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">All types</SelectItem>
                      <SelectItem value="IN">Stock In</SelectItem>
                      <SelectItem value="OUT">Stock Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Input type="date" value={historyFilters.startDate}
                    onChange={(e) => setHistoryFilters((f) => ({ ...f, startDate: e.target.value }))}
                    placeholder="From" />
                </div>
                <div>
                  <Input type="date" value={historyFilters.endDate}
                    onChange={(e) => setHistoryFilters((f) => ({ ...f, endDate: e.target.value }))}
                    placeholder="To" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={applyHistoryFilters}>
                  <Search className="h-4 w-4 mr-1" /> Search
                </Button>
              </div>

              {/* History table */}
              {historyLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : history.length === 0 ? (
                <div className="border rounded-md p-8 text-center text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No direct stock transactions found.
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Total Value</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((tx) => (
                        <TableRow key={tx.code}>
                          <TableCell className="font-mono text-xs">{tx.code}</TableCell>
                          <TableCell>
                            <Badge className={tx.type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {tx.type === 'IN' ? 'IN' : 'OUT'}
                            </Badge>
                          </TableCell>
                          <TableCell>{tx.locationName || tx.locationId.slice(0, 8)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {tx.items.slice(0, 3).map((it, i) => (
                                <div key={i} className="truncate max-w-[200px]">
                                  {it.itemName || it.itemId.slice(0, 8)} × {Math.abs(it.quantityChange)}
                                </div>
                              ))}
                              {tx.items.length > 3 && <div className="text-xs text-muted-foreground">+{tx.items.length - 3} more</div>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">KES {tx.totalValue.toLocaleString()}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{tx.notes || '-'}</TableCell>
                          <TableCell className="text-sm">{format(new Date(tx.timestamp), 'dd MMM yyyy HH:mm')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              {historyMeta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {historyMeta.page} of {historyMeta.totalPages} ({historyMeta.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={historyMeta.page <= 1}
                      onClick={() => { const p = Math.max(1, historyMeta.page - 1); setHistoryPage(p); loadHistory(p); }}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={historyMeta.page >= historyMeta.totalPages}
                      onClick={() => { const p = historyMeta.page + 1; setHistoryPage(p); loadHistory(p); }}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Stock In: Item picker dialog ─────────────────────────────────── */}
      <Dialog open={showInItemPicker} onOpenChange={setShowInItemPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Select Item to Add</DialogTitle></DialogHeader>
          <Input placeholder="Search items..." value={inItemSearch} onChange={(e) => setInItemSearch(e.target.value)}
            className="mb-2" autoFocus />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {inFilteredItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                onClick={() => addInItem(item)}>
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.itemCode} · {item.unit}</p>
                </div>
                <Badge variant="outline">{item.unitCost ? `KES ${item.unitCost}` : 'No cost'}</Badge>
              </div>
            ))}
            {inFilteredItems.length === 0 && <p className="text-sm text-muted-foreground p-2">No items found</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Stock Out: Item picker dialog ──────────────────────────────── */}
      <Dialog open={showOutItemPicker} onOpenChange={setShowOutItemPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Select Item to Remove</DialogTitle></DialogHeader>
          <Input placeholder="Search items with stock..." value={outItemSearch} onChange={(e) => setOutItemSearch(e.target.value)}
            className="mb-2" autoFocus />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {outFilteredStock.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                onClick={() => addOutItem(item)}>
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.itemCode} · {item.unit}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{item.availableQty}</p>
                  <p className="text-xs text-muted-foreground">available</p>
                </div>
              </div>
            ))}
            {outFilteredStock.length === 0 && <p className="text-sm text-muted-foreground p-2">No items with stock at this location</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
