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
  if (error) return <div className="text-danger text-center mt-8">Failed to load visits</div>;
  if (!visits?.length) return <div className="text-muted-foreground/70 text-center mt-8">No visits found</div>;

  const statusColor = (status: string) => {
    switch (status) {
      case 'ARRIVED': return 'bg-warning-muted text-warning';
      case 'IN_PROGRESS': return 'bg-primary-muted text-primary';
      case 'COMPLETED': return 'bg-success-muted text-success';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-3">
      {visits.map((visit: Visit) => (
        <div key={visit.id} className="bg-white border border-border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-foreground">{visit.visitCode}</h3>
              <p className="text-sm text-muted-foreground">
                {visit.appointment?.type || 'General'} • Dr. {visit.dentist.firstName} {visit.dentist.lastName}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(visit.status)}`}>
              {visit.status.replace('_', ' ')}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{format(new Date(visit.createdAt), 'PPP')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{format(new Date(visit.checkedInAt), 'p')}</span>
            </div>
            {visit.completedAt && (
              <div className="flex items-center gap-1 text-success">
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