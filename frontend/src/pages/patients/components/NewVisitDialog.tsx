import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Stethoscope } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { visitsApi } from "../../../lib/api";
import { staffApi } from "../../../lib/api/staff-api";
import { useAuthStore } from "../../../store/auth.store";

interface Props {
  open: boolean;
  patientId: string;
  patientName: string;
  onClose: () => void;
}

const apiMessage = (e: any): string | undefined => {
  const msg = e?.response?.data?.message;
  if (!msg) return undefined;
  return Array.isArray(msg) ? msg.join(" • ") : String(msg);
};

/** Open a walk-in visit for an existing patient (same flow as "Register Patient & Visit"). */
export function NewVisitDialog({ open, patientId, patientName, onClose }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [dentistId, setDentistId] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [dentistError, setDentistError] = useState<string>();

  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
    enabled: open,
  });

  // The logged-in dentist is usually the one seeing the patient; with a
  // single dentist on staff there is nothing to choose.
  useEffect(() => {
    if (!open) return;
    setChiefComplaint("");
    setDentistError(undefined);
    setDentistId(
      dentists.find((d: any) => d.id === user?.staff?.id)?.id ??
        (dentists.length === 1 ? dentists[0].id : ""),
    );
  }, [open, dentists, user?.staff?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      visitsApi.createWalkIn({
        patientId,
        dentistId,
        chiefComplaint: chiefComplaint.trim() || undefined,
      }),
    onSuccess: (visit: any) => {
      notify.success("Visit opened", `A visit was opened for ${patientName}.`);
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
      onClose();
      navigate(`/visits/${visit.id}`);
    },
    onError: (e: any) => {
      notify.error("Could not open the visit", apiMessage(e) || "Please try again.");
    },
  });

  const submit = () => {
    if (!dentistId) {
      setDentistError("Choose the dentist for the visit");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 bg-primary-muted rounded-lg">
              <Stethoscope className="w-5 h-5 text-primary" />
            </div>
            New Visit
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <p className="text-sm text-muted-foreground">
            Open a visit now for{" "}
            <span className="font-semibold text-foreground">{patientName}</span>.
          </p>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Dentist <span className="text-danger">*</span>
            </label>
            <select
              className={`w-full h-9 rounded-md border bg-white px-3 text-sm ${
                dentistError ? "border-danger" : "border-input"
              }`}
              value={dentistId}
              onChange={(e) => {
                setDentistId(e.target.value);
                setDentistError(undefined);
              }}
            >
              <option value="">Select dentist</option>
              {dentists.map((d: any) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.firstName} {d.lastName}
                </option>
              ))}
            </select>
            {dentistError && (
              <p className="mt-1 text-xs text-danger">{dentistError}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Chief Complaint
            </label>
            <Input
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g. Toothache, lower left"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Stethoscope className="w-4 h-4 mr-2" />
            )}
            {mutation.isPending ? "Opening visit…" : "Start Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
