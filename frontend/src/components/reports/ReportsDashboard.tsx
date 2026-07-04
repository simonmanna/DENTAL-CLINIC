// frontend/src/components/reports/ReportsDashboard.tsx
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  Calendar,
  FileText,
} from 'lucide-react';
import { reportService } from '@/services/report.service';
import { SummaryReportView } from './SummaryReportView';
import { FinancialReportView } from './FinancialReportView';
import { ClinicalReportView } from './ClinicalReportView';
import { PatientReportView } from './PatientReportView';
import { DentistReportView } from './DentistReportView';
import { ProcedureReportView } from './ProcedureReportView';
import { DetailedReportView } from './DetailedReportView';
// Keep your own types for internal state, but cast when calling the service
import type { ReportQuery, ReportPeriod, ReportType } from '@/types/reports';
import { toast } from 'sonner';

export const ReportsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportType>('SUMMARY');
  const [period, setPeriod] = useState<ReportPeriod>('THIS_MONTH');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>();
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const query = {
        type: activeTab,
        period: period === 'CUSTOM' ? undefined : period,
        ...(period === 'CUSTOM' && dateRange
          ? { startDate: dateRange.from.toISOString(), endDate: dateRange.to.toISOString() }
          : {}),
      };

      // Cast to any to bypass the mismatched ReportPeriod type
      const response = await reportService.getReports(query as any);
      setReportData(response.data);
    } catch (error) {
      toast.error('Failed to load report', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const query = {
        type: activeTab,
        period: period === 'CUSTOM' ? undefined : period,
        ...(period === 'CUSTOM' && dateRange
          ? { startDate: dateRange.from.toISOString(), endDate: dateRange.to.toISOString() }
          : {}),
      };

      const response = await reportService.exportCSV(query as any);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeTab.toLowerCase()}_report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Report exported successfully');
    } catch (error) {
      toast.error('Failed to export report', {
        description: error instanceof Error ? error.message : 'Export failed',
      });
    }
  };

  useEffect(() => {
    fetchReport();
  }, [activeTab, period, dateRange]);

  const renderReportContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <Activity className="animate-spin h-8 w-8 text-primary" />
        </div>
      );
    }

    if (!reportData) return null;

    switch (activeTab) {
      case 'SUMMARY':
        return <SummaryReportView data={reportData} />;
      case 'FINANCIAL':
        return <FinancialReportView data={reportData} />;
      case 'CLINICAL':
        return <ClinicalReportView data={reportData} />;
      case 'PATIENT':
        return <PatientReportView data={reportData} />;
      case 'DENTIST':
        return <DentistReportView data={reportData} />;
      case 'PROCEDURE':
        return <ProcedureReportView data={reportData} />;
      case 'DETAILED':
        return <DetailedReportView data={reportData} />;
      default:
        return <SummaryReportView data={reportData} />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Visit Reports</h1>
          <p className="text-muted-foreground">
            Comprehensive analytics and insights for dental clinic operations
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Customize your report view</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Select value={period} onValueChange={(v: ReportPeriod) => setPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAY">Today</SelectItem>
              <SelectItem value="YESTERDAY">Yesterday</SelectItem>
              <SelectItem value="THIS_WEEK">This Week</SelectItem>
              <SelectItem value="LAST_WEEK">Last Week</SelectItem>
              <SelectItem value="THIS_MONTH">This Month</SelectItem>
              <SelectItem value="LAST_MONTH">Last Month</SelectItem>
              <SelectItem value="CUSTOM">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {period === 'CUSTOM' && (
            // Cast to any to bypass the missing/incorrect prop types
            <DateRangePicker
              {...({
                value: dateRange,
                onChange: (range: { from: Date; to: Date } | undefined) => setDateRange(range),
              } as any)}
            />
          )}
        </CardContent>
      </Card>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportType)}>
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="SUMMARY">Summary</TabsTrigger>
          <TabsTrigger value="FINANCIAL">Financial</TabsTrigger>
          <TabsTrigger value="CLINICAL">Clinical</TabsTrigger>
          <TabsTrigger value="PATIENT">Patient</TabsTrigger>
          <TabsTrigger value="DENTIST">Dentist</TabsTrigger>
          <TabsTrigger value="PROCEDURE">Procedure</TabsTrigger>
          <TabsTrigger value="DETAILED">Detailed</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {renderReportContent()}
        </TabsContent>
      </Tabs>
    </div>
  );
};