import { describe, it, expect } from "vitest";
import { ARCH } from "../../../lib/dental/notation";
import { displayToothNumber } from "./dentalChartDisplay";

describe("chart display notation", () => {
  it("maps the permanent arches in patient-facing order without changing FDI IDs", () => {
    expect(ARCH.permanent.upper.map(t => displayToothNumber(t, "Universal")))
      .toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
    expect(ARCH.permanent.lower.map(t => displayToothNumber(t, "Universal")))
      .toEqual(Array.from({ length: 16 }, (_, i) => String(32 - i)));
    expect(ARCH.permanent.upper.map(t => displayToothNumber(t, "FDI"))).toEqual(ARCH.permanent.upper.map(String));
    expect(ARCH.permanent.lower[0]).toBe(48);
  });
  it("uses A–J above and T–K below for primary teeth", () => {
    expect(ARCH.primary.upper.map(t => displayToothNumber(t, "Universal")).join("")).toBe("ABCDEFGHIJ");
    expect(ARCH.primary.lower.map(t => displayToothNumber(t, "Universal")).join("")).toBe("TSRQPONMLK");
  });
  it("does not give invalid tooth IDs a valid Universal label", () => {
    expect(displayToothNumber(99, "Universal")).toBe("99");
  });
});
