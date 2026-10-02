import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ToothAnatomy } from "./ToothAnatomy";
import type { ChartEntry, Layer } from "./dentalChartLogic";

const layers: Record<Layer, boolean> = { EXISTING: true, PLANNED: true, IN_PROGRESS: true, COMPLETED: true, INACTIVE: true, CONDITION: true, RESOLVED: true };
const colors = Object.fromEntries(Object.keys(layers).map(k => [k, { c: k === "COMPLETED" ? "#123abc" : "#ef4444", light: "#fff" }])) as Record<Layer, { c: string; light: string }>;
const entry = (patch: Partial<ChartEntry>): ChartEntry => ({ id: "test", toothNumbers: [16], type: "CONDITION", status: "ACTIVE", surfaces: [], date: "2026-10-01", label: "Finding", ...patch });
const render = (entries: ChartEntry[] = [], isUpper = true, visibleLayers = layers) => renderToStaticMarkup(<ToothAnatomy fdi={isUpper ? 16 : 46} isUpper={isUpper} entries={entries} visibleLayers={visibleLayers} colors={colors} />);

describe("facial anatomy clinical states", () => {
  it("points upper roots up and lower roots down", () => {
    expect(render()).not.toContain("scale(1 -1)");
    expect(render([], false)).toContain("translate(0 120) scale(1 -1)");
  });
  it("preserves missing tooth markers when the condition paint layer is hidden", () => {
    const html = render([entry({ code: "K08.1" })], true, { ...layers, CONDITION: false });
    expect(html).toContain('d="M13 17L51 109M51 17L13 109"');
  });
  it("does not mark a resolved missing-tooth condition as current", () => {
    expect(render([entry({ code: "K08.1", conditionStatus: "RESOLVED" })])).not.toContain('d="M13 17L51 109M51 17L13 109"');
  });
  it("draws a planned implant differently from a placed implant", () => {
    const planned = render([entry({ type: "PLANNED", code: "D6010", label: "Implant" })]);
    const placed = render([entry({ type: "COMPLETED", code: "D6010", label: "Implant" })]);
    expect(planned).toContain('stroke-dasharray="3 2"');
    expect(placed).not.toContain('stroke-dasharray="3 2"');
  });
  it("shows proximal fillings on the mesial side, which faces the midline", () => {
    const mo = entry({ type: "EXISTING", code: "D2392", label: "Composite", surfaces: ["M", "O"] });
    const q1 = renderToStaticMarkup(<ToothAnatomy fdi={16} isUpper entries={[mo]} visibleLayers={layers} colors={colors} />);
    const q2 = renderToStaticMarkup(<ToothAnatomy fdi={26} isUpper entries={[{ ...mo, toothNumbers: [26] }]} visibleLayers={layers} colors={colors} />);
    expect(q1).toContain('d="M59 78H45');
    expect(q2).toContain('d="M5 78H19');
    expect(q1).toContain('d="M0 102Q32 99 64 102V120H0Z"');
  });
  it("uses the completed color for completed root canals independently of planned layer visibility", () => {
    const html = render([entry({ type: "COMPLETED", code: "D3330", label: "Endodontic therapy" })], true, { ...layers, PLANNED: false });
    expect(html).toContain('stroke="#123abc"');
    expect(html).toContain('stroke-linecap="round"');
  });
});
