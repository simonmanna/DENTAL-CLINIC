// src/pages/staff/StaffDetailPage.tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ChevronLeft, 
  Edit2, 
  Calendar, 
  Star, 
  Mail, 
  Phone, 
  MapPin, 
  Award, 
  Briefcase, 
  Clock,
  User,
  FileText,
  Activity,
  MoreVertical,
  Power,
  Trash2
} from 'lucide-react';
import { staffApi } from '../../services/staffApi';
import { ROLE_LABELS, ROLE_COLORS, DAYS_OF_WEEK } from '../../types/staff';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/staff';

import { format } from 'date-fns';

export function StaffDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'performance'>('overview');

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;

  const { data: staff, isLoading, refetch } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.getById(id!),
    enabled: !!id,
  });

  const handleToggleActive = async () => {
    try {
      await staffApi.toggleActive(id!);
      refetch();
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${staff.firstName} ${staff.lastName}? This action cannot be undone.`)) {
      try {
        await staffApi.delete(id!);
        navigate('/staff');
      } catch (error) {
        console.error('Failed to delete:', error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-800">Staff member not found</h2>
        <button 
          onClick={() => navigate('/staff')}
          className="mt-4 text-blue-600 hover:text-blue-700"
        >
          Back to Staff List
        </button>
      </div>
    );
  }

  const getInitials = () => `${staff.firstName[0]}${staff.lastName[0]}`;
  
  const getNextAppointment = () => {
    if (!staff.appointments?.length) return null;
    return staff.appointments[0];
  };

  const nextAppointment = getNextAppointment();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/staff')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Staff Details</h1>
            <p className="text-slate-500 text-sm">View and manage staff information</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => navigate(`/staff/${id}/schedule`)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                Edit Schedule
              </button>
              <button
                onClick={() => navigate(`/staff/${id}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-blue-500 to-blue-600"></div>
            <div className="px-6 pb-6">
              <div className="relative flex justify-between items-end -mt-12 mb-4">
                <div className="w-24 h-24 rounded-xl bg-white p-1 shadow-lg">
                  {staff.avatar ? (
                    <img 
                      src={staff.avatar} 
                      alt={staff.firstName} 
                      className="w-full h-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-lg bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-400">
                      {getInitials()}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => navigate(`/staff/${id}/performance`)}
                    className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-600"
                    title="Add Performance Review"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={handleToggleActive}
                      className={`p-2 rounded-lg shadow-sm ${
                        staff.isActive 
                          ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={staff.isActive ? 'Deactivate' : 'Activate'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-800">
                  {staff.firstName} {staff.lastName}
                </h2>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${ROLE_COLORS[staff.role]}`}>
                  {ROLE_LABELS[staff.role]}
                </span>
                {!staff.isActive && (
                  <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    Inactive
                  </span>
                )}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 text-slate-600">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{staff.email}</span>
                </div>
                {staff.phone && (
                  <div className="flex items-center gap-3 text-slate-600">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span>{staff.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-slate-600">
                  <Award className="w-4 h-4 text-slate-400" />
                  <span className="font-mono text-xs">{staff.staffCode}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>Joined {format(new Date(staff.joiningDate), 'MMM yyyy')}</span>
                </div>
              </div>

              {staff.bio && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-sm text-slate-600 leading-relaxed">{staff.bio}</p>
                </div>
              )}

              {isSuperAdmin && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Staff Member
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-4">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{staff._count?.appointments || 0}</div>
                <div className="text-xs text-blue-600 font-medium">Total Appointments</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">{staff._count?.treatmentPlans || 0}</div>
                <div className="text-xs text-green-600 font-medium">Treatment Plans</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-700">
                  {staff.performanceNotes?.length || 0}
                </div>
                <div className="text-xs text-purple-600 font-medium">Reviews</div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-700">
                  {staff.isAvailable ? 'Yes' : 'No'}
                </div>
                <div className="text-xs text-orange-600 font-medium">Available</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Tabs Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="flex border-b border-slate-100">
              {['overview', 'schedule', 'performance'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab 
                      ? 'text-blue-600 border-b-2 border-blue-600' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Professional Info */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-slate-400" />
                      Professional Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">Specialization</div>
                        <div className="font-medium text-slate-800">
                          {staff.specialization || 'Not specified'}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">Qualification</div>
                        <div className="font-medium text-slate-800">
                          {staff.qualification || 'Not specified'}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">License Number</div>
                        <div className="font-medium text-slate-800 font-mono text-sm">
                          {staff.licenseNumber || 'Not provided'}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">Status</div>
                        <div className={`font-medium ${staff.isActive ? 'text-green-700' : 'text-red-700'}`}>
                          {staff.isActive ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Upcoming Appointments */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-slate-400" />
                      Upcoming Appointments
                    </h3>
                    {staff.appointments?.length > 0 ? (
                      <div className="space-y-3">
                        {staff.appointments.slice(0, 5).map((apt: any) => (
                          <div 
                            key={apt.id} 
                            className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-medium text-slate-800">
                                  {apt.patient?.firstName} {apt.patient?.lastName}
                                </div>
                                <div className="text-sm text-slate-500">
                                  {apt.patient?.patientCode} • {apt.type}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-slate-800">
                                {format(new Date(apt.scheduledAt), 'MMM dd, yyyy')}
                              </div>
                              <div className="text-xs text-slate-500">
                                {format(new Date(apt.scheduledAt), 'HH:mm')} ({apt.duration} min)
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-slate-50 rounded-lg">
                        <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">No upcoming appointments</p>
                      </div>
                    )}
                  </div>

                  {/* Recent Activity */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-slate-400" />
                      Recent Activity
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                        <div>
                          <div className="text-sm text-slate-800">Profile updated</div>
                          <div className="text-xs text-slate-500">
                            {format(new Date(staff.updatedAt), 'MMM dd, yyyy HH:mm')}
                          </div>
                        </div>
                      </div>
                      {staff.lastLoginAt && (
                        <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                          <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                          <div>
                            <div className="text-sm text-slate-800">Last login</div>
                            <div className="text-xs text-slate-500">
                              {format(new Date(staff.lastLoginAt), 'MMM dd, yyyy HH:mm')}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'schedule' && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Weekly Schedule</h3>
                  <div className="space-y-3">
                    {DAYS_OF_WEEK.map((day, index) => {
                      const schedule = staff.schedules?.find((s: any) => s.dayOfWeek === index);
                      return (
                        <div 
                          key={day} 
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            schedule?.isWorking 
                              ? 'bg-white border-slate-200' 
                              : 'bg-slate-50 border-slate-100 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              schedule?.isWorking ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'
                            }`}>
                              <Clock className="w-5 h-5" />
                            </div>
                            <span className="font-medium text-slate-800">{day}</span>
                          </div>
                          <div className="text-right">
                            {schedule?.isWorking ? (
                              <div className="text-sm font-medium text-slate-800">
                                {schedule.startTime} - {schedule.endTime}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-500">Off</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => navigate(`/staff/${id}/schedule`)}
                      className="mt-4 w-full py-2 border border-dashed border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Edit Schedule
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'performance' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Performance History</h3>
                    {isAdmin && (
                      <button
                        onClick={() => navigate(`/staff/${id}/performance`)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        + Add Review
                      </button>
                    )}
                  </div>
                  
                  {staff.performanceNotes?.length > 0 ? (
                    <div className="space-y-4">
                      {staff.performanceNotes.map((note: any) => (
                        <div key={note.id} className="p-4 border border-slate-100 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-medium text-slate-800">{note.period}</div>
                              <div className="text-xs text-slate-500">
                                {format(new Date(note.createdAt), 'MMM dd, yyyy')}
                              </div>
                            </div>
                            {note.rating && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 rounded-lg">
                                <Star className="w-3 h-3 text-yellow-600 fill-yellow-600" />
                                <span className="text-sm font-medium text-yellow-700">{note.rating}/5</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-slate-600">{note.notes}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-lg">
                      <Star className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h4 className="text-slate-800 font-medium mb-1">No performance reviews yet</h4>
                      <p className="text-slate-500 text-sm mb-4">Start tracking performance by adding a review</p>
                      {isAdmin && (
                        <button
                          onClick={() => navigate(`/staff/${id}/performance`)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                        >
                          Add First Review
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}