// frontend/src/components/reports/DentistReportView.tsx
import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Calendar,
  Users,
  Stethoscope,
  Award,
  ChevronRight,
  Star,
} from 'lucide-react';

interface DentistReportViewProps {
  data: {
    period: { startDate: string; endDate: string };
    dentistPerformance: Array<{
      dentist_id: string;
      firstName: string;
      lastName: string;
      specialization: string;
      total_visits: number;
      completed_visits: number;
      total_revenue: number;
      amount_collected: number;
      avg_revenue_per_visit: number;
      procedures_performed: number;
      prescriptions_written: number;
    }>;
    dentistTrends: Array<{
      dentist_id: string;
      firstName: string;
      lastName: string;
      month: string;
      visits: number;
      revenue: number;
    }>;
    summary: {
      totalDentists: number;
      averageRevenuePerDentist: number;
    };
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B', '#4ECDC4', '#45B7D1'];

export const DentistReportView: React.FC<DentistReportViewProps> = ({ data }) => {
  const [selectedDentist, setSelectedDentist] = useState<string>('all');
  const [viewMetric, setViewMetric] = useState<'revenue' | 'visits' | 'procedures'>('revenue');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
    });
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  // Filter dentists
  const filteredDentists = selectedDentist === 'all'
    ? data.dentistPerformance
    : data.dentistPerformance.filter(d => d.dentist_id === selectedDentist);

  // Prepare dentist comparison data
  const comparisonData = data.dentistPerformance.map(dentist => ({
    name: `${dentist.firstName} ${dentist.lastName}`,
    revenue: dentist.total_revenue,
    visits: dentist.total_visits,
    procedures: dentist.procedures_performed,
    avgPerVisit: dentist.avg_revenue_per_visit,
    collectionRate: dentist.total_revenue > 0 
      ? (dentist.amount_collected / dentist.total_revenue) * 100 
      : 0,
  })).sort((a, b) => b[viewMetric] - a[viewMetric]);

  // Prepare trend data
  const trendData = data.dentistTrends
    .filter(trend => selectedDentist === 'all' || trend.dentist_id === selectedDentist)
    .reduce((acc, trend) => {
      const existing = acc.find(a => a.month === trend.month);
      const dentistName = `${trend.firstName} ${trend.lastName}`;
      if (existing) {
        existing[dentistName] = viewMetric === 'revenue' ? trend.revenue : trend.visits;
      } else {
        acc.push({
          month: trend.month,
          [dentistName]: viewMetric === 'revenue' ? trend.revenue : trend.visits,
        });
      }
      return acc;
    }, [] as any[]);

