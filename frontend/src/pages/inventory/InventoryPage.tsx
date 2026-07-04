// src/pages/inventory/InventoryPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { formatCurrency, cn } from '../../lib/utils';
import { PageHeader, StatCard, Button, Table, Tr, Td, LoadingSpinner, Modal, FormField, Input, Select } from '../../components/shared';
import { Package, Plus, AlertTriangle, TrendingDown } from 'lucide-react';

const CATEGORIES = ['CONSUMABLE', 'INSTRUMENT', 'MEDICATION', 'EQUIPMENT', 'PROTECTIVE', 'RESTORATIVE', 'ANESTHETIC', 'IMPRESSION', 'OTHER'];

export function InventoryPage() {
  const qc = useQueryClient();
  const [catFilter, setCatFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showTx, setShowTx] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ name: '', category: 'CONSUMABLE', unit: '', quantity: 0, minQuantity: 5, unitCost: 0, location: '' });
  const [txForm, setTxForm] = useState({ type: 'PURCHASE', quantity: 0, unitCost: 0, notes: '' });

  const { data: items, isLoading } = useQuery({
    queryKey: ['inventory', catFilter],
    queryFn: () => inventoryApi.getItems({ category: catFilter }),
  });

  const { data: stats } = useQuery({ queryKey: ['inventory-stats'], queryFn: inventoryApi.getStats });

  const addMutation = useMutation({
    mutationFn: inventoryApi.createItem,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setShowAdd(false); },
  });

  const txMutation = useMutation({
    mutationFn: ({ id, data }: any) => inventoryApi.transaction(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setShowTx(null); },
  });

  const itemList = items || [];

  return (
    <div className="space-y-2">
      <PageHeader title="Inventory & Supplies" subtitle="Track dental materials, equipment and consumables"
        actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Add Item</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard title="Total Items" value={stats?.totalItems || 0} icon={<Package className="w-6 h-6 text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard title="Stock Value" value={formatCurrency(stats?.totalValue || 0)} icon={<TrendingDown className="w-6 h-6 text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard title="Low Stock" value={stats?.lowStockItems || 0} icon={<AlertTriangle className="w-6 h-6 text-amber-600" />} iconBg="bg-amber-100" />
        <StatCard title="Out of Stock" value={stats?.outOfStock || 0} icon={<Package className="w-6 h-6 text-red-600" />} iconBg="bg-red-100" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-1 border-b border-slate-100 flex items-center gap-3">
          <Select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="w-44">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </Select>
        </div>
        {isLoading ? <LoadingSpinner /> : (
          <Table headers={['Item', 'Category', 'Location', 'Quantity', 'Min Stock', 'Unit Cost', 'Value', 'Actions']}>
            {itemList.map((item: any) => {
              const isLow = item.quantity <= item.minQuantity;
              return (
                <Tr key={item.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      {isLow && <div className="w-2 h-2 rounded-full bg-amber-500" title="Low stock" />}
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.itemCode}</p>
                      </div>
                    </div>
                  </Td>
                  <Td><span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{item.category}</span></Td>
                  <Td><span className="text-sm text-slate-500">{item.location || '—'}</span></Td>
                  <Td>
                    <span className={cn('font-bold text-sm', isLow ? 'text-red-600' : 'text-slate-800')}>
                      {item.quantity} {item.unit}
                    </span>
                  </Td>
                  <Td><span className="text-sm text-slate-500">{item.minQuantity} {item.unit}</span></Td>
                  <Td><span className="text-sm text-slate-600">{formatCurrency(item.unitCost)}</span></Td>
                  <Td><span className="text-sm font-medium text-slate-700">{formatCurrency(item.quantity * item.unitCost)}</span></Td>
                  <Td>
                    <button onClick={() => { setShowTx(item.id); setTxForm({ type: 'PURCHASE', quantity: 0, unitCost: item.unitCost, notes: '' }); }}
                      className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors">
                      Stock In/Out
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Inventory Item">
        <form onSubmit={e => { e.preventDefault(); addMutation.mutate(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Item Name" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></FormField>
            <FormField label="Category" required><Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </Select></FormField>
            <FormField label="Unit" required><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="box, piece, kg..." required /></FormField>
            <FormField label="Initial Quantity"><Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: +e.target.value })} min={0} /></FormField>
            <FormField label="Min. Stock Level"><Input type="number" value={form.minQuantity} onChange={e => setForm({ ...form, minQuantity: +e.target.value })} min={0} /></FormField>
            <FormField label="Unit Cost (UGX)"><Input type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: +e.target.value })} min={0} /></FormField>
            <FormField label="Storage Location"><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Storeroom A, Shelf 2..." /></FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={addMutation.isPending}>Add Item</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showTx} onClose={() => setShowTx(null)} title="Record Stock Transaction">
        <form onSubmit={e => { e.preventDefault(); txMutation.mutate({ id: showTx, data: txForm }); }} className="space-y-4">
          <FormField label="Transaction Type">
            <Select value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })}>
              {['PURCHASE', 'USAGE', 'ADJUSTMENT', 'RETURN', 'EXPIRED', 'DAMAGED'].map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Quantity" required><Input type="number" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: +e.target.value })} min={1} required /></FormField>
          <FormField label="Unit Cost (UGX)"><Input type="number" value={txForm.unitCost} onChange={e => setTxForm({ ...txForm, unitCost: +e.target.value })} min={0} /></FormField>
          <FormField label="Notes"><Input value={txForm.notes} onChange={e => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Reason, reference..." /></FormField>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={() => setShowTx(null)}>Cancel</Button>
            <Button type="submit" loading={txMutation.isPending}>Record</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
