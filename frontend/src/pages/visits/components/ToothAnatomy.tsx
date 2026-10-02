import { memo, useId } from "react";
import { getQuadrant, toothKind } from "../../../lib/dental/notation";
import {
  highestPriorityEntry, isLiveConditionEntry, layerForEntry, pickRestoration,
  resolvePresence, type ChartEntry, type Layer,
} from "./dentalChartLogic";

interface Props {
  fdi: number;
  isUpper: boolean;
  entries: ChartEntry[];
  visibleLayers: Record<Layer, boolean>;
  colors: Record<Layer, { c: string; light: string }>;
}

/** Facial view. Upper roots point up; lower roots point down. Surface charting
 * is a separate occlusal view, so facial anatomy never doubles as a surface map.
 * Presence is resolved from the full record, independently of paint filters. */
export const ToothAnatomy = memo(function ToothAnatomy({ fdi, isUpper, entries, visibleLayers, colors }: Props) {
  const id = useId().replace(/:/g, "");
  const kind = toothKind(fdi);
  const pos = fdi % 10;
  const presence = resolvePresence(entries);
  const live = entries.filter(e => e.status === "ACTIVE" && isLiveConditionEntry(e) && visibleLayers[layerForEntry(e)]);
  const treatment = highestPriorityEntry(live.filter(e => e.type !== "CONDITION" && !e.surfaces.length));
  const restoration = pickRestoration(live.filter(e => e.type !== "CONDITION"));
  const rootCanal = highestPriorityEntry(live.filter(e => /^D33[123]0$/.test(e.code ?? "") || /root canal|rct|endodont/i.test(e.label)));
  const color = treatment ? colors[layerForEntry(treatment)].c : "#738497";
  const absent = presence.primary === "EXTRACTED" || presence.primary === "CONGENITAL";
  const implant = presence.primary === "IMPLANT";
  const pontic = presence.primary === "PONTIC";
  const retained = presence.primary === "RETAINED_ROOT";
  const unerupted = presence.primary === "UNERUPTED";
  const wide = kind === "molar";
  const half = wide ? (pos === 8 ? 20 : 23) : kind === "premolar" ? 17 : kind === "canine" ? 14 : pos === 1 && isUpper ? 17 : 13;
  const l = 32 - half, r = 32 + half;
  const outline = wide
    ? `M${l + 3} 72 Q32 68 ${r - 3} 72 C${r + 1} 79 ${r + 2} 92 ${r - 1} 104 Q${r - 4} 111 ${r - 11} 108 Q32 114 ${l + 11} 108 Q${l - 2} 114 ${l} 101 Q${l - 2} 86 ${l + 3} 72Z`
    : kind === "canine"
      ? `M${l + 2} 71 Q32 67 ${r - 2} 71 Q${r + 3} 85 ${r} 98 Q40 107 32 113 Q24 107 ${l} 98 Q${l - 3} 84 ${l + 2} 71Z`
      : kind === "premolar"
        ? `M${l + 3} 72 Q32 68 ${r - 3} 72 Q${r + 3} 91 ${r - 1} 104 Q40 113 32 107 Q23 113 ${l + 1} 104 Q${l - 3} 90 ${l + 3} 72Z`
        : `M${l + 3} 72 Q32 69 ${r - 3} 72 Q${r + 2} 90 ${r} 108 Q32 113 ${l} 108 Q${l - 2} 90 ${l + 3} 72Z`;
  // Three upper molar roots, two lower molar roots, bifurcated upper first
  // premolars, and a single tapered root for the remaining schematic teeth.
  const roots = wide
    ? [
        `M${l + 3} 77 C${l - 1} 56 ${l + 4} 22 ${l - 1} 9 Q${l + 1} 4 ${l + 6} 14 C${l + 16} 36 25 60 29 76Z`,
        ...(isUpper ? ["M24 75 C24 48 30 31 33 18 Q36 10 37 22 C36 41 42 57 41 76Z"] : []),
        `M35 76 C40 52 ${r - 8} 29 ${r - 4} 12 Q${r + 2} 2 ${r + 1} 15 C${r - 1} 39 ${r + 4} 58 ${r - 3} 77Z`,
      ]
    : kind === "premolar" && isUpper && pos === 4
      ? ["M18 76 C17 52 24 31 23 11 Q25 5 28 16 L33 76Z", "M30 76 C32 49 39 24 40 12 Q44 5 43 20 C41 45 46 61 45 76Z"]
      : [`M${l + 3} 76 C${l} 54 28 30 30 ${kind === "canine" ? 3 : 11} Q33 -1 36 13 C37 36 ${r + 1} 55 ${r - 3} 76Z`];
  const fullCrown = restoration === "CROWN" || restoration === "BRIDGE_RETAINER" || restoration === "DENTURE" || pontic;
  // Surfaces visible from the facial aspect: the facial face itself, both
  // proximal sides (mesial faces the midline) and the occlusal / incisal edge.
  const surfaceTop = (codes: string[]) => highestPriorityEntry(live.filter(e => e.surfaces.some(s => codes.includes(s))));
  const mesialRight = [1, 4, 5, 8].includes(getQuadrant(fdi));
  const facial = surfaceTop(["B"]);
  const mesial = surfaceTop(["M"]);
  const distal = surfaceTop(["D"]);
  const edge = surfaceTop(["O", "I"]);
  const pw = Math.max(6, Math.round(half * 0.45));
  const proximal = (side: "left" | "right") => side === "right"
    ? `M${r + 4} 78H${r - pw}Q${r - pw - 3} 96 ${r - pw} 116H${r + 4}Z`
    : `M${l - 4} 78H${l + pw}Q${l + pw + 3} 96 ${l + pw} 116H${l - 4}Z`;
  return (
    <svg className="dc-anatomy" viewBox="0 0 64 120" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-root`} x1="0" x2="1">
          <stop stopColor="#c9b67e" /><stop offset=".3" stopColor="#f5edcf" />
          <stop offset=".58" stopColor="#fff9e6" /><stop offset="1" stopColor="#c9bb8e" />
        </linearGradient>
        <linearGradient id={`${id}-enamel`} x1="0" x2="1" y2=".2">
          <stop stopColor="#b9c3bd" /><stop offset=".2" stopColor="#eff1e8" />
          <stop offset=".48" stopColor="#fffffa" /><stop offset=".76" stopColor="#eeefe5" /><stop offset="1" stopColor="#b5c0b9" />
        </linearGradient>
        <linearGradient id={`${id}-restoration`} x1="0" x2="1">
          <stop stopColor={color} /><stop offset=".5" stopColor={treatment ? colors[layerForEntry(treatment)].light : "#e2e8f0"} /><stop offset="1" stopColor={color} />
        </linearGradient>
        <clipPath id={`${id}-crown`}><path d={outline} /></clipPath>
      </defs>
      <g transform={isUpper ? undefined : "translate(0 120) scale(1 -1)"}>
        <g opacity={absent ? .16 : unerupted ? .5 : 1}>
          {!implant && !pontic && roots.map((d, i) => (
            <path key={i} d={d} fill={`url(#${id}-root)`} stroke="#baad88" strokeWidth=".8" />
          ))}
          {rootCanal && !implant && !pontic && !absent && (
            <g fill="none" stroke={colors[layerForEntry(rootCanal)].c} strokeWidth="2" strokeLinecap="round">
              <path d={wide ? `M23 86 Q23 50 ${l + 5} 17 M41 86 Q40 50 ${r - 3} 17` : "M32 91 Q32 45 33 15"} />
            </g>
          )}
          {implant && (
            <g opacity={presence.implantPlanned ? .5 : 1} stroke={presence.implantPlanned ? "#dc2626" : "#64748b"} strokeDasharray={presence.implantPlanned ? "3 2" : undefined}>
              <path d="M24 73 L26 17 Q32 9 38 17 L40 73Z" fill="#cbd5e1" />
              {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M25 ${22 + i * 5} l14 -3`} fill="none" strokeWidth="1.5" />)}
              <path d="M24 75V65H40V75" fill="#94a3b8" />
            </g>
          )}
          {!retained && <path d={outline} fill={`url(#${id}-${fullCrown ? "restoration" : "enamel"})`} stroke={fullCrown ? color : "#aeb9ae"} strokeWidth=".9" strokeDasharray={presence.implantPlanned ? "3 2" : undefined} />}
          {retained && <path d={`M${l + 3} 75 Q32 66 ${r - 3} 75 L${r - 4} 81 Q32 77 ${l + 4} 81Z`} fill="#bc996e" stroke="#987d56" />}
          {!retained && !fullCrown && (
            <g clipPath={`url(#${id}-crown)`} fill="none" strokeLinecap="round">
              <path d={`M${l + 6} 79 Q${l + 2} 94 ${l + 5} 103`} stroke="white" strokeWidth="3" opacity=".8" />
              <path d={wide ? "M24 78 Q21 94 25 104 M40 79 Q44 94 40 104" : "M33 77 Q36 90 33 105"} stroke="#b9c2b4" strokeWidth=".8" opacity=".55" />
              <path d={`M${l + 2} 74 Q32 78 ${r - 2} 74`} stroke="#c3bb98" strokeWidth="1.2" />
            </g>
          )}
          {!retained && !absent && (facial || mesial || distal || edge) && (
            <g clipPath={`url(#${id}-crown)`} opacity=".88">
              {facial && <path d={`M${l + 5} 80 Q32 76 ${r - 5} 80 L${r - 5} 98 Q32 102 ${l + 5} 98Z`} fill={colors[layerForEntry(facial)].c} />}
              {mesial && <path d={proximal(mesialRight ? "right" : "left")} fill={colors[layerForEntry(mesial)].c} />}
              {distal && <path d={proximal(mesialRight ? "left" : "right")} fill={colors[layerForEntry(distal)].c} />}
              {edge && <path d="M0 102Q32 99 64 102V120H0Z" fill={colors[layerForEntry(edge)].c} />}
            </g>
          )}
          {restoration === "VENEER" && <path d={outline} fill="#e9d5ff" fillOpacity=".6" stroke="#a855f7" strokeWidth="1.5" />}
          {(pontic || restoration === "BRIDGE_RETAINER") && <path d={`M2 91H${l + 4} M${r - 4} 91H62`} stroke={color} strokeWidth="4" />}
          {restoration === "ORTHODONTIC" && <g stroke="#64748b"><path d="M0 92H64" strokeWidth="1.5" /><rect x="25" y="86" width="14" height="12" rx="2" fill="#dbe4ea" /><path d="M29 87V97M35 87V97" /></g>}
          {restoration === "SEALANT" && <path d={`M${l + 5} 106 Q32 111 ${r - 5} 106`} stroke={color} strokeWidth="3" fill="none" />}
        </g>
        {presence.primary === "EXTRACTED" && <path d="M13 17L51 109M51 17L13 109" stroke="#dc2626" strokeWidth="2.4" strokeLinecap="round" />}
        {presence.primary === "CONGENITAL" && <g stroke="#94a3b8" fill="none" strokeWidth="2"><circle cx="32" cy="91" r="12" /><path d="M23 100L41 82" /></g>}
        {unerupted && <rect x={l - 3} y="7" width={half * 2 + 6} height="107" rx="15" stroke="#8b5cf6" strokeDasharray="4 3" fill="none" />}
        {presence.primary === "SUPERNUMERARY" && <path d="M48 59V75M40 67H56" stroke="#db2777" strokeWidth="3" />}
        {(implant || pontic) && presence.wasExtracted && <path d="M12 68V76H20M52 68V76H44" fill="none" stroke="#b91c1c" strokeWidth="1.5" />}
      </g>
      {implant && presence.wasCongenital && <text x="49" y="15" fill="#0284c7" fontSize="14">∅</text>}
      {(presence.implantPlanned || (unerupted && presence.hasPlannedIntervention)) && <circle cx="53" cy="10" r="3" fill="#dc2626" />}
    </svg>
  );
});
