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
  CASH:          { label: 'Cash',          icon: Banknote,   color: 'bg-green-100 text-green-700' },
  BANK_TRANSFER: { label: 'Bank Transfer', icon: Building2,  color: 'bg-blue-100 text-blue-700' },
  MOBILE_MONEY:  { label: 'Mobile Money',  icon: Smartphone, color: 'bg-yellow-100 text-yellow-700' },
  CHEQUE:        { label: 'Cheque',        icon: Receipt,    color: 'bg-purple-100 text-purple-700' },
  CREDIT_NOTE:   { label: 'Credit Note',   icon: CreditCard, color: 'bg-orange-100 text-orange-700' },
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
      <div className="text-center py-8 text-slate-500 text-sm">
        <Wallet className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        No payments recorded yet
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead className="text-xs">Date</TableHead>
          <TableHead className="text-xs">Reference</TableHead>
          <TableHead className="text-xs">Method</TableHead>
          <TableHead className="text-xs">Account</TableHead>
          <TableHead className="text-xs text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p: any) => {
          const meta = METHOD_META[p.method] ?? { label: p.method, icon: Wallet, color: 'bg-slate-100 text-slate-700' };
          const Icon = meta.icon;
          return (
            <TableRow key={p.id} className="text-sm">
              <TableCell className="text-slate-600">
                {format(new Date(p.paidAt), 'dd MMM yyyy, HH:mm')}
              </TableCell>
              <TableCell className="font-mono text-xs text-slate-500">
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
                  <span className="text-slate-400 text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-slate-600 text-xs">{p.account ?? '—'}</TableCell>
              <TableCell className="text-right font-semibold text-slate-800">
                {formatUGX(p.amount)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
