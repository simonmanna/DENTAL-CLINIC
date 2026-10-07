import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import {
  Plus, ArrowDownToLine, ArrowUpFromLine, Package, Search, X,
  AlertCircle, Loader2, RefreshCw, Clock, MapPin, ChevronRight,
  ChevronLeft, Check, Trash2, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BASE_CURRENCY, formatCurrency } from '@/constants/currency';

import { api as API } from '@/lib/api/client';
import type {
  LocationStockItem, BatchInfo, HistoryTransaction,
} from '@/services/direct-stock.api';
import {
  directStockIn, directStockOut, getHistory,
  getDirectStockLocationStock, getDirectStockBatches,
} from '@/services/direct-stock.api';

interface Location { id: string; name: string; type: string; }

type Tab = 'in' | 'out' | 'history';

interface InLine {
  inventoryItemId: string; itemName: string; itemCode?: string; unit: string;
  quantity: number; unitCost: number; batchNumber: string; expiryDate: string;
}
interface OutLine {
  inventoryItemId: string; itemName: string; itemCode?: string; unit: string;
  quantity: number; unitCost: number; batchTracking: boolean;
  distributionStrategy: string; selectedBatchNumber: string; availableQty: number;
}

// Radix Select can't hold an empty-string value, so "all" stands in for "no filter".
const ALL = 'all';
const HISTORY_LIMIT = 20;

const money = (n: number) => formatCurrency(n, BASE_CURRENCY);
const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const errMessage = (err: any, fallback: string) => {
  const m = err?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || fallback;
};

