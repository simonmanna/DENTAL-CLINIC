import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  patientName: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/** Soft-delete confirmation: the patient is hidden, never erased, and can be restored. */
export function DeletePatientDialog({
  open,
  patientName,
  loading,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 bg-danger-muted rounded-lg">
              <AlertTriangle className="w-5 h-5 text-danger" />
            </div>
            Delete Patient?
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Delete{" "}
            <span className="font-semibold text-foreground">{patientName}</span>?
          </p>
          <div className="rounded-lg bg-warning-muted/60 border border-warning/25 p-3">
            <p className="text-xs text-warning">
              This is a <span className="font-semibold">soft delete</span> —
              the patient is hidden from the patient list and search, but all
              visits, charts, invoices and receipts are kept. You can restore
              the patient from the “Deleted” view.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Reason <span className="text-danger">*</span>
            </label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate registration"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
            disabled={loading || !reason.trim()}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
