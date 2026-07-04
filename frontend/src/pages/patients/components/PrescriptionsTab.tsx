// src/pages/patients/components/PrescriptionsTab.tsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pill, Calendar, CheckCircle, Clock, AlertTriangle, 
  ChevronRight, Loader2, FileText, Printer, Trash2, RefreshCw,
  Hash, User, Stethoscope
} from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { prescriptionsApi } from '../../../lib/api';

// Types
export interface Drug {
  id: string;
  name: string;
  genericName?: string;
  strength?: string;
  form?: string;
}

export interface PrescriptionItem {
  id: string;
  drugId: string;
  drug: Drug;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string;
  quantity: number;
  instructions?: string;
  refills: number;
}

export interface Prescription {
  id: string;
  prescriptionCode: string;
  visitId: string;
  patientId: string;
  dentistId: string;
  status: 'ACTIVE' | 'DISPENSED' | 'EXPIRED' | 'CANCELLED';
  notes?: string;
  validUntil?: string;
  dispensedAt?: string;
  dispensedBy?: string;
  createdAt: string;
  items: PrescriptionItem[];
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
  };
  dentist?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  visit?: {
    id: string;
    visitCode: string;
  };
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DISPENSED: 'bg-blue-50 text-blue-700 border-blue-200',
  EXPIRED: 'bg-slate-100 text-slate-500 border-slate-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ACTIVE: <Clock className="w-3 h-3" />,
  DISPENSED: <CheckCircle className="w-3 h-3" />,
  EXPIRED: <AlertTriangle className="w-3 h-3" />,
  CANCELLED: <Trash2 className="w-3 h-3" />,
};

function cn(...cls: (string | boolean | undefined | null)[]) {
  return cls.filter(Boolean).join(' ');
}

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  return <Loader2 className={cn('animate-spin text-blue-600', sizes[size])} />;
}

interface PrescriptionsTabProps {
  patientId: string;
  patient?: any;
}

