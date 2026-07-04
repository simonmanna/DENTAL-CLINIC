// src/pages/pharmacy/PrescriptionsPage.tsx
import { useState, useMemo } from 'react';
import {
  FileText, Plus, Search, Clock, CheckCircle2, XCircle, AlertCircle,
  MoreHorizontal, Filter, Calendar, User, Stethoscope, Pill,
  ChevronRight, Printer, Package, Send, Eye, RefreshCw, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Mock types - replace with your actual API types
interface PrescriptionItem {
  id: string;
  drugName: string;
  drugId?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions?: string;
  dispensedQty?: number;
}

interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientId: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  doctorName: string;
  doctorId: string;
  date: string;
  status: 'pending' | 'dispensing' | 'completed' | 'cancelled';
  items: PrescriptionItem[];
  diagnosis?: string;
  notes?: string;
  totalItems: number;
}

// Mock data
const MOCK_PRESCRIPTIONS: Prescription[] = [
  {
    id: '1',
    prescriptionNumber: 'RX-2024-001',
    patientId: 'P001',
    patientName: 'John Mukasa',
    patientAge: 34,
    patientGender: 'M',
    doctorName: 'Dr. Sarah Namuli',
    doctorId: 'D001',
    date: '2024-04-11T10:30:00',
    status: 'pending',
    diagnosis: 'Malaria',
    items: [
      { id: 'i1', drugName: 'Artemether-Lumefantrine', dosage: '80/480mg', frequency: 'Twice daily', duration: '3 days', quantity: 6, instructions: 'Take with food' },
      { id: 'i2', drugName: 'Paracetamol', dosage: '500mg', frequency: 'Three times daily', duration: '3 days', quantity: 9, instructions: 'Take if fever persists' }
    ],
    totalItems: 2
  },
  {
    id: '2',
    prescriptionNumber: 'RX-2024-002',
    patientId: 'P002',
    patientName: 'Mary Auma',
    patientAge: 28,
    patientGender: 'F',
    doctorName: 'Dr. James Okello',
    doctorId: 'D002',
    date: '2024-04-11T09:15:00',
    status: 'dispensing',
    diagnosis: 'Upper Respiratory Infection',
    items: [
      { id: 'i3', drugName: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily', duration: '7 days', quantity: 21, dispensedQty: 21 },
      { id: 'i4', drugName: 'Vitamin C', dosage: '1000mg', frequency: 'Once daily', duration: '14 days', quantity: 14, dispensedQty: 14 }
    ],
    totalItems: 2
  },
  {
    id: '3',
    prescriptionNumber: 'RX-2024-003',
    patientId: 'P003',
    patientName: 'Peter Odoi',
    patientAge: 45,
    patientGender: 'M',
    doctorName: 'Dr. Sarah Namuli',
    doctorId: 'D001',
    date: '2024-04-10T14:20:00',
    status: 'completed',
    items: [
      { id: 'i5', drugName: 'Metformin', dosage: '500mg', frequency: 'Twice daily', duration: '30 days', quantity: 60, dispensedQty: 60 }
    ],
    totalItems: 1
  }
];

const UGX = (n: number) => new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Prescription['status'] }) {
  const configs = {
    pending: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', icon: Clock, label: 'Pending' },
    dispensing: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', icon: Package, label: 'Dispensing' },
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2, label: 'Completed' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', icon: XCircle, label: 'Cancelled' },
  };
  const config = configs[status];
  const Icon = config.icon;
  
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', config.bg, config.text, config.border)}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

function PrescriptionCard({ prescription, onClick, onDispense }: { prescription: Prescription; onClick: () => void; onDispense: (e: React.MouseEvent) => void }) {
  const pendingItems = prescription.items.filter(i => !i.dispensedQty || i.dispensedQty < i.quantity).length;
  
  return (
    <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden" onClick={onClick}>
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3">
              <Avatar className="w-12 h-12 border-2 border-white shadow-sm">
                <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-sm font-bold">
                  {prescription.patientName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-slate-900">{prescription.patientName}</h3>
                <p className="text-sm text-slate-500">
                  {prescription.patientAge} yrs · {prescription.patientGender} · ID: {prescription.patientId}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge status={prescription.status} />
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500">{prescription.prescriptionNumber}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1">{new Date(prescription.date).toLocaleDateString()}</p>
              <p className="text-xs text-slate-500">{new Date(prescription.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Stethoscope className="w-4 h-4 text-slate-400" />
              <span className="font-medium">{prescription.doctorName}</span>
              {prescription.diagnosis && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500">{prescription.diagnosis}</span>
                </>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{prescription.totalItems} items</span>
                {pendingItems > 0 && prescription.status !== 'completed' && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0">
                    {pendingItems} pending
                  </Badge>
                )}
              </div>
              {/* {prescription.status === 'pending' && (
                <Button size="sm" className="h-8 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700" onClick={onDispense}>
                  <Package className="w-3.5 h-3.5 mr-1.5" /> Dispense
                </Button>
              )} */}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DispenseDialog({ prescription, open, onClose, onComplete }: { 
  prescription: Prescription | null; 
  open: boolean; 
  onClose: () => void;
  onComplete: () => void;
}) {
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset items when prescription changes
  useState(() => {
    if (prescription) {
      setItems(prescription.items.map(i => ({ ...i, dispensedQty: i.dispensedQty || 0 })));
    }
  });

  if (!prescription) return null;

  const updateDispensedQty = (itemId: string, qty: number) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, dispensedQty: Math.min(qty, item.quantity) } : item
    ));
  };

  const allDispensed = items.every(i => i.dispensedQty === i.quantity);
  const progress = (items.reduce((acc, i) => acc + (i.dispensedQty || 0), 0) / items.reduce((acc, i) => acc + i.quantity, 0)) * 100;

  const handleComplete = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise(r => setTimeout(r, 1000));
    toast.success('Prescription dispensed successfully');
    setSaving(false);
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl">Dispense Prescription</DialogTitle>
                <p className="text-sm text-slate-500 mt-0.5">{prescription.prescriptionNumber} · {prescription.patientName}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{prescription.doctorName}</p>
              <p className="text-xs text-slate-500">{new Date(prescription.date).toLocaleDateString()}</p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-6 space-y-6">
            {/* Patient Info Card */}
            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-4">
                <Avatar className="w-14 h-14 border-2 border-white shadow-sm">
                  <AvatarFallback className="bg-blue-600 text-white text-lg">
                    {prescription.patientName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900">{prescription.patientName}</h4>
                  <p className="text-sm text-slate-500">{prescription.patientAge} years · {prescription.patientGender}</p>
                  {prescription.diagnosis && (
                    <p className="text-sm text-blue-700 mt-1 font-medium">Diagnosis: {prescription.diagnosis}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-700">Dispensing Progress</span>
                <span className="text-slate-500">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Items */}
            <div className="space-y-4">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Pill className="w-4 h-4 text-slate-400" />
                Prescription Items ({items.length})
              </h4>
              
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={item.id} className={cn('p-4 rounded-xl border transition-all',
                    item.dispensedQty === item.quantity ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'
                  )}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <h5 className="font-semibold text-slate-900">{item.drugName}</h5>
                          <Badge variant="outline" className="text-xs">{item.dosage}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 ml-8">
                          {item.frequency} · {item.duration} · Qty: {item.quantity}
                        </p>
                        {item.instructions && (
                          <p className="text-sm text-amber-700 mt-1 ml-8 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> {item.instructions}
                          </p>
                        )}
                      </div>
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center',
                        item.dispensedQty === item.quantity ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                      )}>
                        {item.dispensedQty === item.quantity ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 ml-8">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium text-slate-500">Dispense Qty:</Label>
                        <div className="flex items-center border rounded-lg overflow-hidden">
                          <button 
                            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border-r text-slate-600"
                            onClick={() => updateDispensedQty(item.id, Math.max(0, (item.dispensedQty || 0) - 1))}
                          >-</button>
                          <input 
                            type="number" 
                            value={item.dispensedQty || 0}
                            onChange={(e) => updateDispensedQty(item.id, parseInt(e.target.value) || 0)}
                            className="w-16 text-center text-sm font-semibold py-1.5 focus:outline-none"
                          />
                          <button 
                            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border-l text-slate-600"
                            onClick={() => updateDispensedQty(item.id, Math.min(item.quantity, (item.dispensedQty || 0) + 1))}
                          >+</button>
                        </div>
                        <span className="text-xs text-slate-400">/ {item.quantity}</span>
                      </div>
                      
                      {item.dispensedQty === item.quantity ? (
                        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Fully Dispensed
                        </span>
                      ) : (
                        <button 
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                          onClick={() => updateDispensedQty(item.id, item.quantity)}
                        >
                          Dispense All
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Dispensing Notes</Label>
              <Textarea placeholder="Add any notes about this dispensing..." rows={3} className="resize-none" />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50/50 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button 
            onClick={handleComplete} 
            disabled={saving || !allDispensed}
            className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {saving ? 'Processing...' : 'Complete Dispensing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PrescriptionsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Prescription['status'] | 'all'>('all');
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);
  const [dispenseDialogOpen, setDispenseDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const filteredPrescriptions = useMemo(() => {
    return MOCK_PRESCRIPTIONS.filter(rx => {
      const matchesSearch = rx.patientName.toLowerCase().includes(search.toLowerCase()) || 
                           rx.prescriptionNumber.toLowerCase().includes(search.toLowerCase()) ||
                           rx.doctorName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || rx.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  const stats = {
    total: MOCK_PRESCRIPTIONS.length,
    pending: MOCK_PRESCRIPTIONS.filter(r => r.status === 'pending').length,
    dispensing: MOCK_PRESCRIPTIONS.filter(r => r.status === 'dispensing').length,
    completed: MOCK_PRESCRIPTIONS.filter(r => r.status === 'completed').length,
  };

  const handleDispenseClick = (e: React.MouseEvent, prescription: Prescription) => {
    e.stopPropagation();
    setSelectedRx(prescription);
    setDispenseDialogOpen(true);
  };

  const handleViewClick = (prescription: Prescription) => {
    setSelectedRx(prescription);
    setViewDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Prescriptions</h1>
            <p className="text-slate-500 mt-1">Manage and dispense patient prescriptions</p>
          </div>
          {/* <Button className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25">
            <Plus className="w-4 h-4" /> New Prescription
          </Button> */}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Today', value: stats.total, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Dispensing', value: stats.dispensing, icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <p className="text-sm text-slate-500">{label}</p>
                </div>
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', bg, color)}>
                  <Icon className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                className="pl-10 h-10 bg-slate-50 border-slate-200"
                placeholder="Search patient, doctor, or Rx number..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-full sm:w-auto">
              <TabsList className="bg-slate-100 p-1 h-10">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
                <TabsTrigger value="dispensing" className="text-xs">Dispensing</TabsTrigger>
                <TabsTrigger value="completed" className="text-xs">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className={cn('space-y-4', selectedRx ? 'lg:col-span-1' : 'lg:col-span-3')}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Prescription Queue</h2>
            <Button variant="ghost" size="sm" className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
          </div>
          
          {filteredPrescriptions.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-16 text-center">
                <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">No prescriptions found</h3>
                <p className="text-slate-500">Try adjusting your filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredPrescriptions.map(rx => (
                <PrescriptionCard 
                  key={rx.id} 
                  prescription={rx} 
                  onClick={() => handleViewClick(rx)}
                  onDispense={(e) => handleDispenseClick(e, rx)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail View (Desktop only) */}
        {selectedRx && (
          <div className="hidden lg:block lg:col-span-2">
            <Card className="border-0 shadow-sm sticky top-6">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400" />
                    Prescription Details
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Printer className="w-4 h-4" /> Print
                    </Button>
                    {selectedRx.status === 'pending' && (
                      <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => setDispenseDialogOpen(true)}>
                        <Package className="w-4 h-4" /> Dispense
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  {/* Patient Info */}
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                    <Avatar className="w-16 h-16">
                      <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-xl">
                        {selectedRx.patientName.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-slate-900">{selectedRx.patientName}</h3>
                      <p className="text-slate-500">{selectedRx.patientAge} years · {selectedRx.patientGender}</p>
                      <p className="text-sm text-slate-400 mt-1">ID: {selectedRx.patientId}</p>
                    </div>
                    <StatusBadge status={selectedRx.status} />
                  </div>

                  {/* Rx Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 mb-1">Prescription #</p>
                      <p className="font-semibold text-slate-900">{selectedRx.prescriptionNumber}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">Date</p>
                      <p className="font-semibold text-slate-900">{new Date(selectedRx.date).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">Prescribed By</p>
                      <p className="font-semibold text-slate-900">{selectedRx.doctorName}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">Diagnosis</p>
                      <p className="font-semibold text-slate-900">{selectedRx.diagnosis || '—'}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Items */}
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-4">Prescribed Items</h4>
                    <div className="space-y-3">
                      {selectedRx.items.map((item, idx) => (
                        <div key={item.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="font-semibold text-slate-900">{item.drugName}</h5>
                              <Badge variant="outline" className="text-xs">{item.dosage}</Badge>
                            </div>
                            <p className="text-sm text-slate-600">{item.frequency} · {item.duration}</p>
                            <p className="text-sm text-slate-500 mt-1">Qty: {item.quantity} · Instructions: {item.instructions || '—'}</p>
                            
                            {item.dispensedQty !== undefined && (
                              <div className="mt-3 flex items-center gap-2">
                                <span className={cn('text-xs font-medium px-2 py-1 rounded-full',
                                  item.dispensedQty === item.quantity ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                )}>
                                  {item.dispensedQty === item.quantity ? 'Fully Dispensed' : `Dispensed: ${item.dispensedQty}/${item.quantity}`}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Dispense Dialog */}
      <DispenseDialog
        prescription={selectedRx}
        open={dispenseDialogOpen}
        onClose={() => setDispenseDialogOpen(false)}
        onComplete={() => {
          setDispenseDialogOpen(false);
          toast.success('Prescription marked as completed');
        }}
      />
    </div>
  );
}