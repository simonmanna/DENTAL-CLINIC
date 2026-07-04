// src/components/payments/PaymentButton.tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Banknote } from 'lucide-react';
import { PaymentModal } from './PaymentModal';
import { usePaymentModal, type PaymentContextType } from '@/hooks/usePaymentModal';

interface PaymentButtonProps {
  contextType: PaymentContextType;
  contextId: string;
  /** Extra react-query keys to invalidate on success */
  invalidateKeys?: string[][];
  onSuccess?: () => void;
  /** Show as icon-only (compact tables) */
  compact?: boolean;
  label?: string;
  disabled?: boolean;
}

/**
 * Drop-in "Pay" button that opens the central payment modal.
 * Works for both Purchase Orders and Expenses.
 *
 * Usage (Purchase Order row):
 *   <PaymentButton contextType="PURCHASE_ORDER" contextId={po.id} />
 *
 * Usage (Expense row):
 *   <PaymentButton contextType="EXPENSE" contextId={expense.id} />
 */
export function PaymentButton({
  contextType,
  contextId,
  invalidateKeys,
  onSuccess,
  compact = false,
  label,
  disabled = false,
}: PaymentButtonProps) {
  const { open, openModal, closeModal, contextQuery, mutation } = usePaymentModal({
    invalidateKeys,
    onSuccess,
  });

  return (
    <>
      <Button
        size={compact ? 'sm' : 'default'}
        variant="outline"
className="w-full bg-green-600 text-white font-bold hover:bg-green-700 py-6 shadow-lg shadow-green-200 border-none transition-all active:scale-[0.98] disabled:bg-gray-400 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={() => openModal(contextType, contextId)}
      >
        <Banknote className="h-4 w-4 mr-1.5" />
        {label ?? 'Pay'}
      </Button>

      <PaymentModal
        open={open}
        onClose={closeModal}
        contextType={contextType}
        contextId={contextId}
        contextData={contextQuery.data}
        isLoadingContext={contextQuery.isLoading}
        contextError={contextQuery.error as Error | null}
        onSubmit={(payload) => mutation.mutate(payload)}
        isSubmitting={mutation.isPending}
      />
    </>
  );
}
