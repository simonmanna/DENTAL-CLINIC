import { useQuery } from '@tanstack/react-query';
import { Calendar, Activity, FileText, Loader2 } from 'lucide-react';
// import { treatmentPlansApi } from "../../../lib/api/treatment-plans';
import { treatmentPlansApi } from '@/lib/api/treatment-plans';
import { format } from 'date-fns';

interface SessionTarget {
  id: string;
  toothNumber: number | null;
  surfaces: string[];
}

interface ExecutedSession {
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
  visit: { id: string; visitCode: string };
}

export function PatientProceduresTab({ patientId }: { patientId: string }) {
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['patient-procedures', patientId],
    queryFn: () => treatmentPlansApi.getPatientExecutedSessions(patientId),
    enabled: !!patientId,
  });

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin mx-auto mt-8" />;
  if (error) return <div className="text-red-500 text-center mt-8">Failed to load procedures</div>;
  if (!sessions?.length) return <div className="text-slate-400 text-center mt-8">No treatment procedures recorded</div>;

  return (
    <div className="space-y-4">
      {sessions.map((session: ExecutedSession) => (
        <div key={session.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <h3 className="font-semibold text-slate-800">
                {session.treatmentProcedure.procedure.name}
                {session.sessionLabel && (
                  <span className="text-slate-500 font-normal ml-2">({session.sessionLabel})</span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Plan: {session.treatmentProcedure.treatmentPlan.title} • Visit: {session.visit.visitCode}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              session.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {session.status}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>{session.performedDate ? format(new Date(session.performedDate), 'PPP p') : 'Not performed'}</span>
            </div>
            <div className="flex items-start gap-2 text-slate-600">
              <Activity className="w-4 h-4 text-slate-400 mt-0.5" />
              <div>
                {session.targets.length > 0 ? (
                  session.targets.map(t => (
                    <span key={t.id} className="inline-block mr-3">
                      Tooth {t.toothNumber}
                      {t.surfaces.length > 0 && ` (${t.surfaces.join(', ')})`}
                    </span>
                  ))
                ) : <span className="italic">No tooth</span>}
              </div>
            </div>
          </div>

          {session.performedNotes && (
            <div className="mt-3 flex items-start gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded">
              <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
              <p className="flex-1">{session.performedNotes}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}