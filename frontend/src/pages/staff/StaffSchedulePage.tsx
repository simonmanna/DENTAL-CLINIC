// src/pages/staff/StaffSchedulePage.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft, Save, X, Clock, Calendar, RotateCcw, Check } from 'lucide-react';
import { staffApi } from '../../services/staffApi';
import { DAYS_OF_WEEK } from '../../types/staff';

interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
}

const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '17:00';

export function StaffSchedulePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [schedules, setSchedules] = useState<ScheduleInput[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.getById(id!),
    enabled: !!id,
  });

  // Initialize schedules
  useEffect(() => {
    if (staff) {
      const existingSchedules = staff.schedules || [];
      const defaultSchedules: ScheduleInput[] = Array.from({ length: 7 }, (_, i) => {
        const existing = existingSchedules.find((s: any) => s.dayOfWeek === i);
        return {
          dayOfWeek: i,
          startTime: existing?.startTime || DEFAULT_START_TIME,
          endTime: existing?.endTime || DEFAULT_END_TIME,
          isWorking: existing?.isWorking ?? (i !== 0 && i !== 6), // Mon-Fri default
        };
      });
      setSchedules(defaultSchedules);
    }
  }, [staff]);

  const updateMutation = useMutation({
    mutationFn: (data: ScheduleInput[]) => staffApi.updateSchedule(id!, data),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Schedule updated successfully' });
      setHasChanges(false);
      setTimeout(() => navigate(`/staff/${id}`), 1500);
    },
    onError: (error: any) => {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update schedule' });
    },
  });

  const handleScheduleChange = (index: number, field: keyof ScheduleInput, value: any) => {
    const newSchedules = [...schedules];
    newSchedules[index] = { ...newSchedules[index], [field]: value };
    setSchedules(newSchedules);
    setHasChanges(true);
  };

  const handleToggleWorking = (index: number) => {
    const newSchedules = [...schedules];
    newSchedules[index].isWorking = !newSchedules[index].isWorking;
    setSchedules(newSchedules);
    setHasChanges(true);
  };

  const handleCopyToAll = (sourceIndex: number) => {
    const sourceSchedule = schedules[sourceIndex];
    const newSchedules = schedules.map((schedule, idx) => 
      idx === sourceIndex ? schedule : { ...schedule, startTime: sourceSchedule.startTime, endTime: sourceSchedule.endTime, isWorking: sourceSchedule.isWorking }
    );
    setSchedules(newSchedules);
    setHasChanges(true);
    setMessage({ type: 'success', text: 'Applied to all days' });
    setTimeout(() => setMessage(null), 2000);
  };

  const handleReset = () => {
    if (staff) {
      const existingSchedules = staff.schedules || [];
      const defaultSchedules: ScheduleInput[] = Array.from({ length: 7 }, (_, i) => {
        const existing = existingSchedules.find((s: any) => s.dayOfWeek === i);
        return {
          dayOfWeek: i,
          startTime: existing?.startTime || DEFAULT_START_TIME,
          endTime: existing?.endTime || DEFAULT_END_TIME,
          isWorking: existing?.isWorking ?? (i !== 0 && i !== 6),
        };
      });
      setSchedules(defaultSchedules);
      setHasChanges(false);
      setMessage({ type: 'success', text: 'Reset to saved schedule' });
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const handleSubmit = () => {
    updateMutation.mutate(schedules);
  };

  const getWorkingDaysCount = () => schedules.filter(s => s.isWorking).length;
  const getTotalHours = () => {
    return schedules.reduce((total, schedule) => {
      if (!schedule.isWorking) return total;
      const start = new Date(`2000-01-01T${schedule.startTime}`);
      const end = new Date(`2000-01-01T${schedule.endTime}`);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return total + hours;
    }, 0);
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
      {/* Message Banner */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/staff/${id}`)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Manage Schedule</h1>
            <p className="text-slate-500 text-sm">
              {staff?.firstName} {staff?.lastName} • {staff?.staffCode}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSubmit}
            disabled={!hasChanges || updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="text-blue-600 text-sm font-medium mb-1">Working Days</div>
          <div className="text-2xl font-bold text-blue-700">{getWorkingDaysCount()}/7 days</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <div className="text-green-600 text-sm font-medium mb-1">Weekly Hours</div>
          <div className="text-2xl font-bold text-green-700">{getTotalHours()} hours</div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
          <div className="text-purple-600 text-sm font-medium mb-1">Avg Daily</div>
          <div className="text-2xl font-bold text-purple-700">
            {getWorkingDaysCount() > 0 ? (getTotalHours() / getWorkingDaysCount()).toFixed(1) : 0} hrs
          </div>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Weekly Schedule</h2>
              <p className="text-sm text-slate-500">Set working hours for each day</p>
            </div>
          </div>
          <div className="text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              Timezone: Local
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {schedules.map((schedule, index) => (
            <div 
              key={schedule.dayOfWeek} 
              className={`p-6 transition-colors ${schedule.isWorking ? 'bg-white' : 'bg-slate-50/50'}`}
            >
              <div className="flex items-center gap-6">
                {/* Day Info */}
                <div className="w-32 shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleWorking(index)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        schedule.isWorking ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          schedule.isWorking ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`font-medium ${schedule.isWorking ? 'text-slate-800' : 'text-slate-400'}`}>
                      {DAYS_OF_WEEK[schedule.dayOfWeek]}
                    </span>
                  </div>
                </div>

                {/* Time Inputs */}
                <div className="flex-1 flex items-center gap-4">
                  {schedule.isWorking ? (
                    <>
                      <div className="flex items-center gap-2 flex-1">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <input
                          type="time"
                          value={schedule.startTime}
                          onChange={(e) => handleScheduleChange(index, 'startTime', e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <span className="text-slate-400 font-medium">to</span>
                        <input
                          type="time"
                          value={schedule.endTime}
                          onChange={(e) => handleScheduleChange(index, 'endTime', e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                      
                      {/* Duration Badge */}
                      <div className="px-3 py-1 bg-slate-100 rounded-full text-sm font-medium text-slate-600">
                        {(() => {
                          const start = new Date(`2000-01-01T${schedule.startTime}`);
                          const end = new Date(`2000-01-01T${schedule.endTime}`);
                          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                          return `${hours} hrs`;
                        })()}
                      </div>

                      {/* Copy to All Button */}
                      <button
                        onClick={() => handleCopyToAll(index)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 hover:bg-blue-50 rounded"
                        title="Copy this schedule to all days"
                      >
                        Apply to All
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 text-slate-400 text-sm italic">
                      Day off - Not scheduled for work
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Tips */}
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            <p>Changes will take effect immediately for new appointments. Existing appointments will not be affected.</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <button
          onClick={() => {
            const newSchedules = schedules.map(s => ({ ...s, isWorking: true, startTime: '09:00', endTime: '17:00' }));
            setSchedules(newSchedules);
            setHasChanges(true);
          }}
          className="p-4 border border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-left"
        >
          <div className="font-medium mb-1">Standard Week</div>
          <div className="text-sm text-slate-400">Mon-Fri, 9AM-5PM</div>
        </button>
        
        <button
          onClick={() => {
            const newSchedules = schedules.map((s, i) => ({ 
              ...s, 
              isWorking: i !== 0 && i !== 6,
              startTime: '08:00',
              endTime: '16:00'
            }));
            setSchedules(newSchedules);
            setHasChanges(true);
          }}
          className="p-4 border border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-left"
        >
          <div className="font-medium mb-1">Weekend Off</div>
          <div className="text-sm text-slate-400">Mon-Fri only, 8AM-4PM</div>
        </button>
      </div>
    </div>
  );
}