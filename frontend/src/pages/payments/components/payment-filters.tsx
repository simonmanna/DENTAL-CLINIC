import { useState } from 'react';
import { PaymentFilters as PaymentFiltersType, PaymentType, CashFlowDirection, PaymentMethod, PaymentStatus } from '@/types/payment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Search, X, Filter } from 'lucide-react';

interface Props {
  filters: PaymentFiltersType;
  onChange: (filters: PaymentFiltersType) => void;
}

export function PaymentFilters({ filters, onChange }: Props) {
  const [local, setLocal] = useState<PaymentFiltersType>(filters);

  const update = (key: keyof PaymentFiltersType, value: string | undefined) => {
    setLocal((prev) => ({ ...prev, [key]: value === 'all' ? undefined : value, page: 1 }));
  };

  const apply = () => onChange(local);
  const reset = () => {
    const clean = { page: 1, limit: 20 };
    setLocal(clean);
    onChange(clean);
  };

  return (
    <Card>
      <CardContent className="pt-1">
        <div className="flex items-center gap-2 mb-0">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Code, ref, txn ID..."
                className="pl-8"
                value={local.search || ''}
                onChange={(e) => update('search', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Type</Label>
            <Select value={local.type || 'all'} onValueChange={(v) => update('type', v)}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="INVOICE_RECEIPT">Invoice Receipt</SelectItem>
                <SelectItem value="PURCHASE_ORDER">Purchase Order</SelectItem>
                <SelectItem value="EXPENSE">Expense</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Direction</Label>
            <Select value={local.direction || 'all'} onValueChange={(v) => update('direction', v)}>
              <SelectTrigger>
                <SelectValue placeholder="All directions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="IN">Money In</SelectItem>
                <SelectItem value="OUT">Money Out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Method</Label>
            <Select value={local.method || 'all'} onValueChange={(v) => update('method', v)}>
              <SelectTrigger>
                <SelectValue placeholder="All methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="VISA_CARD">Visa</SelectItem>
                <SelectItem value="MASTERCARD">Mastercard</SelectItem>
                <SelectItem value="MTN_MOBILE_MONEY">MTN MoMo</SelectItem>
                <SelectItem value="AIRTEL_MONEY">Airtel Money</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="INSURANCE">Insurance</SelectItem>
                <SelectItem value="CREDIT_NOTE">Credit Note</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <Select value={local.status || 'all'} onValueChange={(v) => update('status', v)}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button onClick={apply} className="flex-1">Apply Filters</Button>
            <Button variant="default" size="icon" onClick={reset}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}