// src/components/payments/PaymentHistory.tsx
'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Banknote, Building2, Smartphone, Receipt, CreditCard, Wallet } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PaymentContextType } from '@/hooks/usePaymentModal';

interface PaymentHistoryProps {
  contextType: PaymentContextType;
  contextId: string;
}

const METHOD_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  CASH:          { label: 'Cash',          icon: Banknote,   color: 'bg-success-muted text-success' },
  BANK_TRANSFER: { label: 'Bank Transfer', icon: Building2,  color: 'bg-primary-muted text-primary' },
  MOBILE_MONEY:  { label: 'Mobile Money',  icon: Smartphone, color: 'bg-warning-muted text-warning' },
  CHEQUE:        { label: 'Cheque',        icon: Receipt,    color: 'bg-purple-100 text-purple-700' },
  CREDIT_NOTE:   { label: 'Credit Note',   icon: CreditCard, color: 'bg-warning-muted text-warning' },
};

function formatUGX(n: number) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency', currency: 'UGX',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export function PaymentHistory({ contextType, contextId }: PaymentHistoryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['payment-history', contextType, contextId],
    queryFn: () =>
      api
        .get('/payments', { params: { contextType, contextId, limit: 50 } })
        .then((r) => r.data),
    enabled: !!contextId,
  });

  const payments = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Wallet className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        No payments recorded yet
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="text-xs">Date</TableHead>
          <TableHead className="text-xs">Reference</TableHead>
          <TableHead className="text-xs">Method</TableHead>
          <TableHead className="text-xs">Account</TableHead>
          <TableHead className="text-xs text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p: any) => {
          const meta = METHOD_META[p.method] ?? { label: p.method, icon: Wallet, color: 'bg-muted text-foreground' };
          const Icon = meta.icon;
          return (
            <TableRow key={p.id} className="text-sm">
              <TableCell className="text-muted-foreground">
                {format(new Date(p.paidAt), 'dd MMM yyyy, HH:mm')}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {p.reference ?? p.paymentCode}
              </TableCell>
              <TableCell>
                {p.method ? (
                  <Badge
                    variant="outline"
                    className={`text-xs gap-1 border-0 font-medium ${meta.color}`}
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground/70 text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">{p.account ?? '—'}</TableCell>
              <TableCell className="text-right font-semibold text-foreground">
                {formatUGX(p.amount)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
