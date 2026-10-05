import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, RefreshCw, ArrowRight, Warehouse, ArrowLeftRight, 
  Package, Pill, Search, History, MapPin, X, ChevronDown, 
  User, FileText, Activity
} from 'lucide-react';
import {
  locationsApi, inventoryApi, pharmacyApi,
  type Location, type StockMovement, type Drug, type InventoryItem,
} from '../../lib/api/inventory';
import { formatDate, statusBadgeClass } from '../../lib/utils';

const LOCATION_TYPES = ['PHARMACY', 'STORE', 'CLINIC', 'DISPENSARY', 'LAB'];
const MOVEMENT_TYPES = ['TRANSFER_IN', 'TRANSFER_OUT', 'INITIAL_STOCK', 'ADJUSTMENT'];

// --- Enhanced Location Dialog ---
function LocationDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', type: 'PHARMACY', description: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try { await locationsApi.create(form); onSaved(); }
    catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-border/60 flex justify-between items-center bg-muted/50">
          <h2 className="text-lg font-bold text-foreground">New Storage Location</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Location Name</label>
            <input className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary/60 outline-none transition-all" 
                   value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Emergency Ward A" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Facility Type</label>
            <select className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary/60 outline-none transition-all appearance-none" 
                    value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
              {LOCATION_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Description (Optional)</label>
            <textarea className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary/60 outline-none transition-all" 
                      rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Describe the location's purpose..." />
          </div>
        </div>
        <div className="p-6 bg-muted/50 border-t border-border/60 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-muted-foreground font-medium hover:text-foreground transition-colors">Cancel</button>
          <button onClick={save} disabled={saving || !form.name} className="bg-primary hover:bg-primary text-white px-6 py-2 rounded-lg font-semibold shadow-lg shadow-sky-200 disabled:opacity-50 transition-all">
            {saving ? 'Creating...' : 'Confirm Location'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Refined Transfer Dialog ---
function TransferDialog({ locations, drugs, items, onClose, onSaved }: {
  locations: Location[]; drugs: Drug[]; items: InventoryItem[];
  onClose: () => void; onSaved: () => void;
}) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [notes, setNotes] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [lines, setLines] = useState([{ type: 'drug' as 'drug' | 'item', id: '', quantity: 1 }]);
  const [saving, setSaving] = useState(false);

  const addLine = () => setLines(l => [...l, { type: 'drug', id: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, k: string, v: string | number) =>
    setLines(l => l.map((line, idx) => idx !== i ? line : { ...line, [k]: v }));

  const save = async () => {
    if (!fromId || !toId || fromId === toId || lines.some(l => !l.id)) return;
    setSaving(true);
    try {
      await locationsApi.transfer({
        fromLocationId: fromId,
        toLocationId: toId,
        notes: notes || undefined,
        performedBy: performedBy || undefined,
        items: lines.map(l => ({
          drugId: l.type === 'drug' ? l.id : undefined,
          itemId: l.type === 'item' ? l.id : undefined,
          quantity: l.quantity,
        })),
      });
      onSaved();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="p-6 border-b border-border/60 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-foreground">Transfer Stock</h2>
            <p className="text-sm text-muted-foreground">Move inventory between facility locations</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-5 h-5 text-muted-foreground/70" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Visual Route */}
          <div className="flex items-center gap-4 bg-primary-muted/50 p-4 rounded-xl border border-primary/20">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-primary uppercase mb-1 block">Origin</label>
              <select className="w-full bg-transparent font-medium text-foreground outline-none cursor-pointer" value={fromId} onChange={e => setFromId(e.target.value)}>
                <option value="">Select Origin</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="bg-white p-2 rounded-full shadow-sm">
              <ArrowRight className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-primary uppercase mb-1 block">Destination</label>
              <select className="w-full bg-transparent font-medium text-foreground outline-none cursor-pointer" value={toId} onChange={e => setToId(e.target.value)}>
                <option value="">Select Destination</option>
                {locations.filter(l => l.id !== fromId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          {/* Lines Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Inventory Items</h3>
              <button onClick={addLine} className="flex items-center gap-1 text-sm text-primary hover:text-primary font-semibold bg-primary-muted/60 px-3 py-1 rounded-full transition-all">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
            
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl border border-border/60 group">
                   <select className="bg-white border border-border rounded-md text-xs px-2 py-1.5 focus:ring-1 ring-primary/60 outline-none" value={line.type} onChange={e => updateLine(i, 'type', e.target.value)}>
                    <option value="drug">Drug</option>
                    <option value="item">Supply</option>
                  </select>
                  <div className="flex-1">
                    <select className="w-full bg-white border border-border rounded-md text-sm px-3 py-1.5 focus:ring-1 ring-primary/60 outline-none" value={line.id} onChange={e => updateLine(i, 'id', e.target.value)}>
                      <option value="">Select item...</option>
                      {line.type === 'drug'
                        ? drugs.map(d => <option key={d.id} value={d.id}>{d.name} ({d.stockQuantity} {d.unit} left)</option>)
                        : items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.quantity} {it.unit} left)</option>)
                      }
                    </select>
                  </div>
                  <input type="number" className="w-20 bg-white border border-border rounded-md text-sm px-3 py-1.5 focus:ring-1 ring-primary/60 outline-none" value={line.quantity} min={1}
                    onChange={e => updateLine(i, 'quantity', +e.target.value)} />
                  <button onClick={() => removeLine(i)} className="p-1.5 text-muted-foreground/50 hover:text-danger hover:bg-danger-muted/60 rounded-md transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/60">
            <div>
              <label className="text-xs font-bold text-muted-foreground/70 uppercase mb-1 block">Handled By</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70" />
                <input className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-border rounded-lg text-sm" value={performedBy} onChange={e => setPerformedBy(e.target.value)} placeholder="Personnel Name" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground/70 uppercase mb-1 block">Notes / Reason</label>
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70" />
                <input className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-border rounded-lg text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal remarks" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-muted/50 border-t border-border/60 flex gap-3 justify-end">
          <button onClick={onClose} className="px-6 py-2 text-muted-foreground font-medium hover:text-foreground transition-colors">Discard</button>
          <button onClick={save} disabled={saving || !fromId || !toId || lines.some(l => !l.id)} className="bg-success hover:bg-success text-white px-8 py-2 rounded-lg font-bold shadow-lg shadow-emerald-100 disabled:opacity-50 transition-all flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            {saving ? 'Processing...' : 'Complete Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Enhanced Stock Card ---
function LocationStockCard({ location }: { location: Location }) {
  const [stock, setStock] = useState<{ drugs: any[]; items: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    locationsApi.getStock(location.id).then(setStock).catch(() => {}).finally(() => setLoading(false));
  }, [location.id]);

  const typeIcon: Record<string, JSX.Element> = { 
    PHARMACY: <Pill className="w-5 h-5 text-primary" />, 
    STORE: <Warehouse className="w-5 h-5 text-warning" />, 
    CLINIC: <Activity className="w-5 h-5 text-danger" />, 
    DISPENSARY: <Package className="w-5 h-5 text-success" />, 
    LAB: <History className="w-5 h-5 text-purple-600" /> 
  };

  const bgColors: Record<string, string> = { 
    PHARMACY: 'bg-primary-muted/60', STORE: 'bg-warning-muted/60', CLINIC: 'bg-danger-muted/60', DISPENSARY: 'bg-success-muted/60', LAB: 'bg-purple-50' 
  };

  return (
    <div className={`bg-white border border-border rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md ${expanded ? 'ring-2 ring-primary/20' : ''}`}>
      <div className="p-4 flex items-center justify-between cursor-pointer group" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 ${bgColors[location.type] || 'bg-muted'} rounded-xl flex items-center justify-center transition-transform group-hover:scale-110`}>
            {typeIcon[location.type] ?? <MapPin className="w-5 h-5 text-muted-foreground" />}
          </div>
          <div>
            <h3 className="font-bold text-foreground leading-tight">{location.name}</h3>
            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{location.type}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {!loading && stock && (
            <div className="hidden sm:flex gap-4">
              <div className="text-right">
                <p className="text-xs font-bold text-foreground">{stock.drugs?.length ?? 0}</p>
                <p className="text-[10px] text-muted-foreground/70 uppercase font-medium">Drugs</p>
              </div>
              <div className="text-right border-l border-border/60 pl-4">
                <p className="text-xs font-bold text-foreground">{stock.items?.length ?? 0}</p>
                <p className="text-[10px] text-muted-foreground/70 uppercase font-medium">Supplies</p>
              </div>
            </div>
          )}
          <ChevronDown className={`w-5 h-5 text-muted-foreground/50 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-muted/50 rounded-xl border border-border/60 overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {[...(stock?.drugs || []), ...(stock?.items || [])].length === 0 ? (
                   <p className="p-8 text-center text-sm text-muted-foreground/70 italic">Inventory is empty</p>
                ) : (
                  <>
                    {stock?.drugs?.map(({ drug, quantity }: any) => (
                      <div key={drug.id} className="px-4 py-3 flex items-center justify-between hover:bg-white transition-colors">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-primary/80" />
                           <span className="text-sm font-medium text-foreground">{drug.name}</span>
                        </div>
                        <span className={`text-sm font-bold ${quantity <= (drug.minStock || 5) ? 'text-danger bg-danger-muted/60 px-2 py-0.5 rounded' : 'text-muted-foreground'}`}>
                          {quantity} <span className="text-[10px] text-muted-foreground/70">{drug.unit}</span>
                        </span>
                      </div>
                    ))}
                    {stock?.items?.map(({ item, quantity }: any) => (
                      <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-white transition-colors">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-success/80" />
                           <span className="text-sm font-medium text-foreground">{item.name}</span>
                        </div>
                        <span className="text-sm font-bold text-muted-foreground">{quantity} <span className="text-[10px] text-muted-foreground/70">{item.unit}</span></span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Page ---
export function StockMovementsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'locations' | 'history'>('locations');
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [locationDialog, setLocationDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, movs, drugsData, itemsData] = await Promise.all([
        locationsApi.getAll(),
        locationsApi.getMovements({ fromLocationId: locationFilter || undefined, type: typeFilter || undefined }),
        pharmacyApi.getDrugs(),
        inventoryApi.getItems(),
      ]);
      setLocations(locs);
      setMovements((movs as any).data ?? movs);
      setDrugs(drugsData);
      setItems(itemsData);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [locationFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="p-2 bg-primary rounded-lg shadow-lg shadow-sky-200">
                <Warehouse className="w-5 h-5 text-white" />
             </div>
             <h1 className="text-3xl font-black text-foreground tracking-tight">Inventory Logistics</h1>
          </div>
          <p className="text-muted-foreground font-medium">Control stock distribution and monitor movement across the network.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => load()} className="p-2.5 text-muted-foreground/70 hover:text-primary hover:bg-primary-muted/60 rounded-xl transition-all border border-border">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setLocationDialog(true)} className="flex items-center gap-2 px-5 py-2.5 font-bold text-foreground bg-white border border-border rounded-xl hover:bg-muted/50 transition-all shadow-sm">
            <Plus className="w-4 h-4" /> New Site
          </button>
          <button onClick={() => setTransferDialog(true)} className="flex items-center gap-2 px-6 py-2.5 font-bold text-white bg-primary rounded-xl hover:bg-primary transition-all shadow-lg shadow-sky-200">
            <ArrowLeftRight className="w-4 h-4" /> Transfer Stock
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-8 border-b border-border">
        <button onClick={() => setActiveTab('locations')} 
                className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'locations' ? 'text-primary' : 'text-muted-foreground/70 hover:text-muted-foreground'}`}>
          Storage Locations
          {activeTab === 'locations' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
        </button>
        <button onClick={() => setActiveTab('history')} 
                className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'history' ? 'text-primary' : 'text-muted-foreground/70 hover:text-muted-foreground'}`}>
          Movement History
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
        </button>
      </div>

      {activeTab === 'locations' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            [...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse border border-border/60" />)
          ) : locations.length === 0 ? (
            <div className="col-span-full bg-muted/50 border-2 border-dashed border-border rounded-3xl py-20 flex flex-col items-center justify-center text-muted-foreground/70">
              <Warehouse className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-semibold text-lg">No storage locations defined</p>
              <button onClick={() => setLocationDialog(true)} className="mt-4 text-primary font-bold hover:underline">Setup your first location</button>
            </div>
          ) : (
            locations.map(loc => <LocationStockCard key={loc.id} location={loc} />)
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Enhanced History Filters */}
          <div className="flex flex-wrap gap-4 bg-white p-4 rounded-2xl border border-border/60 shadow-sm">
            <div className="relative group flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
              <select className="w-full pl-10 pr-4 py-2 bg-muted/50 border-none rounded-xl text-sm font-medium outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/60 transition-all appearance-none" 
                      value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                <option value="">All Origin Locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <select className="w-full px-4 py-2 bg-muted/50 border-none rounded-xl text-sm font-medium outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/60 transition-all appearance-none" 
                      value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All Movement Types</option>
                {MOVEMENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/60">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest">Movement ID</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest">Logistics Path</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest">Items</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest">Personnel</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {movements.map(mv => (
                    <tr key={mv.id} className="hover:bg-muted/80 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-muted-foreground/70 bg-muted px-2 py-1 rounded">{mv.movementCode}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${statusBadgeClass(mv.type)}`}>
                          {mv.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{mv.fromLocation?.name ?? 'External'}</span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                          <span className="text-sm font-bold text-foreground">{mv.toLocation?.name ?? 'External'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <div className="bg-primary-muted/60 text-primary font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">
                              {mv.items.length}
                           </div>
                           <span className="text-xs text-muted-foreground font-medium truncate max-w-[120px]">
                              {mv.items.map(it => it.drug?.name ?? it.inventoryItem?.name).join(', ')}
                           </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold text-muted-foreground">{mv.performedBy || 'System'}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs font-medium text-muted-foreground/70">{formatDate(mv.createdAt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Containers */}
      {locationDialog && (
        <LocationDialog onClose={() => setLocationDialog(false)} onSaved={() => { setLocationDialog(false); load(); }} />
      )}
      {transferDialog && (
        <TransferDialog
          locations={locations} drugs={drugs} items={items}
          onClose={() => setTransferDialog(false)}
          onSaved={() => { setTransferDialog(false); load(); }}
        />
      )}
    </div>
  );
}