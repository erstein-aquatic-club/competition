/**
 * BodySvg — Interactive SVG body silhouette with tappable pain zones.
 *
 * Clean geometric outline (Apple Health style) with circles for joints.
 * Two views: front and back. Each zone cycles through 3 intensity levels on tap.
 */

import { useCallback } from "react";

// ── Zone definitions ──────────────────────────────────────────

export interface BodyZone {
  id: string;
  label: string;
  side: "front" | "back";
}

export const BODY_ZONES: BodyZone[] = [
  // Front
  { id: "left_shoulder", label: "Épaule G", side: "front" },
  { id: "right_shoulder", label: "Épaule D", side: "front" },
  { id: "left_elbow", label: "Coude G", side: "front" },
  { id: "right_elbow", label: "Coude D", side: "front" },
  { id: "left_wrist", label: "Poignet G", side: "front" },
  { id: "right_wrist", label: "Poignet D", side: "front" },
  { id: "left_hip", label: "Hanche G", side: "front" },
  { id: "right_hip", label: "Hanche D", side: "front" },
  { id: "left_knee", label: "Genou G", side: "front" },
  { id: "right_knee", label: "Genou D", side: "front" },
  { id: "left_ankle", label: "Cheville G", side: "front" },
  { id: "right_ankle", label: "Cheville D", side: "front" },
  // Back
  { id: "neck", label: "Nuque", side: "back" },
  { id: "upper_back", label: "Dos haut", side: "back" },
  { id: "lower_back", label: "Lombaires", side: "back" },
  { id: "left_calf", label: "Mollet G", side: "back" },
];

// ── Positions on the SVG (viewBox 0 0 200 400) ───────────────

interface ZonePos {
  cx: number;
  cy: number;
  r: number;
}

const FRONT_POSITIONS: Record<string, ZonePos> = {
  left_shoulder:  { cx: 68,  cy: 102, r: 14 },
  right_shoulder: { cx: 132, cy: 102, r: 14 },
  left_elbow:     { cx: 52,  cy: 168, r: 12 },
  right_elbow:    { cx: 148, cy: 168, r: 12 },
  left_wrist:     { cx: 40,  cy: 228, r: 10 },
  right_wrist:    { cx: 160, cy: 228, r: 10 },
  left_hip:       { cx: 82,  cy: 230, r: 14 },
  right_hip:      { cx: 118, cy: 230, r: 14 },
  left_knee:      { cx: 84,  cy: 310, r: 13 },
  right_knee:     { cx: 116, cy: 310, r: 13 },
  left_ankle:     { cx: 84,  cy: 378, r: 10 },
  right_ankle:    { cx: 116, cy: 378, r: 10 },
};

const BACK_POSITIONS: Record<string, ZonePos> = {
  neck:           { cx: 100, cy: 78,  r: 13 },
  upper_back:     { cx: 100, cy: 130, r: 18 },
  lower_back:     { cx: 100, cy: 200, r: 16 },
  left_calf:      { cx: 84,  cy: 345, r: 14 },
};

// ── Intensity colors ──────────────────────────────────────────

function intensityColor(intensity: number): string {
  switch (intensity) {
    case 1: return "rgba(234, 179, 8, 0.7)";    // yellow
    case 2: return "rgba(249, 115, 22, 0.75)";   // orange
    case 3: return "rgba(239, 68, 68, 0.8)";     // red
    default: return "transparent";
  }
}

function intensityStroke(intensity: number): string {
  switch (intensity) {
    case 1: return "#ca8a04";
    case 2: return "#ea580c";
    case 3: return "#dc2626";
    default: return "transparent";
  }
}

// For view mode: map a frequency/count to opacity
function frequencyOpacity(count: number): number {
  if (count >= 5) return 0.9;
  if (count >= 3) return 0.7;
  if (count >= 2) return 0.5;
  return 0.3;
}

// ── Props ─────────────────────────────────────────────────────

export interface BodySvgProps {
  selectedZones: Record<string, number>; // zone_id -> intensity (1-3)
  onZoneToggle: (zoneId: string, intensity: number | null) => void;
  mode?: "edit" | "view";
  viewData?: Record<string, number>; // for view mode: zone -> frequency/intensity
  side: "front" | "back";
}

// ── Body outline paths ────────────────────────────────────────

