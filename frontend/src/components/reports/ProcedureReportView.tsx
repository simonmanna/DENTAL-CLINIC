// frontend/src/components/reports/ProcedureReportView.tsx
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
  AreaChart,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Calendar,
  Target,
  ChevronRight,
  Search,
  Filter,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ProcedureReportViewProps {
  data: {
    period: { startDate: string; endDate: string };
    procedurePerformance: Array<{
      procedure_id: string;
      procedure_name: string;
      category_name: string;
      times_performed: number;
      total_revenue: number;
      avg_cost: number;
      min_cost: number;
      max_cost: number;
      unique_visits: number;
      unique_patients: number;
    }>;
    procedureTrends: Array<{
      procedure_name: string;
      month: string;
      count: number;
      revenue: number;
    }>;
    commonTeeth: Array<{
      tooth_number: number;
      treatment_count: number;
      visit_count: number;
    }>;
    summary: {
      totalProcedures: number;
      totalRevenue: number;
      mostPerformedProcedure: {
        procedure_name: string;
        times_performed: number;
        total_revenue: number;
      };
      highestRevenueProcedure: {
        procedure_name: string;
        total_revenue: number;
        times_performed: number;
      };
    };
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B', '#4ECDC4', '#45B7D1'];

export const ProcedureReportView: React.FC<ProcedureReportViewProps> = ({ data }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'count' | 'avg'>('revenue');

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

  // Get unique categories
  const categories = ['all', ...new Set(data.procedurePerformance.map(p => p.category_name).filter(Boolean))];

  // Filter and sort procedures
  const filteredProcedures = data.procedurePerformance
    .filter(proc => {
      if (selectedCategory !== 'all' && proc.category_name !== selectedCategory) return false;
      if (searchTerm && !proc.procedure_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'revenue') return b.total_revenue - a.total_revenue;
      if (sortBy === 'count') return b.times_performed - a.times_performed;
      return b.avg_cost - a.avg_cost;
    });

  // Prepare category distribution data
  const categoryData = Object.values(
    data.procedurePerformance.reduce((acc, proc) => {
      const category = proc.category_name || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = { name: category, revenue: 0, count: 0 };
      }
      acc[category].revenue += proc.total_revenue;
      acc[category].count += proc.times_performed;
      return acc;
    }, {} as Record<string, { name: string; revenue: number; count: number }>)
  );

  // Prepare trend data for top 5 procedures
  const topProcedures = data.procedurePerformance.slice(0, 5).map(p => p.procedure_name);
  const trendData = data.procedureTrends
    .filter(trend => topProcedures.includes(trend.procedure_name))
    .reduce((acc, trend) => {
      const existing = acc.find(a => a.month === trend.month);
      if (existing) {
        existing[trend.procedure_name] = trend.count;
      } else {
        acc.push({
          month: trend.month,
          [trend.procedure_name]: trend.count,
        });
      }
      return acc;
    }, [] as any[]);

  // Teeth distribution data
  const toothData = data.commonTeeth.slice(0, 16).sort((a, b) => a.tooth_number - b.tooth_number);

  return (
    <div className="space-y-6">
      {/* Period Badge */}
      <div className="flex justify-between items-center">
        <Badge variant="outline" className="text-sm">
          <Calendar className="mr-2 h-4 w-4" />
          {formatDate(data.period.startDate)} - {formatDate(data.period.endDate)}
        </Badge>
        <div className="text-sm text-muted-foreground">
          Total Procedures: {data.summary.totalProcedures}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Procedures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalProcedures.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Procedures performed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">From all procedures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Most Performed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">{data.summary.mostPerformedProcedure?.procedure_name}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.mostPerformedProcedure?.times_performed.toLocaleString()} times
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Highest Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">{data.summary.highestRevenueProcedure?.procedure_name}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(data.summary.highestRevenueProcedure?.total_revenue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Category</CardTitle>
            <CardDescription>Distribution across procedure categories</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Procedure Volume by Category</CardTitle>
            <CardDescription>Number of procedures per category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#82ca9d" name="Procedure Count" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Procedure Trends Over Time */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Procedure Trends</CardTitle>
            <CardDescription>Top 5 procedures - monthly volume trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                {topProcedures.map((proc, idx) => (
                  <Line
                    key={proc}
                    type="monotone"
                    dataKey={proc}
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

      {/* Teeth Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Tooth Distribution</CardTitle>
          <CardDescription>Most commonly treated teeth numbers</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={toothData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="tooth_number" 
                label={{ value: 'Tooth Number', position: 'insideBottom', offset: -5 }}
              />
              <YAxis label={{ value: 'Treatment Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="treatment_count" fill="#8884d8" name="Treatments" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search procedures..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Sort by Revenue</SelectItem>
            <SelectItem value="count">Sort by Count</SelectItem>
            <SelectItem value="avg">Sort by Avg Cost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Procedures Table */}
      <Card>
        <CardHeader>
          <CardTitle>Procedure Performance Details</CardTitle>
          <CardDescription>Detailed breakdown of each procedure's performance</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Procedure Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Times Performed</TableHead>
                <TableHead>Unique Visits</TableHead>
                <TableHead>Unique Patients</TableHead>
                <TableHead>Avg Cost</TableHead>
                <TableHead>Min/Max</TableHead>
                <TableHead>Total Revenue</TableHead>
                <TableHead>% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProcedures.map((proc) => {
                const percentage = (proc.total_revenue / data.summary.totalRevenue) * 100;
                return (
                  <TableRow key={proc.procedure_id}>
                    <TableCell className="font-medium">{proc.procedure_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{proc.category_name || 'Uncategorized'}</Badge>
                    </TableCell>
                    <TableCell>{proc.times_performed.toLocaleString()}</TableCell>
                    <TableCell>{proc.unique_visits.toLocaleString()}</TableCell>
                    <TableCell>{proc.unique_patients.toLocaleString()}</TableCell>
                    <TableCell>{formatCurrency(proc.avg_cost)}</TableCell>
                    <TableCell>
                      <span className="text-green-600">{formatCurrency(proc.min_cost)}</span>
                      {' - '}
                      <span className="text-red-600">{formatCurrency(proc.max_cost)}</span>
                    </TableCell>
                    <TableCell className="font-bold">{formatCurrency(proc.total_revenue)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm">{percentage.toFixed(1)}%</span>
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