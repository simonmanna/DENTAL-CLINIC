// src/hooks/usePaymentModal.ts
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';


export type PaymentContextType = 'PURCHASE_ORDER' | 'EXPENSE';

export interface PaymentContext {
  accounts: Account[];
  outstanding: number;
  label: string;
  maxAmount: number;
}

export interface Account {
  id: string;
  accountCode: string;
  name: string;
  type: string;
  currency: string;
  currentBalance: number;
  isActive: boolean;
}

export interface CreatePaymentPayload {
  contextType: PaymentContextType;
  contextId: string;
  accountId: string;
  amount: number;
  method: string;
  reference?: string;
  bankName?: string;
  chequeNumber?: string;
  transactionId?: string;
  notes?: string;
  paidAt?: string;
}

interface UsePaymentModalOptions {
  onSuccess?: () => void;
  /** Query keys to invalidate after payment */
  invalidateKeys?: string[][];
}

export function usePaymentModal(options: UsePaymentModalOptions = {}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contextType, setContextType] = useState<PaymentContextType>('PURCHASE_ORDER');
  const [contextId, setContextId] = useState<string>('');

  const openModal = useCallback((type: PaymentContextType, id: string) => {
    setContextType(type);
    setContextId(id);
    setOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    setTimeout(() => setContextId(''), 300);
  }, []);

  const contextQuery = useQuery<PaymentContext>({
    queryKey: ['payment-context', contextType, contextId],
    queryFn: () =>
      api.get(`/payments/context/${contextType}/${contextId}`).then((r) => r.data),
    enabled: open && !!contextId,
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: (payload: CreatePaymentPayload) =>
      api.post('/payments', payload).then((r) => r.data),
    onSuccess: () => {
      toast.success('Payment recorded successfully');
      closeModal();
      // Invalidate parent queries
      const defaultKeys = [
        ['purchase-orders'],
        ['expenses'],
        ['accounts'],
      ];
      const keysToInvalidate = options.invalidateKeys ?? defaultKeys;
      keysToInvalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      options.onSuccess?.();
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message ?? 'Payment failed. Please try again.';
      toast.error(message);
    },
  });

  return {
    open,
    openModal,
    closeModal,
    contextType,
    contextId,
    contextQuery,
    mutation,
  };
}
