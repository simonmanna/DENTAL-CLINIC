// Shared prescribing vocabulary: used by the visit Prescription tab and the
// drug form's "Prescribing defaults" section, so a default saved on a drug
// always matches an option the quick-entry row can show.

export const RX_ROUTES = [
  { value: "oral", label: "Oral" },
  { value: "topical", label: "Topical" },
  { value: "sublingual", label: "Sublingual" },
  { value: "buccal", label: "Buccal" },
  { value: "rectal", label: "Rectal" },
  { value: "inhalation", label: "Inhalation" },
  { value: "intravenous", label: "Intravenous" },
  { value: "intramuscular", label: "Intramuscular" },
  { value: "subcutaneous", label: "Subcutaneous" },
  { value: "ophthalmic", label: "Ophthalmic" },
  { value: "otic", label: "Otic (Ear)" },
  { value: "nasal", label: "Nasal" },
];

/** `perDay` drives the quantity auto-calc; 0 = not countable (PRN, weekly…). */
export const RX_FREQUENCIES = [
  { value: "once daily", code: "OD", label: "OD - Once daily", perDay: 1 },
  { value: "twice daily", code: "BD", label: "BD - Twice daily", perDay: 2 },
  { value: "three times daily", code: "TDS", label: "TDS - 3× daily", perDay: 3 },
  { value: "four times daily", code: "QID", label: "QID - 4× daily", perDay: 4 },
  { value: "every 4 hours", code: "Q4H", label: "Q4H - Every 4 hours", perDay: 6 },
  { value: "every 6 hours", code: "Q6H", label: "Q6H - Every 6 hours", perDay: 4 },
  { value: "every 8 hours", code: "Q8H", label: "Q8H - Every 8 hours", perDay: 3 },
  { value: "every 12 hours", code: "Q12H", label: "Q12H - Every 12 hours", perDay: 2 },
  { value: "at bedtime", code: "HS", label: "HS - At bedtime", perDay: 1 },
  { value: "as needed for pain", code: "PRN", label: "PRN - As needed for pain", perDay: 0 },
  { value: "as needed", code: "PRN", label: "PRN - As needed", perDay: 0 },
  { value: "before meals", code: "AC", label: "AC - Before meals", perDay: 3 },
  { value: "after meals", code: "PC", label: "PC - After meals", perDay: 3 },
  { value: "once weekly", code: "1/wk", label: "Once weekly", perDay: 0 },
  { value: "twice weekly", code: "2/wk", label: "Twice weekly", perDay: 0 },
];

export const RX_DURATIONS = [
  { value: "1 day", label: "1 day" },
  { value: "2 days", label: "2 days" },
  { value: "3 days", label: "3 days" },
  { value: "5 days", label: "5 days" },
  { value: "7 days", label: "7 days" },
  { value: "10 days", label: "10 days" },
  { value: "14 days", label: "14 days" },
  { value: "21 days", label: "21 days" },
  { value: "1 month", label: "1 month" },
  { value: "2 months", label: "2 months" },
  { value: "3 months", label: "3 months" },
  { value: "until finished", label: "Until finished" },
  { value: "as directed", label: "As directed" },
];

export function frequencyMeta(value?: string | null) {
  return RX_FREQUENCIES.find((f) => f.value === value);
}

export function routeLabel(value?: string | null) {
  return RX_ROUTES.find((r) => r.value === value)?.label ?? value ?? "";
}

function durationDays(duration: string): number | null {
  const d = duration.toLowerCase();
  const n = parseInt(d.match(/(\d+)/)?.[1] ?? "", 10);
  if (Number.isNaN(n)) return null;
  if (d.includes("week")) return n * 7;
  if (d.includes("month")) return n * 30;
  if (d.includes("day")) return n;
  return null;
}

/**
 * Units to supply: dose × times-per-day × days. Returns null when the
 * combination isn't countable (PRN, "as directed", liquid doses in ml…),
 * so the caller keeps whatever quantity the user typed.
 */
export function calcQuantity(
  dosage: string,
  frequency: string,
  duration: string,
): number | null {
  const perDay = frequencyMeta(frequency)?.perDay ?? 0;
  const days = durationDays(duration);
  if (!perDay || !days) return null;
  if (/\bml\b|\bmg\b|apply|layer/i.test(dosage)) return null;
  const dose = parseFloat(dosage.match(/(\d+(\.\d+)?)/)?.[1] ?? "1");
  const qty = Math.ceil(dose * perDay * days);
  return qty > 0 ? qty : null;
}

/** Default dose text by dosage form when a drug has no saved default. */
export function suggestDosage(form?: string | null): string {
  const f = (form || "").toLowerCase();
  if (f.includes("syrup") || f.includes("suspension")) return "5ml";
  if (f.includes("drop")) return "2 drops";
  if (f.includes("inhaler") || f.includes("spray")) return "1 puff";
  if (f.includes("cream") || f.includes("ointment") || f.includes("gel"))
    return "apply thin layer";
  return "1";
}

/** Route implied by dosage form when a drug has no saved default. */
export function suggestRoute(form?: string | null): string {
  const f = (form || "").toLowerCase();
  if (f.includes("cream") || f.includes("ointment") || f.includes("gel") || f.includes("lotion"))
    return "topical";
  if (f.includes("inhaler")) return "inhalation";
  if (f.includes("injection") || f.includes("infusion")) return "intravenous";
  if (f.includes("suppository")) return "rectal";
  return "oral";
}
