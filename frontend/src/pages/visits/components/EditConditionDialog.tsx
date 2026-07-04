// src/pages/visits/components/EditConditionDialog.tsx
// UI Refactor: Two-column layout, wider dialog (matching AddTreatmentDialog pattern)
// Logic: 100% unchanged from original

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Loader2,
  AlertCircle,
  Save,
  Stethoscope,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  conditionsApi,
  type Condition,
  type PatientConditionStatus,
} from "@/lib/api/conditions";
import { staffApi } from "@/lib/api/staff-api";
import { RadialSurfacePicker } from './SurfacePicker';
import type { UiSurface } from '../../../lib/dental/notation';
type ConditionSeverity = "MILD" | "MODERATE" | "SEVERE";

interface Dentist {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

export interface EditConditionInitialData {
  patientConditionId?: string;
  chartEntryId: string;
  toothNumbers: number[];
  surfaces: UiSurface[];
  label: string;
  code?: string;
  notes?: string;
  conditionId?: string;
  diagnosedAt?: string;
  diagnosedBy?: string;
  providerId?: string;
  severity?: ConditionSeverity | "";
  status?: PatientConditionStatus;
}

export interface EditConditionSubmitData {
  chartEntryId: string;
  patientConditionId?: string;
  toothNumbers: number[];
  surfaces: UiSurface[];
  label: string;
  code: string;
  notes?: string;
  conditionId?: string;
  diagnosedAt?: string;
  diagnosedBy?: string;
  providerId?: string;
  severity?: ConditionSeverity;
  status?: PatientConditionStatus;
  /** Required when changing a substantive clinical field — audit trail. */
  editReason?: string;
}

interface EditConditionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: EditConditionInitialData;
  defaultDentistId?: string;
  onSubmit: (data: EditConditionSubmitData) => Promise<void>;
}

