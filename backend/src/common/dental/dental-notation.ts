// src/common/dental/dental-notation.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for tooth numbering + surfaces across the whole system.
//
// CANONICAL NOTATION: FDI / ISO-3950 (two-digit).
//   - Permanent:  11-18, 21-28, 31-38, 41-48
//   - Primary:    51-55, 61-65, 71-75, 81-85
//
// CANONICAL SURFACES: the 9-value Prisma `ToothSurface` enum. No lossy 1-letter
// collapsing anywhere in persisted data. The 1-letter codes are a UI-only
// concern handled by an explicit, NON-lossy bidirectional map (see below).
// ─────────────────────────────────────────────────────────────────────────────

export const FDI_PERMANENT: ReadonlySet<number> = new Set<number>([
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]);

export const FDI_PRIMARY: ReadonlySet<number> = new Set<number>([
  51, 52, 53, 54, 55,
  61, 62, 63, 64, 65,
  71, 72, 73, 74, 75,
  81, 82, 83, 84, 85,
]);

export const FDI_ALL: ReadonlySet<number> = new Set<number>([
  ...FDI_PERMANENT,
  ...FDI_PRIMARY,
]);

export type Dentition = 'PERMANENT' | 'PRIMARY';

export function isValidFdiTooth(n: number): boolean {
  return Number.isInteger(n) && FDI_ALL.has(n);
}

export function getDentition(fdi: number): Dentition | null {
  if (FDI_PERMANENT.has(fdi)) return 'PERMANENT';
  if (FDI_PRIMARY.has(fdi)) return 'PRIMARY';
  return null;
}

export function getQuadrant(fdi: number): number | null {
  if (!isValidFdiTooth(fdi)) return null;
  return Math.floor(fdi / 10); // 1-4 permanent, 5-8 primary
}

export function getArch(fdi: number): 'UPPER' | 'LOWER' | null {
  const q = getQuadrant(fdi);
  if (q === null) return null;
  return q === 1 || q === 2 || q === 5 || q === 6 ? 'UPPER' : 'LOWER';
}

// ── Universal (US) ↔ FDI bridge ──────────────────────────────────────────────
// We persist ONLY FDI. This bridge exists so a US-numbering UI can still
// interoperate without ever writing Universal numbers to the database.

const UNIVERSAL_TO_FDI_PERMANENT: Record<number, number> = {
  1: 18, 2: 17, 3: 16, 4: 15, 5: 14, 6: 13, 7: 12, 8: 11,
  9: 21, 10: 22, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28,
  17: 38, 18: 37, 19: 36, 20: 35, 21: 34, 22: 33, 23: 32, 24: 31,
  25: 41, 26: 42, 27: 43, 28: 44, 29: 45, 30: 46, 31: 47, 32: 48,
};

const FDI_TO_UNIVERSAL_PERMANENT: Record<number, number> = Object.fromEntries(
  Object.entries(UNIVERSAL_TO_FDI_PERMANENT).map(([u, f]) => [f, Number(u)]),
);

// Primary teeth: Universal uses letters A-T. We expose them as the letter.
const UNIVERSAL_LETTER_TO_FDI_PRIMARY: Record<string, number> = {
  A: 55, B: 54, C: 53, D: 52, E: 51,
  F: 61, G: 62, H: 63, I: 64, J: 65,
  K: 75, L: 74, M: 73, N: 72, O: 71,
  P: 81, Q: 82, R: 83, S: 84, T: 85,
};
const FDI_PRIMARY_TO_UNIVERSAL_LETTER: Record<number, string> =
  Object.fromEntries(
    Object.entries(UNIVERSAL_LETTER_TO_FDI_PRIMARY).map(([l, f]) => [f, l]),
  );

export function universalToFdi(value: number | string): number | null {
  if (typeof value === 'string') {
    const f = UNIVERSAL_LETTER_TO_FDI_PRIMARY[value.toUpperCase()];
    return f ?? null;
  }
  return UNIVERSAL_TO_FDI_PERMANENT[value] ?? null;
}

export function fdiToUniversal(fdi: number): number | string | null {
  if (FDI_PERMANENT.has(fdi)) return FDI_TO_UNIVERSAL_PERMANENT[fdi] ?? null;
  if (FDI_PRIMARY.has(fdi)) return FDI_PRIMARY_TO_UNIVERSAL_LETTER[fdi] ?? null;
  return null;
}

// ── Tooth names (FDI-keyed, single definition) ───────────────────────────────

const FDI_TOOTH_NAMES: Record<number, string> = {
  11: 'UR Central Incisor', 12: 'UR Lateral Incisor', 13: 'UR Canine',
  14: 'UR 1st Premolar', 15: 'UR 2nd Premolar', 16: 'UR 1st Molar',
  17: 'UR 2nd Molar', 18: 'UR 3rd Molar',
  21: 'UL Central Incisor', 22: 'UL Lateral Incisor', 23: 'UL Canine',
  24: 'UL 1st Premolar', 25: 'UL 2nd Premolar', 26: 'UL 1st Molar',
  27: 'UL 2nd Molar', 28: 'UL 3rd Molar',
  31: 'LL Central Incisor', 32: 'LL Lateral Incisor', 33: 'LL Canine',
  34: 'LL 1st Premolar', 35: 'LL 2nd Premolar', 36: 'LL 1st Molar',
  37: 'LL 2nd Molar', 38: 'LL 3rd Molar',
  41: 'LR Central Incisor', 42: 'LR Lateral Incisor', 43: 'LR Canine',
  44: 'LR 1st Premolar', 45: 'LR 2nd Premolar', 46: 'LR 1st Molar',
  47: 'LR 2nd Molar', 48: 'LR 3rd Molar',
  51: 'UR Primary Central Incisor', 52: 'UR Primary Lateral Incisor',
  53: 'UR Primary Canine', 54: 'UR Primary 1st Molar', 55: 'UR Primary 2nd Molar',
  61: 'UL Primary Central Incisor', 62: 'UL Primary Lateral Incisor',
  63: 'UL Primary Canine', 64: 'UL Primary 1st Molar', 65: 'UL Primary 2nd Molar',
  71: 'LL Primary Central Incisor', 72: 'LL Primary Lateral Incisor',
  73: 'LL Primary Canine', 74: 'LL Primary 1st Molar', 75: 'LL Primary 2nd Molar',
  81: 'LR Primary Central Incisor', 82: 'LR Primary Lateral Incisor',
  83: 'LR Primary Canine', 84: 'LR Primary 1st Molar', 85: 'LR Primary 2nd Molar',
};

