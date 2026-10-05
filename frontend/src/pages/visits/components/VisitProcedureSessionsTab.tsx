import { useQuery } from '@tanstack/react-query';
import { 
  CalendarDays, 
  Activity, 
  Info, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  Hash 
} from 'lucide-react';
import { treatmentPlansApi } from '../../../lib/api/treatment-plans';


interface SessionTarget {
  id: string;
  toothNumber: number | null;
  surfaces: string[];
}

interface ProcedureSession {
  id: string;
  sessionNumber: number;
  sessionLabel: string | null;
  status: string;
  performedDate: string | null;
  performedNotes: string | null;
  treatmentProcedure: {
    procedure: { name: string; code: string };
    treatmentPlan: { title: string };
  };
  targets: SessionTarget[];
}

export function VisitProcedureSessionsTab({ visitId }: { visitId: string }) {
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['visit-sessions', visitId],
    queryFn: () => treatmentPlansApi.getSessionsByVisit(visitId),
    enabled: !!visitId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-xs font-medium text-muted-foreground/70">Loading sessions...</span>
      </div>
    );
  }

  if (error || !sessions?.length) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-border/60 rounded-xl">
        <p className="text-sm text-muted-foreground/70">
          {error ? 'Failed to load sessions.' : 'No procedure sessions recorded.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-white border border-border rounded-xl shadow-sm">
      <div className="divide-y divide-border/60">
        {sessions.map((session: ProcedureSession) => (
          <div
            key={session.id}
            className="group hover:bg-muted/50 transition-colors duration-150 p-3"
          >
            {/* Header Row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${
                  session.status === 'COMPLETED' ? 'bg-success-muted/60' : 'bg-primary-muted/60'
                }`}>
                  {session.status === 'COMPLETED' ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <Clock className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {session.treatmentProcedure.procedure.name}
                    </span>
                    {session.sessionLabel && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                        {session.sessionLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-none mt-1">
                    Treatment Plan: {session.treatmentProcedure.treatmentPlan.title}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  session.status === 'COMPLETED' 
                    ? 'bg-success-muted/60 border-success/20 text-success' 
                    : 'bg-warning-muted/60 border-warning/20 text-warning'
                }`}>
                  {session.status}
                </span>
              </div>
            </div>

            {/* Details Row */}
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 ml-11">
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="tabular-nums">
                  {session.performedDate
                    ? new Date(session.performedDate).toLocaleDateString(undefined, { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      })
                    : 'Scheduled'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Hash className="w-3.5 h-3.5 text-muted-foreground/70" />
                <div className="flex gap-1">
                  {session.targets.length > 0 ? (
                    session.targets.map((t) => (
                      <span key={t.id} className="bg-muted px-1.5 rounded font-medium text-foreground">
                        T{t.toothNumber} { " "}
                        <span className="text-[10px] text-muted-foreground/70 ml-0.5">{t.surfaces.join(' , ')}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground/70 italic">No Target</span>
                  )}
                </div>
              </div>
            </div>

            {/* Notes Section */}
            {session.performedNotes && (
              <div className="mt-2 ml-11 flex items-start gap-2 bg-primary-muted/50 p-2 rounded-md border border-primary/50">
                <Info className="w-3.5 h-3.5 text-primary/70 mt-0.5 shrink-0" />
                <p className="text-[12px] text-muted-foreground italic leading-relaxed">
                  {session.performedNotes}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}