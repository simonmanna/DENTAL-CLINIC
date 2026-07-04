// frontend/src/components/reports/DetailedReportView.tsx
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
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DetailedReportViewProps {
  data: {
    period: { startDate: string; endDate: string };
    data: Array<{
      id: string;
      visitCode: string;
      status: string;
      createdAt: string;
      completedAt: string | null;
      totalCost: number;
      amountPaid: number;
      patient: {
        id: string;
        firstName: string;
        lastName: string;
        patientCode: string;
        phone: string | null;
        email: string | null;
      };
      dentist: {
        id: string;
        firstName: string;
        lastName: string;
        specialization: string | null;
      };
      appointment: {
        scheduledAt: string;
        type: string;
      } | null;
      procedures: Array<{
        procedure: {
          name: string;
          code: string | null;
        };
        cost: number;
        toothNumbers: number[];
      }>;
      prescriptions: Array<{
        prescriptionCode: string;
        items: Array<{
          drug: { name: string };
          dosage: string;
          quantity: number;
        }>;
      }>;
      payments: Array<{
        amount: number;
        method: string;
        paidAt: string;
      }>;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    summary: {
      totalVisits: number;
      totalRevenue: number;
      totalCollected: number;
      averageRevenuePerVisit: number;
    };
  };
}

export const DetailedReportView: React.FC<DetailedReportViewProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedVisit, setSelectedVisit] = useState<any>(null);
  const [visitDetailsOpen, setVisitDetailsOpen] = useState(false);

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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      COMPLETED: { color: 'bg-green-100 text-green-800', label: 'Completed' },
      IN_PROGRESS: { color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
      ARRIVED: { color: 'bg-yellow-100 text-yellow-800', label: 'Arrived' },
      CANCELLED: { color: 'bg-red-100 text-red-800', label: 'Cancelled' },
    };
    const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', label: status };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const toggleRowExpand = (visitId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(visitId)) {
      newExpanded.delete(visitId);
    } else {
      newExpanded.add(visitId);
    }
    setExpandedRows(newExpanded);
  };

  const handleViewDetails = (visit: any) => {
    setSelectedVisit(visit);
    setVisitDetailsOpen(true);
  };

  // Filter visits
  const filteredVisits = data.data.filter(visit => {
    if (statusFilter !== 'all' && visit.status !== statusFilter) return false;
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        visit.visitCode.toLowerCase().includes(searchLower) ||
        `${visit.patient.firstName} ${visit.patient.lastName}`.toLowerCase().includes(searchLower) ||
        `${visit.dentist.firstName} ${visit.dentist.lastName}`.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalVisits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">In selected period</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">From all visits</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Amount Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.totalCollected)}</div>
            <p className="text-xs text-muted-foreground">Payments received</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average per Visit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.averageRevenuePerVisit)}</div>
            <p className="text-xs text-muted-foreground">Revenue per visit</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by visit code, patient name, or dentist..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="ARRIVED">Arrived</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Visits Table */}
      <Card>
        <CardHeader>
          <CardTitle>Visit Details</CardTitle>
          <CardDescription>
            Showing {filteredVisits.length} of {data.pagination.total} visits
            {statusFilter !== 'all' && ` (filtered by ${statusFilter})`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead>Visit Code</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Dentist</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Procedures</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVisits.map((visit) => {
                const balance = visit.totalCost - visit.amountPaid;
                const isExpanded = expandedRows.has(visit.id);
                return (
                  <React.Fragment key={visit.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/50">
                      <TableCell onClick={() => toggleRowExpand(visit.id)}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium">{visit.visitCode}</TableCell>
                      <TableCell>
                        <div>
                          <div>{visit.patient.firstName} {visit.patient.lastName}</div>
                          <div className="text-xs text-muted-foreground">{visit.patient.patientCode}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        Dr. {visit.dentist.firstName} {visit.dentist.lastName}
                      </TableCell>
                      <TableCell>{formatDate(visit.createdAt)}</TableCell>
                      <TableCell>{getStatusBadge(visit.status)}</TableCell>
                      <TableCell>{visit.procedures.length}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(visit.totalCost)}</TableCell>
                      <TableCell>{formatCurrency(visit.amountPaid)}</TableCell>
                      <TableCell className={balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                        {formatCurrency(balance)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(visit)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Row Details */}
                    {isExpanded && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={11} className="p-4">
                          <div className="space-y-4">
                            {/* Procedures Section */}
                            {visit.procedures.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-2">Procedures Performed</h4>
                                <div className="space-y-2">
                                  {visit.procedures.map((proc, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm border-b pb-2">
                                      <div>
                                        <span className="font-medium">{proc.procedure.name}</span>
                                        {proc.toothNumbers.length > 0 && (
                                          <Badge variant="outline" className="ml-2">
                                            Teeth: {proc.toothNumbers.join(', ')}
                                          </Badge>
                                        )}
                                      </div>
                                      <span>{formatCurrency(proc.cost)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Prescriptions Section */}
                            {visit.prescriptions.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-2">Prescriptions</h4>
                                {visit.prescriptions.map((rx, idx) => (
                                  <div key={idx} className="text-sm border rounded-lg p-3 mb-2">
                                    <div className="font-mono text-xs text-muted-foreground mb-2">{rx.prescriptionCode}</div>
                                    {rx.items.map((item, itemIdx) => (
                                      <div key={itemIdx} className="flex justify-between">
                                        <span>{item.drug.name}</span>
                                        <span>{item.dosage} - Qty: {item.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Payments Section */}
                            {visit.payments.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-2">Payment History</h4>
                                <div className="space-y-2">
                                  {visit.payments.map((payment, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm border-b pb-2">
                                      <div>
                                        <Badge variant="secondary">{payment.method}</Badge>
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          {formatDate(payment.paidAt)}
                                        </span>
                                      </div>
                                      <span className="text-green-600">{formatCurrency(payment.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total visits)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.pagination.page === 1}
                  onClick={() => {/* Handle previous page */}}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.pagination.page === data.pagination.totalPages}
                  onClick={() => {/* Handle next page */}}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visit Details Dialog */}
      <Dialog open={visitDetailsOpen} onOpenChange={setVisitDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedVisit && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Visit Details: {selectedVisit.visitCode}
                </DialogTitle>
                <DialogDescription>
                  Complete clinical and financial information for this visit
                </DialogDescription>
              </DialogHeader>

              {/* Visit Overview */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Patient Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p><span className="font-medium">Name:</span> {selectedVisit.patient.firstName} {selectedVisit.patient.lastName}</p>
                      <p><span className="font-medium">Patient Code:</span> {selectedVisit.patient.patientCode}</p>
                      {selectedVisit.patient.phone && <p><span className="font-medium">Phone:</span> {selectedVisit.patient.phone}</p>}
                      {selectedVisit.patient.email && <p><span className="font-medium">Email:</span> {selectedVisit.patient.email}</p>}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Visit Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p><span className="font-medium">Dentist:</span> Dr. {selectedVisit.dentist.firstName} {selectedVisit.dentist.lastName}</p>
                      <p><span className="font-medium">Status:</span> {getStatusBadge(selectedVisit.status)}</p>
                      <p><span className="font-medium">Date:</span> {formatDate(selectedVisit.createdAt)}</p>
                      {selectedVisit.completedAt && (
                        <p><span className="font-medium">Completed:</span> {formatDate(selectedVisit.completedAt)}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Financial Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Financial Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Cost</p>
                      <p className="text-xl font-bold">{formatCurrency(selectedVisit.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Amount Paid</p>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(selectedVisit.amountPaid)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Balance</p>
                      <p className={`text-xl font-bold ${selectedVisit.totalCost - selectedVisit.amountPaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(selectedVisit.totalCost - selectedVisit.amountPaid)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Procedures */}
              {selectedVisit.procedures.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Procedures</CardTitle>
                    <CardDescription>All procedures performed during this visit</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Procedure</TableHead>
                          <TableHead>Teeth</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedVisit.procedures.map((proc: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>{proc.procedure.name}</TableCell>
                            <TableCell>{proc.toothNumbers?.join(', ') || '-'}</TableCell>
                            <TableCell>{proc.notes || '-'}</TableCell>
                            <TableCell className="text-right">{formatCurrency(proc.cost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Prescriptions */}
              {selectedVisit.prescriptions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Prescriptions</CardTitle>
                    <CardDescription>Medications prescribed during this visit</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedVisit.prescriptions.map((rx: any, idx: number) => (
                      <div key={idx} className="mb-4 last:mb-0">
                        <div className="font-mono text-sm text-muted-foreground mb-2">{rx.prescriptionCode}</div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Medication</TableHead>
                              <TableHead>Dosage</TableHead>
                              <TableHead>Frequency</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead>Quantity</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rx.items.map((item: any, itemIdx: number) => (
                              <TableRow key={itemIdx}>
                                <TableCell>{item.drug.name}</TableCell>
                                <TableCell>{item.dosage}</TableCell>
                                <TableCell>{item.frequency}</TableCell>
                                <TableCell>{item.duration}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Payments */}
              {selectedVisit.payments.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Payment History</CardTitle>
                    <CardDescription>All payments made for this visit</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedVisit.payments.map((payment: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>{formatDate(payment.paidAt)}</TableCell>
                            <TableCell>{payment.method}</TableCell>
                            <TableCell>{payment.reference || '-'}</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(payment.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};