export default function DirectStockPage() {
  const [activeTab, setActiveTab] = useState<Tab>('in');
  const [locations, setLocations] = useState<Location[]>([]);

  // Stock In form state
  const [inLocationId, setInLocationId] = useState('');
  const [inNotes, setInNotes] = useState('');
  const [inItems, setInItems] = useState<InLine[]>([]);
  const [inSubmitting, setInSubmitting] = useState(false);
  const [inBatchInfo, setInBatchInfo] = useState<Record<string, { batchTracking: boolean; batches: BatchInfo[] }>>({});
  const [showInItemPicker, setShowInItemPicker] = useState(false);
  const [inAllItems, setInAllItems] = useState<LocationStockItem[]>([]);
  const [inAllItemsLoading, setInAllItemsLoading] = useState(false);

  // Stock Out form state
  const [outLocationId, setOutLocationId] = useState('');
  const [outNotes, setOutNotes] = useState('');
  const [outItems, setOutItems] = useState<OutLine[]>([]);
  const [outSubmitting, setOutSubmitting] = useState(false);
  const [outLocationStock, setOutLocationStock] = useState<LocationStockItem[]>([]);
  const [outStockLoading, setOutStockLoading] = useState(false);
  const [showOutItemPicker, setShowOutItemPicker] = useState(false);
  const [outAvailableBatches, setOutAvailableBatches] = useState<Record<string, { batchTracking: boolean; batches: BatchInfo[] }>>({});

  // History state
  const [history, setHistory] = useState<HistoryTransaction[]>([]);
  const [historyMeta, setHistoryMeta] = useState({ total: 0, page: 1, limit: HISTORY_LIMIT, totalPages: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ search: '', locationId: '', type: '', startDate: '', endDate: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Load locations once ──────────────────────────────────────────────────
  useEffect(() => {
    API.get<Location[]>('/locations')
      .then((r) => setLocations(r.data))
      .catch(() => toast.error('Could not load locations'));
  }, []);

  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '';

  // ── Stock In ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showInItemPicker || inAllItems.length) return;
    setInAllItemsLoading(true);
    API.get<LocationStockItem[]>('/inventory?limit=500&isActive=true')
      .then((r) => {
        if (Array.isArray(r.data)) setInAllItems(r.data);
        else if (r.data && Array.isArray((r.data as any).data)) setInAllItems((r.data as any).data);
      })
      .catch(() => toast.error('Could not load inventory items'))
      .finally(() => setInAllItemsLoading(false));
  }, [showInItemPicker, inAllItems.length]);

  // Batch info is fetched per location — refetch for the current lines when it changes.
  useEffect(() => {
    setInBatchInfo({});
    if (!inLocationId) return;
    const ids = Array.from(new Set(inItems.map((it) => it.inventoryItemId)));
    ids.forEach((id) => {
      getDirectStockBatches(id, inLocationId)
        .then((data) => setInBatchInfo((prev) => ({ ...prev, [id]: data })))
        .catch(() => {});
    });
  }, [inLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      itemCode: item.itemCode,
      unit: item.unit,
      quantity: 1,
      unitCost: item.unitCost || 0,
      batchNumber: '',
      expiryDate: '',
    }]);
    fetchItemBatchInfo(item.id);
  }

  function updateInItem(idx: number, field: keyof InLine, value: any) {
    setInItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const inErrors = inItems.map((it) => (it.quantity > 0 ? null : 'Enter a quantity above 0'));
  const inValid = !!inLocationId && inItems.length > 0 && inErrors.every((e) => !e);
  const inTotal = inItems.reduce((s, it) => s + it.quantity * it.unitCost, 0);

  async function handleStockIn() {
    if (!inValid) return;
    setInSubmitting(true);
    try {
      const res = await directStockIn({
        locationId: inLocationId,
        items: inItems.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          batchNumber: it.batchNumber.trim() || undefined,
          expiryDate: it.expiryDate || undefined,
          itemName: it.itemName,
          unit: it.unit,
        })),
        notes: inNotes.trim() || undefined,
      });
      toast.success('Stock in recorded', {
        description: `${res?.code ? `${res.code} · ` : ''}${inItems.length} item${inItems.length === 1 ? '' : 's'} into ${locationName(inLocationId)}`,
      });
      setInItems([]);
      setInNotes('');
    } catch (err: any) {
      toast.error('Stock in failed', { description: errMessage(err, 'Please try again.') });
    } finally {
      setInSubmitting(false);
    }
  }

  // ── Stock Out ────────────────────────────────────────────────────────────
  function loadOutStock(locationId: string) {
    if (!locationId) { setOutLocationStock([]); return; }
    setOutStockLoading(true);
    getDirectStockLocationStock(locationId)
      .then(setOutLocationStock)
      .catch(() => toast.error('Could not load stock for this location'))
      .finally(() => setOutStockLoading(false));
  }

  useEffect(() => {
    loadOutStock(outLocationId);
    // Lines were picked against the previous location's stock — they no longer apply.
    setOutItems([]);
    setOutAvailableBatches({});
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
      itemCode: item.itemCode,
      unit: item.unit,
      quantity: 1,
      unitCost: item.unitCost || 0,
      batchTracking: item.batchTracking,
      distributionStrategy: 'FEFO',
      selectedBatchNumber: '',
      availableQty: item.availableQty,
    }]);
    if (item.batchTracking) fetchOutBatchInfo(item.id);
  }

  function updateOutItem(idx: number, field: keyof OutLine, value: any) {
    setOutItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const outErrors = outItems.map((it) => {
    if (!(it.quantity > 0)) return 'Enter a quantity above 0';
    if (it.quantity > it.availableQty) return `Only ${qty(it.availableQty)} ${it.unit} available`;
    if (it.batchTracking && it.distributionStrategy === 'MANUAL' && !it.selectedBatchNumber) return 'Pick a batch';
    return null;
  });
  const outValid = !!outLocationId && outItems.length > 0 && outErrors.every((e) => !e);
  const outTotal = outItems.reduce((s, it) => s + it.quantity * it.unitCost, 0);

  async function handleStockOut() {
    if (!outValid) return;
    setOutSubmitting(true);
    try {
      const res = await directStockOut({
        locationId: outLocationId,
        items: outItems.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          quantity: it.quantity,
          distributionStrategy: it.batchTracking ? (it.distributionStrategy as any) : undefined,
          selectedBatchNumber: it.selectedBatchNumber || undefined,
          itemName: it.itemName,
          unitCost: it.unitCost,
        })),
        notes: outNotes.trim() || undefined,
      });
      toast.success('Stock out recorded', {
        description: `${res?.code ? `${res.code} · ` : ''}${outItems.length} item${outItems.length === 1 ? '' : 's'} from ${locationName(outLocationId)}`,
      });
      setOutItems([]);
      setOutNotes('');
      loadOutStock(outLocationId);
    } catch (err: any) {
      toast.error('Stock out failed', { description: errMessage(err, 'Please try again.') });
    } finally {
      setOutSubmitting(false);
    }
  }

  // ── History ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchInput === historyFilters.search) return;
    const t = setTimeout(() => {
      setHistoryFilters((f) => ({ ...f, search: searchInput }));
      setHistoryPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, historyFilters.search]);

  function setFilter(patch: Partial<typeof historyFilters>) {
    setHistoryFilters((f) => ({ ...f, ...patch }));
    setHistoryPage(1);
  }

  const hasHistoryFilters = Object.values(historyFilters).some(Boolean);
  function clearHistoryFilters() {
    setSearchInput('');
    setHistoryFilters({ search: '', locationId: '', type: '', startDate: '', endDate: '' });
    setHistoryPage(1);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const result = await getHistory({
        search: historyFilters.search.trim() || undefined,
        locationId: historyFilters.locationId || undefined,
        type: (historyFilters.type as any) || undefined,
        startDate: historyFilters.startDate || undefined,
        endDate: historyFilters.endDate || undefined,
        page: historyPage,
        limit: HISTORY_LIMIT,
      });
      setHistory(result.data);
      setHistoryMeta({ ...result.meta, page: historyPage });
    } catch (err: any) {
      toast.error('Could not load history', { description: errMessage(err, 'Please try again.') });
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, historyPage, historyFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    if (activeTab === 'history') loadHistory();
    else if (activeTab === 'out') loadOutStock(outLocationId);
    else setInAllItems([]);
  }

  const refreshing = activeTab === 'history' ? historyLoading : activeTab === 'out' ? outStockLoading : inAllItemsLoading;
  const historyFrom = historyMeta.total ? (historyMeta.page - 1) * HISTORY_LIMIT + 1 : 0;
  const historyTo = Math.min(historyMeta.page * HISTORY_LIMIT, historyMeta.total);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-3 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Direct Stock</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Receive or issue stock at a location without a purchase order.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Direct stock" className="flex gap-1 border-b">
        {([
          { id: 'in', label: 'Stock In', icon: ArrowDownToLine, count: inItems.length },
          { id: 'out', label: 'Stock Out', icon: ArrowUpFromLine, count: outItems.length },
          { id: 'history', label: 'History', icon: Clock, count: 0 },
        ] as const).map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-t-md',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className={cn('h-4 w-4', active && 'text-primary')} />
              {t.label}
              {t.count > 0 && (
                <span className="rounded-full bg-primary-muted px-1.5 text-xs font-semibold tabular-nums text-accent-foreground">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ STOCK IN ═══ */}
      {activeTab === 'in' && (
        <MovementLayout
          main={
            <>
              <LocationField
                id="in-location"
                label="Receive into"
                value={inLocationId}
                onChange={setInLocationId}
                locations={locations}
              />
              <LinesSection
                title="Items received"
                disabled={!inLocationId}
                disabledHint="Choose a location first, then add the items you're receiving."
                count={inItems.length}
                onAdd={() => setShowInItemPicker(true)}
                onClear={() => setInItems([])}
                emptyText="No items yet. Add the items you're receiving."
              >
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="w-28 px-3 py-2 font-medium">Qty</th>
                      <th className="w-32 px-3 py-2 font-medium">Unit cost</th>
                      <th className="w-32 px-3 py-2 font-medium">Batch #</th>
                      <th className="w-36 px-3 py-2 font-medium">Expiry</th>
                      <th className="w-32 px-3 py-2 text-right font-medium">Line total</th>
                      <th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inItems.map((item, idx) => {
                      const tracked = inBatchInfo[item.inventoryItemId]?.batchTracking;
                      const err = inErrors[idx];
                      return (
                        <tr key={idx} className="border-b align-top last:border-0">
                          <td className="px-3 py-2.5">
                            <ItemCell name={item.itemName} code={item.itemCode} unit={item.unit} />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number" min={0} step="any" inputMode="decimal"
                              aria-label={`Quantity for ${item.itemName}`}
                              aria-invalid={!!err}
                              value={item.quantity || ''}
                              onChange={(e) => updateInItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className={cn('h-8 tabular-nums', err && 'border-danger/60 focus-visible:ring-danger/40')}
                            />
                            {err && <p className="mt-1 text-xs text-danger">{err}</p>}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number" min={0} step="any" inputMode="decimal"
                              aria-label={`Unit cost for ${item.itemName}`}
                              value={item.unitCost}
                              onChange={(e) => updateInItem(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                              className="h-8 tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {tracked ? (
                              <Input
                                aria-label={`Batch number for ${item.itemName}`}
                                value={item.batchNumber}
                                onChange={(e) => updateInItem(idx, 'batchNumber', e.target.value)}
                                placeholder="Optional"
                                className="h-8 font-mono text-xs"
                              />
                            ) : <NotTracked />}
                          </td>
                          <td className="px-3 py-2">
                            {tracked ? (
                              <Input
                                type="date"
                                aria-label={`Expiry date for ${item.itemName}`}
                                value={item.expiryDate}
                                min={format(new Date(), 'yyyy-MM-dd')}
                                onChange={(e) => updateInItem(idx, 'expiryDate', e.target.value)}
                                className="h-8 text-xs"
                              />
                            ) : <NotTracked />}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                            {money(item.quantity * item.unitCost)}
                          </td>
                          <td className="px-2 py-2">
                            <RemoveButton label={item.itemName} onClick={() => setInItems((p) => p.filter((_, i) => i !== idx))} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </LinesSection>
            </>
          }
          summary={
            <SummaryPanel
              tone="in"
              title="Stock in summary"
              location={locationName(inLocationId)}
              lines={inItems.length}
              units={inItems.reduce((s, it) => s + (it.quantity || 0), 0)}
              totalLabel="Total value"
              total={inTotal}
              notes={inNotes}
              onNotes={setInNotes}
              notesPlaceholder="e.g. Supplier drop-off, donation…"
              issue={
                !inLocationId ? 'Choose a location' :
                inItems.length === 0 ? 'Add at least one item' :
                inErrors.some(Boolean) ? 'Fix the highlighted lines' : null
              }
              submitting={inSubmitting}
              disabled={!inValid}
              onSubmit={handleStockIn}
              submitLabel="Record stock in"
            />
          }
        />
      )}

      {/* ═══ STOCK OUT ═══ */}
      {activeTab === 'out' && (
        <MovementLayout
          main={
            <>
              <LocationField
                id="out-location"
                label="Issue from"
                value={outLocationId}
                onChange={setOutLocationId}
                locations={locations}
                hint={outLocationId && !outStockLoading
                  ? `${outLocationStock.length} item${outLocationStock.length === 1 ? '' : 's'} in stock here`
                  : undefined}
              />
              <LinesSection
                title="Items issued"
                disabled={!outLocationId}
                disabledHint="Choose a location first — only items in stock there can be issued."
                count={outItems.length}
                onAdd={() => setShowOutItemPicker(true)}
                onClear={() => setOutItems([])}
                emptyText="No items yet. Add the items you're issuing."
              >
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="w-28 px-3 py-2 text-right font-medium">Available</th>
                      <th className="w-32 px-3 py-2 font-medium">Qty</th>
                      <th className="w-32 px-3 py-2 font-medium">Batch rule</th>
                      <th className="w-44 px-3 py-2 font-medium">Batch</th>
                      <th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {outItems.map((item, idx) => {
                      const bi = outAvailableBatches[item.inventoryItemId];
                      const err = outErrors[idx];
                      const over = item.quantity > item.availableQty;
                      return (
                        <tr key={idx} className="border-b align-top last:border-0">
                          <td className="px-3 py-2.5">
                            <ItemCell name={item.itemName} code={item.itemCode} unit={item.unit} />
                          </td>
                          <td className={cn('px-3 py-2.5 text-right tabular-nums', over ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                            {qty(item.availableQty)}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number" min={0} max={item.availableQty} step="any" inputMode="decimal"
                              aria-label={`Quantity for ${item.itemName}`}
                              aria-invalid={!!err}
                              value={item.quantity || ''}
                              onChange={(e) => updateOutItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className={cn('h-8 tabular-nums', err && 'border-danger/60 focus-visible:ring-danger/40')}
                            />
                            {err && <p className="mt-1 text-xs text-danger">{err}</p>}
                          </td>
                          <td className="px-3 py-2">
                            {item.batchTracking ? (
                              <Select value={item.distributionStrategy} onValueChange={(v) => updateOutItem(idx, 'distributionStrategy', v)}>
                                <SelectTrigger className="h-8" aria-label={`Batch rule for ${item.itemName}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="FEFO">First expiry</SelectItem>
                                  <SelectItem value="FIFO">First in</SelectItem>
                                  <SelectItem value="MANUAL">Pick batch</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : <NotTracked />}
                          </td>
                          <td className="px-3 py-2">
                            {item.batchTracking && item.distributionStrategy === 'MANUAL' ? (
                              bi?.batches ? (
                                <Select value={item.selectedBatchNumber} onValueChange={(v) => updateOutItem(idx, 'selectedBatchNumber', v)}>
                                  <SelectTrigger className="h-8" aria-label={`Batch for ${item.itemName}`}><SelectValue placeholder="Select batch" /></SelectTrigger>
                                  <SelectContent>
                                    {bi.batches.map((b) => (
                                      <SelectItem key={b.id} value={b.batchNumber ?? ''}>
                                        <span className="font-mono text-xs">{b.batchNumber || '—'}</span>
                                        <span className="ml-2 text-muted-foreground">
                                          {qty(b.quantity)} left{b.expiryDate ? ` · exp ${format(new Date(b.expiryDate), 'MMM yyyy')}` : ''}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : <Skeleton className="h-8 w-full" />
                            ) : (
                              <span className="inline-flex h-8 items-center text-xs text-muted-foreground">
                                {item.batchTracking ? 'Chosen automatically' : '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <RemoveButton label={item.itemName} onClick={() => setOutItems((p) => p.filter((_, i) => i !== idx))} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </LinesSection>
            </>
          }
          summary={
            <SummaryPanel
              tone="out"
              title="Stock out summary"
              location={locationName(outLocationId)}
              lines={outItems.length}
              units={outItems.reduce((s, it) => s + (it.quantity || 0), 0)}
              totalLabel="Estimated value"
              total={outTotal}
              notes={outNotes}
              onNotes={setOutNotes}
              notesPlaceholder="e.g. Used in procedure, expired, damaged…"
              issue={
                !outLocationId ? 'Choose a location' :
                outItems.length === 0 ? 'Add at least one item' :
                outErrors.some(Boolean) ? 'Fix the highlighted lines' : null
              }
              submitting={outSubmitting}
              disabled={!outValid}
              onSubmit={handleStockOut}
              submitLabel="Record stock out"
            />
          }
        />
      )}

      {/* ═══ HISTORY ═══ */}
      {activeTab === 'history' && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search history"
                placeholder="Search code, item, notes…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
            <Select value={historyFilters.locationId || ALL} onValueChange={(v) => setFilter({ locationId: v === ALL ? '' : v })}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Filter by location"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All locations</SelectItem>
                {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div role="group" aria-label="Filter by type" className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5">
              {[
                { v: '', label: 'All' },
                { v: 'IN', label: 'In' },
                { v: 'OUT', label: 'Out' },
              ].map((o) => (
                <button
                  key={o.v || 'all'}
                  aria-pressed={historyFilters.type === o.v}
                  onClick={() => setFilter({ type: o.v })}
                  className={cn(
                    'h-full rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    historyFilters.type === o.v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
              <input
                type="date" aria-label="From date"
                value={historyFilters.startDate}
                max={historyFilters.endDate || undefined}
                onChange={(e) => setFilter({ startDate: e.target.value })}
                className="w-[118px] bg-transparent text-sm text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
              <span aria-hidden="true">→</span>
              <input
                type="date" aria-label="To date"
                value={historyFilters.endDate}
                min={historyFilters.startDate || undefined}
                onChange={(e) => setFilter({ endDate: e.target.value })}
                className="w-[118px] bg-transparent text-sm text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            {hasHistoryFilters && (
              <Button variant="ghost" size="sm" onClick={clearHistoryFilters} className="text-muted-foreground">
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            )}
          </div>

          {/* Table */}
          {!historyLoading && history.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={hasHistoryFilters ? 'No matching movements' : 'No direct stock movements yet'}
              text={hasHistoryFilters ? 'Try a different search or widen the date range.' : 'Stock you receive or issue here will be listed in this tab.'}
              action={hasHistoryFilters ? <Button variant="outline" size="sm" onClick={clearHistoryFilters}>Clear filters</Button> : null}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed text-sm" aria-busy={historyLoading}>
                <colgroup>
                  <col className="w-10" />
                  <col className="w-[150px]" />
                  <col className="w-[84px]" />
                  <col className="w-[160px]" />
                  <col />
                  <col className="w-[140px]" />
                  <col className="w-[150px]" />
                </colgroup>
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2.5"><span className="sr-only">Expand</span></th>
                    <th className="px-3 py-2.5 font-medium">Reference</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 font-medium">Location</th>
                    <th className="px-3 py-2.5 font-medium">Items</th>
                    <th className="px-3 py-2.5 text-right font-medium">Value</th>
                    <th className="px-3 py-2.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading
                    ? Array.from({ length: 8 }, (_, i) => (
                        <tr key={i} className="h-[57px] border-b last:border-0">
                          <td />
                          <td className="px-3"><Skeleton className="h-3.5 w-24" /></td>
                          <td className="px-3"><Skeleton className="h-5 w-12 rounded-full" /></td>
                          <td className="px-3"><Skeleton className="h-3.5 w-24" /></td>
                          <td className="px-3"><Skeleton className="h-3.5" style={{ width: `${40 + ((i * 23) % 45)}%` }} /></td>
                          <td className="px-3"><Skeleton className="ml-auto h-3.5 w-20" /></td>
                          <td className="px-3"><Skeleton className="h-3.5 w-24" /></td>
                        </tr>
                      ))
                    : history.map((tx) => {
                        const isOpen = expanded === tx.code;
                        const isIn = tx.type === 'IN';
                        const names = tx.items.map((it) => it.itemName || it.itemId.slice(0, 8));
                        const toggle = () => setExpanded(isOpen ? null : tx.code);
                        return (
                          <React.Fragment key={tx.code}>
                            <tr
                              tabIndex={0}
                              aria-expanded={isOpen}
                              onClick={toggle}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                              className={cn(
                                'h-[57px] cursor-pointer border-b transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none',
                                isOpen && 'bg-muted/30',
                              )}
                            >
                              <td className="px-2 text-muted-foreground">
                                <ChevronRight className={cn('mx-auto h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
                              </td>
                              <td className="truncate px-3 font-mono text-xs">{tx.code}</td>
                              <td className="px-3"><TypeBadge type={tx.type} /></td>
                              <td className="truncate px-3">{tx.locationName || tx.locationId.slice(0, 8)}</td>
                              <td className="px-3">
                                <div className="truncate" title={names.join(', ')}>
                                  {names.slice(0, 2).join(', ')}
                                  {names.length > 2 && <span className="text-muted-foreground"> +{names.length - 2} more</span>}
                                </div>
                                {tx.notes && <div className="truncate text-xs text-muted-foreground" title={tx.notes}>{tx.notes}</div>}
                              </td>
                              <td className={cn('px-3 text-right font-medium tabular-nums', isIn ? 'text-success' : 'text-foreground')}>
                                {isIn ? '+' : '−'}{money(tx.totalValue)}
                              </td>
                              <td className="px-3">
                                <div className="tabular-nums">{format(new Date(tx.timestamp), 'dd MMM yyyy')}</div>
                                <div className="text-xs text-muted-foreground tabular-nums">{format(new Date(tx.timestamp), 'HH:mm')}</div>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="border-b bg-muted/20">
                                <td />
                                <td colSpan={6} className="px-3 pb-4 pt-1">
                                  <div className="overflow-hidden rounded-lg border bg-card">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b text-left text-xs text-muted-foreground">
                                          <th className="px-3 py-2 font-medium">Item</th>
                                          <th className="px-3 py-2 text-right font-medium">Qty</th>
                                          <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                                          <th className="px-3 py-2 font-medium">Batch</th>
                                          <th className="px-3 py-2 font-medium">Expiry</th>
                                          <th className="px-3 py-2 text-right font-medium">Value</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tx.items.map((it, i) => (
                                          <tr key={i} className="border-b last:border-0">
                                            <td className="px-3 py-2">
                                              <ItemCell name={it.itemName || it.itemId.slice(0, 8)} code={it.itemCode} unit={it.unit || it.uom} />
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">{qty(Math.abs(it.quantityChange))}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{money(it.unitCost)}</td>
                                            <td className="px-3 py-2 font-mono text-xs">{it.batchNumber || <span className="text-muted-foreground">—</span>}</td>
                                            <td className="px-3 py-2 tabular-nums">{it.expiryDate ? format(new Date(it.expiryDate), 'dd MMM yyyy') : <span className="text-muted-foreground">—</span>}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{money(Math.abs(it.totalValue))}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {tx.notes && (
                                    <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {tx.notes}</p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!historyLoading && historyMeta.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5">
              <p className="text-sm text-muted-foreground tabular-nums">
                Showing <span className="font-medium text-foreground">{historyFrom}–{historyTo}</span> of{' '}
                <span className="font-medium text-foreground">{historyMeta.total}</span>
              </p>
              {historyMeta.totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Previous page"
                    disabled={historyMeta.page <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 text-sm tabular-nums text-muted-foreground">
                    {historyMeta.page} / {historyMeta.totalPages}
                  </span>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Next page"
                    disabled={historyMeta.page >= historyMeta.totalPages} onClick={() => setHistoryPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Item pickers ──────────────────────────────────────────────────── */}
      <ItemPicker
        open={showInItemPicker}
        onOpenChange={setShowInItemPicker}
        title="Add items to receive"
        description={`Receiving into ${locationName(inLocationId)}. Pick as many as you need.`}
        items={inAllItems}
        loading={inAllItemsLoading}
        addedIds={inItems.map((i) => i.inventoryItemId)}
        onPick={addInItem}
        emptyText="No inventory items match."
        renderMeta={(item) => (
          <span className="text-xs tabular-nums text-muted-foreground">{item.unitCost ? money(item.unitCost) : 'No cost set'}</span>
        )}
      />
      <ItemPicker
        open={showOutItemPicker}
        onOpenChange={setShowOutItemPicker}
        title="Add items to issue"
        description={`Only items in stock at ${locationName(outLocationId)} are listed.`}
        items={outLocationStock}
        loading={outStockLoading}
        addedIds={outItems.map((i) => i.inventoryItemId)}
        // Two lines for one item would each be checked against the full balance.
        blockDuplicates
        onPick={addOutItem}
        emptyText="No items with stock at this location."
        renderMeta={(item) => (
          <span className="text-right text-xs tabular-nums">
            <span className="font-semibold text-foreground">{qty(item.availableQty)}</span>
            <span className="text-muted-foreground"> {item.unit} left</span>
          </span>
        )}
      />
    </div>
  );
}

/* ─── Building blocks ──────────────────────────────────────────────────────── */

function MovementLayout({ main, summary }: { main: React.ReactNode; summary: React.ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5 rounded-xl border bg-card p-4 shadow-sm md:p-5">{main}</div>
      <div className="lg:sticky lg:top-4">{summary}</div>
    </div>
  );
}

function LocationField({ id, label, value, onChange, locations, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  locations: Location[]; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        {label} <span className="text-danger">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={cn('max-w-sm', !value && 'text-muted-foreground')}>
          <SelectValue placeholder="Select a location" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LinesSection({ title, disabled, disabledHint, count, onAdd, onClear, emptyText, children }: {
  title: string; disabled: boolean; disabledHint: string; count: number;
  onAdd: () => void; onClear: () => void; emptyText: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {title}
          {count > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({count})</span>}
        </h2>
        <div className="flex gap-1.5">
          {count > 0 && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onClear}>
              Clear all
            </Button>
          )}
          <Button size="sm" variant={count ? 'outline' : 'default'} disabled={disabled} onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add items
          </Button>
        </div>
      </div>
      {count === 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors',
            disabled ? 'cursor-not-allowed bg-muted/20' : 'hover:border-primary/50 hover:bg-primary-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Package className="h-5 w-5" />
          </span>
          {disabled ? disabledHint : emptyText}
        </button>
      ) : (
        <div className="overflow-x-auto rounded-lg border">{children}</div>
      )}
    </div>
  );
}

function SummaryPanel(props: {
  tone: 'in' | 'out'; title: string; location: string; lines: number; units: number;
  totalLabel: string; total: number; notes: string; onNotes: (v: string) => void;
  notesPlaceholder: string; issue: string | null; submitting: boolean; disabled: boolean;
  onSubmit: () => void; submitLabel: string;
}) {
  const Icon = props.tone === 'in' ? ArrowDownToLine : ArrowUpFromLine;
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm md:p-5">
      <h2 className="text-sm font-semibold">{props.title}</h2>
      <dl className="space-y-2 text-sm">
        <Row label="Location" value={props.location || <span className="text-muted-foreground">Not selected</span>} />
        <Row label="Lines" value={props.lines} />
        <Row label="Total quantity" value={qty(props.units)} />
      </dl>
      <div className="flex items-baseline justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">{props.totalLabel}</span>
        <span className="text-xl font-semibold tabular-nums">{money(props.total)}</span>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${props.tone}-notes`}>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea
          id={`${props.tone}-notes`}
          rows={3}
          value={props.notes}
          onChange={(e) => props.onNotes(e.target.value)}
          placeholder={props.notesPlaceholder}
          className="resize-none"
        />
      </div>
      <Button className="w-full" onClick={props.onSubmit} disabled={props.disabled || props.submitting}>
        {props.submitting
          ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Recording…</>
          : <><Icon className="mr-1.5 h-4 w-4" /> {props.submitLabel}</>}
      </Button>
      {props.issue && !props.submitting && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {props.issue}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function ItemCell({ name, code, unit }: { name: string; code?: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={name}>{name}</div>
      {(code || unit) && (
        <div className="truncate text-xs text-muted-foreground">
          {code && <span className="font-mono">{code}</span>}
          {code && unit && ' · '}
          {unit}
        </div>
      )}
    </div>
  );
}

function NotTracked() {
  return <span className="inline-flex h-8 items-center text-xs text-muted-foreground" title="This item isn't batch-tracked">—</span>;
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-danger-muted hover:text-danger"
      aria-label={`Remove ${label}`} onClick={onClick}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function TypeBadge({ type }: { type: 'IN' | 'OUT' }) {
  const isIn = type === 'IN';
  const Icon = isIn ? ArrowDownToLine : ArrowUpFromLine;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
      isIn ? 'bg-success-muted text-success' : 'bg-warning-muted text-warning',
    )}>
      <Icon className="h-3 w-3" /> {isIn ? 'In' : 'Out'}
    </span>
  );
}

function EmptyState({ icon: Icon, title, text, action }: {
  icon: React.ElementType; title: string; text: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-muted text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Searchable, keyboard-navigable item list. Stays open so several items can be added in one go. */
function ItemPicker({ open, onOpenChange, title, description, items, loading, addedIds, blockDuplicates, onPick, emptyText, renderMeta }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description: string;
  items: LocationStockItem[]; loading: boolean; addedIds: string[]; blockDuplicates?: boolean;
  onPick: (item: LocationStockItem) => void; emptyText: string;
  renderMeta: (item: LocationStockItem) => React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.itemCode?.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const added = new Set(addedIds);
  const pick = (item?: LocationStockItem) => {
    if (!item || (blockDuplicates && added.has(item.id))) return;
    onPick(item);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-3 p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="relative px-5">
          <Search className="pointer-events-none absolute left-8 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="item-picker-list"
            aria-activedescendant={filtered[active] ? `picker-${filtered[active].id}` : undefined}
            placeholder="Search by name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); pick(filtered[active]); }
            }}
            className="pl-9"
          />
        </div>
        <div ref={listRef} id="item-picker-list" role="listbox" className="max-h-[50vh] min-h-[200px] overflow-y-auto border-t px-2 py-2">
          {loading ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((item, i) => {
              const isAdded = added.has(item.id);
              const blocked = blockDuplicates && isAdded;
              return (
                <div
                  key={item.id}
                  id={`picker-${item.id}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={blocked}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(item)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-md px-3 py-2',
                    blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                    i === active && !blocked && 'bg-muted',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{item.itemCode}</span> · {item.unit}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {renderMeta(item)}
                    {isAdded && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-success-muted px-1.5 py-0.5 text-[11px] font-semibold text-success">
                        <Check className="h-3 w-3" /> Added
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t px-5 py-3">
          <span className="text-xs text-muted-foreground">
            <kbd className="rounded border px-1 font-mono">↑↓</kbd> move · <kbd className="rounded border px-1 font-mono">Enter</kbd> add
          </span>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