export default function PrescriptionsTab({ patientId, patient }: PrescriptionsTabProps) {

     // DEBUG: Check patientId
  console.log('🔍 TreatmentsTab mounted with patientId:', patientId);
  console.log('🔍 patientId type:', typeof patientId);
  console.log('🔍 patientId truthy?:', !!patientId);
  console.log('🔍 Full patient prop:', patient);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedRx, setExpandedRx] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  // Fetch all patient prescriptions
  const { data: prescriptions = [], isLoading, error, refetch } = useQuery({
    queryKey: ['patient-prescriptions', patientId],
    queryFn: () => prescriptionsApi.getByPatient(patientId),
    enabled: !!patientId,
    staleTime: 30_000,
  });

  // Mutations
  const dispenseMutation = useMutation({
    mutationFn: (id: string) => prescriptionsApi.dispense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-prescriptions', patientId] });
    },
  });

  // Stats
  const stats = useMemo(() => {
    const active = prescriptions.filter(r => r.status === 'ACTIVE').length;
    const dispensed = prescriptions.filter(r => r.status === 'DISPENSED').length;
    const expired = prescriptions.filter(r => r.status === 'EXPIRED').length;
    const cancelled = prescriptions.filter(r => r.status === 'CANCELLED').length;
    const totalItems = prescriptions.reduce((sum, r) => sum + r.items.length, 0);

    return {
      total: prescriptions.length,
      active,
      dispensed,
      expired,
      cancelled,
      totalItems,
    };
  }, [prescriptions]);

  // Sort prescriptions by date (newest first)
  const sortedPrescriptions = useMemo(() => {
    return [...prescriptions].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [prescriptions]);

  // Flatten all items for timeline view
  const allItems = useMemo(() => {
    const items: (PrescriptionItem & { 
      prescriptionId: string; 
      prescriptionCode: string;
      prescriptionStatus: string;
      createdAt: string;
      dentist?: { firstName: string; lastName: string };
    })[] = [];
    
    prescriptions.forEach(rx => {
      rx.items.forEach(item => {
        items.push({
          ...item,
          prescriptionId: rx.id,
          prescriptionCode: rx.prescriptionCode,
          prescriptionStatus: rx.status,
          createdAt: rx.createdAt,
          dentist: rx.dentist,
        });
      });
    });
    
    return items.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [prescriptions]);

  const handlePrint = (rx: Prescription) => {
    // Use the print function from your PrescriptionTab
    console.log('Print prescription:', rx.prescriptionCode);
    // Implement print logic or import from PrescriptionTab
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <AlertTriangle className="w-10 h-10 mb-3 text-red-400" />
        <p className="text-sm font-medium text-slate-500">Failed to load prescriptions</p>
        <button 
          onClick={() => refetch()} 
          className="mt-3 px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Pill className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-400 uppercase">Total Rx</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-400 uppercase">Active</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-400 uppercase">Dispensed</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats.dispensed}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-slate-400 uppercase">Expired</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats.expired}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-indigo-500" />
            <span className="text-xs text-slate-400 uppercase">Items</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600">{stats.totalItems}</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            By Prescription
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            Timeline
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {/* <button
            onClick={() => navigate(`/prescriptions/new?patientId=${patientId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-semibold hover:bg-[#16324f] transition-colors"
          >
            <Plus className="w-4 h-4" /> New Prescription
          </button> */}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="space-y-3">
          {sortedPrescriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Pill className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium text-slate-500">No prescriptions yet</p>
              <p className="text-xs text-slate-400 mt-1">Create a prescription from a visit</p>
            </div>
          ) : (
            sortedPrescriptions.map((rx) => {
              const isExpired = rx.validUntil && new Date(rx.validUntil) < new Date() && rx.status === 'ACTIVE';
              const isExpanded = expandedRx === rx.id;
              
              return (
                <div
                  key={rx.id}
                  className={cn(
                    'bg-white rounded-xl border transition-all overflow-hidden',
                    rx.status === 'CANCELLED' ? 'opacity-60 border-slate-100' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  {/* Header */}
                  <div 
                    className="flex items-start gap-4 px-5 py-4 cursor-pointer"
                    onClick={() => setExpandedRx(isExpanded ? null : rx.id)}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                      rx.status === 'DISPENSED' ? "bg-blue-50 border border-blue-100" : "bg-emerald-50 border border-emerald-100"
                    )}>
                      <Pill className={cn(
                        "w-5 h-5",
                        rx.status === 'DISPENSED' ? "text-blue-500" : "text-emerald-500"
                      )} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-slate-800">
                          {rx.items.length} Medication{rx.items.length !== 1 ? 's' : ''}
                        </span>
                        <span className={cn(
                          "flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border font-medium",
                          isExpired ? STATUS_STYLES.EXPIRED : STATUS_STYLES[rx.status]
                        )}>
                          {isExpired ? STATUS_ICONS.EXPIRED : STATUS_ICONS[rx.status]}
                          {isExpired ? 'Expired' : rx.status}
                        </span>
                        <ChevronRight className={cn(
                          'w-4 h-4 text-slate-400 transition-transform ml-auto',
                          isExpanded && 'rotate-90'
                        )} />
                      </div>

                      <div className="text-xs text-slate-500">
                        {rx.items.slice(0, 2).map((item, idx) => (
                          <span key={item.id} className="mr-3">
                            {idx + 1}. {item.drug.name} {item.drug.strength}
                          </span>
                        ))}
                        {rx.items.length > 2 && (
                          <span className="text-slate-400">+{rx.items.length - 2} more</span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 font-mono">
                          <Hash className="w-3 h-3" />
                          {rx.prescriptionCode}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(rx.createdAt)}
                        </span>
                        {rx.dentist && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="w-3 h-3" />
                            Dr. {rx.dentist.firstName} {rx.dentist.lastName}
                          </span>
                        )}
                        {rx.validUntil && (
                          <span className={cn(isExpired && "text-red-500 font-medium")}>
                            Valid until: {formatDate(rx.validUntil)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrint(rx);
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        title="Print"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {rx.status === 'ACTIVE' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dispenseMutation.mutate(rx.id);
                          }}
                          disabled={dispenseMutation.isPending}
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Mark as dispensed"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                      <div className="space-y-3">
                        {rx.items.map((item, idx) => (
                          <div key={item.id} className="bg-white rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start gap-3">
                              <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-800">{item.drug.name}</span>
                                  <span className="text-xs text-slate-500">{item.drug.strength} {item.drug.form}</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                                  <div><span className="text-slate-400">Dosage:</span> <span className="text-slate-700">{item.dosage}</span></div>
                                  <div><span className="text-slate-400">Frequency:</span> <span className="text-slate-700">{item.frequency}</span></div>
                                  <div><span className="text-slate-400">Duration:</span> <span className="text-slate-700">{item.duration}</span></div>
                                  <div><span className="text-slate-400">Qty:</span> <span className="text-slate-700">{item.quantity}</span></div>
                                </div>
                                {item.instructions && (
                                  <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5">
                                    <span className="font-medium">Instructions:</span> {item.instructions}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {rx.notes && (
                        <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          <span className="font-medium">Notes:</span> {rx.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Timeline View */
        <div className="space-y-3">
          {allItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Calendar className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium text-slate-500">No medications prescribed</p>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-slate-200 space-y-4">
              {allItems.map((item, idx) => (
                <div key={`${item.prescriptionId}-${item.id}`} className="relative">
                  <div className={cn(
                    'absolute -left-[29px] w-4 h-4 rounded-full border-2 border-white shadow-sm',
                    item.prescriptionStatus === 'DISPENSED' ? 'bg-blue-500' :
                    item.prescriptionStatus === 'ACTIVE' ? 'bg-emerald-500' :
                    item.prescriptionStatus === 'EXPIRED' ? 'bg-slate-400' :
                    'bg-red-400'
                  )} />
                  <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">
                          {formatDate(item.createdAt)} • {item.prescriptionCode}
                        </p>
                        <h4 className="font-semibold text-slate-800">{item.drug.name}</h4>
                      </div>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border",
                        STATUS_STYLES[item.prescriptionStatus]
                      )}>
                        {item.prescriptionStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{item.dosage}</span>
                      <span>{item.frequency}</span>
                      <span>{item.duration}</span>
                      {item.dentist && (
                        <span className="ml-auto">Dr. {item.dentist.firstName} {item.dentist.lastName}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}