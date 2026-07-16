// src/pages/visits/components/SurfacePicker.tsx
// ─────────────────────────────────────────────────────────────────────────────
// SHARED surface picker — single source of truth for surface selection.
//
// Uses UiSurface from notation.ts ('M' | 'D' | 'O' | 'I' | 'B' | 'L').
// All dialogs (AddCondition, AddTreatment, ToothDetailDrawer) import THIS.
//
// Two modes:
//   1. RadialSurfacePicker  — visual radial layout (for conditions / detail)
//   2. CompactSurfacePicker — inline pill buttons  (for treatment dialog)
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { biteCode, type UiSurface } from '../../../lib/dental/notation';

// ── Surface metadata ────────────────────────────────────────────────────────

export const SURFACE_META: {
  key: UiSurface;
  label: string;
  shortLabel: string;
}[] = [
  { key: 'M', label: 'Mesial',   shortLabel: 'M' },
  { key: 'O', label: 'Occlusal', shortLabel: 'O' },
  { key: 'I', label: 'Incisal',  shortLabel: 'I' },
  { key: 'D', label: 'Distal',   shortLabel: 'D' },
  { key: 'B', label: 'Buccal',   shortLabel: 'B' },
  { key: 'L', label: 'Lingual',  shortLabel: 'L' },
];

// ── Combination presets ─────────────────────────────────────────────────────

export const SURFACE_COMBOS: { label: string; surfaces: UiSurface[] }[] = [
  { label: 'DO / DI', surfaces: ['D', 'O'] },
  { label: 'MO / MI', surfaces: ['M', 'O'] },
  { label: 'MOD / MID', surfaces: ['M', 'O', 'D'] },
];

// ── Shared props ────────────────────────────────────────────────────────────

interface SurfacePickerProps {
  value: UiSurface[];
  onChange: (v: UiSurface[]) => void;
  /**
   * FDI numbers of the teeth being charted. When every tooth shares the same
   * bite surface, the picker only offers that surface — O on posteriors,
   * I on anteriors (a molar has no incisal edge). Omitted or mixed selection
   * falls back to offering both.
   */
  teeth?: number[];
}

