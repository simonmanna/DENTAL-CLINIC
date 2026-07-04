// frontend/src/components/reports/PatientReportView.tsx
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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend,
} from 'recharts';
import {
    Phone,
    Mail,
    MapPin,
    Calendar,
    Eye,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface PatientReportViewProps {
    data: {
        period: { startDate: string; endDate: string };
        patients: Array<{
            patient: {
                id: string;
                firstName: string;
                lastName: string;
                patientCode: string;
                phone?: string;
                email?: string;
                avatar?: string;
                dateOfBirth?: string;
                gender?: string;
                address?: string;
            };
            totalVisits: number;
            totalCost: number;
            totalPaid: number;
            visits: Array<{
                id: string;
                visitCode: string;
                status: string;
                totalCost: number;
                amountPaid: number;
                createdAt: string;
                dentist: { firstName: string; lastName: string };
                procedures: Array<{ procedure: { name: string; code?: string }; cost: number }>;
            }>;
            lastVisit: string | null;
        }>;
        summary: {
            _count: number;
            _sum: { totalCost: number; amountPaid: number };
            _avg: { totalCost: number };
        };
        topPatients: Array<{
            patient: {
                firstName: string;
                lastName: string;
                patientCode: string;
            };
            totalVisits: number;
            totalCost: number;
            totalPaid: number;
        }>;
    };
}

export const PatientReportView: React.FC<PatientReportViewProps> = ({ data }) => {
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [patientDetailsOpen, setPatientDetailsOpen] = useState(false);

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
            day: 'numeric',
        });
    };

    const getStatusBadge = (status: string) => {
        const statusColors: Record<string, string> = {
            COMPLETED: 'bg-green-100 text-green-800',
            IN_PROGRESS: 'bg-blue-100 text-blue-800',
            ARRIVED: 'bg-yellow-100 text-yellow-800',
            CANCELLED: 'bg-red-100 text-red-800',
        };
        return statusColors[status] || 'bg-gray-100 text-gray-800';
    };

    const getInitials = (firstName: string, lastName: string) => {
        return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
    };

    const handleViewPatient = (patient: any) => {
        setSelectedPatient(patient);
        setPatientDetailsOpen(true);
    };

    const patientVisitTrends = data.topPatients.slice(0, 5).map(patient => ({
        name: `${patient.patient.firstName} ${patient.patient.lastName}`,
        visits: patient.totalVisits,
        revenue: patient.totalCost,
    }));

    const paymentStatusData = data.patients.map(patient => ({
        name: `${patient.patient.firstName} ${patient.patient.lastName}`,
        paid: patient.totalPaid,
        outstanding: patient.totalCost - patient.totalPaid,
    })).slice(0, 10);

    return (
        <div className="space-y-6">
            {/* Period Badge */}
            <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-sm">
                    <Calendar className="mr-2 h-4 w-4" />
                    {formatDate(data.period.startDate)} - {formatDate(data.period.endDate)}
                </Badge>
                <div className="text-sm text-muted-foreground">
                    Total Patients: {data.patients.length}
                </div>
            </div>

            {/* Patient Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.summary._count}</div>
                        <p className="text-xs text-muted-foreground">Patients with visits</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(data.summary._sum.totalCost || 0)}</div>
                        <p className="text-xs text-muted-foreground">
                            Collected: {formatCurrency(data.summary._sum.amountPaid || 0)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Average per Patient</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(data.summary._avg.totalCost || 0)}</div>
                        <p className="text-xs text-muted-foreground">Revenue per patient</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Top Patients by Revenue</CardTitle>
                        <CardDescription>Highest contributing patients</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={patientVisitTrends}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                                <YAxis />
                                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                                <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Top Patients by Visit Count</CardTitle>
                        <CardDescription>Most frequent patients</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={patientVisitTrends}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="visits" fill="#82ca9d" name="Visit Count" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Payment vs Outstanding for Top Patients */}
            <Card>
                <CardHeader>
                    <CardTitle>Payment Status by Patient</CardTitle>
                    <CardDescription>Paid vs outstanding balance for top patients</CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={paymentStatusData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="name" width={120} />
                            <Tooltip formatter={(value) => formatCurrency(value as number)} />
                            <Legend />
                            <Bar dataKey="paid" stackId="a" fill="#00C49F" name="Paid" />
                            <Bar dataKey="outstanding" stackId="a" fill="#FF8042" name="Outstanding" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Patients Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Patient List</CardTitle>
                    <CardDescription>All patients with visit history in this period</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Patient</TableHead>
                                <TableHead>Patient Code</TableHead>
                                <TableHead>Visits</TableHead>
                                <TableHead>Total Cost</TableHead>
                                <TableHead>Amount Paid</TableHead>
                                <TableHead>Balance</TableHead>
                                <TableHead>Last Visit</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.patients.map((patientData) => {
                                const balance = patientData.totalCost - patientData.totalPaid;
                                const balanceColor = balance === 0 ? 'text-green-600' : balance > 0 ? 'text-red-600' : 'text-gray-600';

                                return (
                                    <TableRow key={patientData.patient.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={patientData.patient.avatar} />
                                                    <AvatarFallback>
                                                        {getInitials(patientData.patient.firstName, patientData.patient.lastName)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-medium">
                                                        {patientData.patient.firstName} {patientData.patient.lastName}
                                                    </div>
                                                    {patientData.patient.phone && (
                                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Phone className="h-3 w-3" />
                                                            {patientData.patient.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{patientData.patient.patientCode}</Badge>
                                        </TableCell>
                                        <TableCell>{patientData.totalVisits}</TableCell>
                                        <TableCell className="font-medium">{formatCurrency(patientData.totalCost)}</TableCell>
                                        <TableCell>{formatCurrency(patientData.totalPaid)}</TableCell>
                                        <TableCell className={balanceColor}>
                                            {formatCurrency(balance)}
                                        </TableCell>
                                        <TableCell>
                                            {patientData.lastVisit ? formatDate(patientData.lastVisit) : 'N/A'}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleViewPatient(patientData)}
                                            >
                                                <Eye className="h-4 w-4 mr-1" />
                                                Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Patient Details Dialog */}
            <Dialog open={patientDetailsOpen} onOpenChange={setPatientDetailsOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    {selectedPatient && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={selectedPatient.patient.avatar} />
                                        <AvatarFallback>
                                            {getInitials(selectedPatient.patient.firstName, selectedPatient.patient.lastName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div>{selectedPatient.patient.firstName} {selectedPatient.patient.lastName}</div>
                                        <div className="text-sm font-normal text-muted-foreground">
                                            {selectedPatient.patient.patientCode}
                                        </div>
                                    </div>
                                </DialogTitle>
                                <DialogDescription>
                                    Complete visit history and treatment details
                                </DialogDescription>
                            </DialogHeader>

                            {/* Patient Info */}
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Contact Information</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {selectedPatient.patient.phone && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                <span>{selectedPatient.patient.phone}</span>
                                            </div>
                                        )}
                                        {selectedPatient.patient.email && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                                <span>{selectedPatient.patient.email}</span>
                                            </div>
                                        )}
                                        {selectedPatient.patient.address && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                                <span>{selectedPatient.patient.address}</span>
                                            </div>
                                        )}
                                        {selectedPatient.patient.dateOfBirth && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                <span>DOB: {formatDate(selectedPatient.patient.dateOfBirth)}</span>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Financial Summary</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Total Visits:</span>
                                                <span className="font-medium">{selectedPatient.totalVisits}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Total Cost:</span>
                                                <span className="font-medium">{formatCurrency(selectedPatient.totalCost)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Amount Paid:</span>
                                                <span className="font-medium text-green-600">{formatCurrency(selectedPatient.totalPaid)}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 border-t">
                                                <span className="text-muted-foreground">Balance:</span>
                                                <span className={`font-bold ${selectedPatient.totalCost - selectedPatient.totalPaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {formatCurrency(selectedPatient.totalCost - selectedPatient.totalPaid)}
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Visit History */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Visit History</CardTitle>
                                    <CardDescription>All visits during the selected period</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {selectedPatient.visits.map((visit: any) => (
                                            <div key={visit.id} className="border rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge className={getStatusBadge(visit.status)}>
                                                                {visit.status.replace('_', ' ')}
                                                            </Badge>
                                                            <span className="font-mono text-sm">{visit.visitCode}</span>
                                                        </div>
                                                        <div className="text-sm text-muted-foreground mt-1">
                                                            Dentist: Dr. {visit.dentist.firstName} {visit.dentist.lastName}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-medium">{formatCurrency(visit.totalCost)}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            Paid: {formatCurrency(visit.amountPaid)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="text-sm text-muted-foreground mb-2">
                                                    {formatDate(visit.createdAt)}
                                                </div>

                                                {visit.procedures.length > 0 && (
                                                    <div className="mt-2">
                                                        <div className="text-sm font-medium mb-1">Procedures:</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {visit.procedures.map((proc: any, idx: number) => (
                                                                <Badge key={idx} variant="secondary">
                                                                    {proc.procedure.name}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};
