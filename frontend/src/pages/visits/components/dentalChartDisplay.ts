import { ARCH, getQuadrant, isPrimary, isValidFdi } from "../../../lib/dental/notation";

export type ToothNumbering = "FDI" | "Universal";

/** Display notation only. All selections, dialogs and persisted IDs stay FDI. */
export function displayToothNumber(fdi: number, notation: ToothNumbering): string {
  if (notation === "FDI" || !isValidFdi(fdi)) return String(fdi);
  const arch = isPrimary(fdi) ? ARCH.primary : ARCH.permanent;
  const sequence = [...arch.upper, ...[...arch.lower].reverse()];
  const index = sequence.indexOf(fdi);
  return isPrimary(fdi) ? String.fromCharCode(65 + index) : String(index + 1);
}

export function quadrantLabel(fdi: number): string {
  return ({ 1: "UR", 2: "UL", 3: "LL", 4: "LR", 5: "UR", 6: "UL", 7: "LL", 8: "LR" })[getQuadrant(fdi)];
}
