// src/pages/visits/components/ExaminationTab.tsx
// Full Examination & Notes tab — SOAP + Vitals + Diagnosis, fully persisted

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Check,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Save,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Heart,
  HeartPulse,
  Thermometer,
  Wind,
  User,
  Pill,
  FileText,
  ClipboardList,
  ShieldAlert,
  Plus,
  X,
} from "lucide-react";
import { patientsApi } from "../../../lib/api/patients";
import { visitsApi } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExaminationTabProps {
  visitId: string;
  visit: any;
  readOnly?: boolean;
}

// ─── Save Status Indicator ────────────────────────────────────────────────────
function SaveStatus({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${
        status === "saving"
          ? "bg-blue-50 text-blue-600 border border-blue-200"
          : status === "saved"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-600 border border-red-200"
      }`}
    >
      {status === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === "saved" && <Check className="w-3 h-3" />}
      {status === "error" && <AlertCircle className="w-3 h-3" />}
      {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Error"}
    </span>
  );
}

// ─── Vital Card ───────────────────────────────────────────────────────────────
function VitalCard({
  label,
  field,
  placeholder,
  unit,
  icon: Icon,
  color,
  value,
  onChange,
  disabled,
}: {
  label: string;
  field: string;
  placeholder: string;
  unit: string;
  icon: React.ElementType;
  color: string;
  value: string;
  onChange: (field: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl border-2 px-3 py-1 transition-all group focus-within:shadow-md ${
        disabled
          ? "border-slate-100 bg-slate-50"
          : `border-slate-200 bg-white hover:border-${color}-200 focus-within:border-${color}-400`
      }`}
    >
      <div className={`flex items-center gap-0.5 mb-1`}>
        <div
          className={`w-6 h-5 rounded-lg flex items-center justify-center bg-${color}-50`}
        >
          <Icon className={`w-3.0 h-3.0 text-${color}-600`} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          className="w-full text-lg font-bold text-slate-800 bg-transparent border-none outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
        />
        <span className="text-xs text-slate-400 shrink-0 font-medium">
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─── SOAP Field ───────────────────────────────────────────────────────────────
function SOAPField({
  label,
  sublabel,
  field,
  placeholder,
  value,
  onChange,
  disabled,
  accentColor,
}: {
  label: string;
  sublabel: string;
  field: string;
  placeholder: string;
  value: string;
  onChange: (field: string, value: string) => void;
  disabled: boolean;
  accentColor: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className={`text-xs font-black uppercase tracking-widest text-${accentColor}-600`}
        >
          {label}
        </span>
        <span className="text-xs text-slate-400 font-medium">{sublabel}</span>
      </div>
      <textarea
        rows={3}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        className={`w-full rounded-xl border-2 px-4 py-3 text-sm resize-none focus:outline-none transition-all leading-relaxed
          ${
            disabled
              ? "border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed"
              : `border-slate-200 bg-white text-slate-800 focus:border-${accentColor}-400 focus:shadow-sm hover:border-slate-300`
          }
          placeholder:text-slate-300`}
      />
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mt-1 mb-1">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Editable Chip List ──────────────────────────────────────────────────────
// Inline list with add/remove. Calls onChange with the full updated array.
function EditableChipList({
  values,
  onAdd,
  onRemove,
  disabled,
  placeholder,
  chipClass,
  emptyText = "None on record",
  icon: ChipIcon,
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  disabled?: boolean;
  placeholder: string;
  chipClass: string;
  emptyText?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commit = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onAdd(v);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {values.length === 0 && !adding && (
        <span className="text-xs text-slate-400 italic">{emptyText}</span>
      )}

      {values.map((v) => (
        <span
          key={v}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${chipClass}`}
        >
          {ChipIcon && <ChipIcon className="w-3 h-3" />}
          {v}
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(v)}
              className="ml-0.5 -mr-0.5 rounded-full hover:bg-white/40 p-0.5 transition-colors"
              title={`Remove ${v}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}

      {!disabled && adding && (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="text-xs px-2 py-1 border-2 border-slate-300 rounded-full bg-white focus:outline-none focus:border-blue-500 min-w-[120px]"
        />
      )}

      {!disabled && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ExaminationTab({
  visitId,
  visit,
  readOnly = false,
}: ExaminationTabProps) {
  const qc = useQueryClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [diagnosisExpanded, setDiagnosisExpanded] = useState(true);

  // SOAP state — seeded from visit data
  const [soap, setSoap] = useState({
    chiefComplaint: visit?.chiefComplaint || "",
    historyOfPresentIllness: visit?.historyOfPresentIllness || "",
    subjective: visit?.subjective || "",
    objective: visit?.objective || "",
    assessment: visit?.assessment || "",
    plan: visit?.plan || "",
  });

  // Vitals state
  const [vitals, setVitals] = useState({
    bloodPressure: visit?.bloodPressure || "",
    pulseRate: visit?.pulseRate?.toString() || "",
    temperature: visit?.temperature?.toString() || "",
    weight: visit?.weight?.toString() || "",
    height: visit?.height?.toString() || "",
    oxygenSat: visit?.oxygenSat?.toString() || "",
  });

  // Additional clinical fields
  const [clinical, setClinical] = useState({
    findings: visit?.findings || "",
    recommendations: visit?.recommendations || "",
  });

  // Re-seed when visit data changes
  useEffect(() => {
    if (visit) {
      setSoap({
        chiefComplaint: visit.chiefComplaint || "", // ← ADD
        historyOfPresentIllness: visit.historyOfPresentIllness || "",
        subjective: visit.subjective || "",
        objective: visit.objective || "",
        assessment: visit.assessment || "",
        plan: visit.plan || "",
      });
      setVitals({
        bloodPressure: visit.bloodPressure || "",
        pulseRate: visit.pulseRate?.toString() || "",
        temperature: visit.temperature?.toString() || "",
        weight: visit.weight?.toString() || "",
        height: visit.height?.toString() || "",
        oxygenSat: visit.oxygenSat?.toString() || "",
      });
      setClinical({
        findings: visit.findings || "",
        recommendations: visit.recommendations || "",
      });
    }
  }, [visit?.id]);

  // Debounced save for SOAP
  const autoSaveSOAP = useCallback(
    (updated: typeof soap) => {
      if (readOnly) return;
      clearTimeout(saveTimer.current);
      setSaveStatus("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          await visitsApi.updateSOAP(visitId, updated);
          setSaveStatus("saved");
          qc.invalidateQueries({ queryKey: ["visit", visitId] });
          setTimeout(() => setSaveStatus("idle"), 2500);
        } catch {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
      }, 1000);
    },
    [visitId, readOnly, qc],
  );

  // Debounced save for vitals
  const autoSaveVitals = useCallback(
    (updated: typeof vitals) => {
      if (readOnly) return;
      clearTimeout(saveTimer.current);
      setSaveStatus("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          await visitsApi.updateVitals(visitId, {
            bloodPressure: updated.bloodPressure || undefined,
            pulseRate: updated.pulseRate
              ? Number(updated.pulseRate)
              : undefined,
            temperature: updated.temperature
              ? Number(updated.temperature)
              : undefined,
            weight: updated.weight ? Number(updated.weight) : undefined,
            height: updated.height ? Number(updated.height) : undefined,
            oxygenSat: updated.oxygenSat
              ? Number(updated.oxygenSat)
              : undefined,
          });
          setSaveStatus("saved");
          qc.invalidateQueries({ queryKey: ["visit", visitId] });
          setTimeout(() => setSaveStatus("idle"), 2500);
        } catch {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
      }, 1000);
    },
    [visitId, readOnly, qc],
  );

  const handleSoap = (field: string, value: string) => {
    const updated = { ...soap, [field]: value };
    setSoap(updated);
    autoSaveSOAP(updated);
  };

  const handleVitals = (field: string, value: string) => {
    const updated = { ...vitals, [field]: value };
    setVitals(updated);
    autoSaveVitals(updated);
  };

  const handleClinical = (field: string, value: string) => {
    const updated = { ...clinical, [field]: value };
    setClinical(updated);
    // Save clinical notes together with SOAP
    autoSaveSOAP({ ...soap, ...updated } as any);
  };

  const vitalCards = [
    {
      label: "Blood Pressure",
      field: "bloodPressure",
      placeholder: "120/80",
      unit: "mmHg",
      icon: Heart,
      color: "red",
    },
    {
      label: "Pulse Rate",
      field: "pulseRate",
      placeholder: "72",
      unit: "bpm",
      icon: Activity,
      color: "pink",
    },
    {
      label: "Temperature",
      field: "temperature",
      placeholder: "36.5",
      unit: "°C",
      icon: Thermometer,
      color: "orange",
    },
    {
      label: "Weight",
      field: "weight",
      placeholder: "70",
      unit: "kg",
      icon: User,
      color: "purple",
    },
    {
      label: "Height",
      field: "height",
      placeholder: "170",
      unit: "cm",
      icon: User,
      color: "indigo",
    },
    {
      label: "SpO₂",
      field: "oxygenSat",
      placeholder: "98",
      unit: "%",
      icon: Wind,
      color: "teal",
    },
  ];

  const soapFields = [
    {
      label: "S",
      sublabel: "Subjective",
      field: "subjective",
      placeholder:
        "Chief complaint, history of present illness, symptoms described by the patient…",
      accentColor: "violet",
    },
    {
      label: "O",
      sublabel: "Objective",
      field: "objective",
      placeholder:
        "Clinical examination findings, test results, observable signs…",
      accentColor: "blue",
    },
    {
      label: "A",
      sublabel: "Assessment",
      field: "assessment",
      placeholder: "Diagnosis, clinical impression, differential diagnoses…",
      accentColor: "emerald",
    },
    {
      label: "P",
      sublabel: "Plan",
      field: "plan",
      placeholder:
        "Treatment plan, prescriptions, referrals, follow-up instructions…",
      accentColor: "amber",
    },
  ];

  // ── Patient medical-history (editable, optimistic) ──
  const patientId: string | undefined = visit?.patient?.id ?? visit?.patientId;

  type HistoryField = "allergies" | "medicalConditions" | "currentMedications";
  const [history, setHistory] = useState<Record<HistoryField, string[]>>({
    allergies: visit?.patient?.allergies ?? [],
    medicalConditions: visit?.patient?.medicalConditions ?? [],
    currentMedications: visit?.patient?.currentMedications ?? [],
  });
  const [historySaveStatus, setHistorySaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Re-seed when visit data changes
  useEffect(() => {
    setHistory({
      allergies: visit?.patient?.allergies ?? [],
      medicalConditions: visit?.patient?.medicalConditions ?? [],
      currentMedications: visit?.patient?.currentMedications ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit?.patient?.id]);

  const saveHistory = useCallback(
    async (field: HistoryField, nextValues: string[]) => {
      if (!patientId || readOnly) return;
      setHistorySaveStatus("saving");
      try {
        await patientsApi.update(patientId, { [field]: nextValues } as any);
        setHistorySaveStatus("saved");
        qc.invalidateQueries({ queryKey: ["visit", visitId] });
        qc.invalidateQueries({ queryKey: ["patient", patientId] });
        setTimeout(() => setHistorySaveStatus("idle"), 2000);
      } catch {
        setHistorySaveStatus("error");
        setTimeout(() => setHistorySaveStatus("idle"), 3000);
      }
    },
    [patientId, readOnly, qc, visitId],
  );

  const addHistoryItem = (field: HistoryField, v: string) => {
    const next = [...history[field], v];
    setHistory((h) => ({ ...h, [field]: next }));
    saveHistory(field, next);
  };
  const removeHistoryItem = (field: HistoryField, v: string) => {
    const next = history[field].filter((x) => x !== v);
    setHistory((h) => ({ ...h, [field]: next }));
    saveHistory(field, next);
  };

  const allergies = history.allergies;
  const medicalConditions = history.medicalConditions;
  const currentMedications = history.currentMedications;
  const hasAnyHistory =
    allergies.length > 0 ||
    medicalConditions.length > 0 ||
    currentMedications.length > 0;

  return (
    <div className="space-y-1">
      {/* ── Patient Medical History Snapshot ──────────────────────────── */}
      <div
        className={`rounded-2xl border shadow-sm overflow-hidden ${
          allergies.length > 0
            ? "bg-rose-50/40 border-rose-200"
            : medicalConditions.length > 0
              ? "bg-amber-50/40 border-amber-200"
              : "bg-white border-slate-200"
        }`}
      >
        <div className="px-5 py-2.5 border-b border-slate-100/80 bg-white/60 flex items-center gap-2">
          <ShieldAlert
            className={`w-4 h-4 ${
              allergies.length > 0 ? "text-rose-600" : "text-amber-600"
            }`}
          />
          <h3 className="text-sm font-bold text-slate-800">
            Patient Medical History
          </h3>
          {!hasAnyHistory && (
            <span className="ml-2 text-xs text-slate-400 italic">
              No history on record
            </span>
          )}
          <div className="ml-auto">
            <SaveStatus status={historySaveStatus} />
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Allergies */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                Allergies
              </span>
              {allergies.length > 0 && (
                <span className="text-[10px] font-semibold bg-rose-600 text-white px-1.5 py-0.5 rounded-full">
                  {allergies.length}
                </span>
              )}
            </div>
            <EditableChipList
              values={allergies}
              onAdd={(v) => addHistoryItem("allergies", v)}
              onRemove={(v) => removeHistoryItem("allergies", v)}
              disabled={readOnly || !patientId}
              placeholder="e.g. Penicillin"
              chipClass="bg-rose-100 border border-rose-300 text-rose-700"
              emptyText="None reported"
              icon={AlertTriangle}
            />
          </div>

          {/* Medical Conditions */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <HeartPulse className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Medical Conditions
              </span>
              {medicalConditions.length > 0 && (
                <span className="text-[10px] font-semibold bg-amber-600 text-white px-1.5 py-0.5 rounded-full">
                  {medicalConditions.length}
                </span>
              )}
            </div>
            <EditableChipList
              values={medicalConditions}
              onAdd={(v) => addHistoryItem("medicalConditions", v)}
              onRemove={(v) => removeHistoryItem("medicalConditions", v)}
              disabled={readOnly || !patientId}
              placeholder="e.g. Hypertension"
              chipClass="bg-amber-100 border border-amber-300 text-amber-700"
            />
          </div>

          {/* Current Medications */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Pill className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                Current Medications
              </span>
              {currentMedications.length > 0 && (
                <span className="text-[10px] font-semibold bg-purple-600 text-white px-1.5 py-0.5 rounded-full">
                  {currentMedications.length}
                </span>
              )}
            </div>
            <EditableChipList
              values={currentMedications}
              onAdd={(v) => addHistoryItem("currentMedications", v)}
              onRemove={(v) => removeHistoryItem("currentMedications", v)}
              disabled={readOnly || !patientId}
              placeholder="e.g. Lisinopril 10mg"
              chipClass="bg-purple-100 border border-purple-300 text-purple-700"
            />
          </div>
        </div>
      </div>

      {/* ── Chief Complaint & HPI ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <SectionHeader
            icon={Stethoscope}
            title="Chief Complaint & History"
            subtitle="Primary reason for visit and clinical background"
          >
            <SaveStatus status={saveStatus} />
          </SectionHeader>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Chief Complaint */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xs font-black uppercase tracking-widest text-rose-600">
                CC
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Chief Complaint
              </span>
            </div>
            <textarea
              rows={2}
              disabled={readOnly}
              placeholder="Patient's primary concern in their own words — e.g. 'Sharp pain in lower right molar for 3 days'…"
              value={soap.chiefComplaint}
              onChange={(e) => handleSoap("chiefComplaint", e.target.value)}
              className={`w-full rounded-xl border-2 px-4 py-3 text-sm resize-none focus:outline-none transition-all leading-relaxed
          ${
            readOnly
              ? "border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed"
              : "border-slate-200 bg-white text-slate-800 focus:border-rose-400 focus:shadow-sm hover:border-slate-300"
          } placeholder:text-slate-300`}
            />
          </div>

          {/* History of Present Illness */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xs font-black uppercase tracking-widest text-indigo-600">
                HPI
              </span>
              <span className="text-xs text-slate-400 font-medium">
                History of Present Illness
              </span>
            </div>
            <textarea
              rows={2}
              disabled={readOnly}
              placeholder="Onset, location, duration, character, aggravating/relieving factors, radiation, associated symptoms (OLDCART)…"
              value={soap.historyOfPresentIllness}
              onChange={(e) =>
                handleSoap("historyOfPresentIllness", e.target.value)
              }
              className={`w-full rounded-xl border-2 px-4 py-3 text-sm resize-none focus:outline-none transition-all leading-relaxed
          ${
            readOnly
              ? "border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed"
              : "border-slate-200 bg-white text-slate-800 focus:border-indigo-400 focus:shadow-sm hover:border-slate-300"
          } placeholder:text-slate-300`}
            />
          </div>
        </div>
      </div>

      {/* ── Vitals ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-1 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <SectionHeader
            icon={Activity}
            title="Vital Signs"
            subtitle="Patient measurements at time of visit"
          >
            <SaveStatus status={saveStatus} />
          </SectionHeader>
        </div>
        <div className="px-5 py-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
            {vitalCards.map((card) => (
              <VitalCard
                key={card.field}
                {...card}
                value={(vitals as any)[card.field]}
                onChange={handleVitals}
                disabled={readOnly}
              />
            ))}
          </div>

          {/* Vitals status row */}
          {!readOnly && (
            <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                Normal range: BP 90-120/60-80, Pulse 60-100, Temp 36-37.5, SpO₂
                95-100%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── SOAP Notes ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-1 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <SectionHeader
            icon={FileText}
            title="SOAP Notes"
            subtitle="Structured clinical documentation"
          >
            {!readOnly && (
              <div className="flex items-center gap-2">
                <SaveStatus status={saveStatus} />
                <span className="text-xs text-slate-400">
                  Auto-saves as you type
                </span>
              </div>
            )}
          </SectionHeader>
        </div>

        <div className="p-4">
          {/* SOAP color indicator bar */}
          <div className="grid grid-cols-4 mb-3">
            {[
              { letter: "S", label: "Subjective", color: "bg-violet-500" },
              { letter: "O", label: "Objective", color: "bg-blue-500" },
              { letter: "A", label: "Assessment", color: "bg-emerald-500" },
              { letter: "P", label: "Plan", color: "bg-amber-500" },
            ].map(({ letter, label, color }) => (
              <div
                key={letter}
                className={`${color} py-1.5 flex items-center justify-center gap-1.5`}
              >
                <span className="text-white font-black text-sm">{letter}</span>
                <span className="text-white/70 text-xs hidden sm:block">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {soapFields.map((f) => (
              <SOAPField
                key={f.field}
                {...f}
                value={(soap as any)[f.field]}
                onChange={handleSoap}
                disabled={readOnly}
              />
            ))}
          </div>

          {/* Completeness indicator */}
          {!readOnly && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-xs font-medium text-slate-500">
                  SOAP Completeness
                </span>
                <span className="text-xs text-slate-400">
                  {
                    [
                      soap.subjective,
                      soap.objective,
                      soap.assessment,
                      soap.plan,
                    ].filter(Boolean).length
                  }
                  /4 fields filled
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500 rounded-full transition-all duration-700"
                  style={{
                    width: `${([soap.subjective, soap.objective, soap.assessment, soap.plan].filter(Boolean).length / 4) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Clinical Findings & Recommendations ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setDiagnosisExpanded(!diagnosisExpanded)}
          className="w-full px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-slate-800">
                Findings & Recommendations
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Detailed clinical findings and patient instructions
              </p>
            </div>
          </div>
          {diagnosisExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {diagnosisExpanded && (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">
                  Clinical Findings
                </label>
                <textarea
                  rows={3}
                  disabled={readOnly}
                  value={clinical.findings}
                  onChange={(e) => handleClinical("findings", e.target.value)}
                  placeholder="Detailed intra-oral and extra-oral findings, radiographic observations…"
                  className={`w-full rounded-xl border-2 px-4 py-3 text-sm resize-none focus:outline-none transition-all leading-relaxed
                    ${readOnly ? "border-slate-100 bg-slate-50 text-slate-500" : "border-slate-200 bg-white text-slate-800 focus:border-blue-400 hover:border-slate-300"}
                    placeholder:text-slate-300`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">
                  Patient Recommendations
                </label>
                <textarea
                  rows={3}
                  disabled={readOnly}
                  value={clinical.recommendations}
                  onChange={(e) =>
                    handleClinical("recommendations", e.target.value)
                  }
                  placeholder="Post-treatment instructions, dietary advice, oral hygiene recommendations, follow-up schedule…"
                  className={`w-full rounded-xl border-2 px-4 py-3 text-sm resize-none focus:outline-none transition-all leading-relaxed
                    ${readOnly ? "border-slate-100 bg-slate-50 text-slate-500" : "border-slate-200 bg-white text-slate-800 focus:border-blue-400 hover:border-slate-300"}
                    placeholder:text-slate-300`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ReadOnly notice */}
      {readOnly && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>This visit is completed. Clinical notes are read-only.</span>
        </div>
      )}
    </div>
  );
}
