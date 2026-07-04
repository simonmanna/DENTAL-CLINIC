import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi, CreateAccountInput, UpdateAccountInput } from '@/lib/api/accounts';
import { toast } from 'sonner';

export const ACCOUNTS_KEY = 'accounts';

export const useAccounts = (params?: Record<string, any>) =>
  useQuery({
    queryKey: [ACCOUNTS_KEY, params],
    queryFn: () => accountsApi.getAll(params),
  });

export const useAccount = (id: string) =>
  useQuery({
    queryKey: [ACCOUNTS_KEY, id],
    queryFn: () => accountsApi.getById(id),
    enabled: !!id,
  });

export const useCreateAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => accountsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACCOUNTS_KEY] });
      toast.success('Account created');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Create failed'),
  });
};

export const useUpdateAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountInput }) =>
      accountsApi.update(id, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [ACCOUNTS_KEY] });
      qc.invalidateQueries({ queryKey: [ACCOUNTS_KEY, vars.id] });
      toast.success('Account updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Update failed'),
  });
};

export const useDeleteAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACCOUNTS_KEY] });
      toast.success('Account deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed'),
  });
};