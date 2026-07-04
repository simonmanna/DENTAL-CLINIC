import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BadgeCheck,
  XCircle,
  MapPin,
  Calendar,
  User,
  Package,
  Pill,
  TrendingDown,
  CheckCircle2,
  Clock,
  Hash,
  FileText,
  Activity,
} from 'lucide-react';
import type { WasteRecord, WasteCategory } from '../../../types/waste.types';
import { WASTE_CATEGORY_META } from '../../../types/waste.types';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr?: string, showTime = false) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-UG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(showTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

interface Props {
  record: WasteRecord | null;
  open: boolean;
  onClose: () => void;
  onApprove: (record: WasteRecord) => void;
  onReject: (record: WasteRecord) => void;
}

export function WasteDetailDrawer({ record, open, onClose, onApprove, onReject }: Props) {
  if (!record) return null;

  const meta = WASTE_CATEGORY_META[record.category as WasteCategory];
  const isApproved = !!record.approvedById;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10">
          <SheetHeader>
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-lg font-bold font-mono text-gray-900">
                  {record.wasteCode}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.color}`}
                  >
                    {meta.icon} {meta.label}
                  </span>
                  {isApproved ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Approved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3" /> Pending Approval
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Total Loss</p>
                <p className="text-xl font-bold text-red-600">
                  {formatCurrency(record.totalValue)}
                </p>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Info Grid ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCell icon={MapPin} label="Location" value={record.location.name} />
            <InfoCell
              icon={Calendar}
              label="Recorded On"
              value={formatDate(record.createdAt, true)}
            />
            {record.witnessName && (
              <InfoCell icon={User} label="Witness" value={record.witnessName} />
            )}
            {record.disposalMethod && (
              <InfoCell icon={FileText} label="Disposal Method" value={record.disposalMethod} />
            )}
            {record.disposalDate && (
              <InfoCell
                icon={Calendar}
                label="Disposal Date"
                value={formatDate(record.disposalDate)}
              />
            )}
            {record.approvedById && record.approvedAt && (
              <InfoCell
                icon={CheckCircle2}
                label="Approved On"
                value={formatDate(record.approvedAt, true)}
              />
            )}
          </div>

          {record.notes && (
            <div className="bg-gray-50 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Notes
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</p>
            </div>
          )}

          {/* ── Items ──────────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              Items ({record.items.length})
            </p>
            <div className="space-y-2">
              {record.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.itemType === 'DRUG' ? (
                        <Pill className="w-4 h-4 text-blue-500 shrink-0" />
                      ) : (
                        <Package className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {item.itemName}
                        </p>
                        {item.reason && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(item.totalCost)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.quantity} {item.unit} × {formatCurrency(item.unitCost)}
                      </p>
                    </div>
                  </div>

                  {(item.batchNumber || item.expiryDate) && (
                    <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100">
                      {item.batchNumber && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Hash className="w-3 h-3" /> {item.batchNumber}
                        </span>
                      )}
                      {item.expiryDate && (
                        <span className="text-xs text-orange-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Exp: {formatDate(item.expiryDate)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Total row */}
            <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 mt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4" />
                Total Loss Value
              </span>
              <span className="text-lg font-bold text-red-800">
                {formatCurrency(record.totalValue)}
              </span>
            </div>
          </div>

          {/* ── Stock Log (if approved) ──────────────────────────────────────── */}
          {record.stockLogs && record.stockLogs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Stock Log Entries
              </p>
              <div className="space-y-2">
                {record.stockLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs"
                  >
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-700">
                        {log.inventoryItem?.name || log.drug?.name}
                      </span>
                      <span className="font-mono font-bold text-red-600">
                        {log.quantityChange} {/* negative */}
                      </span>
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      Stock: {log.quantityBefore} → {log.quantityAfter} ·{' '}
                      {formatDate(log.createdAt, true)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Actions ────────────────────────────────────────────────────── */}
          {!isApproved && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => onReject(record)}
                variant="outline"
                className="flex-1 gap-2 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </Button>
              <Button
                onClick={() => onApprove(record)}
                className="flex-1 gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <BadgeCheck className="w-4 h-4" />
                Approve & Deduct
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3" />
        {label}
      </p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}
