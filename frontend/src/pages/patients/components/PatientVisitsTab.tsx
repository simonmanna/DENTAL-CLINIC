import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, User, Loader2 } from 'lucide-react';
import { treatmentPlansApi } from '@/lib/api/treatment-plans';
import { format } from 'date-fns';

interface Visit {
  id: string;
  visitCode: string;
  status: string;
  createdAt: string;
  checkedInAt: string;
  completedAt: string | null;
  dentist: { firstName: string; lastName: string };
  appointment: { type: string } | null;
}

export function PatientVisitsTab({ patientId }: { patientId: string }) {
  const { data: visits, isLoading, error } = useQuery({
    queryKey: ['patient-visits', patientId],
    queryFn: () => treatmentPlansApi.getPatientVisits(patientId),
    enabled: !!patientId,
  });

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin mx-auto mt-8" />;
  if (error) return <div className="text-red-500 text-center mt-8">Failed to load visits</div>;
  if (!visits?.length) return <div className="text-slate-400 text-center mt-8">No visits found</div>;

  const statusColor = (status: string) => {
    switch (status) {
      case 'ARRIVED': return 'bg-amber-100 text-amber-700';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-700';
      case 'COMPLETED': return 'bg-green-100 text-green-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-3">
      {visits.map((visit: Visit) => (
        <div key={visit.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-slate-800">{visit.visitCode}</h3>
              <p className="text-sm text-slate-500">
                {visit.appointment?.type || 'General'} • Dr. {visit.dentist.firstName} {visit.dentist.lastName}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(visit.status)}`}>
              {visit.status.replace('_', ' ')}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{format(new Date(visit.createdAt), 'PPP')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{format(new Date(visit.checkedInAt), 'p')}</span>
            </div>
            {visit.completedAt && (
              <div className="flex items-center gap-1 text-green-600">
                <User className="w-4 h-4" />
                <span>Completed</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}