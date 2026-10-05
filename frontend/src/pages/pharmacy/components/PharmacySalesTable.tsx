import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PharmacySale, PharmacySaleStatus } from '@/types/pharmacy-sales';
import { MoreHorizontal, Eye, Receipt, RefreshCw, CreditCard, Undo2, User } from 'lucide-react';
import { PharmacySaleDetailDialog } from './PharmacySaleDetailDialog';
import { cn } from '@/lib/utils';

interface Props {
  sales: PharmacySale[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onAddPayment?: (sale: PharmacySale) => void;
  onRefund?: (sale: PharmacySale) => void;
}

export function PharmacySalesTable({ sales, isLoading, onRefresh, onAddPayment, onRefund }: Props) {
  const [selectedSale, setSelectedSale] = useState<PharmacySale | null>(null);

  const getStatusStyle = (status: PharmacySaleStatus) => {
    switch (status) {
      case PharmacySaleStatus.COMPLETED:
        return "bg-success-muted/60 text-success border-success/25 ring-success/20";
      case PharmacySaleStatus.PENDING:
        return "bg-warning-muted/60 text-warning border-warning/25 ring-warning/20";
      case PharmacySaleStatus.CANCELLED:
        return "bg-danger-muted/60 text-danger border-danger/25 ring-danger/20";
      default:
        return "bg-muted/50 text-muted-foreground border-border";
    }
  };

  if (isLoading) {
    return (
      <div className="border-t">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {['Sale ID', 'Patient', 'Status', 'Total', 'Balance', 'Date', ''].map((h, i) => (
                <TableHead key={i} className="h-10 text-xs uppercase font-semibold tracking-wider">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(7)].map((_, j) => (
                  <TableCell key={j} className="py-3"><div className="h-4 w-full bg-muted animate-pulse rounded" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border-t">
        <div className="p-4 bg-muted/50 rounded-full mb-4">
          <Receipt className="h-8 w-8 text-muted-foreground/70" />
        </div>
        <h3 className="font-semibold text-foreground">No transactions found</h3>
        <p className="text-sm text-muted-foreground max-w-[250px] mx-auto">Try adjusting your filters or checking a different date range.</p>
      </div>
    );
  }

  return (
    <>
      <div className="border-t overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 text-xs uppercase font-bold tracking-wider">Sale ID</TableHead>
              <TableHead className="h-10 text-xs uppercase font-bold tracking-wider">Patient</TableHead>
              <TableHead className="h-10 text-xs uppercase font-bold tracking-wider text-center">Status</TableHead>
              <TableHead className="h-10 text-xs uppercase font-bold tracking-wider text-right">Total</TableHead>
              <TableHead className="h-10 text-xs uppercase font-bold tracking-wider text-right">Balance</TableHead>
              <TableHead className="h-10 text-xs uppercase font-bold tracking-wider">Date</TableHead>
              <TableHead className="h-10 w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id} className="group transition-colors">
                {/* Sale ID */}
                <TableCell className="py-3 font-mono text-[13px] text-muted-foreground">
                  {sale.saleCode}
                </TableCell>

                {/* Patient */}
                <TableCell className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center border border-border">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-foreground truncate max-w-[150px]">
                        {sale.patient ? `${sale.patient.firstName} ${sale.patient.lastName}` : 'Walk-in Customer'}
                      </span>
                      {sale.patient && (
                        <span className="text-[11px] text-muted-foreground">{sale.patient.patientCode}</span>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Status */}
                <TableCell className="py-3 text-center">
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-medium px-2 py-0 h-5 text-[11px] border shadow-none capitalize",
                      getStatusStyle(sale.status)
                    )}
                  >
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                    {sale.status.toLowerCase().replace('_', ' ')}
                  </Badge>
                </TableCell>

                {/* Total */}
                <TableCell className="py-3 text-right font-semibold text-foreground">
                  {formatCurrency(sale.total)}
                </TableCell>

                {/* Balance */}
                <TableCell className="py-3 text-right">
                  <span className={cn(
                    "text-sm font-medium px-2 py-0.5 rounded-md",
                    sale.balance > 0 ? "text-warning bg-warning-muted/60" : "text-success bg-success-muted/60"
                  )}>
                    {formatCurrency(sale.balance)}
                  </span>
                </TableCell>

                {/* Date */}
                <TableCell className="py-3 text-[13px] text-muted-foreground">
                  {formatDate(sale.createdAt)}
                </TableCell>

                {/* Actions */}
                <TableCell className="py-3">
                  <Button
                    title="View Details"
                    className="h-6 rounded-md bg-primary px-3 py-1 text-white hover:bg-primary shadow-sm"
                    onClick={() => setSelectedSale(sale)}>
                    <Eye size={16} strokeWidth={3} />
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedSale && (
        <PharmacySaleDetailDialog
          sale={selectedSale}
          open={!!selectedSale}
          onOpenChange={(open) => !open && setSelectedSale(null)}
          onAddPayment={onAddPayment}
          onRefund={onRefund}
        />
      )}
    </>
  );
}