function FrontBody() {
  return (
    <g stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3">
      {/* Head */}
      <ellipse cx="100" cy="42" rx="22" ry="26" />
      {/* Neck */}
      <line x1="92" y1="68" x2="92" y2="82" />
      <line x1="108" y1="68" x2="108" y2="82" />
      {/* Torso */}
      <path d="M68,88 L68,230 Q68,240 80,242 L90,244 Q100,246 110,244 L120,242 Q132,240 132,230 L132,88 Q132,82 120,82 L80,82 Q68,82 68,88Z" />
      {/* Left arm */}
      <path d="M68,92 Q50,100 48,130 Q46,155 50,168 Q52,185 44,228" strokeLinecap="round" />
      {/* Right arm */}
      <path d="M132,92 Q150,100 152,130 Q154,155 150,168 Q148,185 156,228" strokeLinecap="round" />
      {/* Left leg */}
      <path d="M82,242 Q78,270 80,310 Q82,350 82,380" strokeLinecap="round" />
      {/* Right leg */}
      <path d="M118,242 Q122,270 120,310 Q118,350 118,380" strokeLinecap="round" />
    </g>
  );
}

function BackBody() {
  return (
    <g stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3">
      {/* Head */}
      <ellipse cx="100" cy="42" rx="22" ry="26" />
      {/* Neck */}
      <line x1="92" y1="68" x2="92" y2="82" />
      <line x1="108" y1="68" x2="108" y2="82" />
      {/* Torso */}
      <path d="M68,88 L68,230 Q68,240 80,242 L90,244 Q100,246 110,244 L120,242 Q132,240 132,230 L132,88 Q132,82 120,82 L80,82 Q68,82 68,88Z" />
      {/* Spine line */}
      <line x1="100" y1="82" x2="100" y2="242" strokeDasharray="4,4" opacity="0.4" />
      {/* Left arm */}
      <path d="M68,92 Q50,100 48,130 Q46,155 50,168 Q52,185 44,228" strokeLinecap="round" />
      {/* Right arm */}
      <path d="M132,92 Q150,100 152,130 Q154,155 150,168 Q148,185 156,228" strokeLinecap="round" />
      {/* Left leg */}
      <path d="M82,242 Q78,270 80,310 Q82,340 82,380" strokeLinecap="round" />
      {/* Right leg */}
      <path d="M118,242 Q122,270 120,310 Q118,340 118,380" strokeLinecap="round" />
    </g>
  );
}

// ── Component ─────────────────────────────────────────────────

export function BodySvg({
  selectedZones,
  onZoneToggle,
  mode = "edit",
  viewData,
  side,
}: BodySvgProps) {
  const positions = side === "front" ? FRONT_POSITIONS : BACK_POSITIONS;
  const zonesForSide = BODY_ZONES.filter((z) => z.side === side);

  const handleTap = useCallback(
    (zoneId: string) => {
      if (mode !== "edit") return;
      const current = selectedZones[zoneId] ?? 0;
      if (current >= 3) {
        onZoneToggle(zoneId, null); // deselect
      } else {
        onZoneToggle(zoneId, current + 1);
      }
    },
    [mode, selectedZones, onZoneToggle],
  );

  return (
    <svg
      viewBox="0 0 200 400"
      className="w-full max-w-[180px] h-auto text-foreground"
      role="img"
      aria-label={side === "front" ? "Corps face avant" : "Corps face arrière"}
    >
      {side === "front" ? <FrontBody /> : <BackBody />}

      {zonesForSide.map((zone) => {
        const pos = positions[zone.id];
        if (!pos) return null;

        const intensity = mode === "view"
          ? (viewData?.[zone.id] ? 3 : 0) // in view mode, show red if any
          : (selectedZones[zone.id] ?? 0);

        const viewCount = viewData?.[zone.id] ?? 0;
        const isActive = mode === "view" ? viewCount > 0 : intensity > 0;

        const fillColor = mode === "view" && viewCount > 0
          ? `rgba(239, 68, 68, ${frequencyOpacity(viewCount)})`
          : isActive
            ? intensityColor(intensity)
            : "rgba(148, 163, 184, 0.15)";

        const strokeColor = isActive
          ? (mode === "view" ? "#dc2626" : intensityStroke(intensity))
          : "rgba(148, 163, 184, 0.3)";

        return (
          <g key={zone.id}>
            <circle
              cx={pos.cx}
              cy={pos.cy}
              r={pos.r}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={isActive ? 2 : 1}
              className={mode === "edit" ? "cursor-pointer active:scale-90 transition-transform" : ""}
              onClick={() => handleTap(zone.id)}
              role={mode === "edit" ? "button" : undefined}
              aria-label={zone.label}
              tabIndex={mode === "edit" ? 0 : undefined}
              onKeyDown={mode === "edit" ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleTap(zone.id);
                }
              } : undefined}
            />
            {/* Zone label on hover/active */}
            {isActive && (
              <text
                x={pos.cx}
                y={pos.cy - pos.r - 4}
                textAnchor="middle"
                className="fill-foreground text-[8px] font-semibold pointer-events-none select-none"
              >
                {zone.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
