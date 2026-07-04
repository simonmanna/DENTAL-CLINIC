// frontend/src/components/reports/FinancialReportView.tsx
import React from 'react';
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { Badge } from '@/components/ui/badge';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

interface FinancialReportViewProps {
  data: {
    revenueByPaymentMethod: Array<{
      payment_method: string;
      total_amount: number;
      payment_count: number;
    }>;
    revenueByProcedureCategory: Array<{
      category_name: string;
      procedure_count: number;
      total_revenue: number;
    }>;
    outstandingInvoices: Array<{
      visitCode: string;
      patient: { firstName: string; lastName: string };
      dentist: { firstName: string; lastName: string };
      totalCost: number;
      amountPaid: number;
      balance: number;
      createdAt: string;
    }>;
    revenueTrends: Array<{
      date: string;
      daily_revenue: number;
      payment_count: number;
    }>;
  };
}

export const FinancialReportView: React.FC<FinancialReportViewProps> = ({ data }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getBalanceColor = (balance: number) => {
    if (balance === 0) return 'bg-green-100 text-green-800';
    if (balance < 50000) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-6">
      {/* Revenue Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Payment Method</CardTitle>
            <CardDescription>Distribution of payments by method</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.revenueByPaymentMethod}
                  dataKey="total_amount"
                  nameKey="payment_method"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {data.revenueByPaymentMethod.map((entry, index) => (
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
            <CardTitle>Revenue by Procedure Category</CardTitle>
            <CardDescription>Revenue breakdown by service type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.revenueByProcedureCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category_name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="total_revenue" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
          <CardDescription>Daily revenue and payment volume over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data.revenueTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                formatter={(value, name) => 
                  name === 'daily_revenue' ? formatCurrency(value as number) : value
                }
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="daily_revenue"
                stroke="#8884d8"
                name="Daily Revenue"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="payment_count"
                stroke="#82ca9d"
                name="Payment Count"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Outstanding Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding Invoices</CardTitle>
          <CardDescription>Pending payments from completed visits</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visit Code</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Dentist</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.outstandingInvoices.map((invoice) => (
                <TableRow key={invoice.visitCode}>
                  <TableCell className="font-medium">{invoice.visitCode}</TableCell>
                  <TableCell>{`${invoice.patient.firstName} ${invoice.patient.lastName}`}</TableCell>
                  <TableCell>{`${invoice.dentist.firstName} ${invoice.dentist.lastName}`}</TableCell>
                  <TableCell>{new Date(invoice.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>{formatCurrency(invoice.totalCost)}</TableCell>
                  <TableCell>{formatCurrency(invoice.amountPaid)}</TableCell>
                  <TableCell>
                    <Badge className={getBalanceColor(invoice.balance)}>
                      {formatCurrency(invoice.balance)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};