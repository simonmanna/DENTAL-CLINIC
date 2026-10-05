// src/pages/patients/components/TreatmentsTab.tsx
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ClipboardList, Calendar, CheckCircle, Clock,
  AlertTriangle, ChevronRight, Loader2, FileText,
  TrendingUp, DollarSign, Activity, TrendingDown,
  ChevronsUpDown,
  ChevronDown
} from 'lucide-react';
import { formatDate, formatCurrency } from '../../../lib/utils';
import { patientsApi } from '../../../lib/api';
import { formatSurfaces } from '../../../lib/dental/notation';

// Types
export type TxStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

export interface TreatmentProcedure {
  id: string;
  sequence: number;
  visitGroup: number;
  procedureId: string;
  toothNumbers: number[];
  surfaces: string[];
  cost: number;
  status: TxStatus;
  notes?: string;
  scheduledDate?: string;
  completedAt?: string;
  performedDate?: string;
  procedure: {
    id: string;
    code?: string;
    name: string;
    category: string;
    description?: string;
    defaultCost: number;
  };
  dentist?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TreatmentPlan {
  id: string;
  planCode: string;
  title: string;
  status: TxStatus;
  priority: string;
  diagnosis?: string;
  notes?: string;
  estimatedCost: number;
  actualCost: number;
  consentSigned: boolean;
  consentDate?: string;
  createdAt: string;
  updatedAt: string;
  dentist: { id: string; firstName: string; lastName: string };
  procedures: TreatmentProcedure[];
  summary?: {
    totalProcedures: number;
    plannedCount: number;
    inProgressCount: number;
    completedCount: number;
    totalCost: number;
    completedCost: number;
    remainingCost: number;
    completionPercent: number;
  };
}

const STATUS_META: Record<TxStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  PLANNED: { label: 'Planned', color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border', dot: 'bg-muted-foreground/70' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-primary', bg: 'bg-primary-muted/60', border: 'border-primary/25', dot: 'bg-primary' },
  COMPLETED: { label: 'Completed', color: 'text-success', bg: 'bg-success-muted/60', border: 'border-success/25', dot: 'bg-success' },
  ON_HOLD: { label: 'On Hold', color: 'text-warning', bg: 'bg-warning-muted/60', border: 'border-warning/25', dot: 'bg-warning' },
  CANCELLED: { label: 'Cancelled', color: 'text-danger', bg: 'bg-danger-muted/60', border: 'border-danger/25', dot: 'bg-danger/80' },
};

function cn(...c: (string | boolean | undefined | null)[]) { return c.filter(Boolean).join(' '); }
function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <Loader2 className={cn('animate-spin text-primary', size === 'sm' ? 'w-4 h-4' : 'w-6 h-6')} />;
}

function StatusBadge({ status }: { status: TxStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', m.bg, m.color, m.border)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', m.dot)} />{m.label}
    </span>
  );
}

interface TreatmentsTabProps {
  patientId: string;
  patient?: any;
}