/** Single bite letter shared by ALL given teeth, or null when mixed/unknown. */
function biteForTeeth(teeth?: number[]): 'O' | 'I' | null {
  if (!teeth?.length) return null;
  // biteCode only ever returns 'O' or 'I' (its signature is the wider UiSurface)
  const codes = new Set(teeth.map((t) => biteCode(t) as 'O' | 'I'));
  return codes.size === 1 ? [...codes][0] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Radial Surface Picker — used in AddConditionDialog, ToothDetailDrawer
// ═══════════════════════════════════════════════════════════════════════════

export function RadialSurfacePicker({ value, onChange, teeth }: SurfacePickerProps) {
  const bite = biteForTeeth(teeth);
  const toggle = (s: UiSurface) =>
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);

  const outerBtn = (
    s: UiSurface,
    label: string,
    style: React.CSSProperties,
  ) => {
    const active = value.includes(s);
    return (
      <button
        key={s}
        type="button"
        title={label}
        onClick={() => toggle(s)}
        style={{
          position: 'absolute',
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: `2px solid ${active ? '#1d4ed8' : '#cbd5e1'}`,
          background: active ? '#1d4ed8' : '#f8fafc',
          color: active ? '#fff' : '#475569',
          fontSize: 10,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
          ...style,
        }}
      >
        {label}
      </button>
    );
  };

  const CENTER = 62;
  const RING = 46;

  const hasO = value.includes('O');
  const hasI = value.includes('I');
  const centerActive = hasO || hasI;
  const handleCenter = () => {
    if (bite) {
      // The tooth's bite surface is unambiguous — plain on/off toggle.
      // Stripping BOTH letters also clears a stale opposite value loaded
      // from a legacy row into an edit dialog.
      const rest = value.filter((x) => x !== 'O' && x !== 'I');
      onChange(centerActive ? rest : [...rest, bite]);
      return;
    }
    if (!hasO && !hasI) onChange([...value, 'O']);
    else if (hasO && !hasI)
      onChange([...value.filter((x) => x !== 'O'), 'I']);
    else onChange(value.filter((x) => x !== 'O' && x !== 'I'));
  };
  const centerLabel = bite ?? (hasO ? 'O' : hasI ? 'I' : 'O/I');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {/* Radial wheel */}
      <div
        style={{
          position: 'relative',
          width: 124,
          height: 124,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '1.5px dashed #e2e8f0',
            background: '#f8fafc',
          }}
        />
        {outerBtn('B', 'B', { top: CENTER - RING - 18, left: CENTER - 18 })}
        {outerBtn('M', 'M', { top: CENTER - 18, left: CENTER - RING - 18 })}
        {outerBtn('D', 'D', { top: CENTER - 18, left: CENTER + RING - 18 })}
        {outerBtn('L', 'L', { top: CENTER + RING - 18, left: CENTER - 18 })}
        <button
          type="button"
          onClick={handleCenter}
          title={
            bite === 'O'
              ? 'Occlusal'
              : bite === 'I'
                ? 'Incisal'
                : 'Occlusal / Incisal — click to cycle'
          }
          style={{
            position: 'absolute',
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: `2px solid ${centerActive ? '#1d4ed8' : '#94a3b8'}`,
            background: centerActive ? '#1d4ed8' : '#e2e8f0',
            color: centerActive ? '#fff' : '#475569',
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            top: CENTER - 21,
            left: CENTER - 21,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
        >
          {centerLabel}
        </button>
      </div>

      {/* Combination presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            marginBottom: 2,
          }}
        >
          Surface combinations
        </p>
        {SURFACE_COMBOS.map((c) => {
          // Presets are written with 'O'; swap in the tooth's real bite letter.
          const surfaces = c.surfaces.map((s) =>
            (s === 'O' || s === 'I') && bite ? bite : s,
          );
          const active =
            surfaces.every((s) => value.includes(s)) &&
            value.length === surfaces.length;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onChange(active ? [] : [...surfaces])}
              style={{
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 600,
                border: `1.5px solid ${active ? '#1d4ed8' : '#d1d5db'}`,
                borderRadius: 5,
                background: active ? '#eff6ff' : '#fff',
                color: active ? '#1d4ed8' : '#374151',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {/* Labels read "DO / DI" — show only the applicable half. */}
              {bite === 'O'
                ? c.label.split(' / ')[0]
                : bite === 'I'
                  ? c.label.split(' / ')[1]
                  : c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Compact Surface Picker — used in AddTreatmentDialog
// ═══════════════════════════════════════════════════════════════════════════

export function CompactSurfacePicker({ value, onChange, teeth }: SurfacePickerProps) {
  const bite = biteForTeeth(teeth);
  // When the bite surface is unambiguous, hide the inapplicable pill and let
  // the remaining one own BOTH letters — so a stale opposite value loaded
  // from a legacy row still reads as selected and can be cleared.
  const meta = bite
    ? SURFACE_META.filter((s) => (s.key === 'O' || s.key === 'I' ? s.key === bite : true))
    : SURFACE_META;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {meta.map((s) => {
        const isBiteKey = s.key === 'O' || s.key === 'I';
        const selected =
          bite && isBiteKey
            ? value.includes('O') || value.includes('I')
            : value.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              if (bite && isBiteKey) {
                const rest = value.filter((v) => v !== 'O' && v !== 'I');
                onChange(selected ? rest : [...rest, bite]);
              } else if (selected) {
                onChange(value.filter((v) => v !== s.key));
              } else {
                onChange([...value, s.key]);
              }
            }}
            style={{
              width: 36,
              height: 30,
              borderRadius: 6,
              border: `1px solid ${selected ? '#1e293b' : '#d1d5db'}`,
              background: selected ? '#1e293b' : '#fff',
              color: selected ? '#fff' : '#64748b',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            aria-pressed={selected}
            title={s.label}
          >
            {s.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

export default RadialSurfacePicker;