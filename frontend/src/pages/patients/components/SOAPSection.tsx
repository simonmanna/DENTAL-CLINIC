// src/pages/visits/components/SOAPSection.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { visitsApi } from '../../../lib/api';
import { FileText, Save, CheckCircle, Clock } from 'lucide-react';

interface SOAPSectionProps {
  visitId: string;
  data: any;
  readOnly?: boolean;
}

interface SOAPData {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

const SOAP_FIELDS = [
  {
    key: 'subjective' as keyof SOAPData,
    label: 'S — Subjective',
    hint: 'Chief complaint, history of present illness, patient-reported symptoms',
    color: 'bg-violet-50 border-violet-100',
    accent: 'text-violet-600',
    badge: 'bg-violet-100 text-violet-700',
  },
  {
    key: 'objective' as keyof SOAPData,
    label: 'O — Objective',
    hint: 'Clinical findings, vitals, diagnostics, measurements',
    color: 'bg-sky-50 border-sky-100',
    accent: 'text-sky-600',
    badge: 'bg-sky-100 text-sky-700',
  },
  {
    key: 'assessment' as keyof SOAPData,
    label: 'A — Assessment',
    hint: 'Diagnosis, differential diagnoses, clinical impression',
    color: 'bg-amber-50 border-amber-100',
    accent: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'plan' as keyof SOAPData,
    label: 'P — Plan',
    hint: 'Treatment plan, referrals, patient education, follow-up',
    color: 'bg-emerald-50 border-emerald-100',
    accent: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
];

export function SOAPSection({ visitId, data, readOnly }: SOAPSectionProps) {
  const qc = useQueryClient();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [soap, setSOAP] = useState<SOAPData>({
    subjective: data?.subjective || '',
    objective: data?.objective || '',
    assessment: data?.assessment || '',
    plan: data?.plan || '',
  });

  // Sync when visit data loads
  useEffect(() => {
    if (data) {
      setSOAP({
        subjective: data.subjective || '',
        objective: data.objective || '',
        assessment: data.assessment || '',
        plan: data.plan || '',
      });
    }
  }, [data?.id]);

  const saveMutation = useMutation({
    mutationFn: (notes: SOAPData) => visitsApi.updateSOAP(visitId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', visitId] });
      setSavedAt(new Date());
      setIsDirty(false);
    },
  });

  const handleChange = (key: keyof SOAPData, value: string) => {
    setSOAP(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);

    // Auto-save after 2 seconds of inactivity
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveMutation.mutate({ ...soap, [key]: value });
    }, 2000);
  };

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    saveMutation.mutate(soap);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">SOAP Notes</span>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle className="w-3.5 h-3.5" />
              Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-amber-500">
              <Clock className="w-3.5 h-3.5" />
              Unsaved changes
            </span>
          )}
          {!readOnly && (
            <button
              onClick={handleManualSave}
              disabled={saveMutation.isPending || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* SOAP Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SOAP_FIELDS.map(field => (
          <div
            key={field.key}
            className={`rounded-xl border p-4 ${field.color} transition-shadow hover:shadow-sm`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${field.badge}`}>
                {field.label.split(' — ')[0]}
              </span>
              <span className={`text-xs font-semibold ${field.accent}`}>
                {field.label.split(' — ')[1]}
              </span>
            </div>
            <textarea
              className="w-full bg-white/70 border border-white/80 rounded-lg p-3 text-sm text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all leading-relaxed"
              rows={5}
              placeholder={field.hint}
              value={soap[field.key]}
              readOnly={readOnly}
              disabled={readOnly}
              onChange={e => handleChange(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