export function EditConditionDialog({
  isOpen,
  onClose,
  initialData,
  defaultDentistId = "",
  onSubmit,
}: EditConditionDialogProps) {
  const [search, setSearch] = useState(initialData.label);
  const [selectedCondition, setSelectedCondition] = useState<Condition | null>(
    null,
  );
  const [surfaces, setSurfaces] = useState<UiSurface[]>(
    initialData.surfaces,
  );
  const [status, setStatus] = useState<PatientConditionStatus>(
    initialData.status ?? "ACTIVE",
  );
  const [diagnosedAt, setDiagnosedAt] = useState(
    initialData.diagnosedAt ?? new Date().toISOString().split("T")[0],
  );
  const [selectedProviderId, setSelectedProviderId] = useState(
    initialData.providerId ?? initialData.diagnosedBy ?? defaultDentistId,
  );
  const [severity, setSeverity] = useState<ConditionSeverity | "">(
    initialData.severity ?? "",
  );
  const [notes, setNotes] = useState(initialData.notes ?? "");
  const [editReason, setEditReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: dentists = [] } = useQuery<Dentist[]>({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: conditions = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["conditions", "active"],
    queryFn: () => conditionsApi.list({ isActive: true }),
    enabled: isOpen,
  });

  useEffect(() => {
    if (!conditions.length) return;
    if (initialData.conditionId) {
      const match = (conditions as Condition[]).find(
        (c) => c.id === initialData.conditionId,
      );
      if (match) {
        setSelectedCondition(match);
        setSearch(match.name);
        return;
      }
    }
    const byName = (conditions as Condition[]).find(
      (c) => c.name.toLowerCase() === initialData.label.toLowerCase(),
    );
    if (byName) {
      setSelectedCondition(byName);
      setSearch(byName.name);
    }
  }, [conditions, initialData.conditionId, initialData.label]);

  // E1 fix: this effect used to depend on the full `initialData` object, which
  // the parent rebuilds on every render (e.g. via buildConditionInitialData() in
  // ToothDetailDrawer). That made the form reset to the original values on any
  // parent re-render — wiping in-progress edits when the chart re-fetched.
  // The form only needs to (re)seed when the user opens the dialog for a
  // *different* condition, so we key on a stable identity (patientConditionId
  // for the normal path, falling back to chartEntryId for legacy unlinked
  // rows). The ref guards against a same-condition re-render re-seeding the
  // form even when isOpen flickers or defaultDentistId changes.
  const lastSeededKeyRef = useRef<string | null>(null);
  const identityKey =
    initialData.patientConditionId ?? initialData.chartEntryId ?? null;

  useEffect(() => {
    if (!isOpen) {
      lastSeededKeyRef.current = null;
      return;
    }
    if (!identityKey) return;
    if (lastSeededKeyRef.current === identityKey) return;
    lastSeededKeyRef.current = identityKey;

    setSearch(initialData.label);
    setSurfaces(initialData.surfaces);
    setStatus(initialData.status ?? "ACTIVE");
    setDiagnosedAt(
      initialData.diagnosedAt ?? new Date().toISOString().split("T")[0],
    );
    setSeverity(initialData.severity ?? "");
    setNotes(initialData.notes ?? "");
    setEditReason("");

    const resolvedProvider = resolveProviderIdFromInitialData(
      initialData.providerId,
      initialData.diagnosedBy,
      defaultDentistId,
    );
    setSelectedProviderId(resolvedProvider);
  }, [isOpen, identityKey, initialData, defaultDentistId]);

  // E1 fix: key the provider-resolution effect on the same stable identity
  // used by the form-seed effect above. This effect re-runs when the dentists
  // list arrives, but it must NOT re-seed selectedProviderId on every parent
  // re-render (which would silently overwrite a user-typed provider change).
  useEffect(() => {
    if (!dentists.length || !isOpen) return;
    const resolvedProvider = resolveProviderIdFromInitialData(
      initialData.providerId,
      initialData.diagnosedBy,
      defaultDentistId,
      dentists as Dentist[],
    );
    setSelectedProviderId((prev) => {
      const alreadyValid = (dentists as Dentist[]).some((d) => d.id === prev);
      return alreadyValid ? prev : resolvedProvider;
    });
  }, [dentists, isOpen, identityKey, initialData.providerId, initialData.diagnosedBy, defaultDentistId]);

  const filtered = (conditions as Condition[]).filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.icd10Code?.toLowerCase().includes(search.toLowerCase()) ||
      c.snodentCode?.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedDentist = (dentists as Dentist[]).find(
    (d) => d.id === selectedProviderId,
  );

  const canSubmit =
    !!selectedCondition &&
    !submitting &&
    !(selectedCondition.requiresSurface && surfaces.length === 0);

  // A "substantive" edit is anything beyond a pure status flip — same rule
  // the backend uses to decide whether to require editReason. We compute it
  // here so the UI can ask for the reason exactly when needed.
  const substantiveChange =
    !!selectedCondition &&
    (selectedCondition.id !== initialData.conditionId ||
      JSON.stringify([...surfaces].sort()) !==
        JSON.stringify([...initialData.surfaces].sort()) ||
      severity !== (initialData.severity ?? "") ||
      (selectedProviderId || "") !==
        (initialData.providerId ?? initialData.diagnosedBy ?? "") ||
      diagnosedAt !== (initialData.diagnosedAt ?? "") ||
      (notes ?? "") !== (initialData.notes ?? ""));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (substantiveChange && !editReason.trim()) {
      alert(
        "Please provide a reason for editing this condition. The reason is recorded in the clinical audit trail.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        chartEntryId: initialData.chartEntryId,
        patientConditionId: initialData.patientConditionId,
        toothNumbers: initialData.toothNumbers,
        surfaces,
        label: selectedCondition!.name,
        code:
          selectedCondition!.icd10Code || selectedCondition!.snodentCode || "",
        notes: notes || undefined,
        conditionId: selectedCondition!.id,
        diagnosedAt,
        diagnosedBy: selectedProviderId || undefined,
        providerId: selectedProviderId || undefined,
        severity: severity || undefined,
        status,
        editReason: editReason.trim() || undefined,
      });
      onClose();
    } catch (e) {
      console.error("Failed to update condition:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const toothLabel =
    initialData.toothNumbers.length === 1
      ? `Tooth ${initialData.toothNumbers[0]}`
      : `${initialData.toothNumbers.length} teeth`;

  if (!isOpen) return null;

  const lbl: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 4,
    display: "block",
  };
  const inp: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    fontSize: 13,
    border: "1px solid #d1d5db",
    borderRadius: 6,
    outline: "none",
    background: "#fff",
    color: "#1e293b",
    boxSizing: "border-box",
  };

  // ── Column layout styles (matching AddTreatmentDialog) ─────────────────────
  const leftColumnStyle: React.CSSProperties = {
    width: 380,
    minWidth: 380,
    borderRight: "1px solid #e2e8f0",
    paddingRight: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const rightColumnStyle: React.CSSProperties = {
    flex: 1,
    paddingLeft: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingRight: 4,
    minHeight: 0,
    paddingBottom: 8,
    overflowY: "auto",
  };

  const twoColumnContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: 16,
    height: "100%",
    flex:1,
    minHeight: 0,
  };

  const scrollableListStyle: React.CSSProperties = {
    maxHeight: 300,
    overflowY: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: 7,
    background: "#fff",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 1000,
          maxWidth: "95vw",
          maxHeight: "92vh",
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (full width, unchanged) */}
        <div
          style={{
            background: "#0369a1",
            color: "#fff",
            padding: "5px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              Edit Condition
            </h3>
            <p style={{ fontSize: 14, color: "#e2ecf7", margin: "3px 0 0" }}>
              {toothLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#93c5fd",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body with Two Columns */}
        <div
          style={{
            overflow: "hidden",
            flex: 1,
            padding: "8px 20px",
            display: "flex", // ← Add flex context
            flexDirection: "column",
          }}
        >
          <div style={twoColumnContainerStyle}>
            {/* ════════════════ LEFT COLUMN: Search & Condition List ════════════════ */}
            <div style={leftColumnStyle}>
              {/* Search Input */}
              <div>
                <label style={lbl}>
                  Condition <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <Search
                    size={13}
                    style={{
                      position: "absolute",
                      left: 9,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#9ca3af",
                    }}
                  />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedCondition(null);
                    }}
                    placeholder="Search by name or code…"
                    style={{ ...inp, paddingLeft: 30 }}
                  />
                </div>
              </div>

              {/* Condition List */}
              <div style={{ ...scrollableListStyle, flex: 1 }}>
                {isLoading && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "28px",
                      color: "#94a3b8",
                    }}
                  >
                    <Loader2
                      size={22}
                      style={{
                        animation: "spin 1s linear infinite",
                        marginBottom: 6,
                      }}
                    />
                    <p style={{ fontSize: 12 }}>Loading conditions…</p>
                  </div>
                )}
                {error && !isLoading && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "20px",
                      color: "#dc2626",
                    }}
                  >
                    <AlertCircle size={20} style={{ marginBottom: 6 }} />
                    <p style={{ fontSize: 12, marginBottom: 10 }}>
                      Failed to load conditions
                    </p>
                    <button
                      onClick={() => refetch()}
                      style={{
                        padding: "5px 12px",
                        fontSize: 12,
                        borderRadius: 5,
                        border: "1px solid #dc2626",
                        background: "#fff",
                        color: "#dc2626",
                        cursor: "pointer",
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!isLoading && !error && filtered.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "24px",
                      color: "#94a3b8",
                    }}
                  >
                    <AlertCircle
                      size={18}
                      style={{ marginBottom: 6, opacity: 0.5 }}
                    />
                    <p style={{ fontSize: 12 }}>
                      {search
                        ? `No results for "${search}"`
                        : "Start typing to search conditions"}
                    </p>
                  </div>
                )}
                {!isLoading &&
                  !error &&
                  filtered.length > 0 &&
                  filtered.map((c: Condition) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCondition(c);
                        setSearch(c.name);
                      }}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f3f4f6",
                        background:
                          selectedCondition?.id === c.id ? "#eff6ff" : "#fff",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        if (selectedCondition?.id !== c.id)
                          e.currentTarget.style.background = "#f8fafc";
                      }}
                      onMouseLeave={(e) => {
                        if (selectedCondition?.id !== c.id)
                          e.currentTarget.style.background = "#fff";
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "#1e293b",
                          }}
                        >
                          {c.name}
                        </div>
                        {c.description && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "#94a3b8",
                              marginTop: 1,
                            }}
                          >
                            {c.description}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {c.icd10Code && (
                          <div
                            style={{
                              fontSize: 10,
                              fontFamily: "monospace",
                              color: "#6b7280",
                            }}
                          >
                            {c.icd10Code}
                          </div>
                        )}
                        {c.requiresSurface && (
                          <div style={{ fontSize: 9, color: "#f59e0b" }}>
                            Requires surface
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* ════════════════ RIGHT COLUMN: Form Fields & Configuration ════════════════ */}
            <div style={rightColumnStyle}>
              {/* Selected Condition Badge */}
              {selectedCondition && (
                <div
                  style={{
                    padding: "4px 12px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 7,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 4,
                  }}
                >
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: "#1e40af" }}
                  >
                    {selectedCondition.name}
                  </span>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {selectedCondition.icd10Code && (
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#1d4ed8",
                        }}
                      >
                        ICD-10: {selectedCondition.icd10Code}
                      </span>
                    )}
                    {selectedCondition.snodentCode && (
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#94a3b8",
                        }}
                      >
                        SNODENT: {selectedCondition.snodentCode}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Row 1 – Date + Provider */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div>
                  <label style={lbl}>
                    Date <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={diagnosedAt}
                    onChange={(e) => setDiagnosedAt(e.target.value)}
                    style={inp}
                  />
                </div>

                <div>
                  <label style={lbl}>Provider</label>
                  <div style={{ position: "relative" }}>
                    <Stethoscope
                      size={13}
                      style={{
                        position: "absolute",
                        left: 9,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#9ca3af",
                        pointerEvents: "none",
                      }}
                    />
                    <select
                      value={selectedProviderId}
                      onChange={(e) => setSelectedProviderId(e.target.value)}
                      style={{ ...inp, paddingLeft: 28, cursor: "pointer" }}
                    >
                      <option value="">Select provider…</option>
                      {(dentists as Dentist[]).map((d) => (
                        <option key={d.id} value={d.id}>
                          Dr. {d.firstName} {d.lastName}
                          {d.specialization ? ` — ${d.specialization}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* {selectedDentist ? (
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        borderRadius: 5,
                        background: "#f0f9ff",
                        border: "1px solid #bae6fd",
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "#0ea5e9",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {selectedDentist.firstName[0]}
                        {selectedDentist.lastName[0]}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#0369a1",
                        }}
                      >
                        Dr. {selectedDentist.firstName}{" "}
                        {selectedDentist.lastName}
                      </span>
                      {selectedDentist.specialization && (
                        <span style={{ fontSize: 10, color: "#7dd3fc" }}>
                          &nbsp;· {selectedDentist.specialization}
                        </span>
                      )}
                    </div>
                  ) : selectedProviderId ? (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "4px 8px",
                        borderRadius: 5,
                        background: "#fefce8",
                        border: "1px solid #fde68a",
                        fontSize: 11,
                        color: "#92400e",
                      }}
                    >
                      Loading provider…
                    </div>
                  ) : null} */}
                </div>
              </div>

              {/* Row 2 – Status + Severity */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={lbl}>Status</label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as PatientConditionStatus)
                    }
                    style={inp}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="MONITORED">Monitored</option>
                    <option value="IN_TREATMENT">In Treatment</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="RULED_OUT">Ruled Out</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Severity</label>
                  <select
                    value={severity}
                    onChange={(e) =>
                      setSeverity(e.target.value as ConditionSeverity | "")
                    }
                    style={inp}
                  >
                    <option value="">— none —</option>
                    <option value="MILD">Mild</option>
                    <option value="MODERATE">Moderate</option>
                    <option value="SEVERE">Severe</option>
                  </select>
                </div>
              </div>

              {/* Tooth (read-only) */}
              <div>
                <label style={lbl}>Tooth</label>
                <input
                  readOnly
                  value={
                    initialData.toothNumbers.length === 1
                      ? String(initialData.toothNumbers[0])
                      : initialData.toothNumbers.join(", ") || "—"
                  }
                  style={{
                    ...inp,
                    background: "#f1f5f9",
                    color: "#64748b",
                    cursor: "default",
                  }}
                />
              </div>

              {/* Surfaces */}
              <div>
                <label style={{ ...lbl, marginBottom: 10 }}>
                  Surfaces{" "}
                  {selectedCondition?.requiresSurface && (
                    <span style={{ color: "#dc2626" }}>*</span>
                  )}
                </label>
                <RadialSurfacePicker value={surfaces} onChange={setSurfaces} />
                {selectedCondition?.requiresSurface &&
                  surfaces.length === 0 && (
                    <p style={{ fontSize: 10, color: "#dc2626", marginTop: 8 }}>
                      At least one surface is required for this condition
                    </p>
                  )}
              </div>

              {/* Notes */}
              <div>
                <label style={lbl}>Notes</label>
                <textarea
                  rows={1}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Clinical notes…"
                  style={{
                    ...inp,
                    resize: "vertical",
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Reason for edit — required for substantive changes */}
              <div>
                <label style={lbl}>
                  Reason for Edit{" "}
                  {substantiveChange ? (
                    <span style={{ color: "#dc2626" }}>*</span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                      (optional)
                    </span>
                  )}
                </label>
                <textarea
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={
                    substantiveChange
                      ? 'Required — e.g. "Corrected wrong tooth surface noted by Dr. K"'
                      : "Optional — only needed for substantive clinical changes"
                  }
                  style={{
                    ...inp,
                    resize: "vertical",
                    fontFamily: "inherit",
                    lineHeight: 1.4,
                    borderColor:
                      substantiveChange && !editReason.trim()
                        ? "#fcd34d"
                        : "#d1d5db",
                  }}
                />
                <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                  Logged in the clinical audit trail with timestamp and actor.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer (full width, unchanged) */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: 10,
            background: "#f8fafc",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "9px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1,
              padding: "9px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              background: canSubmit ? "#1e3a5f" : "#e2e8f0",
              color: canSubmit ? "#fff" : "#94a3b8",
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            {submitting ? (
              <>
                <Loader2
                  size={14}
                  style={{ animation: "spin 1s linear infinite" }}
                />{" "}
                Saving…
              </>
            ) : (
              <>
                <Save size={14} /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─── Helper: resolve the best provider ID to pre-select ──────────────────────
function resolveProviderIdFromInitialData(
  providerId?: string,
  diagnosedBy?: string,
  defaultDentistId?: string,
  dentists?: { id: string }[],
): string {
  if (providerId) return providerId;
  if (diagnosedBy) {
    if (dentists?.some((d) => d.id === diagnosedBy)) return diagnosedBy;
    const looksLikeId =
      /^c[a-z0-9]{20,}$/.test(diagnosedBy) ||
      /^[0-9a-f-]{36}$/.test(diagnosedBy);
    if (looksLikeId) return diagnosedBy;
  }
  return defaultDentistId ?? "";
}
