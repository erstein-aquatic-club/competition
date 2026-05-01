/**
 * export-pace-pdf.ts — Export PDF allures nageur (§186 refonte colorée).
 *
 * Utilise jsPDF + jspdf-autotable.
 * Palette : STROKE_COLORS_RGB / ZONE_BG_RGB / ZONE_TEXT_RGB depuis pdfPalette.ts.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { PaceTarget } from "@/lib/api/pace-targets";
import type { EventFamily, Zone } from "@/lib/paceData";
import {
  eventFamily,
  computeTMax,
  computeZoneTime,
  getDistanceRowsV2,
  compute4NSegment,
  compute4NCumulative,
} from "@/lib/paceCalculatorV2";
import { convertTargetTime } from "@/lib/poolConversion";
import type { Stroke } from "@/lib/paceCalculator";
import {
  STROKE_COLORS_RGB,
  STROKE_TINTS_RGB,
  ZONE_BG_RGB,
  ZONE_TEXT_RGB,
  PDF_GENERAL,
  type RgbColor,
} from "./pdfPalette";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert stroke label from PaceTarget to pdfPalette key. */
const STROKE_DISPLAY_KEY: Record<Stroke, string> = {
  NL:     "NL",
  Dos:    "Dos",
  Brasse: "Brasse",
  Pap:    "Pap",
  "4N":   "4N",
};

/** Convert Stroke (NL/Dos/Brasse/Pap/4N) to paceCalculatorV2 SingleStroke. */
const STROKE_TO_SINGLE: Partial<Record<Stroke, SingleStroke>> = {
  NL:     "crawl",
  Dos:    "dos",
  Brasse: "brasse",
  Pap:    "papillon",
};

/** 4N sub-segment display labels. */
const SEGMENT_LABELS: Record<SingleStroke, string> = {
  papillon: "Pap",
  dos:      "Dos",
  brasse:   "Brasse",
  crawl:    "NL",
};

