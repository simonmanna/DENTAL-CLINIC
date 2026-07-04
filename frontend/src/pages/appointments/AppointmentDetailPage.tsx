// src/pages/appointments/AppointmentDetailPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi } from '../../lib/api';
import { formatDateTime, formatDate } from '../../lib/utils';
import { Button, Card, LoadingSpinner, StatusBadge } from '../../components/shared';
import { Calendar, User, Clock, FileText, Stethoscope, CreditCard } from 'lucide-react';

export function AppointmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: apt, isLoading } = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => appointmentsApi.getOne(id!),
  });

  const checkInMutation = useMutation({
    mutationFn: () => appointmentsApi.checkIn(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointment', id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => appointmentsApi.cancel(id!, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointment', id] }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ date, reason }: { date: string; reason: string }) => 
      appointmentsApi.reschedule(id!, { newScheduledAt: date, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointment', id] }),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!apt) return <div>Appointment not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Appointment {apt.appointmentCode}
          </h1>
          <p className="text-slate-500 mt-1">
            Scheduled for {formatDateTime(apt.scheduledAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {apt.status === 'CHECKED_IN' && !apt.visit && (
            <Button 
              variant="primary"
              onClick={() => navigate(`/visits/new?appointmentId=${apt.id}`)}
            >
              <Stethoscope className="w-4 h-4 mr-2" />
              Start Visit
            </Button>
          )}
          {apt.visit && (
            <Button 
              variant="outline"
              onClick={() => navigate(`/visits/${apt.visit.id}`)}
            >
              View Visit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-slate-400" />
              Patient Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">Name</p>
                <p className="font-medium">{apt.patient.firstName} {apt.patient.lastName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Patient Code</p>
                <p className="font-medium">{apt.patient.patientCode}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Phone</p>
                <p className="font-medium">{apt.patient.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Date of Birth</p>
                <p className="font-medium">
                  {apt.patient.dateOfBirth ? formatDate(apt.patient.dateOfBirth) : 'N/A'}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-400" />
              Appointment Details
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Type</span>
                <span className="font-medium">{apt.type}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Dentist</span>
                <span className="font-medium">Dr. {apt.dentist.firstName} {apt.dentist.lastName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Duration</span>
                <span className="font-medium">{apt.duration} minutes</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Status</span>
                <StatusBadge status={apt.status} />
              </div>
              {apt.chiefComplaint && (
                <div className="pt-2">
                  <p className="text-slate-600 mb-1">Chief Complaint</p>
                  <p className="text-slate-900 bg-slate-50 p-3 rounded-lg">{apt.chiefComplaint}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Visit Summary if exists */}
          {apt.visit && (
            <Card>
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-slate-400" />
                Visit Summary
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Visit Status</p>
                  <StatusBadge status={apt.visit.status} />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Procedures</p>
                  <p className="font-medium">{apt.visit.procedures?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Prescriptions</p>
                  <p className="font-medium">{apt.visit.prescriptions?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Payment Status</p>
                  <p className="font-medium">{apt.visit.paymentStatus}</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-slate-900 mb-4">Actions</h3>
            <div className="space-y-2">
              {['SCHEDULED', 'CONFIRMED'].includes(apt.status) && (
                <Button 
                  className="w-full justify-center"
                  onClick={() => checkInMutation.mutate()}
                >
                  <User className="w-4 h-4 mr-2" />
                  Check In Patient
                </Button>
              )}

              {['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(apt.status) && (
                <>
                  <Button 
                    variant="outline" 
                    className="w-full justify-center"
                    onClick={() => {
                      const date = prompt('New date/time (ISO format):');
                      const reason = prompt('Reschedule reason:');
                      if (date) rescheduleMutation.mutate({ date, reason: reason || '' });
                    }}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Reschedule
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-center text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const reason = prompt('Cancellation reason:');
                      if (reason) cancelMutation.mutate(reason);
                    }}
                  >
                    Cancel Appointment
                  </Button>
                </>
              )}
            </div>
          </Card>

          {apt.visit?.invoice && (
            <Card>
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Billing
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total</span>
                  <span className="font-medium">${apt.visit.invoice.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Paid</span>
                  <span className="font-medium text-green-600">${apt.visit.invoice.amountPaid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Balance</span>
                  <span className="font-medium text-red-600">${apt.visit.invoice.balance}</span>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={() => navigate(`/invoices/${apt.visit.invoice.id}`)}
              >
                View Invoice
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}