export function getFdiToothName(fdi: number): string {
  return FDI_TOOTH_NAMES[fdi] ?? `Tooth ${fdi}`;
}

export type ToothKind = 'molar' | 'premolar' | 'canine' | 'incisor';

export function getToothKind(fdi: number): ToothKind {
  const pos = fdi % 10; // 1=central .. 8=3rd molar
  if (FDI_PRIMARY.has(fdi)) {
    if (pos <= 2) return 'incisor';
    if (pos === 3) return 'canine';
    return 'molar'; // primary 4,5 are molars
  }
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (pos <= 5) return 'premolar';
  return 'molar';
}

// ── Surfaces — canonical 9-value enum, NON-lossy UI bridge ───────────────────
// Prisma enum ToothSurface:
//   FACIAL LINGUAL PALATAL MESIAL DISTAL OCCLUSAL INCISAL BUCCAL LABIAL

export const TOOTH_SURFACES = [
  'MESIAL', 'DISTAL', 'OCCLUSAL', 'INCISAL',
  'BUCCAL', 'LABIAL', 'FACIAL', 'LINGUAL', 'PALATAL',
] as const;

export type CanonicalSurface = (typeof TOOTH_SURFACES)[number];

export function isValidSurface(s: string): s is CanonicalSurface {
  return (TOOTH_SURFACES as readonly string[]).includes(s);
}

// Anterior teeth bite with INCISAL + LABIAL; posteriors with OCCLUSAL + BUCCAL.
// Tongue side is LINGUAL (lower) / PALATAL (upper). We resolve the correct
// canonical surface from a short UI code USING the tooth, so nothing is lost.
//
// UI codes:  M D O I B L  (+ explicit P only if you choose to expose it)
// We keep the UI minimal but resolve to the anatomically-correct enum value.

export function uiCodeToCanonical(
  code: string,
  fdi: number,
): CanonicalSurface | null {
  const kind = getToothKind(fdi);
  const isAnterior = kind === 'incisor' || kind === 'canine';
  const arch = getArch(fdi);
  switch (code.toUpperCase()) {
    case 'M':
      return 'MESIAL';
    case 'D':
      return 'DISTAL';
    // O and I are one anatomical concept (the biting surface); the correct
    // enum value follows the tooth, not the code the client sent.
    case 'O':
    case 'I':
      return isAnterior ? 'INCISAL' : 'OCCLUSAL';
    case 'B': // cheek/lip side
      return isAnterior ? 'LABIAL' : 'BUCCAL';
    case 'L': // tongue side
      return arch === 'UPPER' ? 'PALATAL' : 'LINGUAL';
    case 'F':
      return 'FACIAL';
    case 'P':
      return 'PALATAL';
    default:
      return null;
  }
}

export function canonicalToUiCode(surface: string): string {
  switch (surface) {
    case 'MESIAL':
      return 'M';
    case 'DISTAL':
      return 'D';
    case 'OCCLUSAL':
      return 'O';
    case 'INCISAL':
      return 'I';
    case 'BUCCAL':
    case 'LABIAL':
    case 'FACIAL':
      return 'B';
    case 'LINGUAL':
    case 'PALATAL':
      return 'L';
    default:
      return '?';
  }
}

// Standard charting order M, O/I, D, B, L keyed by display letter — a tooth
// never carries both O and I, so they share a slot.
const SURFACE_ORDER: Record<string, number> = { M: 0, O: 1, I: 1, D: 2, B: 3, L: 4 };

// A bite surface stored on the wrong tooth type (INCISAL on a molar, OCCLUSAL
// on an incisor — legacy rows saved before O/I resolution existed) is folded
// onto the tooth's real bite surface. Side surfaces are never remapped.
function toAnatomicalBite(s: CanonicalSurface, fdi: number): CanonicalSurface {
  if (s !== 'INCISAL' && s !== 'OCCLUSAL') return s;
  const kind = getToothKind(fdi);
  return kind === 'incisor' || kind === 'canine' ? 'INCISAL' : 'OCCLUSAL';
}

// Normalize an arbitrary surface array (from any layer) to canonical enum
// values, given the tooth. Drops anything unrecognized rather than guessing.
// Output is deduped and sorted in standard charting order.
export function normalizeSurfaces(
  raw: (string | null | undefined)[] | null | undefined,
  fdi: number,
): CanonicalSurface[] {
  if (!raw) return [];
  const out: CanonicalSurface[] = [];
  for (const r of raw) {
    if (!r) continue;
    if (isValidSurface(r)) {
      const fixed = toAnatomicalBite(r, fdi);
      if (!out.includes(fixed)) out.push(fixed);
      continue;
    }
    const resolved = uiCodeToCanonical(r, fdi);
    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out.sort(
    (a, b) =>
      (SURFACE_ORDER[canonicalToUiCode(a)] ?? 9) -
      (SURFACE_ORDER[canonicalToUiCode(b)] ?? 9),
  );
}
