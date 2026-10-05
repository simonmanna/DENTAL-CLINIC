// src/pages/patients/components/ProgressReportsTab.tsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ClipboardList, Calendar, CheckCircle, Clock,
  AlertTriangle, ChevronRight, Loader2, FileText,
  TrendingUp, TrendingDown, Minus, BarChart2,
  User, Stethoscope, Hash, Search, Filter
} from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { api } from '@/lib/api/client';

// Types
type ComplaintStatus = 'IMPROVED' | 'SAME' | 'WORSE';
type Outcome = 'GOOD' | 'FAIR' | 'POOR';

interface ProgressReport {
  id: string;
  reportCode: string;
  visitId: string;
  patientId: string;
  complaint?: string;
  complaintStatus?: ComplaintStatus;
  treatmentStatus?: string;
  outcome?: Outcome;
  toothNumber?: number;
  procedureName?: string;
  findings?: string;
  notes?: string;
  nextPlan?: string;
  createdAt: string;
  updatedAt: string;
  dentist?: { 
    id: string; 
    firstName: string; 
    lastName: string 
  };
  visit?: {
    id: string;
    visitCode: string;
    visitDate?: string;
  };
}

const STATUS_ICONS: Record<ComplaintStatus, React.ReactNode> = {
  IMPROVED: <TrendingUp className="w-3 h-3" />,
  SAME: <Minus className="w-3 h-3" />,
  WORSE: <TrendingDown className="w-3 h-3" />,
};

const STATUS_STYLES: Record<ComplaintStatus, string> = {
  IMPROVED: 'bg-success-muted/60 text-success border-success/25',
  SAME: 'bg-warning-muted/60 text-warning border-warning/25',
  WORSE: 'bg-danger-muted/60 text-danger border-danger/25',
};

const OUTCOME_STYLES: Record<Outcome, string> = {
  GOOD: 'bg-success-muted/60 text-success border-success/25',
  FAIR: 'bg-primary-muted/60 text-primary border-primary/25',
  POOR: 'bg-danger-muted/60 text-danger border-danger/25',
};

function cn(...c: (string | boolean | undefined | null)[]) { 
  return c.filter(Boolean).join(' '); 
}

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  return <Loader2 className={cn('animate-spin text-primary', sizes[size])} />;
}

interface ProgressReportsTabProps {
  patientId: string;
  patient?: any;
}

