// src/pages/reports/ReportsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../lib/api';
import { formatCurrency, formatDate, cn } from '../../lib/utils';
import { PageHeader, Card, LoadingSpinner, StatCard } from '../../components/shared';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts';
import { BarChart3, TrendingUp, Users, Calendar, DollarSign, Activity } from 'lucide-react';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
const today = new Date();
const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
const endOfMonth = today.toISOString();
const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString();

export function ReportsPage() {
  const [revenueRange, setRevenueRange] = useState<[string, string]>([startOfMonth, endOfMonth]);
  const [aptRange, setAptRange] = useState<[string, string]>([startOfMonth, endOfMonth]);
  const [activeSection, setActiveSection] = useState('overview');

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['reports-dashboard'],
    queryFn: reportsApi.getDashboard,
  });

  const { data: revenue, isLoading: revLoading } = useQuery({
    queryKey: ['revenue-report', revenueRange],
    queryFn: () => reportsApi.getRevenue({ startDate: revenueRange[0], endDate: revenueRange[1], groupBy: 'day' }),
  });

  const { data: appointments, isLoading: aptLoading } = useQuery({
    queryKey: ['apt-report', aptRange],
    queryFn: () => reportsApi.getAppointments({ startDate: aptRange[0], endDate: aptRange[1] }),
  });

  const { data: retention } = useQuery({ queryKey: ['retention'], queryFn: reportsApi.getRetention });

  const { data: dentistPerf } = useQuery({
    queryKey: ['dentist-perf'],
    queryFn: () => reportsApi.getDentistPerformance({ startDate: startOfMonth, endDate: endOfMonth }),
  });

  const sections = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'revenue', label: 'Revenue', icon: DollarSign },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'staff', label: 'Staff Performance', icon: Users },
  ];

  const d = dashboard || {};

  return (
    <div className="space-y-2">
      <PageHeader title="Reports & Analytics" subtitle="Business intelligence and clinic performance insights" />

      {/* Section tabs */}
      <div className="flex gap-2 bg-white rounded-xl border border-slate-100 shadow-sm p-2">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center',
              activeSection === s.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100')}>
            <s.icon className="w-4 h-4" /> {s.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-2">
          {dashLoading ? <LoadingSpinner /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Patients" value={d.patients?.total || 0}
                  icon={<Users className="w-6 h-6 text-blue-600" />} iconBg="bg-blue-100"
                  change={`+${d.patients?.newThisMonth || 0} this month`} changeType="up" />
                <StatCard title="Month Revenue" value={formatCurrency(d.revenue?.thisMonth || 0)}
                  icon={<DollarSign className="w-6 h-6 text-emerald-600" />} iconBg="bg-emerald-100"
                  change={`${d.revenue?.growth >= 0 ? '+' : ''}${d.revenue?.growth || 0}%`}
                  changeType={d.revenue?.growth >= 0 ? 'up' : 'down'} />
                <StatCard title="Month Appointments" value={d.appointments?.thisMonth || 0}
                  icon={<Calendar className="w-6 h-6 text-indigo-600" />} iconBg="bg-indigo-100" />
                <StatCard title="Patient Retention" value={`${retention?.retentionRate3m || 0}%`}
                  icon={<TrendingUp className="w-6 h-6 text-purple-600" />} iconBg="bg-purple-100"
                  subtitle="Last 3 months" />
              </div>

              {/* Revenue chart */}
              <Card title="Revenue — This Month">
                <div className="p-4">
                  {revLoading ? <div className="h-48 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={revenue?.chart || []}>
                        <defs>
                          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                          tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: any) => [formatCurrency(v), 'Revenue']}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                        <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2}
                          fill="url(#grad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              {/* Retention stats */}
              {retention && (
                <Card title="Patient Retention">
                  <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Patients', value: retention.totalPatients },
                      { label: 'New (3 months)', value: retention.newLast3Months },
                      { label: 'Returning (3 months)', value: retention.returningLast3Months },
                      { label: 'Retention Rate', value: `${retention.retentionRate3m}%` },
                    ].map(s => (
                      <div key={s.label} className="text-center p-4 rounded-xl bg-slate-50">
                        <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                        <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* REVENUE */}
      {activeSection === 'revenue' && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-600">From:</label>
            <input type="date" defaultValue={startOfMonth.split('T')[0]}
              onChange={e => setRevenueRange([e.target.value, revenueRange[1]])}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            <label className="text-sm font-medium text-slate-600">To:</label>
            <input type="date" defaultValue={endOfMonth.split('T')[0]}
              onChange={e => setRevenueRange([revenueRange[0], e.target.value])}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Total Revenue" value={formatCurrency(revenue?.total || 0)}
              icon={<DollarSign className="w-6 h-6 text-emerald-600" />} iconBg="bg-emerald-100" />
            <StatCard title="Transactions" value={revenue?.count || 0}
              icon={<Activity className="w-6 h-6 text-blue-600" />} iconBg="bg-blue-100" />
            <StatCard title="Avg per Transaction" value={formatCurrency(revenue?.count ? (revenue.total / revenue.count) : 0)}
              icon={<TrendingUp className="w-6 h-6 text-purple-600" />} iconBg="bg-purple-100" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Revenue by Day">
              <div className="p-4">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={revenue?.chart || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tickLine={false} />
                    <Tooltip formatter={(v: any) => [formatCurrency(v), 'Revenue']}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Revenue by Payment Method">
              <div className="p-4">
                {revenue?.byMethod?.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={revenue.byMethod.map((m: any) => ({ name: m.method.replace(/_/g, ' '), value: m.total }))}
                          cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                          {revenue.byMethod.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [formatCurrency(v), 'Amount']}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-1">
                      {revenue.byMethod.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-slate-600">{m.method.replace(/_/g, ' ')}</span>
                          </div>
                          <span className="font-semibold text-slate-700">{formatCurrency(m.total)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-sm text-slate-400 text-center py-8">No payment data</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* APPOINTMENTS */}
      {activeSection === 'appointments' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="By Appointment Type">
              <div className="p-4">
                {aptLoading ? <LoadingSpinner /> : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={appointments?.byType || []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} tickLine={false} width={100}
                        tickFormatter={(v: string) => v.replace(/_/g, ' ')} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card title="By Status">
              <div className="p-4">
                {aptLoading ? <LoadingSpinner /> : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={appointments?.byStatus || []}
                        cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                        paddingAngle={3} dataKey="count" nameKey="status">
                        {(appointments?.byStatus || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                      <Legend formatter={(v: string) => v.replace(/_/g, ' ')} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* STAFF */}
      {activeSection === 'staff' && (
        <Card title="Dentist Performance — This Month">
          <div className="p-5">
            {!dentistPerf ? <LoadingSpinner /> : dentistPerf.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No performance data available</p>
            ) : (
              <div className="space-y-2">
                {dentistPerf.map((staff: any, i: number) => (
                  <div key={staff.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm',
                      i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-blue-500')}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">Dr. {staff.firstName} {staff.lastName}</p>
                      <p className="text-xs text-slate-400">{staff.specialization || 'General Dentistry'}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-6 text-center">
                      <div>
                        <p className="text-lg font-bold text-slate-800">{staff.appointments}</p>
                        <p className="text-xs text-slate-400">Appointments</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{staff.completionRate}%</p>
                        <p className="text-xs text-slate-400">Completion</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-600 text-sm">{formatCurrency(staff.revenue)}</p>
                        <p className="text-xs text-slate-400">Revenue</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