export default function TreatmentsTab({ patientId, patient }: TreatmentsTabProps) {
  const navigate = useNavigate();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

   // DEBUG: Check patientId
  console.log('🔍 TreatmentsTab mounted with patientId:', patientId);
  console.log('🔍 patientId type:', typeof patientId);
  console.log('🔍 patientId truthy?:', !!patientId);
  console.log('🔍 Full patient prop:', patient);


  // Fetch all patient treatment plans ordered by date (newest first from backend)
  const { data: treatmentPlans = [], isLoading, error } = useQuery({
    queryKey: ['patient-treatments', patientId],
    queryFn: () => patientsApi.getPatientTreatmentPlans(patientId),
    enabled: !!patientId,
    staleTime: 30_000,
  });

  // Get selected plan details
  const { data: selectedPlan } = useQuery({
    queryKey: ['treatment-plan', selectedPlanId],
    queryFn: () => patientsApi.getTreatmentPlan(selectedPlanId!),
    enabled: !!selectedPlanId,
  });

  // Flatten all procedures from all plans for timeline view
  const allProcedures = useMemo(() => {
    const procedures: (TreatmentProcedure & { planTitle: string; planId: string })[] = [];
    treatmentPlans.forEach(plan => {
      plan.procedures?.forEach(proc => {
        procedures.push({
          ...proc,
          planTitle: plan.title,
          planId: plan.id,
        });
      });
    });
    // Sort by sequence, then by scheduled date
    return procedures.sort((a, b) => {
      if (a.scheduledDate && b.scheduledDate) {
        return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
      }
      return a.sequence - b.sequence;
    });
  }, [treatmentPlans]);

  // Summary statistics across all plans
  const stats = useMemo(() => {
    const totalCost = treatmentPlans.reduce((sum, plan) => sum + (plan.summary?.totalCost || 0), 0);
    const completedCost = treatmentPlans.reduce((sum, plan) => sum + (plan.summary?.completedCost || 0), 0);
    const totalProcedures = treatmentPlans.reduce((sum, plan) => sum + (plan.summary?.totalProcedures || 0), 0);
    const completedProcedures = treatmentPlans.reduce((sum, plan) => sum + (plan.summary?.completedCount || 0), 0);
    
    return {
      totalCost,
      completedCost,
      remainingCost: totalCost - completedCost,
      totalProcedures,
      completedProcedures,
      completionPercent: totalProcedures > 0 ? Math.round((completedProcedures / totalProcedures) * 100) : 0,
      activePlans: treatmentPlans.filter(p => p.status !== 'COMPLETED' && p.status !== 'CANCELLED').length,
    };
  }, [treatmentPlans]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70">
        <AlertTriangle className="w-10 h-10 mb-3 text-danger/70" />
        <p className="text-sm font-medium text-muted-foreground">Failed to load treatments</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-1 mb-1">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground/70 uppercase">Active Plans</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.activePlans}</p>
        </div>
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-indigo-500" />
            <span className="text-xs text-muted-foreground/70 uppercase">Total Procedures</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalProcedures}</p>
        </div>
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-warning" />
            <span className="text-xs text-muted-foreground/70 uppercase">Total Value</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalCost)}</p>
        </div>
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground/70 uppercase">Completion</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.completionPercent}%</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              viewMode === 'list' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'
            )}
          >
            By Plan
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              viewMode === 'timeline' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'
            )}
          >
            Timeline
          </button>
        </div>
        {/* <button
          onClick={() => navigate(`/treatment-plans/new?patientId=${patientId}`)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-semibold hover:bg-[#16324f] transition-colors"
        >
          <Plus className="w-4 h-4" /> New Treatment Plan
        </button> */}
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="space-y-3">
          {treatmentPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70 bg-muted/50 rounded-xl border border-dashed border-border">
              <ClipboardList className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium text-muted-foreground">No treatment plans yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Create a treatment plan to track procedures</p>
            </div>
          ) : (
            treatmentPlans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id === selectedPlanId ? null : plan.id)}
                className={cn(
                  'rounded-xl border transition-all cursor-pointer overflow-hidden',
                  selectedPlanId === plan.id ? 'border-primary/30 bg-primary-muted/30 ring-1 ring-primary/25' : 'border-border bg-white hover:border-primary/25 hover:bg-primary-muted/20'
                )}
              >
                {/* Plan Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        plan.status === 'COMPLETED' ? 'bg-success-muted' : 'bg-primary-muted'
                      )}>
                        <ClipboardList className={cn(
                          'w-5 h-5',
                          plan.status === 'COMPLETED' ? 'text-success' : 'text-primary'
                        )} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{plan.title}</h3>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {plan.planCode} • Created {formatDate(plan.createdAt)}
                          {plan.dentist && ` • Dr. ${plan.dentist.firstName} ${plan.dentist.lastName}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={plan.status} />
                      <ChevronDown className={cn(
                        'w-4 h-4 text-muted-foreground/70 transition-transform',
                        selectedPlanId === plan.id && 'rotate-180'
                      )} />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {plan.summary && (
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] text-muted-foreground/70 mb-1">
                        <span>{plan.summary.completedCount} of {plan.summary.totalProcedures} completed</span>
                        <span className="font-bold">{plan.summary.completionPercent}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-700"
                          style={{ width: `${plan.summary.completionPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Cost Summary */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-xs font-bold text-foreground">{formatCurrency(plan.summary?.totalCost || 0)}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">Total</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-xs font-bold text-success">{formatCurrency(plan.summary?.completedCost || 0)}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">Completed</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-xs font-bold text-primary">{formatCurrency(plan.summary?.remainingCost || 0)}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">Remaining</p>
                    </div>
                  </div>
                </div>

                {/* Expanded Procedures List */}
                {selectedPlanId === plan.id && plan.procedures && plan.procedures.length > 0 && (
                  <div className="border-t border-border/60 bg-muted/50 p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Procedures</h4>
                    <div className="space-y-2">
                      {plan.procedures
                        .sort((a, b) => a.sequence - b.sequence)
                        .map((proc) => (
                        <div
                          key={proc.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/treatment-plans/${plan.id}/procedures/${proc.id}`);
                          }}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-border hover:border-primary/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                              proc.status === 'COMPLETED' ? 'bg-success-muted text-success' :
                              proc.status === 'IN_PROGRESS' ? 'bg-primary-muted text-primary' :
                              'bg-muted text-muted-foreground'
                            )}>
                              {proc.status === 'COMPLETED' ? <CheckCircle className="w-4 h-4" /> :
                               proc.status === 'IN_PROGRESS' ? <Clock className="w-4 h-4" /> :
                               <FileText className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{proc.procedure.name}</p>
                              <p className="text-[11px] text-muted-foreground/70">
                                {proc.procedure.code && <span className="font-mono text-primary mr-2">{proc.procedure.code}</span>}
                                {proc.toothNumbers.length > 0 && `Teeth: ${proc.toothNumbers.join(', ')}`}
                                {(proc.surfaces?.length ?? 0) > 0 && ` [${formatSurfaces(proc.surfaces)}]`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">{formatCurrency(proc.cost)}</p>
                            <StatusBadge status={proc.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/treatment-plans/${plan.id}`);
                      }}
                      className="w-full mt-3 py-2 text-xs text-primary hover:text-primary font-medium border border-dashed border-primary/25 rounded-lg hover:bg-primary-muted/60 transition-colors"
                    >
                      View Full Plan Details
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Timeline View */
        <div className="space-y-3">
          {allProcedures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70 bg-muted/50 rounded-xl border border-dashed border-border">
              <Calendar className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium text-muted-foreground">No procedures scheduled</p>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-border space-y-4">
              {allProcedures.map((proc) => (
                <div key={proc.id} className="relative">
                  <div className={cn(
                    'absolute -left-[29px] w-4 h-4 rounded-full border-2 border-white shadow-sm',
                    proc.status === 'COMPLETED' ? 'bg-success' :
                    proc.status === 'IN_PROGRESS' ? 'bg-primary' :
                    proc.status === 'PLANNED' ? 'bg-border' :
                    'bg-warning'
                  )} />
                  <div
                    onClick={() => navigate(`/treatment-plans/${proc.planId}/procedures/${proc.id}`)}
                    className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground/70 mb-1">
                          {proc.scheduledDate ? formatDate(proc.scheduledDate) : 'Not scheduled'} • {proc.planTitle}
                        </p>
                        <h4 className="font-semibold text-foreground">{proc.procedure.name}</h4>
                      </div>
                      <StatusBadge status={proc.status} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {proc.procedure.code && (
                        <span className="font-mono text-primary bg-primary-muted/60 px-2 py-0.5 rounded">{proc.procedure.code}</span>
                      )}
                      {proc.toothNumbers.length > 0 && (
                        <span>Teeth: {proc.toothNumbers.join(', ')}</span>
                      )}
                      {(proc.surfaces?.length ?? 0) > 0 && (
                        <span>Surfaces: [{formatSurfaces(proc.surfaces)}]</span>
                      )}
                      <span className="ml-auto font-semibold text-foreground">{formatCurrency(proc.cost)}</span>
                    </div>
                    {proc.notes && (
                      <p className="mt-2 text-xs text-muted-foreground/70 italic">{proc.notes}</p>
                    )}
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