  // Prepare radar data for top dentist
  const topDentist = data.dentistPerformance[0];
  const radarData = topDentist ? [
    { metric: 'Revenue', value: (topDentist.total_revenue / Math.max(...data.dentistPerformance.map(d => d.total_revenue))) * 100 },
    { metric: 'Visits', value: (topDentist.total_visits / Math.max(...data.dentistPerformance.map(d => d.total_visits))) * 100 },
    { metric: 'Procedures', value: (topDentist.procedures_performed / Math.max(...data.dentistPerformance.map(d => d.procedures_performed))) * 100 },
    { metric: 'Avg/Visit', value: (topDentist.avg_revenue_per_visit / Math.max(...data.dentistPerformance.map(d => d.avg_revenue_per_visit))) * 100 },
    { metric: 'Collection', value: (topDentist.amount_collected / topDentist.total_revenue) * 100 },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Period Badge */}
      <div className="flex justify-between items-center">
        <Badge variant="outline" className="text-sm">
          <Calendar className="mr-2 h-4 w-4" />
          {formatDate(data.period.startDate)} - {formatDate(data.period.endDate)}
        </Badge>
        <div className="text-sm text-muted-foreground">
          Total Dentists: {data.summary.totalDentists}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Dentists</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalDentists}</div>
            <p className="text-xs text-muted-foreground">Practitioners with visits</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.dentistPerformance.reduce((sum, d) => sum + d.total_revenue, 0))}
            </div>
            <p className="text-xs text-muted-foreground">Across all dentists</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average per Dentist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.averageRevenuePerDentist)}</div>
            <p className="text-xs text-muted-foreground">Revenue per practitioner</p>
          </CardContent>
        </Card>
      </div>

      {/* Dentist Selector and Comparison Chart */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Filter by Dentist</CardTitle>
            <CardDescription>Select a dentist to view details</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedDentist} onValueChange={setSelectedDentist}>
              <SelectTrigger>
                <SelectValue placeholder="Select dentist" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dentists</SelectItem>
                {data.dentistPerformance.map(dentist => (
                  <SelectItem key={dentist.dentist_id} value={dentist.dentist_id}>
                    Dr. {dentist.firstName} {dentist.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Dentist Comparison</CardTitle>
            <CardDescription>
              <div className="flex gap-2 mt-2">
                <Button 
                  variant={viewMetric === 'revenue' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setViewMetric('revenue')}
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Revenue
                </Button>
                <Button 
                  variant={viewMetric === 'visits' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setViewMetric('visits')}
                >
                  <Users className="h-4 w-4 mr-1" />
                  Visits
                </Button>
                <Button 
                  variant={viewMetric === 'procedures' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setViewMetric('procedures')}
                >
                  <Stethoscope className="h-4 w-4 mr-1" />
                  Procedures
                </Button>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip 
                  formatter={(value) => viewMetric === 'revenue' ? formatCurrency(value as number) : value}
                />
                <Bar 
                  dataKey={viewMetric} 
                  fill="#8884d8" 
                  name={viewMetric === 'revenue' ? 'Revenue' : viewMetric === 'visits' ? 'Visits' : 'Procedures'}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance Trends */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
            <CardDescription>
              {viewMetric === 'revenue' ? 'Monthly revenue' : 'Monthly visit volume'} by dentist
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => viewMetric === 'revenue' ? formatCurrency(value as number) : value} />
                <Legend />
                {Object.keys(trendData[0] || {})
                  .filter(key => key !== 'month')
                  .map((dentist, idx) => (
                    <Line
                      key={dentist}
                      type="monotone"
                      dataKey={dentist}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Dentist Radar Chart */}
      {topDentist && (
        <Card>
          <CardHeader>
            <CardTitle>Top Performer Profile</CardTitle>
            <CardDescription>
              Dr. {topDentist.firstName} {topDentist.lastName} - Performance metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-center">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="text-2xl">
                    {getInitials(topDentist.firstName, topDentist.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="ml-4">
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-500" />
                    <span className="font-semibold">Top Performer</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{topDentist.specialization || 'General Dentist'}</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">{formatCurrency(topDentist.total_revenue)}</span> revenue
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">{topDentist.total_visits}</span> visits
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">{topDentist.procedures_performed}</span> procedures
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis domain={[0, 100]} />
                    <Radar name="Performance" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Dentist Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dentist Performance Details</CardTitle>
          <CardDescription>Comprehensive breakdown of each dentist's performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dentist</TableHead>
                <TableHead>Specialization</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Procedures</TableHead>
                <TableHead>Prescriptions</TableHead>
                <TableHead>Total Revenue</TableHead>
                <TableHead>Collected</TableHead>
                <TableHead>Avg/Visit</TableHead>
                <TableHead>Collection Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDentists.map((dentist) => {
                const collectionRate = dentist.total_revenue > 0 
                  ? (dentist.amount_collected / dentist.total_revenue) * 100 
                  : 0;
                return (
                  <TableRow key={dentist.dentist_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {getInitials(dentist.firstName, dentist.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          Dr. {dentist.firstName} {dentist.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{dentist.specialization || 'General'}</Badge>
                    </TableCell>
                    <TableCell>{dentist.total_visits.toLocaleString()}</TableCell>
                    <TableCell>{dentist.completed_visits.toLocaleString()}</TableCell>
                    <TableCell>{dentist.procedures_performed.toLocaleString()}</TableCell>
                    <TableCell>{dentist.prescriptions_written.toLocaleString()}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(dentist.total_revenue)}</TableCell>
                    <TableCell>{formatCurrency(dentist.amount_collected)}</TableCell>
                    <TableCell>{formatCurrency(dentist.avg_revenue_per_visit)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${collectionRate}%` }}
                          />
                        </div>
                        <span className="text-sm">{collectionRate.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};