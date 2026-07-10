// src/pages/visits/components/AddConditionDialog.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FIXED: Multi-tooth support + consistent UiSurface from notation.ts
//
// Changes from original:
//   1. Uses UiSurface from notation.ts (not a local ToothSurface type)
//   2. Uses shared RadialSurfacePicker from SurfacePicker.tsx
//   3. Multi-tooth: iterates selectedTeeth and calls onSubmit per tooth
//   4. Shows clear multi-tooth summary before submission
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Loader2,
  AlertCircle,
  Save,
  Stethoscope,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  conditionsApi,
  type Condition,
  type PatientConditionStatus,
} from '@/lib/api/conditions';
import { staffApi } from '@/lib/api/staff-api';
import { RadialSurfacePicker } from './SurfacePicker';
import type { UiSurface } from '../../../lib/dental/notation';
import { toLocalISODate } from './dentalChartLogic';
import { toast } from '@/components/ui/sonner';
import { extractApiError } from '@/hooks/useApiMutation';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConditionSeverity = 'MILD' | 'MODERATE' | 'SEVERE';

interface Dentist {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

export interface AddConditionSubmitData {
  toothNumbers: number[];
  surfaces: UiSurface[];
  label: string;
  code: string;
  notes?: string;
  conditionId?: string;
  diagnosedAt?: string;
  diagnosedBy?: string;
  severity?: ConditionSeverity;
  status?: PatientConditionStatus;
}

interface AddConditionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTeeth: number[];
  defaultDentistId?: string;
  onSubmit: (data: AddConditionSubmitData) => Promise<void>;
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function AddConditionDialog({
  isOpen,
  onClose,
  selectedTeeth,
  defaultDentistId = '',
  onSubmit,
}: AddConditionDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedCondition, setSelectedCondition] =
    useState<Condition | null>(null);
  const [surfaces, setSurfaces] = useState<UiSurface[]>([]);
  const [status, setStatus] = useState<PatientConditionStatus>('ACTIVE');
  // Local-time default: a UTC split('T')[0] gives yesterday's date during the
  // early-morning hours in any zone ahead of UTC (e.g. UTC+3 Kampala).
  const [diagnosedAt, setDiagnosedAt] = useState(toLocalISODate());
  const [diagnosedBy, setDiagnosedBy] = useState(defaultDentistId);
  const [severity, setSeverity] = useState<ConditionSeverity | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applyMode, setApplyMode] = useState<'all' | 'each'>('all');

  const { data: dentists = [] } = useQuery<Dentist[]>({
    queryKey: ['dentists'],
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
    queryKey: ['conditions', 'active'],
    queryFn: () => conditionsApi.list({ isActive: true }),
    enabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen]);

  useEffect(() => {
    if (defaultDentistId) setDiagnosedBy(defaultDentistId);
  }, [defaultDentistId]);

  const reset = () => {
    setSearch('');
    setSelectedCondition(null);
    setSurfaces([]);
    setStatus('ACTIVE');
    setDiagnosedAt(toLocalISODate());
    setDiagnosedBy(defaultDentistId);
    setSeverity('');
    setNotes('');
    setApplyMode('all');
  };

  const filtered = conditions.filter(
    (c: Condition) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.icd10Code?.toLowerCase().includes(search.toLowerCase()) ||
      c.snodentCode?.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedDentist = (dentists as Dentist[]).find(
    (d) => d.id === diagnosedBy,
  );

  const canSubmit =
    !!selectedCondition &&
    !submitting &&
    selectedTeeth.length > 0 &&
    !(selectedCondition.requiresSurface && surfaces.length === 0);

  // ── Multi-tooth submission: one condition per tooth ────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (applyMode === 'all') {
        // Submit once with all teeth — the parent handler iterates
        await onSubmit({
          toothNumbers: selectedTeeth,
          surfaces,
          label: selectedCondition!.name,
          code:
            selectedCondition!.icd10Code ||
            selectedCondition!.snodentCode ||
            '',
          notes: notes || undefined,
          conditionId: selectedCondition!.id,
          diagnosedAt,
          diagnosedBy: diagnosedBy || undefined,
          severity: severity || undefined,
          status,
        });
      } else {
        // Submit one per tooth for granular control
        for (const tooth of selectedTeeth) {
          await onSubmit({
            toothNumbers: [tooth],
            surfaces,
            label: selectedCondition!.name,
            code:
              selectedCondition!.icd10Code ||
              selectedCondition!.snodentCode ||
              '',
            notes: notes || undefined,
            conditionId: selectedCondition!.id,
            diagnosedAt,
            diagnosedBy: diagnosedBy || undefined,
            severity: severity || undefined,
            status,
          });
        }
      }
      toast.success(
        selectedTeeth.length > 1
          ? `Condition added to ${selectedTeeth.length} teeth`
          : 'Condition added',
      );
      reset();
      onClose();
    } catch (e) {
      // Surface backend error to user — silent console.error left clinicians
      // staring at a frozen dialog with no clue why submit failed.
      const msg = extractApiError(e, 'Failed to add condition');
      toast.error(msg);
      console.error('Failed to add condition:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const toothLabel =
    selectedTeeth.length === 1
      ? `Tooth ${selectedTeeth[0]}`
      : `${selectedTeeth.length} teeth selected`;

  if (!isOpen) return null;

  const lbl: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 4,
    display: 'block',
  };
  const inp: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    background: '#fff',
    color: '#1e293b',
    boxSizing: 'border-box',
  };

  const leftColumnStyle: React.CSSProperties = {
    width: 380,
    minWidth: 380,
    borderRight: '1px solid #e2e8f0',
    paddingRight: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  const rightColumnStyle: React.CSSProperties = {
    flex: 1,
    paddingLeft: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflowY: 'auto',
    paddingRight: 4,
  };

  const scrollableListStyle: React.CSSProperties = {
    maxHeight: 300,
    overflowY: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: 7,
    background: '#fff',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 1000,
          maxWidth: '95vw',
          maxHeight: '92vh',
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: '#1e3a5f',
            color: '#fff',
            padding: '2px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              {selectedCondition ? 'Edit Condition' : 'Add Condition'}
            </h3>
            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#f4f6f8',
                margin: '1px 0 0',
              }}
            >
              {toothLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#93c5fd',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'hidden', flex: 1, padding: '18px 20px' }}>
          <div style={{ display: 'flex', gap: 16, height: '100%' }}>
            {/* LEFT: Search & Condition List */}
            <div style={leftColumnStyle}>
              <div>
                <label style={lbl}>
                  Condition <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute',
                      left: 9,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#9ca3af',
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

              <div style={{ ...scrollableListStyle, flex: 1 }}>
                {isLoading && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '28px',
                      color: '#94a3b8',
                    }}
                  >
                    <Loader2
                      size={22}
                      style={{
                        animation: 'spin 1s linear infinite',
                        marginBottom: 6,
                      }}
                    />
                    <p style={{ fontSize: 12 }}>Loading conditions…</p>
                  </div>
                )}
                {error && !isLoading && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '20px',
                      color: '#dc2626',
                    }}
                  >
                    <AlertCircle size={20} style={{ marginBottom: 6 }} />
                    <p style={{ fontSize: 12, marginBottom: 10 }}>
                      Failed to load conditions
                    </p>
                    <button
                      onClick={() => refetch()}
                      style={{
                        padding: '5px 12px',
                        fontSize: 12,
                        borderRadius: 5,
                        border: '1px solid #dc2626',
                        background: '#fff',
                        color: '#dc2626',
                        cursor: 'pointer',
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!isLoading && !error && filtered.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px',
                      color: '#94a3b8',
                    }}
                  >
                    <AlertCircle
                      size={18}
                      style={{ marginBottom: 6, opacity: 0.5 }}
                    />
                    <p style={{ fontSize: 12 }}>
                      {search
                        ? `No results for "${search}"`
                        : 'Start typing to search conditions'}
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
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f3f4f6',
                        background:
                          selectedCondition?.id === c.id
                            ? '#eff6ff'
                            : '#fff',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedCondition?.id !== c.id)
                          e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        if (selectedCondition?.id !== c.id)
                          e.currentTarget.style.background = '#fff';
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#1e293b',
                          }}
                        >
                          {c.name}
                        </div>
                        {c.description && (
                          <div
                            style={{
                              fontSize: 10,
                              color: '#94a3b8',
                              marginTop: 1,
                            }}
                          >
                            {c.description}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          textAlign: 'right',
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {c.icd10Code && (
                          <div
                            style={{
                              fontSize: 10,
                              fontFamily: 'monospace',
                              color: '#6b7280',
                            }}
                          >
                            {c.icd10Code}
                          </div>
                        )}
                        {c.requiresSurface && (
                          <div style={{ fontSize: 9, color: '#f59e0b' }}>
                            Requires surface
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* RIGHT: Form Fields */}
            <div style={rightColumnStyle}>
              {/* Selected condition badge */}
              {selectedCondition && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 7,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1e40af',
                    }}
                  >
                    {selectedCondition.name}
                  </span>
                  <div
                    style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                  >
                    {selectedCondition.icd10Code && (
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: '#1d4ed8',
                        }}
                      >
                        ICD-10: {selectedCondition.icd10Code}
                      </span>
                    )}
                    {selectedCondition.snodentCode && (
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: '#94a3b8',
                        }}
                      >
                        SNODENT: {selectedCondition.snodentCode}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Date + Provider */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <div>
                  <label style={lbl}>
                    Date <span style={{ color: '#dc2626' }}>*</span>
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
                  <div style={{ position: 'relative' }}>
                    <Stethoscope
                      size={13}
                      style={{
                        position: 'absolute',
                        left: 9,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#9ca3af',
                        pointerEvents: 'none',
                      }}
                    />
                    <select
                      value={diagnosedBy}
                      onChange={(e) => setDiagnosedBy(e.target.value)}
                      style={{ ...inp, paddingLeft: 28, cursor: 'pointer' }}
                    >
                      <option value="">Select provider…</option>
                      {(dentists as Dentist[]).map((d) => (
                        <option key={d.id} value={d.id}>
                          Dr. {d.firstName} {d.lastName}
                          {d.specialization
                            ? ` — ${d.specialization}`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedDentist && (
                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 8px',
                        borderRadius: 5,
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#0ea5e9',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
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
                          color: '#0369a1',
                        }}
                      >
                        Dr. {selectedDentist.firstName}{' '}
                        {selectedDentist.lastName}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status + Severity */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <div>
                  <label style={lbl}>Status</label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(
                        e.target.value as PatientConditionStatus,
                      )
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
                      setSeverity(
                        e.target.value as ConditionSeverity | '',
                      )
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

              {/* ── Multi-tooth display ─────────────────────────────────── */}
              <div>
                <label style={lbl}>
                  Teeth{' '}
                  {selectedTeeth.length > 1 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 400,
                        color: '#3b82f6',
                        marginLeft: 6,
                      }}
                    >
                      {selectedTeeth.length} selected
                    </span>
                  )}
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                    padding: '8px',
                    background: '#f1f5f9',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {selectedTeeth.length === 0 ? (
                    <span
                      style={{ fontSize: 12, color: '#94a3b8' }}
                    >
                      No teeth selected
                    </span>
                  ) : (
                    selectedTeeth
                      .sort((a, b) => a - b)
                      .map((t) => (
                        <span
                          key={t}
                          style={{
                            padding: '3px 8px',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 4,
                            fontFamily: 'monospace',
                          }}
                        >
                          {t}
                        </span>
                      ))
                  )}
                </div>

                {/* Multi-tooth apply mode */}
                {selectedTeeth.length > 1 && (
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    {(
                      [
                        {
                          key: 'all' as const,
                          label: 'Same condition to all teeth at once',
                        },
                        {
                          key: 'each' as const,
                          label: 'One entry per tooth',
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setApplyMode(opt.key)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          fontSize: 11,
                          fontWeight: applyMode === opt.key ? 600 : 400,
                          borderRadius: 6,
                          border: `1.5px solid ${applyMode === opt.key ? '#1d4ed8' : '#e2e8f0'}`,
                          background:
                            applyMode === opt.key
                              ? '#eff6ff'
                              : '#fff',
                          color:
                            applyMode === opt.key
                              ? '#1d4ed8'
                              : '#64748b',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Surfaces */}
              <div>
                <label style={{ ...lbl, marginBottom: 10 }}>
                  Surfaces{' '}
                  {selectedCondition?.requiresSurface && (
                    <span style={{ color: '#dc2626' }}>*</span>
                  )}
                </label>
                <RadialSurfacePicker
                  value={surfaces}
                  onChange={setSurfaces}
                />
                {selectedCondition?.requiresSurface &&
                  surfaces.length === 0 && (
                    <p
                      style={{
                        fontSize: 10,
                        color: '#dc2626',
                        marginTop: 8,
                      }}
                    >
                      At least one surface is required for this condition
                    </p>
                  )}
              </div>

              {/* Notes */}
              <div>
                <label style={lbl}>Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Clinical notes…"
                  style={{
                    ...inp,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: 10,
            background: '#f8fafc',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '9px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 2,
              padding: '9px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              background: canSubmit ? '#1e3a5f' : '#e2e8f0',
              color: canSubmit ? '#fff' : '#94a3b8',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            {submitting ? (
              <>
                <Loader2
                  size={14}
                  style={{ animation: 'spin 1s linear infinite' }}
                />{' '}
                Saving…
              </>
            ) : (
              <>
                <Save size={14} /> Save Condition
                {selectedTeeth.length > 1 &&
                  applyMode === 'each' &&
                  ` (${selectedTeeth.length} teeth)`}
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}