export default function ProgressReportsTab({ patientId, patient }: ProgressReportsTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [filterStatus, setFilterStatus] = useState<'ALL' | ComplaintStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all progress reports for patient
  const { data: reports = [], isLoading, error, refetch } = useQuery({
    queryKey: ['patient-progress-reports', patientId],
    queryFn: async () => {
      const response = await api.get(`visits/patients/${patientId}/progress-reports`);
      return response.data;
    },
    enabled: !!patientId,
    staleTime: 30_000,
  });

  // Stats
  const stats = useMemo(() => {
    const improved = reports.filter(r => r.complaintStatus === 'IMPROVED').length;
    const same = reports.filter(r => r.complaintStatus === 'SAME').length;
    const worse = reports.filter(r => r.complaintStatus === 'WORSE').length;
    const withOutcome = reports.filter(r => r.outcome).length;
    const good = reports.filter(r => r.outcome === 'GOOD').length;
    
    return {
      total: reports.length,
      improved,
      same,
      worse,
      withOutcome,
      good,
      fair: reports.filter(r => r.outcome === 'FAIR').length,
      poor: reports.filter(r => r.outcome === 'POOR').length,
      successRate: withOutcome > 0 ? Math.round((good / withOutcome) * 100) : 0,
    };
  }, [reports]);

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    let filtered = [...reports].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (filterStatus !== 'ALL') {
      filtered = filtered.filter(r => r.complaintStatus === filterStatus);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.complaint?.toLowerCase().includes(query) ||
        r.findings?.toLowerCase().includes(query) ||
        r.notes?.toLowerCase().includes(query) ||
        r.procedureName?.toLowerCase().includes(query) ||
        r.toothNumber?.toString().includes(query)
      );
    }

    return filtered;
  }, [reports, filterStatus, searchQuery]);

  // Timeline items (flattened)
  const timelineItems = useMemo(() => {
    return filteredReports.map(report => ({
      ...report,
      type: 'report' as const,
      date: report.createdAt,
    }));
  }, [filteredReports]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70">
        <AlertTriangle className="w-10 h-10 mb-3 text-danger/70" />
        <p className="text-sm font-medium text-muted-foreground">Failed to load progress reports</p>
        <button 
          onClick={() => refetch()} 
          className="mt-3 px-4 py-2 text-xs text-primary hover:bg-primary-muted/60 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground/70 uppercase">Total Reports</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground/70 uppercase">Improved</span>
          </div>
          <p className="text-2xl font-bold text-success">{stats.improved}</p>
        </div>
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs text-muted-foreground/70 uppercase">Success Rate</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600">{stats.successRate}%</p>
        </div>
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-warning" />
            <span className="text-xs text-muted-foreground/70 uppercase">With Outcome</span>
          </div>
          <p className="text-2xl font-bold text-warning">{stats.withOutcome}</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              viewMode === 'list' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'
            )}
          >
            List View
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

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>

          {/* Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 bg-white"
          >
            <option value="ALL">All Status</option>
            <option value="IMPROVED">Improved</option>
            <option value="SAME">Same</option>
            <option value="WORSE">Worse</option>
          </select>

          {/* <button
            onClick={() => navigate(`/visits/new?patientId=${patientId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-semibold hover:bg-[#16324f] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Visit
          </button> */}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="space-y-3">
          {filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70 bg-muted/50 rounded-xl border border-dashed border-border">
              <ClipboardList className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium text-muted-foreground">No progress reports found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {searchQuery || filterStatus !== 'ALL' 
                  ? 'Try adjusting your filters' 
                  : 'Progress reports will appear here after visits'}
              </p>
            </div>
          ) : (
            filteredReports.map((report) => {
              const isExpanded = selectedReportId === report.id;
              const isExpired = report.visit && new Date(report.visit.visitDate || '') < new Date();
              
              return (
                <div
                  key={report.id}
                  className={cn(
                    'bg-white rounded-xl border transition-all overflow-hidden',
                    'border-border hover:border-input'
                  )}
                >
                  {/* Header */}
                  <div 
                    className="flex items-start gap-4 px-5 py-4 cursor-pointer"
                    onClick={() => setSelectedReportId(isExpanded ? null : report.id)}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                      report.complaintStatus === 'IMPROVED' ? "bg-success-muted/60 border border-success/20" :
                      report.complaintStatus === 'WORSE' ? "bg-danger-muted/60 border border-danger/20" :
                      "bg-primary-muted/60 border border-primary/20"
                    )}>
                      {report.complaintStatus === 'IMPROVED' ? <TrendingUp className="w-5 h-5 text-success" /> :
                       report.complaintStatus === 'WORSE' ? <TrendingDown className="w-5 h-5 text-danger" /> :
                       <Minus className="w-5 h-5 text-primary" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono text-muted-foreground/70">
                          {report.reportCode}
                        </span>
                        
                        {report.complaintStatus && (
                          <span className={cn(
                            "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium",
                            STATUS_STYLES[report.complaintStatus]
                          )}>
                            {STATUS_ICONS[report.complaintStatus]}
                            {report.complaintStatus}
                          </span>
                        )}

                        {report.outcome && (
                          <span className={cn(
                            "text-[11px] px-2 py-0.5 rounded-full border font-medium",
                            OUTCOME_STYLES[report.outcome]
                          )}>
                            Outcome: {report.outcome}
                          </span>
                        )}

                        {report.toothNumber && (
                          <span className="text-xs font-bold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-lg">
                            Tooth {report.toothNumber}
                          </span>
                        )}

                        <ChevronRight className={cn(
                          'w-4 h-4 text-muted-foreground/70 transition-transform ml-auto',
                          isExpanded && 'rotate-90'
                        )} />
                      </div>

                      {report.complaint && (
                        <p className="text-sm text-foreground font-medium mb-1">
                          {report.complaint}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground/70 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(report.createdAt)}
                        </span>
                        {report.visit && (
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {report.visit.visitCode}
                          </span>
                        )}
                        {report.dentist && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Dr. {report.dentist.firstName} {report.dentist.lastName}
                          </span>
                        )}
                        {report.procedureName && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="w-3 h-3" />
                            {report.procedureName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/50 px-5 py-4 space-y-3">
                      {report.findings && (
                        <div className="bg-white rounded-lg border border-border p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Findings</span>
                          <p className="text-sm text-foreground mt-1">{report.findings}</p>
                        </div>
                      )}

                      {report.notes && (
                        <div className="bg-white rounded-lg border border-border p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Session Notes</span>
                          <p className="text-sm text-foreground mt-1">{report.notes}</p>
                        </div>
                      )}

                      {report.nextPlan && (
                        <div className="bg-primary-muted/60 rounded-lg border border-primary/20 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Next Plan</span>
                          <p className="text-sm text-primary mt-1 font-medium">{report.nextPlan}</p>
                        </div>
                      )}

                      {report.treatmentStatus && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Treatment Status:</span>
                          <span className="text-xs px-2 py-1 bg-muted text-foreground rounded-lg">
                            {report.treatmentStatus}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        {report.visit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/visits/${report.visit!.id}`);
                            }}
                            className="px-3 py-1.5 text-xs text-primary hover:bg-primary-muted/60 rounded-lg"
                          >
                            View Visit
                          </button>
                        )}
                      </div>
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
          {timelineItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70 bg-muted/50 rounded-xl border border-dashed border-border">
              <Calendar className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium text-muted-foreground">No reports to display</p>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-border space-y-4">
              {timelineItems.map((report) => (
                <div key={report.id} className="relative">
                  <div className={cn(
                    'absolute -left-[29px] w-4 h-4 rounded-full border-2 border-white shadow-sm',
                    report.complaintStatus === 'IMPROVED' ? 'bg-success' :
                    report.complaintStatus === 'WORSE' ? 'bg-danger' :
                    report.complaintStatus === 'SAME' ? 'bg-warning' :
                    'bg-muted-foreground/70'
                  )} />
                  <div 
                    onClick={() => navigate(report.visit ? `/visits/${report.visit.id}` : '#')}
                    className={cn(
                      "bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-all",
                      report.visit && "cursor-pointer"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground/70 mb-1">
                          {formatDate(report.createdAt)}
                          {report.visit && ` • ${report.visit.visitCode}`}
                        </p>
                        <h4 className="font-semibold text-foreground">
                          {report.complaint || 'Progress Report'}
                        </h4>
                      </div>
                      {report.complaintStatus && (
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border",
                          STATUS_STYLES[report.complaintStatus]
                        )}>
                          {report.complaintStatus}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {report.toothNumber && (
                        <span>Tooth {report.toothNumber}</span>
                      )}
                      {report.procedureName && (
                        <span>{report.procedureName}</span>
                      )}
                      {report.outcome && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full",
                          OUTCOME_STYLES[report.outcome]
                        )}>
                          {report.outcome}
                        </span>
                      )}
                      {report.dentist && (
                        <span className="ml-auto">Dr. {report.dentist.firstName} {report.dentist.lastName}</span>
                      )}
                    </div>

                    {report.findings && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{report.findings}</p>
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