/** Format seconds → mm:ss.x or ss.x. */
function fmtTime(s: number): string {
  if (s <= 0) return "—";
  if (s < 60) return s.toFixed(1);
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${rem}`;
}

/** Collect zones ordered for a family, optionally skip V4 if not in data. */
function getZoneCols(
  family: EventFamily,
  zones: Record<EventFamily, Partial<Record<Zone, number>>>,
): Zone[] {
  const allZones: Zone[] = ["V0", "V1", "V2", "V3", "V4", "MAX"];
  const available = zones[family];
  return allZones.filter((z) => available[z] !== undefined);
}

// ─── Page layout constants ────────────────────────────────────────────────────

const MARGIN = 10;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 190 mm
const DIST_COL_W = 22;

// ─── Footer ──────────────────────────────────────────────────────────────────

function drawPageFooter(doc: jsPDF, coachName?: string): void {
  const y = PAGE_H - 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6);
  doc.setTextColor(...PDF_GENERAL.TEXT_MUTED);
  doc.text(
    "Modèle non-linéaire v2 — régles_calcul_allures_natation.docx",
    MARGIN,
    y,
  );
  const dateStr = new Date().toLocaleDateString("fr-FR");
  const right = coachName ? `${dateStr} · Coach : ${coachName}` : dateStr;
  doc.setFont("helvetica", "normal");
  doc.text(right, PAGE_W - MARGIN, y, { align: "right" });
}

// ─── Single-stroke section ────────────────────────────────────────────────────

interface SingleSectionArgs {
  doc: jsPDF;
  target: PaceTarget;
  effectiveTimeMs: number;          // possibly converted
  effectivePool: "25m" | "50m";
  notConvertibleNote: string | null;
  zones: Record<EventFamily, Partial<Record<Zone, number>>>;
  strokeAdjustments: Record<SingleStroke, Record<EventFamily, number>>;
  coachName?: string;
  cursorY: number;
}

/** Returns new cursorY after drawing the section, adding page if needed. */
function drawSingleSection({
  doc,
  target,
  effectiveTimeMs,
  effectivePool,
  notConvertibleNote,
  zones,
  strokeAdjustments,
  coachName,
  cursorY,
}: SingleSectionArgs): number {
  const { stroke, target_distance_m } = target;
  const paletteKey = STROKE_DISPLAY_KEY[stroke as Stroke];
  const strokeColor = STROKE_COLORS_RGB[paletteKey] ?? PDF_GENERAL.CHARCOAL;
  const strokeTint = STROKE_TINTS_RGB[paletteKey] ?? PDF_GENERAL.ROW_ALT;

  const singleStroke = STROKE_TO_SINGLE[stroke as Stroke];
  if (!singleStroke) return cursorY; // safety guard

  const family = eventFamily(target_distance_m);
  const Tobj_s = effectiveTimeMs / 1000;
  const distRows = getDistanceRowsV2(target_distance_m, singleStroke);
  const zoneCols = getZoneCols(family, zones);

  // Estimate section height: header band (18) + divider (1) + header row (9) + rows * 8
  const sectionHeight = 18 + 1 + 9 + distRows.length * 8 + 6;

  if (cursorY + sectionHeight > PAGE_H - 14) {
    doc.addPage();
    drawPageFooter(doc, coachName);
    cursorY = MARGIN;
  }

  // ── Stroke header band ────────────────────────────────────────────────────
  const bandY = cursorY;
  const BADGE_W = 18;
  const BADGE_H = 8;

  // Badge stroke (filled)
  doc.setFillColor(...strokeColor);
  doc.roundedRect(MARGIN, bandY, BADGE_W, BADGE_H, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(paletteKey, MARGIN + BADGE_W / 2, bandY + 5.3, { align: "center" });

  // Distance label
  const distLabel = target_distance_m >= 1000
    ? `${target_distance_m / 1000} km`
    : `${target_distance_m} m`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...PDF_GENERAL.CHARCOAL);
  doc.text(distLabel, MARGIN + BADGE_W + 3, bandY + 7);

  // Pill temps
  const timeStr = fmtTime(Tobj_s);
  const PILL_X = MARGIN + BADGE_W + 3 + 28;
  const PILL_W = 28;
  const PILL_H = 8;
  doc.setFillColor(...PDF_GENERAL.PILL_BG);
  doc.setDrawColor(...PDF_GENERAL.PILL_BORDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(PILL_X, bandY, PILL_W, PILL_H, 2, 2, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_GENERAL.CHARCOAL);
  doc.text(timeStr, PILL_X + PILL_W / 2, bandY + 5.3, { align: "center" });

  // Label bassin
  const poolLabel = notConvertibleNote
    ? notConvertibleNote
    : `Bassin ${effectivePool}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_GENERAL.TEXT_MUTED);
  doc.text(poolLabel, PILL_X + PILL_W + 3, bandY + 5.3);

  // Accent line (stroke color)
  const accentY = bandY + BADGE_H + 2;
  doc.setDrawColor(...strokeColor);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, accentY, MARGIN + CONTENT_W, accentY);

  cursorY = accentY + 2;

  // ── Matrix table ─────────────────────────────────────────────────────────

  // Compute tMax for each distance row
  const tableBody: (string | object)[][] = distRows.map((d) => {
    const tMax_s = computeTMax({
      Tobj_s,
      D: target_distance_m,
      d,
      stroke: singleStroke,
      adjustmentOverrides: strokeAdjustments as Record<SingleStroke, Partial<Record<EventFamily, number>>>,
    });

    const isTargetRow = d === target_distance_m;
    const dLabel = d >= 1000 ? `${d / 1000} km` : `${d} m`;

    const cells: (string | object)[] = [
      {
        content: dLabel,
        styles: {
          fontStyle: isTargetRow ? "bold" : "bold",
          fillColor: isTargetRow ? strokeTint : undefined,
          textColor: PDF_GENERAL.CHARCOAL,
        },
      },
    ];

    for (const zone of zoneCols) {
      const t_s = computeZoneTime({
        tMax_s,
        zone,
        family,
        coefficientsOverride: zones as Record<EventFamily, Partial<Record<Zone, number>>>,
      });
      const isMax = zone === "MAX";
      cells.push({
        content: fmtTime(t_s),
        styles: {
          fontStyle: isMax ? "bold" : "normal",
          fillColor: isTargetRow ? strokeTint : undefined,
          textColor: isMax ? [179, 26, 26] : [64, 64, 77],
        },
      });
    }

    return cells;
  });

  const headRow: (string | object)[] = [
    {
      content: "Distance",
      styles: {
        fillColor: PDF_GENERAL.CHARCOAL,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: "bold" as const,
        halign: "left" as const,
      },
    },
    ...zoneCols.map((zone) => ({
      content: zone,
      styles: {
        fillColor: ZONE_BG_RGB[zone] ?? [240, 240, 240],
        textColor: ZONE_TEXT_RGB[zone] ?? [50, 50, 50],
        fontStyle: "bold" as const,
        halign: "center" as const,
      },
    })),
  ];

  const zoneCount = zoneCols.length;
  const zoneW = (CONTENT_W - DIST_COL_W) / zoneCount;
  const colWidths = [DIST_COL_W, ...Array(zoneCount).fill(zoneW)];

  autoTable(doc, {
    startY: cursorY,
    head: [headRow],
    body: tableBody,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    columnStyles: Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w }])),
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 2 },
      font: "helvetica",
      lineColor: PDF_GENERAL.BORDER_LIGHT,
      lineWidth: 0.2,
      halign: "center" as const,
    },
    headStyles: {
      minCellHeight: 9,
      fontSize: 8,
      lineColor: [154, 154, 166],
      lineWidth: { bottom: 1, top: 0.2, left: 0.2, right: 0.2 },
    },
    alternateRowStyles: {
      fillColor: PDF_GENERAL.ROW_ALT,
    },
    tableLineColor: PDF_GENERAL.BORDER_MED,
    tableLineWidth: 0.8,
    didParseCell: undefined,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursorY = (doc as any).lastAutoTable.finalY + 6;
  return cursorY;
}

