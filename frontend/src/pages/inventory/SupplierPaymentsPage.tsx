// src/pages/inventory/SupplierPaymentsPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Building2, DollarSign, CreditCard, TrendingUp, ArrowRight } from 'lucide-react';
import {
  supplierPaymentsApi, inventoryApi,
  type SupplierPayment, type Supplier, type PurchaseOrder, type SupplierBalance,
} from '../../lib/api/inventory';
import { formatCurrency, formatDate, statusBadgeClass } from '../../lib/utils';

const PAY_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'MTN_MOBILE_MONEY', label: 'MTN MoMo' },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
];

// ── Record payment dialog ──────────────────────────────────────
function PaymentDialog({ suppliers, purchaseOrders, prefillSupplier, onClose, onSaved }: {
  suppliers: Supplier[]; purchaseOrders: PurchaseOrder[];
  prefillSupplier?: Supplier | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    supplierId: prefillSupplier?.id ?? '',
    purchaseOrderId: '',
    amount: '',
    method: 'CASH',
    reference: '',
    notes: '',
    paidAt: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  // Filter POs by selected supplier
  const filteredPOs = purchaseOrders.filter(
    po => !form.supplierId || (po.supplier as any).id === form.supplierId
  );

  // Auto-fill amount from PO balance
  useEffect(() => {
    if (form.purchaseOrderId) {
      const po = purchaseOrders.find(p => p.id === form.purchaseOrderId);
      if (po) {
        const remaining = po.totalCost - (po.amountPaid ?? 0);
        if (remaining > 0) setForm(p => ({ ...p, amount: String(remaining) }));
      }
    }
  }, [form.purchaseOrderId, purchaseOrders]);

  const save = async () => {
    if (!form.supplierId || !form.amount || parseFloat(form.amount) <= 0) return;
    setSaving(true);
    try {
      await supplierPaymentsApi.create({
        supplierId: form.supplierId,
        purchaseOrderId: form.purchaseOrderId || undefined,
        amount: parseFloat(form.amount),
        method: form.method,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        paidAt: form.paidAt || undefined,
      });
      onSaved();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-border/60">
          <h2 className="text-lg font-semibold text-foreground">Record Supplier Payment</h2>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="label">Supplier *</label>
            <select className="input w-full" value={form.supplierId}
              onChange={e => setForm(p => ({ ...p, supplierId: e.target.value, purchaseOrderId: '' }))}>
              <option value="">— Select Supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Purchase Order (optional)</label>
            <select className="input w-full" value={form.purchaseOrderId} onChange={f('purchaseOrderId')}>
              <option value="">— No specific PO —</option>
              {filteredPOs.map(po => (
                <option key={po.id} value={po.id}>
                  {po.orderNumber} — {formatCurrency(po.totalCost)} · Balance: {formatCurrency(po.totalCost - (po.amountPaid ?? 0))}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (UGX) *</label>
              <input type="number" className="input w-full" value={form.amount} onChange={f('amount')} min={0} />
            </div>
            <div>
              <label className="label">Payment Date</label>
              <input type="date" className="input w-full" value={form.paidAt} onChange={f('paidAt')} />
            </div>
          </div>
          <div>
            <label className="label">Payment Method</label>
            <select className="input w-full" value={form.method} onChange={f('method')}>
              {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference (Cheque #, Tx ID…)</label>
            <input className="input w-full" value={form.reference} onChange={f('reference')} placeholder="Optional" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={f('notes')} />
          </div>
        </div>
        <div className="p-6 border-t border-border/60 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving || !form.supplierId || !form.amount} className="btn-primary">
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Supplier balance card ──────────────────────────────────────
function SupplierBalanceCard({ supplier, onPay }: { supplier: Supplier; onPay: (s: Supplier) => void }) {
  const [balance, setBalance] = useState<SupplierBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supplierPaymentsApi.getBalance(supplier.id).then(setBalance).catch(() => {}).finally(() => setLoading(false));
  }, [supplier.id]);

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary-muted/60 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{supplier.name}</p>
          {supplier.contactPerson && <p className="text-xs text-muted-foreground/70">{supplier.contactPerson}</p>}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : balance ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center mb-4">
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Purchased</p>
              <p className="text-xs font-bold text-foreground mt-0.5">{formatCurrency(balance.totalPurchased, 'UGX', true)}</p>
            </div>
            <div className="bg-success-muted/60 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Paid</p>
              <p className="text-xs font-bold text-success mt-0.5">{formatCurrency(balance.totalPaid, 'UGX', true)}</p>
            </div>
            <div className={`rounded-lg p-2 ${balance.outstanding > 0 ? 'bg-warning-muted/60' : 'bg-success-muted/60'}`}>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Owed</p>
              <p className={`text-xs font-bold mt-0.5 ${balance.outstanding > 0 ? 'text-warning' : 'text-success'}`}>
                {formatCurrency(balance.outstanding, 'UGX', true)}
              </p>
            </div>
          </div>

          {/* PO summary */}
          {balance.purchaseOrders?.slice(0, 3).map(po => (
            <div key={po.id} className="flex items-center justify-between text-xs py-1.5 border-t border-border/40">
              <span className="text-muted-foreground font-mono">{po.orderNumber}</span>
              <div className="flex items-center gap-2">
                <span className={statusBadgeClass(po.status)}>{po.status}</span>
                <span className={po.totalCost - po.amountPaid > 0 ? 'text-warning font-medium' : 'text-success'}>
                  {formatCurrency(po.totalCost - po.amountPaid, 'UGX', true)}
                </span>
              </div>
            </div>
          ))}

          {balance.outstanding > 0 && (
            <button
              onClick={() => onPay(supplier)}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2 bg-primary hover:bg-primary text-white text-sm font-medium rounded-lg transition-colors"
            >
              <CreditCard className="w-4 h-4" /> Pay Balance
            </button>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground/70 text-center py-4">No purchase history</p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────
export function SupplierPaymentsPage() {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'payments' | 'balances'>('payments');
  const [dialog, setDialog] = useState<{ open: boolean; supplier?: Supplier | null }>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pData, sData, poData, stData] = await Promise.all([
        supplierPaymentsApi.getAll({ supplierId: supplierFilter || undefined }),
        inventoryApi.getSuppliers(),
        inventoryApi.getPOs(),
        supplierPaymentsApi.getStats(),
      ]);
      setPayments((pData as any).data ?? pData);
      setSuppliers(sData);
      setPurchaseOrders(poData);
      setStats(stData);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [supplierFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPaid = stats?.totalPaid ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Supplier Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage credit accounts and supplier payments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setDialog({ open: true })} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Paid Out</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalPaid, 'UGX', true)}</p>
          </div>
          <div className="w-10 h-10 bg-success-muted/60 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-success" />
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Suppliers</p>
            <p className="text-2xl font-bold text-foreground mt-1">{suppliers.length}</p>
          </div>
          <div className="w-10 h-10 bg-primary-muted/60 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Transactions</p>
            <p className="text-2xl font-bold text-foreground mt-1">{payments.length}</p>
          </div>
          <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-violet-600" />
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {(['payments', 'balances'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize
              ${activeTab === t ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'balances' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(s => (
            <SupplierBalanceCard key={s.id} supplier={s} onPay={s => setDialog({ open: true, supplier: s })} />
          ))}
          {suppliers.length === 0 && !loading && (
            <div className="col-span-3 text-center py-12 text-muted-foreground/70">No suppliers yet.</div>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <select className="input w-52" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
              <option value="">All Suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/50">
                    {['Supplier', 'Purchase Order', 'Amount', 'Method', 'Reference', 'Date', 'Notes'].map(h => (
                      <th key={h} className="th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {payments.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground/70">No payments recorded yet.</td></tr>
                  ) : payments.map(p => (
                    <tr key={p.id} className="hover:bg-muted/50">
                      <td className="td font-medium text-foreground">{p.supplier.name}</td>
                      <td className="td">
                        {p.purchaseOrder ? (
                          <div>
                            <p className="font-mono text-xs text-primary">{p.purchaseOrder.orderNumber}</p>
                            <p className="text-xs text-muted-foreground/70">{formatCurrency(p.purchaseOrder.totalCost, 'UGX', true)}</p>
                          </div>
                        ) : <span className="text-muted-foreground/70">—</span>}
                      </td>
                      <td className="td font-semibold text-foreground">{formatCurrency(p.amount)}</td>
                      <td className="td">
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          {p.method.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="td text-muted-foreground text-xs font-mono">{p.reference ?? '—'}</td>
                      <td className="td text-muted-foreground text-xs">{formatDate(p.paidAt)}</td>
                      <td className="td text-muted-foreground/70 text-xs truncate max-w-32">{(p as any).notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {dialog.open && (
        <PaymentDialog
          suppliers={suppliers}
          purchaseOrders={purchaseOrders}
          prefillSupplier={dialog.supplier}
          onClose={() => setDialog({ open: false })}
          onSaved={() => { setDialog({ open: false }); load(); }}
        />
      )}
    </div>
  );
}