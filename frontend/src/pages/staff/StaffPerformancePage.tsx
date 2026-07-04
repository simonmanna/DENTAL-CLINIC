// src/pages/staff/StaffPerformancePage.tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  ChevronLeft, 
  Save, 
  Star, 
  Calendar, 
  FileText, 
  TrendingUp, 
  Award,
  Trash2
} from 'lucide-react';
import { staffApi } from '../../services/staffApi';
import { format } from 'date-fns';

interface PerformanceFormData {
  period: string;
  rating: number;
  notes: string;
}

export function StaffPerformancePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState<PerformanceFormData>({
    period: '',
    rating: 5,
    notes: '',
  });

  const { data: staff, isLoading, refetch } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.getById(id!),
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: (data: PerformanceFormData) => staffApi.addPerformanceNote(id!, data),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Performance review added successfully' });
      resetForm();
      refetch();
      setTimeout(() => setIsEditing(false), 1500);
    },
    onError: (error: any) => {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to add review' });
    },
  });

  const resetForm = () => {
    setFormData({ period: '', rating: 5, notes: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleDelete = async (noteId: string) => {
    if (confirm('Are you sure you want to delete this review?')) {
      // Implement delete API call here
      setMessage({ type: 'success', text: 'Review deleted' });
      refetch();
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return 'text-green-600 bg-green-100';
    if (rating >= 3.5) return 'text-blue-600 bg-blue-100';
    if (rating >= 2.5) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getRatingLabel = (rating: number) => {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 3.5) return 'Good';
    if (rating >= 2.5) return 'Average';
    if (rating >= 1.5) return 'Below Average';
    return 'Poor';
  };

  const performanceNotes = staff?.performanceNotes || [];
  
  const averageRating = performanceNotes.length > 0
    ? (performanceNotes.reduce((acc: number, note: any) => acc + (note.rating || 0), 0) / performanceNotes.length).toFixed(1)
    : '0.0';

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
            <h1 className="text-2xl font-bold text-slate-800">Performance Reviews</h1>
            <p className="text-slate-500 text-sm">
              {staff?.firstName} {staff?.lastName} • {staff?.staffCode}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isEditing 
              ? 'border border-slate-200 text-slate-600 hover:bg-slate-50' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isEditing ? (
            <>
              <ChevronLeft className="w-4 h-4" />
              Back to Reviews
            </>
          ) : (
            <>
              <Star className="w-4 h-4" />
              Add Review
            </>
          )}
        </button>
      </div>

      {isEditing ? (
        /* Add Review Form */
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-600" />
            New Performance Review
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Review Period <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select Period</option>
                  <option value="2024-Q1">2024 - Q1</option>
                  <option value="2024-Q2">2024 - Q2</option>
                  <option value="2024-Q3">2024 - Q3</option>
                  <option value="2024-Q4">2024 - Q4</option>
                  <option value="2023-Annual">2023 - Annual</option>
                  <option value="2024-Annual">2024 - Annual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Rating <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.5"
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>Poor</span>
                      <span>Average</span>
                      <span>Excellent</span>
                    </div>
                  </div>
                  <div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center ${getRatingColor(formData.rating)}`}>
                    <span className="text-2xl font-bold">{formData.rating}</span>
                    <span className="text-[10px] uppercase font-medium">/ 5</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Review Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={6}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Enter detailed performance review, achievements, areas for improvement..."
              />
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-slate-700 mb-2">Rating Guide:</h4>
              <div className="grid grid-cols-5 gap-2 text-xs text-slate-600">
                <div className="text-center">
                  <div className="font-medium text-red-600">1.0 - 1.5</div>
                  <div>Poor</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-orange-600">2.0 - 2.5</div>
                  <div>Below Average</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-yellow-600">3.0 - 3.5</div>
                  <div>Average</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-blue-600">4.0 - 4.5</div>
                  <div>Good</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-green-600">5.0</div>
                  <div>Excellent</div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {createMutation.isPending ? 'Saving...' : 'Save Review'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Reviews List */
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-blue-600" />
                <span className="text-blue-600 text-sm font-medium">Average Rating</span>
              </div>
              <div className="text-3xl font-bold text-blue-700">{averageRating}</div>
              <div className="text-xs text-blue-600 mt-1">out of 5.0</div>
            </div>

            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-green-600" />
                <span className="text-green-600 text-sm font-medium">Total Reviews</span>
              </div>
              <div className="text-3xl font-bold text-green-700">{performanceNotes.length}</div>
              <div className="text-xs text-green-600 mt-1">all time</div>
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                <span className="text-purple-600 text-sm font-medium">Latest Period</span>
              </div>
              <div className="text-lg font-bold text-purple-700">
                {performanceNotes[0]?.period || 'N/A'}
              </div>
              <div className="text-xs text-purple-600 mt-1">most recent</div>
            </div>
          </div>

          {/* Reviews Timeline */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-slate-400" />
                Review History
              </h2>
            </div>

            {performanceNotes.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {performanceNotes.map((note: any) => (
                  <div key={note.id} className="p-6 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center ${getRatingColor(note.rating || 0)}`}>
                          <span className="text-lg font-bold">{note.rating || '-'}</span>
                          <span className="text-[10px] uppercase">/ 5</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800 text-lg">{note.period}</h3>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(note.createdAt), 'MMMM dd, yyyy')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRatingColor(note.rating || 0)}`}>
                          {getRatingLabel(note.rating || 0)}
                        </span>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete review"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="pl-15 ml-15">
                      <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {note.notes}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-lg font-medium text-slate-800 mb-2">No reviews yet</h3>
                <p className="text-slate-500 max-w-sm mx-auto mb-6">
                  Start tracking performance by adding your first review for this staff member.
                </p>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add First Review
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}