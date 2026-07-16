// src/lib/dental/notation.ts
// ─────────────────────────────────────────────────────────────────────────────
// FRONTEND canonical tooth + surface model. MUST stay in sync with the backend
// src/common/dental/dental-notation.ts. Persisted values are ALWAYS FDI +
// the 9-value surface enum. The 1-letter codes are display-only.
// ─────────────────────────────────────────────────────────────────────────────

export const FDI_PERMANENT = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
] as const;

export const FDI_PRIMARY = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
  85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
] as const;

// Arch rows for rendering (left→right as seen facing the patient)
export const ARCH = {
  permanent: {
    upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
    lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
  },
  primary: {
    upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
    lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
  },
};

const FDI_SET = new Set<number>([...FDI_PERMANENT, ...FDI_PRIMARY]);

export function isValidFdi(n: number): boolean {
  return Number.isInteger(n) && FDI_SET.has(n);
}

export function getQuadrant(fdi: number): number {
  return Math.floor(fdi / 10);
}

export function getArchOf(fdi: number): 'UPPER' | 'LOWER' {
  const q = getQuadrant(fdi);
  return q === 1 || q === 2 || q === 5 || q === 6 ? 'UPPER' : 'LOWER';
}

export function isPrimary(fdi: number): boolean {
  const q = getQuadrant(fdi);
  return q >= 5 && q <= 8;
}

export type ToothKind = 'molar' | 'premolar' | 'canine' | 'incisor';

export function toothKind(fdi: number): ToothKind {
  const pos = fdi % 10;
  if (isPrimary(fdi)) {
    if (pos <= 2) return 'incisor';
    if (pos === 3) return 'canine';
    return 'molar';
  }
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (pos <= 5) return 'premolar';
  return 'molar';
}

const NAMES: Record<number, string> = {
  11: 'UR Central Incisor', 12: 'UR Lateral Incisor', 13: 'UR Canine',
  14: 'UR 1st PM', 15: 'UR 2nd PM', 16: 'UR 1st Molar', 17: 'UR 2nd Molar',
  18: 'UR 3rd Molar', 21: 'UL Central Incisor', 22: 'UL Lateral Incisor',
  23: 'UL Canine', 24: 'UL 1st PM', 25: 'UL 2nd PM', 26: 'UL 1st Molar',
  27: 'UL 2nd Molar', 28: 'UL 3rd Molar', 31: 'LL Central Incisor',
  32: 'LL Lateral Incisor', 33: 'LL Canine', 34: 'LL 1st PM', 35: 'LL 2nd PM',
  36: 'LL 1st Molar', 37: 'LL 2nd Molar', 38: 'LL 3rd Molar',
  41: 'LR Central Incisor', 42: 'LR Lateral Incisor', 43: 'LR Canine',
  44: 'LR 1st PM', 45: 'LR 2nd PM', 46: 'LR 1st Molar', 47: 'LR 2nd Molar',
  48: 'LR 3rd Molar',
  51: 'UR Primary Central', 52: 'UR Primary Lateral', 53: 'UR Primary Canine',
  54: 'UR Primary 1st Molar', 55: 'UR Primary 2nd Molar',
  61: 'UL Primary Central', 62: 'UL Primary Lateral', 63: 'UL Primary Canine',
  64: 'UL Primary 1st Molar', 65: 'UL Primary 2nd Molar',
  71: 'LL Primary Central', 72: 'LL Primary Lateral', 73: 'LL Primary Canine',
  74: 'LL Primary 1st Molar', 75: 'LL Primary 2nd Molar',
  81: 'LR Primary Central', 82: 'LR Primary Lateral', 83: 'LR Primary Canine',
  84: 'LR Primary 1st Molar', 85: 'LR Primary 2nd Molar',
};

export function toothName(fdi: number): string {
  return NAMES[fdi] ?? `Tooth ${fdi}`;
}

// ── Surfaces — canonical enum + NON-lossy bridge ─────────────────────────────

export type CanonicalSurface =
  | 'MESIAL' | 'DISTAL' | 'OCCLUSAL' | 'INCISAL'
  | 'BUCCAL' | 'LABIAL' | 'FACIAL' | 'LINGUAL' | 'PALATAL';

export type UiSurface = 'M' | 'D' | 'O' | 'I' | 'B' | 'L';

export function uiToCanonical(
  code: UiSurface,
  fdi: number,
): CanonicalSurface {
  const kind = toothKind(fdi);
  const anterior = kind === 'incisor' || kind === 'canine';
  const upper = getArchOf(fdi) === 'UPPER';
  switch (code) {
    case 'M': return 'MESIAL';
    case 'D': return 'DISTAL';
    // O and I are one anatomical concept (the biting surface); which enum
    // value is correct depends on the tooth, not on which button was pressed.
    case 'O':
    case 'I': return anterior ? 'INCISAL' : 'OCCLUSAL';
    case 'B': return anterior ? 'LABIAL' : 'BUCCAL';
    case 'L': return upper ? 'PALATAL' : 'LINGUAL';
  }
}