// ─── 4N section ──────────────────────────────────────────────────────────────

interface FourNSectionArgs {
  doc: jsPDF;
  target: PaceTarget;
  effectiveTimeMs: number;
  effectivePool: "25m" | "50m";
  notConvertibleNote: string | null;
  zones: Record<EventFamily, Partial<Record<Zone, number>>>;
  strokeAdjustments: Record<SingleStroke, Record<EventFamily, number>>;
  coachName?: string;
  cursorY: number;
}

const FOURNSEG_STROKES: SingleStroke[] = ["papillon", "dos", "brasse", "crawl"];
const FOURNSEG_SEG_DIST_200 = 50;
const FOURNSEG_SEG_DIST_400 = 100;

function draw4NSection({
  doc,
  target,
  effectiveTimeMs,
  effectivePool,
  notConvertibleNote,
  zones,
  strokeAdjustments,
  coachName,
  cursorY,
}: FourNSectionArgs): number {
  const { target_distance_m } = target;
  const mode = target_distance_m === 200 ? "200" : "400";
  const segDist = mode === "200" ? FOURNSEG_SEG_DIST_200 : FOURNSEG_SEG_DIST_400;
  const Tobj_s = effectiveTimeMs / 1000;
  const orangeColor = STROKE_COLORS_RGB["4N"];

  // Ensure page space for badge (at least 25mm for the header band)
  if (cursorY + 25 > PAGE_H - 14) {
    doc.addPage();
    drawPageFooter(doc, coachName);
    cursorY = MARGIN;
  }

  // ── 4N Badge header ───────────────────────────────────────────────────────
  const bandY = cursorY;
  const BADGE_W = 18;
  const BADGE_H = 8;

  doc.setFillColor(...orangeColor);
  doc.roundedRect(MARGIN, bandY, BADGE_W, BADGE_H, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("4N", MARGIN + BADGE_W / 2, bandY + 5.3, { align: "center" });

  const distLabel = `${target_distance_m} m`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...PDF_GENERAL.CHARCOAL);
  doc.text(distLabel, MARGIN + BADGE_W + 3, bandY + 7);

  // Pill temps
  const timeStr = fmtTime(Tobj_s);
  const PILL_X = MARGIN + BADGE_W + 3 + 28;
  const PILL_W = 28;
  const PILL_H = 8;
  doc.setFillColor(...PDF_GENERAL.PILL_BG);
  doc.setDrawColor(...PDF_GENERAL.PILL_BORDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(PILL_X, bandY, PILL_W, PILL_H, 2, 2, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_GENERAL.CHARCOAL);
  doc.text(timeStr, PILL_X + PILL_W / 2, bandY + 5.3, { align: "center" });

  const poolLabel = notConvertibleNote
    ? notConvertibleNote
    : `Bassin ${effectivePool}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_GENERAL.TEXT_MUTED);
  doc.text(poolLabel, PILL_X + PILL_W + 3, bandY + 5.3);

  // Accent line (orange)
  const accentY = bandY + BADGE_H + 2;
  doc.setDrawColor(...orangeColor);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, accentY, MARGIN + CONTENT_W, accentY);

  cursorY = accentY + 3;

  // ── Sub-segments ─────────────────────────────────────────────────────────
  for (const segStroke of FOURNSEG_STROKES) {
    const paletteKey = SEGMENT_LABELS[segStroke];
    const segColor = STROKE_COLORS_RGB[paletteKey] ?? PDF_GENERAL.CHARCOAL;
    const segTint = STROKE_TINTS_RGB[paletteKey] ?? PDF_GENERAL.ROW_ALT;
    const segFamily = eventFamily(segDist);
    const zoneCols = getZoneCols(segFamily, zones);

    // Distance rows for this segment (up to segDist)
    const segRows: number[] = [];
    if (mode === "200") {
      // 50m segments: show 15, 25, 50
      for (const d of [15, 25, 50]) {
        if (d <= segDist) segRows.push(d);
      }
    } else {
      // 100m segments: show 25, 50, 75, 100
      for (const d of [25, 50, 75, 100]) {
        if (d <= segDist) segRows.push(d);
      }
    }

    const sectionHeight = 7 + 7.5 + segRows.length * 7.5 + 5;
    if (cursorY + sectionHeight > PAGE_H - 14) {
      doc.addPage();
      drawPageFooter(doc, coachName);
      cursorY = MARGIN;
    }

    // Mini-band header
    doc.setFillColor(247, 247, 249);
    doc.rect(MARGIN, cursorY, CONTENT_W, 7, "F");

    // Mini badge
    doc.setFillColor(...segColor);
    doc.roundedRect(MARGIN + 2, cursorY + 0.75, 14, 5.5, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(paletteKey, MARGIN + 9, cursorY + 4.2, { align: "center" });

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_GENERAL.CHARCOAL);
    doc.text(
      `${paletteKey} · ${segDist}m`,
      MARGIN + 18,
      cursorY + 4.7,
    );
    cursorY += 7;

    // Mini table
    const tableBody: (string | object)[][] = segRows.map((d) => {
      const tMax_s = compute4NSegment({
        Tobj_4N_s: Tobj_s,
        mode,
        segment_stroke: segStroke,
        d_internal: d,
        adjustmentOverrides: strokeAdjustments as Record<SingleStroke, Partial<Record<EventFamily, number>>>,
      });

      const isTarget = d === segDist;
      const dLabel = `${d} m`;

      const cells: (string | object)[] = [
        {
          content: dLabel,
          styles: {
            fontStyle: "bold" as const,
            fillColor: isTarget ? segTint : undefined,
            textColor: PDF_GENERAL.CHARCOAL,
          },
        },
      ];

      for (const zone of zoneCols) {
        const t_s = computeZoneTime({
          tMax_s,
          zone,
          family: segFamily,
          coefficientsOverride: zones as Record<EventFamily, Partial<Record<Zone, number>>>,
        });
        const isMax = zone === "MAX";
        cells.push({
          content: fmtTime(t_s),
          styles: {
            fontStyle: isMax ? "bold" : "normal",
            fillColor: isTarget ? segTint : undefined,
            textColor: isMax ? [179, 26, 26] : [64, 64, 77],
          },
        });
      }
      return cells;
    });

    const headRow: (string | object)[] = [
      {
        content: "Distance",
        styles: {
          fillColor: PDF_GENERAL.CHARCOAL,
          textColor: [255, 255, 255] as [number, number, number],
          fontStyle: "bold" as const,
          halign: "left" as const,
        },
      },
      ...zoneCols.map((zone) => ({
        content: zone,
        styles: {
          fillColor: ZONE_BG_RGB[zone] ?? [240, 240, 240],
          textColor: ZONE_TEXT_RGB[zone] ?? [50, 50, 50],
          fontStyle: "bold" as const,
          halign: "center" as const,
        },
      })),
    ];

    const zoneCount = zoneCols.length;
    const zoneW = (CONTENT_W - DIST_COL_W) / zoneCount;
    const colWidths = [DIST_COL_W, ...Array(zoneCount).fill(zoneW)];

    autoTable(doc, {
      startY: cursorY,
      head: [headRow],
      body: tableBody,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      columnStyles: Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w }])),
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 2 },
        font: "helvetica",
        lineColor: PDF_GENERAL.BORDER_LIGHT,
        lineWidth: 0.2,
        halign: "center" as const,
        minCellHeight: 7.5,
      },
      headStyles: {
        minCellHeight: 7.5,
        fontSize: 7.5,
        lineColor: [154, 154, 166],
        lineWidth: { bottom: 1, top: 0.2, left: 0.2, right: 0.2 },
      },
      alternateRowStyles: {
        fillColor: PDF_GENERAL.ROW_ALT,
      },
      tableLineColor: PDF_GENERAL.BORDER_MED,
      tableLineWidth: 0.8,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = (doc as any).lastAutoTable.finalY;

    // Separator between segments (except last)
    if (segStroke !== "crawl") {
      doc.setDrawColor(191, 191, 204);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, cursorY + 3, MARGIN + CONTENT_W, cursorY + 3);
      cursorY += 6;
    } else {
      cursorY += 4;
    }
  }

  // ── Récap cumulés ─────────────────────────────────────────────────────────

  // Checkpoints: e.g. 200 4N → 50, 100, 150, 200; 400 4N → 100, 200, 300, 400
  const cumulativeCheckpoints: number[] = [];
  const totalDist = target_distance_m;
  const step = totalDist / 4;
  for (let i = 1; i <= 4; i++) {
    cumulativeCheckpoints.push(step * i);
  }

  const recapHeight = 7 + 7.5 + cumulativeCheckpoints.length * 7.5 + 4;
  if (cursorY + recapHeight > PAGE_H - 14) {
    doc.addPage();
    drawPageFooter(doc, coachName);
    cursorY = MARGIN;
  }

  // Trait orange avant récap
  doc.setDrawColor(...orangeColor);
  doc.setLineWidth(1);
  doc.line(MARGIN, cursorY, MARGIN + CONTENT_W, cursorY);
  cursorY += 1;

  // Header recap
  doc.setFillColor(...PDF_GENERAL.ORANGE_RECAP_TINT);
  doc.rect(MARGIN, cursorY, CONTENT_W, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(179, 87, 18);
  doc.text("Récap cumulé", MARGIN + 3, cursorY + 4.7);
  cursorY += 7;

  // Recap table
  const recapBody: (string | object)[][] = cumulativeCheckpoints.map((d) => {
    const cumT_s = compute4NCumulative({ Tobj_4N_s: Tobj_s, mode, d_cumulative: d });
    const dLabel = `${d} m`;
    return [
      {
        content: dLabel,
        styles: { fontStyle: "bold" as const, textColor: PDF_GENERAL.CHARCOAL },
      },
      {
        content: fmtTime(cumT_s),
        styles: { fontStyle: "bold" as const, textColor: [179, 26, 26] as [number, number, number] },
      },
    ];
  });

  const recapHeadRow = [
    {
      content: "Distance cumulée",
      styles: {
        fillColor: PDF_GENERAL.ORANGE_RECAP_TINT,
        textColor: [179, 87, 18] as [number, number, number],
        fontStyle: "bold" as const,
        halign: "left" as const,
      },
    },
    {
      content: "Temps MAX",
      styles: {
        fillColor: PDF_GENERAL.ORANGE_RECAP_TINT,
        textColor: [179, 87, 18] as [number, number, number],
        fontStyle: "bold" as const,
        halign: "center" as const,
      },
    },
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [recapHeadRow],
    body: recapBody,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    columnStyles: {
      0: { cellWidth: DIST_COL_W + 20 },
      1: { cellWidth: CONTENT_W - DIST_COL_W - 20, halign: "center" as const },
    },
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 2 },
      font: "helvetica",
      lineColor: PDF_GENERAL.BORDER_LIGHT,
      lineWidth: 0.2,
      minCellHeight: 7.5,
    },
    headStyles: {
      minCellHeight: 7.5,
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: PDF_GENERAL.ROW_ALT,
    },
    tableLineColor: [249, 115, 22] as RgbColor,
    tableLineWidth: 1.2,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursorY = (doc as any).lastAutoTable.finalY + 6;
  return cursorY;
}

// ─── Page header with swimmer info ───────────────────────────────────────────

function drawSwimmerPageHeader(
  doc: jsPDF,
  swimmerName: string,
  coachName?: string,
): void {
  const H = 12;
  doc.setFillColor(245, 246, 250);
  doc.rect(0, 0, PAGE_W, H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_GENERAL.CHARCOAL);
  doc.text(swimmerName, MARGIN, 7.5);
  if (coachName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_GENERAL.TEXT_MUTED);
    doc.text(`Coach : ${coachName}`, MARGIN, H - 1.5);
  }
  doc.setDrawColor(...PDF_GENERAL.BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(0, H, PAGE_W, H);
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportPacePdf(args: {
  swimmer: TeamMember;
  targets: PaceTarget[];
  zones: Record<EventFamily, Partial<Record<Zone, number>>>;
  strokeAdjustments: Record<SingleStroke, Record<EventFamily, number>>;
  outputPool: "25m" | "50m";
  coachName?: string;
}): Promise<Blob> {
  const { swimmer, targets, zones, strokeAdjustments, outputPool, coachName } = args;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  drawSwimmerPageHeader(doc, swimmer.displayName, coachName);
  drawPageFooter(doc, coachName);

  let cursorY = 14 + 4;

  const sortedTargets = [...targets].sort((a, b) => {
    if (a.stroke < b.stroke) return -1;
    if (a.stroke > b.stroke) return 1;
    return a.target_distance_m - b.target_distance_m;
  });

  for (const target of sortedTargets) {
    const { stroke, target_distance_m, target_time_ms, target_pool_size } = target;

    // Attempt pool conversion
    let effectiveTimeMs = target_time_ms;
    let effectivePool = outputPool;
    let notConvertibleNote: string | null = null;

    if (target_pool_size !== outputPool) {
      const converted = convertTargetTime({
        targetTimeMs: target_time_ms,
        fromPool: target_pool_size,
        toPool: outputPool,
        stroke: stroke as Stroke,
        distanceM: target_distance_m,
        sex: (swimmer as TeamMember & { sex?: "M" | "F" | null }).sex ?? null,
      });
      if (converted !== null) {
        effectiveTimeMs = converted;
        effectivePool = outputPool;
      } else {
        // Not convertible — use original
        effectiveTimeMs = target_time_ms;
        effectivePool = target_pool_size;
        notConvertibleNote = `Bassin ${target_pool_size} — non convertible vers ${outputPool}`;
      }
    }

    const is4N = stroke === "4N" && (target_distance_m === 200 || target_distance_m === 400);

    if (is4N) {
      cursorY = draw4NSection({
        doc,
        target,
        effectiveTimeMs,
        effectivePool,
        notConvertibleNote,
        zones,
        strokeAdjustments,
        coachName,
        cursorY,
      });
    } else {
      const singleStroke = STROKE_TO_SINGLE[stroke as Stroke];
      if (!singleStroke) {
        // Unsupported stroke/distance combo — skip with note
        continue;
      }
      cursorY = drawSingleSection({
        doc,
        target,
        effectiveTimeMs,
        effectivePool,
        notConvertibleNote,
        zones,
        strokeAdjustments,
        coachName,
        cursorY,
      });
    }
  }

  return doc.output("blob") as Blob;
}
