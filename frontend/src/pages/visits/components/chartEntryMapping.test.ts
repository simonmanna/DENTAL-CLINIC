import { describe, it, expect } from "vitest";
import { toChartEntry } from "./chartEntryMapping";

const row = (over: Record<string, unknown> = {}) => ({
  id: "ce1",
  toothNumber: 16,
  surfaces: ["MESIAL", "OCCLUSAL"],
  type: "CONDITION",
  status: "ACTIVE",
  label: "Caries",
  conditionCode: "K02.1",
  createdAt: "2026-09-05T09:00:00.000Z",
  visitId: "visit-1",
  version: 3,
  ...over,
});

describe("toChartEntry", () => {
  it("carries the visit the row was recorded in", () => {
    expect(toChartEntry(row())?.visitId).toBe("visit-1");
    expect(toChartEntry(row({ visitId: null }))?.visitId).toBeUndefined();
  });

  it("uses the real diagnosis date, not the entry's createdAt", () => {
    const e = toChartEntry(
      row({ diagnosedAt: null, patientCondition: { diagnosedAt: "2026-09-01T10:00:00.000Z", status: "ACTIVE" } }),
    );
    expect(e?.diagnosedAt).toBe("2026-09-01");
    expect(e?.date).toBe("2026-09-05");
  });

  it("leaves diagnosedAt undefined when unknown (no createdAt fallback)", () => {
    expect(toChartEntry(row())?.diagnosedAt).toBeUndefined();
  });

  it("maps canonical surfaces to the tooth's UI codes", () => {
    expect(toChartEntry(row())?.surfaces).toEqual(["M", "O"]);
  });

  it("drops rows of cancelled procedures, invalid teeth and tooth-less conditions", () => {
    expect(
      toChartEntry(row({ type: "PLANNED", treatmentProcedure: { id: "tp1", status: "CANCELLED" } })),
    ).toBeNull();
    expect(toChartEntry(row({ toothNumber: 99 }))).toBeNull();
    expect(toChartEntry(row({ toothNumber: null }))).toBeNull();
  });

  it("keeps a mouth-level procedure row with no tooth", () => {
    const e = toChartEntry(row({ type: "PLANNED", toothNumber: null, surfaces: [] }));
    expect(e?.toothNumbers).toEqual([]);
    expect(e?.surfaces).toEqual([]);
  });

  it("keeps the optimistic-lock version", () => {
    expect(toChartEntry(row())?.version).toBe(3);
  });
});
