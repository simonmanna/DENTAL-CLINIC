import { describe, it, expect } from "vitest";
import { occlusalGeometry, OCC_VIEW, type SideZone } from "./occlusalGeometry";

const centroid = (points: string) => {
  const pts = points.split(" ").map(p => p.split(",").map(Number));
  return pts.reduce(([x, y], [px, py]) => [x + px / pts.length, y + py / pts.length], [0, 0]);
};
const side = (fdi: number, upper: boolean, z: SideZone) => {
  const [x, y] = centroid(occlusalGeometry(fdi, upper).sectors[z]);
  return { x: x - OCC_VIEW / 2, y: y - OCC_VIEW / 2 };
};

describe("occlusal surface geometry", () => {
  it("turns the mesial surface toward the midline in every quadrant", () => {
    expect(side(16, true, "M").x).toBeGreaterThan(0);
    expect(side(46, false, "M").x).toBeGreaterThan(0);
    expect(side(26, true, "M").x).toBeLessThan(0);
    expect(side(36, false, "M").x).toBeLessThan(0);
    expect(side(55, true, "D").x).toBeLessThan(0);
    expect(side(75, false, "D").x).toBeGreaterThan(0);
  });

  it("turns the buccal surface toward the facial row of its arch", () => {
    expect(side(16, true, "B").y).toBeLessThan(0);
    expect(side(16, true, "L").y).toBeGreaterThan(0);
    expect(side(36, false, "B").y).toBeGreaterThan(0);
    expect(side(36, false, "L").y).toBeLessThan(0);
  });

  it("keeps every outline inside the shared square viewBox", () => {
    for (const fdi of [11, 13, 14, 16, 18, 31, 33, 35, 37, 51, 55, 71, 75]) {
      const upper = Math.floor(fdi / 10) % 2 === 1 || [5, 6].includes(Math.floor(fdi / 10));
      const coords = occlusalGeometry(fdi, upper).outline.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...coords)).toBeLessThanOrEqual(OCC_VIEW);
    }
  });

  it("draws molars wider than incisors and reuses cached geometry", () => {
    const molar = occlusalGeometry(16, true).box, incisor = occlusalGeometry(12, true).box;
    expect(molar.r - molar.l).toBeGreaterThan(incisor.r - incisor.l);
    expect(occlusalGeometry(16, true)).toBe(occlusalGeometry(16, true));
  });
});
