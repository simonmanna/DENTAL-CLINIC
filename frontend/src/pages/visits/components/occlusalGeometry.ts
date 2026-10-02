import { getQuadrant, isPrimary, toothKind } from "../../../lib/dental/notation";

/** Side length of the square occlusal viewBox. Every tooth shares it so the
 * occlusal row lines up across the arch regardless of tooth size. */
export const OCC_VIEW = 64;

type Pt = [number, number];
export type SideZone = "B" | "L" | "M" | "D";

export interface OcclusalGeometry {
  /** Crown outline seen from the biting surface. */
  outline: string;
  /** Central occlusal table (O) or incisal edge (I) zone. */
  table: string;
  /** Fissures, pits and ridges. Decorative only. */
  grooves: string;
  /** Dashed separators between the five surface zones. */
  guides: string;
  /** Wedge-shaped clip regions; each side zone = (outline − table) ∩ sector. */
  sectors: Record<SideZone, string>;
  labels: Record<SideZone | "O", Pt>;
  box: { l: number; r: number; t: number; b: number };
}

/* Shapes are authored in a unit frame: x ∈ [-1, 1] runs distal → mesial and
 * y ∈ [-1, 1] runs buccal → lingual. They are mapped onto the screen per
 * quadrant so mesial always faces the midline and buccal faces the facial row. */
interface ShapeSpec {
  w: number;
  h: number;
  /** Superellipse exponent: 2 = ellipse, higher = squarer, lower = diamond. */
  n: number;
  /** Mesial shift of the buccal half (upper-molar rhomboid). */
  shear?: number;
  /** Narrowing of the lingual half (incisors, lower premolars). */
  taper?: number;
  /** Radial cusp lobes. */
  lobes?: { k: number; phase: number; amp: number };
  table: { a: number; b: number; n: number; cy: number };
  grooves: Pt[][];
}

function shapeSpec(fdi: number, isUpper: boolean): ShapeSpec {
  const kind = toothKind(fdi);
  const pos = fdi % 10;
  const primary = isPrimary(fdi);
  const third = !primary && pos === 8;
  if (kind === "molar") {
    const small = third || (primary && pos === 4);
    return isUpper
      ? {
          w: small ? 42 : 48, h: small ? 42 : 46, n: 3, shear: 0.12,
          lobes: { k: 4, phase: Math.PI / 4, amp: 0.04 },
          table: { a: 0.56, b: 0.46, n: 2.6, cy: 0 },
          grooves: [
            [[0.5, 0.06], [0.05, -0.04], [-0.42, 0.2]],
            [[0.05, -0.04], [0, -0.74]],
            [[-0.42, 0.2], [-0.32, 0.76]],
          ],
        }
      : {
          w: small ? 46 : 52, h: small ? 40 : 44, n: 3.4, taper: 0.06,
          lobes: { k: 5, phase: -Math.PI / 2, amp: 0.035 },
          table: { a: 0.62, b: 0.42, n: 2.8, cy: 0 },
          grooves: [
            [[0.62, 0.02], [0.2, 0], [-0.28, 0.02], [-0.62, 0.04]],
            [[0.2, 0], [0.26, -0.76]],
            [[-0.28, 0.02], [-0.4, -0.72]],
            [[-0.04, 0.01], [0, 0.76]],
          ],
        };
  }
  if (kind === "premolar") {
    return isUpper
      ? {
          w: 36, h: 44, n: 2.3, lobes: { k: 2, phase: Math.PI / 2, amp: 0.04 },
          table: { a: 0.62, b: 0.34, n: 2.2, cy: 0.02 },
          grooves: [[[0.56, 0.06], [0.2, 0.01], [-0.2, 0.01], [-0.56, 0.06]]],
        }
      : {
          w: 34, h: 38, n: 2.2, taper: 0.22,
          table: { a: 0.6, b: 0.3, n: 2.2, cy: 0.05 },
          grooves: [[[0.5, 0.12], [0, 0.04], [-0.5, 0.12]]],
        };
  }
  if (kind === "canine") {
    return {
      w: isUpper ? 32 : 28, h: isUpper ? 34 : 30, n: 1.7, taper: 0.1,
      table: { a: 0.5, b: 0.26, n: 2, cy: -0.15 },
      grooves: [[[0.82, 0.06], [0, -0.24], [-0.82, 0.12]], [[0, -0.24], [0, 0.6]]],
    };
  }
  const central = pos === 1;
  return {
    w: isUpper ? (central ? 38 : 32) : (central ? 26 : 28),
    h: isUpper ? (central ? 28 : 26) : 24,
    n: 2.4, taper: 0.38,
    table: { a: 0.74, b: 0.22, n: 2.4, cy: -0.3 },
    grooves: [[[0.84, -0.3], [0, -0.42], [-0.84, -0.3]], [[0.3, 0.52], [0, 0.66], [-0.3, 0.52]]],
  };
}

