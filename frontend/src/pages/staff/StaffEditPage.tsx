// src/pages/staff/StaffEditPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft, Save, X, Clock, Calendar, Key } from 'lucide-react';
import { staffApi } from '../../services/staffApi';
import { DAYS_OF_WEEK, UserRole, ROLE_LABELS } from '../../types/staff';
import { toast } from 'react-hot-toast';

interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
}

export function StaffEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: UserRole.RECEPTIONIST,
    phone: '',
    specialization: '',
    qualification: '',
    licenseNumber: '',
    bio: '',
    isAvailable: true,
  });

  const [newPassword, setNewPassword] = useState('');
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const [schedules, setSchedules] = useState<ScheduleInput[]>([]);

  // Fetch staff data
  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.getById(id!),
    enabled: !!id,
  });

  // Initialize form when data loads
  useEffect(() => {
    if (staff) {
      setFormData({
        firstName: staff.firstName || '',
        lastName: staff.lastName || '',
        email: staff.email || '',
        role: staff.role || UserRole.RECEPTIONIST,
        phone: staff.phone || '',
        specialization: staff.specialization || '',
        qualification: staff.qualification || '',
        licenseNumber: staff.licenseNumber || '',
        bio: staff.bio || '',
        isAvailable: staff.isAvailable ?? true,
      });

      // Initialize schedules for all 7 days if not present
      const existingSchedules = staff.schedules || [];
      const defaultSchedules: ScheduleInput[] = Array.from({ length: 7 }, (_, i) => {
        const existing = existingSchedules.find((s: any) => s.dayOfWeek === i);
        return {
          dayOfWeek: i,
          startTime: existing?.startTime || '08:00',
          endTime: existing?.endTime || '17:00',
          isWorking: existing?.isWorking ?? (i !== 0), // Default: closed Sunday
        };
      });
      setSchedules(defaultSchedules);
    }
  }, [staff]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) => staffApi.update(id!, data),
    onSuccess: async () => {
      // Update schedules separately
      if (schedules.length > 0) {
        await staffApi.updateSchedule(id!, schedules);
      }
      toast.success('Staff member updated successfully');
      navigate('/staff');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update staff member');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData };
    if (newPassword) payload['password'] = newPassword;
    updateMutation.mutate(payload);
  };

  const handleScheduleChange = (index: number, field: keyof ScheduleInput, value: any) => {
    const newSchedules = [...schedules];
    newSchedules[index] = { ...newSchedules[index], [field]: value };
    setSchedules(newSchedules);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/staff')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Edit Staff Member</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {staff?.staffCode} • Last updated: {new Date(staff?.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/staff')}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 text-sm">01</span>
              </div>
              Personal Information
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="+256..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="email@example.com"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <span className="text-purple-600 text-sm">02</span>
              </div>
              Professional Details
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Specialization</label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="e.g., Orthodontics"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Qualification</label>
                  <input
                    type="text"
                    value={formData.qualification}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="e.g., BDS, MDS"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">License Number</label>
                <input
                  type="text"
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="DENT-UG-XXXX-XXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  placeholder="Brief professional biography..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Status</h3>
            
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.isAvailable}
                  onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-700">Available for Appointments</div>
                  <div className="text-xs text-slate-500">Show in booking system</div>
                </div>
              </label>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-500 mb-1">Staff Code</div>
                <div className="font-mono text-sm font-medium text-slate-800">{staff?.staffCode}</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-500 mb-1">Joined Date</div>
                <div className="text-sm font-medium text-slate-800">
                  {new Date(staff?.joiningDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>

              {staff?.lastLoginAt && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Last Login</div>
                  <div className="text-sm font-medium text-slate-800">
                    {new Date(staff.lastLoginAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Reset Password Section */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <Key className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Reset Password</h3>
                  <p className="text-xs text-slate-500">Leave blank to keep current password</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showPasswordSection ? 'Cancel' : 'Change Password'}
              </button>
            </div>
            {showPasswordSection && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  minLength={6}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Section */}
      <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-green-600" />
          </div>
          Work Schedule
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {schedules.map((schedule, index) => (
            <div 
              key={schedule.dayOfWeek}
              className={`p-4 rounded-lg border ${schedule.isWorking ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-slate-800">{DAYS_OF_WEEK[schedule.dayOfWeek]}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedule.isWorking}
                    onChange={(e) => handleScheduleChange(index, 'isWorking', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {schedule.isWorking && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <input
                      type="time"
                      value={schedule.startTime}
                      onChange={(e) => handleScheduleChange(index, 'startTime', e.target.value)}
                      className="flex-1 text-sm px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-slate-400">-</span>
                    <input
                      type="time"
                      value={schedule.endTime}
                      onChange={(e) => handleScheduleChange(index, 'endTime', e.target.value)}
                      className="flex-1 text-sm px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}