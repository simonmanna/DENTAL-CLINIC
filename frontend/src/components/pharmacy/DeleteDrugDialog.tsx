import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import api from '@/lib/api/client';
import type { Drug } from '../../pages/pharmacy/drugs.types';

interface Props {
  open: boolean;
  drug: Drug;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteDrugDialog({ open, drug, onClose, onDeleted }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.delete(`/pharmacy/drugs/${drug.id}`);
      toast.success(`"${drug.name}" has been deactivated`);
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to deactivate drug');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            Deactivate Drug?
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <p className="text-sm text-slate-600">
            Are you sure you want to deactivate{' '}
            <span className="font-semibold text-slate-900">{drug.name}</span>?
          </p>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-800">
              This is a{' '}
              <span className="font-semibold">soft delete</span> — the drug
              will be hidden from listings but all historical records (
              prescriptions, sales, transactions) will be preserved.
              You can restore it at any time.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
