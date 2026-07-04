// Shared mutation hook with default error handling.
//
// Why: every mutation in the app needs to (a) extract the human-readable error
// message from the backend response, and (b) surface it to the user as a toast.
// Doing this by hand at every call site means failures get silently logged via
// `console.error` and the user sees nothing change.
//
// Usage:
//   const m = useApiMutation({
//     mutationFn: api.deleteCondition,
//     successMessage: 'Condition removed',
//     errorMessage: 'Could not remove condition',  // optional fallback
//     invalidate: [['dentalChart', patientId]],     // optional cache keys
//   });
//
// Per-call overrides for `onSuccess` / `onError` still work — the defaults
// run first, the override gets the same args and can call extra side-effects.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { toast } from '@/components/ui/sonner';

export type ApiMutationOptions<TData, TVariables, TError = unknown> = Omit<
  UseMutationOptions<TData, TError, TVariables>,
  'onError' | 'onSuccess'
> & {
  /** Toast shown on success. Skip the toast if undefined. */
  successMessage?: string | ((data: TData, vars: TVariables) => string);
  /** Fallback toast on error if backend message can't be extracted. */
  errorMessage?: string;
  /** Query-key arrays to invalidate on success. */
  invalidate?: ReadonlyArray<readonly unknown[]>;
  /** Side-effect on success (runs AFTER the default toast + invalidation). */
  onSuccess?: UseMutationOptions<TData, TError, TVariables>['onSuccess'];
  /** Side-effect on error (runs AFTER the default toast). */
  onError?: UseMutationOptions<TData, TError, TVariables>['onError'];
};

/**
 * Extracts a user-facing message from various error shapes we encounter:
 *  - Axios:   err.response.data.message  (string OR string[])
 *  - Fetch:   err.message
 *  - Nest:    "Bad Request: <reason>"
 */
export function extractApiError(err: unknown, fallback = 'Something went wrong'): string {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;
  const anyErr = err as any;
  const data = anyErr?.response?.data ?? anyErr?.data;
  if (data) {
    if (typeof data.message === 'string') return data.message;
    if (Array.isArray(data.message) && data.message.length) return data.message.join(', ');
    if (typeof data.error === 'string') return data.error;
  }
  if (typeof anyErr.message === 'string' && anyErr.message) return anyErr.message;
  return fallback;
}

export function useApiMutation<TData, TVariables, TError = unknown>(
  opts: ApiMutationOptions<TData, TVariables, TError>,
) {
  const qc = useQueryClient();
  const { successMessage, errorMessage, invalidate, onSuccess, onError, ...rest } = opts;

  return useMutation<TData, TError, TVariables>({
    ...rest,
    // React Query v5 passes a 4th `MutateOptions` arg; forward all args verbatim.
    onSuccess: async (...args) => {
      const [data, vars] = args;
      if (successMessage) {
        const msg = typeof successMessage === 'function' ? successMessage(data, vars) : successMessage;
        toast.success(msg);
      }
      if (invalidate?.length) {
        await Promise.all(
          invalidate.map((key) => qc.invalidateQueries({ queryKey: key as unknown[] })),
        );
      }
      if (onSuccess) await (onSuccess as any)(...args);
    },
    onError: async (...args) => {
      const [err] = args;
      const msg = extractApiError(err, errorMessage);
      toast.error(msg);
      // Keep console for devs — error toasts are for end users.
      // eslint-disable-next-line no-console
      console.error('[useApiMutation]', err);
      if (onError) await (onError as any)(...args);
    },
  });
}