const superellipse = (theta: number, n: number): Pt => {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [Math.sign(c) * Math.abs(c) ** (2 / n), Math.sign(s) * Math.abs(s) ** (2 / n)];
};

const skew = ([x, y]: Pt, spec: ShapeSpec): Pt => [
  x * (1 - (spec.taper ?? 0) * (y + 1) / 2) - (spec.shear ?? 0) * y,
  y,
];

const fmt = (pts: Pt[], close = true) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + (close ? "Z" : "");

function inside([x, y]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** First point where the ray from `from` toward `to` leaves `poly`. */
function exit(from: Pt, to: Pt, poly: Pt[]): Pt {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const p: Pt = [from[0] + (to[0] - from[0]) * mid, from[1] + (to[1] - from[1]) * mid];
    if (inside(p, poly)) lo = mid; else hi = mid;
  }
  return [from[0] + (to[0] - from[0]) * lo, from[1] + (to[1] - from[1]) * lo];
}

const cache = new Map<string, OcclusalGeometry>();

export function occlusalGeometry(fdi: number, isUpper: boolean): OcclusalGeometry {
  const key = `${fdi}:${isUpper}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const spec = shapeSpec(fdi, isUpper);
  const STEPS = 72;
  const raw: Pt[] = Array.from({ length: STEPS }, (_, i) => {
    const t = (i / STEPS) * Math.PI * 2;
    const [x, y] = superellipse(t, spec.n);
    const f = spec.lobes ? 1 + spec.lobes.amp * Math.cos(spec.lobes.k * (t - spec.lobes.phase)) : 1;
    return skew([x * f, y * f], spec);
  });
  // Normalise so the outline spans exactly w × h after lobes / shear / taper.
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
  const ox = (Math.max(...xs) + Math.min(...xs)) / 2, sx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const oy = (Math.max(...ys) + Math.min(...ys)) / 2, sy = (Math.max(...ys) - Math.min(...ys)) / 2;

  const mesialSign = [1, 4, 5, 8].includes(getQuadrant(fdi)) ? 1 : -1;
  const c = OCC_VIEW / 2;
  const toScreen = ([x, y]: Pt): Pt => [
    c + ((x - ox) / sx) * (spec.w / 2) * mesialSign,
    c + ((y - oy) / sy) * (spec.h / 2) * (isUpper ? 1 : -1),
  ];
  const unit = (p: Pt) => toScreen(skew(p, spec));

  const outline = raw.map(toScreen);
  const { a, b, n, cy } = spec.table;
  const table = Array.from({ length: 48 }, (_, i) => {
    const [x, y] = superellipse((i / 48) * Math.PI * 2, n);
    return unit([x * a, cy + y * b]);
  });
  const center = unit([0, cy]);

  const l = c - spec.w / 2, r = c + spec.w / 2, t = c - spec.h / 2, bt = c + spec.h / 2;
  const pad = 8;
  const corner = { tl: [l - pad, t - pad], tr: [r + pad, t - pad], br: [r + pad, bt + pad], bl: [l - pad, bt + pad] } as Record<string, Pt>;
  const wedge = (p: Pt, q: Pt) => `${center[0].toFixed(1)},${center[1].toFixed(1)} ${p[0]},${p[1]} ${q[0]},${q[1]}`;
  const top = wedge(corner.tl, corner.tr), bottom = wedge(corner.br, corner.bl);
  const left = wedge(corner.bl, corner.tl), right = wedge(corner.tr, corner.br);
  const buccalTop = isUpper, mesialRight = mesialSign === 1;

  const guides = Object.values(corner).map(k => fmt([exit(center, k, table), exit(center, k, outline)], false)).join("");
  const mid = (toward: Pt): Pt => {
    const p = exit(center, toward, table), q = exit(center, toward, outline);
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  const up = mid([center[0], -OCC_VIEW]), down = mid([center[0], OCC_VIEW * 2]);
  const lt = mid([-OCC_VIEW, center[1]]), rt = mid([OCC_VIEW * 2, center[1]]);

  const geometry: OcclusalGeometry = {
    outline: fmt(outline),
    table: fmt(table),
    grooves: spec.grooves.map(g => fmt(g.map(unit), false)).join(""),
    guides,
    sectors: {
      B: buccalTop ? top : bottom,
      L: buccalTop ? bottom : top,
      M: mesialRight ? right : left,
      D: mesialRight ? left : right,
    },
    labels: {
      O: center,
      B: buccalTop ? up : down,
      L: buccalTop ? down : up,
      M: mesialRight ? rt : lt,
      D: mesialRight ? lt : rt,
    },
    box: { l, r, t, b: bt },
  };
  cache.set(key, geometry);
  return geometry;
}