export function canonicalToUi(s: string): UiSurface {
  switch (s) {
    case 'MESIAL': return 'M';
    case 'DISTAL': return 'D';
    case 'OCCLUSAL': return 'O';
    case 'INCISAL': return 'I';
    case 'BUCCAL':
    case 'LABIAL':
    case 'FACIAL': return 'B';
    case 'LINGUAL':
    case 'PALATAL': return 'L';
    default: return 'O';
  }
}

/**
 * Tooth-aware variant of canonicalToUi: legacy rows may hold the wrong bite
 * enum for the tooth (e.g. INCISAL persisted on a molar before save-time
 * resolution existed). Fold O/I onto the tooth's real bite surface so every
 * display agrees with the chart SVG.
 */
export function canonicalToUiForTooth(s: string, fdi: number): UiSurface {
  const ui = canonicalToUi(s);
  return ui === 'I' || ui === 'O' ? biteCode(fdi) : ui;
}

// Display metadata — the ONE map covering all 9 canonical values.
// Every surface render site must go through this (or the helpers below);
// do not redefine local surface tables in components.
export const SURFACE_DISPLAY: Record<CanonicalSurface, { short: UiSurface; label: string }> = {
  MESIAL:   { short: 'M', label: 'Mesial' },
  DISTAL:   { short: 'D', label: 'Distal' },
  OCCLUSAL: { short: 'O', label: 'Occlusal (biting surface)' },
  INCISAL:  { short: 'I', label: 'Incisal (cutting edge)' },
  BUCCAL:   { short: 'B', label: 'Buccal (cheek-side)' },
  LABIAL:   { short: 'B', label: 'Labial (lip-side)' },
  FACIAL:   { short: 'B', label: 'Facial (Buccal / Labial)' },
  LINGUAL:  { short: 'L', label: 'Lingual (tongue-side)' },
  PALATAL:  { short: 'L', label: 'Palatal (palate-side)' },
};

/** 1-letter code for any canonical surface string; tolerant of unknowns. */
export function surfaceShort(s: string): string {
  return SURFACE_DISPLAY[s as CanonicalSurface]?.short ?? s?.[0] ?? '?';
}

/** Friendly label for any canonical surface string. */
export function surfaceLabel(s: string): string {
  return SURFACE_DISPLAY[s as CanonicalSurface]?.label ?? s;
}

// Standard charting order: M, O/I, D, B, L (matches how combos are written —
// "MO", "DO", "MOD"). O and I share a slot; a tooth never has both.
const SURFACE_ORDER: Record<UiSurface, number> = { M: 0, O: 1, I: 1, D: 2, B: 3, L: 4 };

/** Stable sort of 1-letter codes into standard charting order. */
export function sortUiSurfaces(s: readonly UiSurface[]): UiSurface[] {
  // ?? 9 keeps unknown letters (tolerated by surfaceShort) at the end.
  return [...s].sort((a, b) => (SURFACE_ORDER[a] ?? 9) - (SURFACE_ORDER[b] ?? 9));
}

/** Stable sort of canonical surface strings into standard charting order. */
export function sortSurfaces(s: readonly string[]): string[] {
  return [...s].sort(
    (a, b) =>
      (SURFACE_ORDER[surfaceShort(a) as UiSurface] ?? 9) -
      (SURFACE_ORDER[surfaceShort(b) as UiSurface] ?? 9),
  );
}

/** "MD" — standard charting order, deduped by display letter (BUCCAL+LABIAL → one "B"). */
export function formatSurfaces(surfaces?: readonly string[] | null): string {
  if (!surfaces?.length) return '';
  return sortUiSurfaces(
    [...new Set(surfaces.map(surfaceShort))] as UiSurface[],
  ).join('');
}

/** "Labial (lip-side), Distal" — tooltip/long-form text, as-entered order. */
export function formatSurfacesLong(surfaces?: readonly string[] | null): string {
  return surfaces?.map(surfaceLabel).join(', ') ?? '';
}

// The natural biting surface code per tooth (O for posteriors, I for anteriors)
export function biteCode(fdi: number): UiSurface {
  const k = toothKind(fdi);
  return k === 'incisor' || k === 'canine' ? 'I' : 'O';
}

// Structured "tooth is absent" detection — NO string matching.
export const ABSENT_CONDITION_CODES = new Set(['K08.1', 'K00.0']);

export function isToothAbsent(
  entries: { type: string; code?: string; status: string }[],
): boolean {
  return entries.some(
    (e) =>
      e.status === 'ACTIVE' &&
      e.type === 'CONDITION' &&
      e.code != null &&
      ABSENT_CONDITION_CODES.has(e.code),
  );
}