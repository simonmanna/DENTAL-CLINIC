import { PaymentStatus } from '@/types/payment';
import { Badge } from '@/components/ui/badge';

const statusConfig: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  PENDING: { label: 'Pending', variant: 'secondary' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  REFUNDED: { label: 'Refunded', variant: 'outline' },
  OPEN: { label: 'Open', variant: 'secondary' },
  PARTIAL: { label: 'Partial', variant: 'secondary' },
  UNPAID: { label: 'Unpaid', variant: 'destructive' },
  PARTIALLY_PAID: { label: 'Partially Paid', variant: 'secondary' },
  PAID: { label: 'Paid', variant: 'default' },
  OVERDUE: { label: 'Overdue', variant: 'destructive' },
  WRITTEN_OFF: { label: 'Written Off', variant: 'outline' },
  INVOICED: { label: 'Invoiced', variant: 'secondary' },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const config = statusConfig[status] || { label: status, variant: 'secondary' };
  // @ts-ignore — shadcn badge variants
  return <Badge variant={config.variant}>{config.label}</Badge>;
}