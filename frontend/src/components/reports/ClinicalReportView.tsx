// frontend/src/components/reports/ClinicalReportView.tsx
import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
} from 'recharts';

interface ClinicalReportViewProps {
  data: {
    diagnosticInsights: Array<{
      diagnosis: string;
      frequency: number;
    }>;
    procedureAnalytics: Array<{
      procedure_name: string;
      times_performed: number;
      avg_cost: number;
      min_cost: number;
      max_cost: number;
    }>;
    prescriptionAnalytics: {
      total_prescriptions: number;
      avg_items_per_rx: number;
      unique_drugs_used: number;
    };
    clinicalMetrics: {
      averageProceduresPerVisit: number;
      averagePrescriptionsPerVisit: number;
      soaps: {
        completionRate: {
          subjective: number;
          objective: number;
          assessment: number;
          plan: number;
          fullSOAP: number;
        };
      };
    };
  };
}

export const ClinicalReportView: React.FC<ClinicalReportViewProps> = ({ data }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const diagnosticData = data.diagnosticInsights.slice(0, 10);
  const procedureData = data.procedureAnalytics.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Clinical Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Procedures/Visit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.clinicalMetrics.averageProceduresPerVisit.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Procedures per visit</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Prescriptions/Visit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.clinicalMetrics.averagePrescriptionsPerVisit.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Rx per visit</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Prescriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.prescriptionAnalytics.total_prescriptions}</div>
            <p className="text-xs text-muted-foreground">{data.prescriptionAnalytics.unique_drugs_used} unique drugs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Items per Rx</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.prescriptionAnalytics.avg_items_per_rx.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Medications per prescription</p>
          </CardContent>
        </Card>
      </div>

      {/* SOAP Documentation Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>SOAP Documentation Compliance</CardTitle>
          <CardDescription>Completion rates for clinical documentation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span>Subjective</span>
              <span className="font-medium">{data.clinicalMetrics.soaps.completionRate.subjective}%</span>
            </div>
            <Progress value={(data.clinicalMetrics.soaps.completionRate.subjective)} />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span>Objective</span>
              <span className="font-medium">{data.clinicalMetrics.soaps.completionRate.objective}%</span>
            </div>
            <Progress value={(data.clinicalMetrics.soaps.completionRate.objective)} />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span>Assessment</span>
              <span className="font-medium">{data.clinicalMetrics.soaps.completionRate.assessment}%</span>
            </div>
            <Progress value={(data.clinicalMetrics.soaps.completionRate.assessment)} />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span>Plan</span>
              <span className="font-medium">{data.clinicalMetrics.soaps.completionRate.plan}%</span>
            </div>
            <Progress value={(data.clinicalMetrics.soaps.completionRate.plan)} />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span>Full SOAP Complete</span>
              <span className="font-medium">{data.clinicalMetrics.soaps.completionRate.fullSOAP}%</span>
            </div>
            <Progress value={(data.clinicalMetrics.soaps.completionRate.fullSOAP)} />
          </div>
        </CardContent>
      </Card>

      {/* Diagnostic Insights */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Diagnoses</CardTitle>
            <CardDescription>Most common diagnoses recorded</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={diagnosticData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="diagnosis" width={150} />
                <Tooltip />
                <Bar dataKey="frequency" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Procedure Analytics</CardTitle>
            <CardDescription>Top 10 procedures by frequency</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={procedureData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="procedure_name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="times_performed" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};