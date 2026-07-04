import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  Calendar, 
  Star, 
  Edit2, 
  Trash2, 
  Power,
  UserCheck,
  MoreVertical
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { staffApi } from '../../services/staffApi';
import { formatDistanceToNow } from '../../utils/date';

// Define the actual API response type
interface StaffMember {
  id: string;
  staffCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string; // Will be extracted from user.email
  role: string;  // Will be extracted from user.role
  isActive: boolean; // Will be extracted from user.isActive
  specialization: string | null;
  lastLoginAt: string | null;
  _count?: {
    appointments: number;
    treatmentPlans: number;
  };
  user: {
    email: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
  };
}

// Map the API role to your frontend UserRole enum
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrator',
  ADMIN: 'Administrator',
  DENTIST: 'Dentist',
  NURSE: 'Nurse',
  RECEPTIONIST: 'Receptionist',
  PHARMACIST: 'Pharmacist',
  LAB_TECHNICIAN: 'Lab Technician',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  ADMIN: 'bg-orange-100 text-orange-700',
  DENTIST: 'bg-blue-100 text-blue-700',
  NURSE: 'bg-green-100 text-green-700',
  RECEPTIONIST: 'bg-purple-100 text-purple-700',
  PHARMACIST: 'bg-cyan-100 text-cyan-700',
  LAB_TECHNICIAN: 'bg-pink-100 text-pink-700',
};

export function StaffListPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | ''>('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['staff', search, roleFilter, statusFilter],
    queryFn: async () => {
      const result = await staffApi.getAll({
        page: 1,
        limit: 50,
        search: search || undefined,
        role: roleFilter || undefined,
        isActive: statusFilter ? statusFilter === 'true' : undefined,
      });
      return result;
    },
  });

  const staffList: StaffMember[] = Array.isArray(data) ? data : (data?.data || []);

  const handleToggleActive = async (id: string) => {
    try {
      await staffApi.toggleActive(id);
      refetch();
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      try {
        await staffApi.delete(id);
        refetch();
      } catch (error) {
        console.error('Failed to delete:', error);
      }
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-slate-500">Loading staff directory...</div>;
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
          {/* <p className="text-slate-500 mt-1">Manage dental clinic staff and their permissions</p> */}
        </div>
        <button
          onClick={() => navigate('/staff/create')}
          className="flex items-center justify-center gap-2 px-2 py-1 m-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Staff Member
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4">
        <div className="flex-1 min-w-[280px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>
        
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
        >
          <option value="">All Roles</option>
          {Object.keys(ROLE_LABELS).map(role => (
            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
        >
          <option value="">All Status</option>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
        </select>
      </div>

      {/* Data Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff Member</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role & ID</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Activity</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffList.map((member) => (
                <tr 
                  key={member.id} 
                  className={`hover:bg-slate-50/50 transition-colors ${!member.user?.isActive ? 'bg-slate-50/30' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600 border border-blue-100">
                        {member.firstName[0]}{member.lastName[0]}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{member.firstName} {member.lastName}</div>
                        <div className="text-xs text-slate-500">{member.specialization || 'General'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${ROLE_COLORS[member.user?.role] || 'bg-gray-100 text-gray-700'}`}>
                        {ROLE_LABELS[member.user?.role] || member.user?.role}
                      </span>
                      <div className="text-xs font-mono text-slate-400">{member.staffCode}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600 truncate max-w-[180px]">{member.user?.email}</div>
                    <div className="text-xs text-slate-400">{member.phone || 'No phone'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1" title="Appointments">
                          <Calendar className="w-3 h-3 text-blue-400" /> {member._count?.appointments || 0}
                        </span>
                        <span className="flex items-center gap-1" title="Treatment Plans">
                          <UserCheck className="w-3 h-3 text-purple-400" /> {member._count?.treatmentPlans || 0}
                        </span>
                      </div>
                      {member.user?.lastLoginAt && (
                        <div className="text-[10px] text-slate-400 italic">
                          Seen {formatDistanceToNow(new Date(member.user.lastLoginAt))} ago
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => navigate(`/staff/${member.id}/edit`)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Profile"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/staff/${member.id}/schedule`)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="View Schedule"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(member.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          member.user?.isActive 
                            ? 'text-emerald-600 hover:bg-emerald-50' 
                            : 'text-slate-300 hover:bg-slate-100'
                        }`}
                        title={member.user?.isActive ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      {currentUser?.role === 'SUPER_ADMIN' && (
                        <button 
                          onClick={() => handleDelete(member.id, `${member.firstName} ${member.lastName}`)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {staffList.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-600 font-medium">No matching staff found</h3>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or search terms.</p>
          </div>
        )}
      </div>
    </div>
  );
}