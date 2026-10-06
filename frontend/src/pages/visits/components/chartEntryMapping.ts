// src/pages/visits/components/chartEntryMapping.ts
// ─────────────────────────────────────────────────────────────────────────────
// Persisted chart-entry row (GET /chart-entries) → the chart's ChartEntry.
//
// Pure (no React / API client) so it is unit-tested. Extracted from
// DentalChart's `apiAsEntries`; it additionally carries:
//   • visitId     — the chart now loads the patient's FULL history in every
//                   visit, and the ledger can still narrow to "this visit";
//   • diagnosedAt — the real diagnosis date. The edit dialog used to fall
//                   back to the row's createdAt, so any edit silently
//                   overwrote a back-dated diagnosis with the entry date.
// ─────────────────────────────────────────────────────────────────────────────
import { canonicalToUiForTooth, isValidFdi } from "../../../lib/dental/notation";
import type { PatientConditionStatus } from "../../../lib/api/conditions";
import {
  IMPLANT_ADA_CODES,
  RENDERABLE_PROC_STATUS,
  toLocalISODate,
  type ChartEntry,
  type EntryStatus,
} from "./dentalChartLogic";

/** Loose shape of a GET /chart-entries row (backend include). */
export type ApiChartRow = Record<string, any>;

export function toChartEntry(e: ApiChartRow): ChartEntry | null {
  const t = e.toothNumber || 0;
  // A mouth-level procedure (cleaning, full-mouth X-ray…) has no tooth: it
  // stays in the ledger with an empty tooth list (the odontogram ignores
  // it). A tooth number that is not FDI is still dropped.
  const mouthLevel = !t && e.type !== "CONDITION";
  if (!mouthLevel && (!t || !isValidFdi(t))) return null;

  const tp = e.treatmentProcedure;
  // A cancelled / terminal procedure never paints the tooth. CONDITION and
  // EXISTING rows carry no linked procedure and are unaffected.
  if (tp?.status && !RENDERABLE_PROC_STATUS.has(tp.status)) return null;

  const prov =
    e.provider?.id ??
    e.patientCondition?.provider?.id ??
    (typeof e.providerId === "string" ? e.providerId : undefined);

  const presenceEffect =
    e.condition?.chartPresenceEffect ??
    e.patientCondition?.condition?.chartPresenceEffect;

  // isImplant: prefer catalog flag, then ADA code.
  const procIsImplant: boolean =
    tp?.procedure?.isImplant === true ||
    (!!tp?.procedure?.code &&
      IMPLANT_ADA_CODES.has(String(tp.procedure.code).toUpperCase())) ||
    false;

  const diagnosedRaw: string | undefined =
    e.diagnosedAt ?? e.patientCondition?.diagnosedAt ?? undefined;

  return {
    id: e.id,
    toothNumbers: mouthLevel ? [] : [t],
    surfaces: mouthLevel
      ? []
      : (e.surfaces || []).map((s: string) => canonicalToUiForTooth(s, t)),
    type: e.type as ChartEntry["type"],
    status: e.status as EntryStatus,
    label: e.label,
    code: e.conditionCode || e.procedureCode,
    notes: e.notes,
    date: toLocalISODate(e.createdAt),
    diagnosedAt: diagnosedRaw ? toLocalISODate(diagnosedRaw) : undefined,
    visitId: e.visitId ?? undefined,
    provider: prov,
    patientConditionId: e.patientConditionId ?? e.patientCondition?.id,
    conditionId: e.conditionId ?? e.patientCondition?.conditionId,
    severity: (e.patientCondition?.severity ?? "") as ChartEntry["severity"],
    conditionStatus: (e.patientCondition?.status ??
      "ACTIVE") as PatientConditionStatus,
    chartPresenceEffect: presenceEffect,
    treatmentProcedureId: e.treatmentProcedureId ?? tp?.id,
    treatmentPlanId: tp?.treatmentPlanId,
    procedureStatus: tp?.status,
    totalPrice: tp?.totalPrice != null ? Number(tp.totalPrice) : undefined,
    currency: tp?.currency,
    isImplant: procIsImplant,
    sessionsCount: tp?.sessions?.length ?? 0,
    version: e.version,
  };
}
