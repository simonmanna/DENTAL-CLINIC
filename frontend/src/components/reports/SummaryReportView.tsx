// frontend/src/components/reports/SummaryReportView.tsx
import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, Calendar, CheckCircle } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

interface SummaryReportViewProps {
  data: {
    period: { startDate: string; endDate: string };
    summary: {
      totalVisits: number;
      completedVisits: number;
      cancelledVisits: number;
      completionRate: number;
      totalRevenue: number;
      totalCollected: number;
      outstandingBalance: number;
      collectionRate: number;
    };
    dailyTrends: Array<{
      date: string;
      total_visits: number;
      completed_visits: number;
      revenue: number;
    }>;
    topProcedures: Array<{
      procedure_name: string;
      count: number;
      total_revenue: number;
    }>;
  };
}

export const SummaryReportView: React.FC<SummaryReportViewProps> = ({ data }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const StatCard = ({ title, value, subtitle, icon, trend }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend && (
          <div className="flex items-center mt-2">
            {trend > 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
            )}
            <span className={`text-xs ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {Math.abs(trend)}% from last period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Period Badge */}
      <div className="flex justify-between items-center">
        <Badge variant="outline" className="text-sm">
          <Calendar className="mr-2 h-4 w-4" />
          {new Date(data.period.startDate).toLocaleDateString()} - {new Date(data.period.endDate).toLocaleDateString()}
        </Badge>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Visits"
          value={data.summary.totalVisits}
          subtitle={`${data.summary.completedVisits} completed, ${data.summary.cancelledVisits} cancelled`}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Completion Rate"
          value={`${data.summary.completionRate}%`}
          icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.summary.totalRevenue)}
          subtitle={`${formatCurrency(data.summary.totalCollected)} collected`}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Collection Rate"
          value={`${data.summary.collectionRate}%`}
          subtitle={`Balance: ${formatCurrency(data.summary.outstandingBalance)}`}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Daily Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Trends</CardTitle>
          <CardDescription>Visit volume and revenue over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={data.dailyTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="total_visits"
                stackId="1"
                stroke="#8884d8"
                fill="#8884d8"
                name="Total Visits"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="completed_visits"
                stackId="1"
                stroke="#82ca9d"
                fill="#82ca9d"
                name="Completed Visits"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                stroke="#ffc658"
                fill="#ffc658"
                name="Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Procedures */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Procedures by Volume</CardTitle>
            <CardDescription>Most frequently performed procedures</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topProcedures.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="procedure_name" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Procedures by Revenue</CardTitle>
            <CardDescription>Highest revenue generating procedures</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.topProcedures.slice(0, 6)}
                  dataKey="total_revenue"
                  nameKey="procedure_name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {data.topProcedures.slice(0, 6).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};