import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { PaceTarget } from "@/lib/api/pace-targets";
import type { ZoneConfig, Stroke } from "@/lib/paceCalculator";
import { pacePer100m, zoneTime, formatPaceTime, getDistanceRows } from "@/lib/paceCalculator";

const EAC_RED: [number, number, number] = [227, 6, 19];
const EAC_RED_LIGHT: [number, number, number] = [237, 40, 52];
const EAC_DARK_RED: [number, number, number] = [180, 4, 14];
const CHARCOAL: [number, number, number] = [35, 35, 40];
const TEXT_DARK: [number, number, number] = [45, 45, 50];
const TEXT_MUTED: [number, number, number] = [125, 125, 135];
const BORDER_LIGHT: [number, number, number] = [215, 218, 225];
const ROW_ALT: [number, number, number] = [248, 249, 253];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY_BG: [number, number, number] = [245, 246, 250];

const HEADER_H = 22;
const ZONE_LABELS = ["V0", "V1", "V2", "V3", "Max"];
const ZONE_KEYS: (keyof ZoneConfig)[] = ["v0_pct", "v1_pct", "v2_pct", "v3_pct", "max_pct"];

async function loadLogoAsDataUrl(): Promise<string | null> {
  try {
    const mod = await import("@assets/logo-eac.png");
    const logoUrl = (mod.default ?? mod) as string;
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawHeader(doc: jsPDF, logoDataUrl: string | null, pageWidth: number): void {
  doc.setFillColor(...EAC_RED);
  doc.rect(0, 0, pageWidth, HEADER_H, "F");
  doc.setFillColor(...EAC_DARK_RED);
  doc.rect(0, 0, pageWidth, 1.2, "F");
  doc.setFillColor(...EAC_RED_LIGHT);
  for (let i = 0; i < 6; i++) {
    const x = pageWidth - 80 + i * 18;
    doc.triangle(x, 0, x + 45, 0, x + 22, HEADER_H, "F");
  }
  const logoSize = 16;
  const logoPad = 1.5;
  const logoX = 8;
  const logoY = (HEADER_H - logoSize) / 2;
  if (logoDataUrl) {
    try {
      doc.setFillColor(...WHITE);
      doc.roundedRect(logoX - logoPad, logoY - logoPad, logoSize + logoPad * 2, logoSize + logoPad * 2, 2, 2, "F");
      doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize);
    } catch { /* continue without logo */ }
  }
  const textX = logoDataUrl ? logoX + logoSize + logoPad + 5 : 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text("ERSTEIN AQUATIC CLUB", textX, 9);
  doc.setDrawColor(255, 180, 180);
  doc.setLineWidth(0.15);
  doc.line(textX, 11, textX + 68, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("CALCULATEUR D'ALLURES", textX, 16);
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, HEADER_H, pageWidth, 0.4, "F");
}

function drawSwimmerBand(
  doc: jsPDF,
  swimmerName: string,
  coachName: string | undefined,
  pageWidth: number,
  startY: number,
): number {
  const H = 15;
  doc.setFillColor(...GRAY_BG);
  doc.rect(0, startY, pageWidth, H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...CHARCOAL);
  doc.text(swimmerName, 10, startY + 5.5);
  if (coachName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Coach : ${coachName}`, 10, startY + 11);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(new Date().toLocaleDateString("fr-FR"), pageWidth - 10, startY + 8, { align: "right" });
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(0, startY + H, pageWidth, startY + H);
  return startY + H;
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  const y = pageHeight - 7;
  doc.setDrawColor(...EAC_RED);
  doc.setLineWidth(0.4);
  doc.line(10, y, pageWidth - 10, y);
  doc.setFillColor(...EAC_RED);
  doc.rect(10, y - 1, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...EAC_RED);
  doc.text("ERSTEIN AQUATIC CLUB", 15, y + 4.5);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `Généré le ${new Date().toLocaleDateString("fr-FR")}`,
    pageWidth - 10,
    y + 4.5,
    { align: "right" },
  );
}

export async function exportPacePdf(args: {
  swimmer: TeamMember;
  targets: PaceTarget[];
  zones: ZoneConfig;
  coachName?: string;
}): Promise<Blob> {
  const { swimmer, targets, zones, coachName } = args;
  const logoDataUrl = await loadLogoAsDataUrl();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const MARGIN = 10;

  drawHeader(doc, logoDataUrl, pageWidth);
  let cursorY = HEADER_H + 2;
  cursorY = drawSwimmerBand(doc, swimmer.displayName, coachName, pageWidth, cursorY);
  cursorY += 4;

  const sortedTargets = [...targets].sort((a, b) => a.stroke.localeCompare(b.stroke));

  for (const target of sortedTargets) {
    const { stroke, target_distance_m, target_time_ms } = target;
    const distLabel = target_distance_m >= 1000
      ? `${target_distance_m / 1000} km`
      : `${target_distance_m} m`;
    const refPace = formatPaceTime(pacePer100m(target_time_ms, target_distance_m));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    doc.text(`${stroke} · ${distLabel}`.toUpperCase(), MARGIN, cursorY + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Allure réf. : ${refPace}/100m`, pageWidth - MARGIN, cursorY + 5, { align: "right" });
    cursorY += 8;

    const distRows = getDistanceRows(target_distance_m, stroke as Stroke);
    if (distRows.length === 0) {
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text("—", MARGIN, cursorY + 4);
      cursorY += 10;
      continue;
    }

    const paceMs = pacePer100m(target_time_ms, target_distance_m);
    const tableBody = distRows.map((dist) => {
      const row: string[] = [dist >= 1000 ? `${dist / 1000} km` : `${dist} m`];
      for (const key of ZONE_KEYS) {
        row.push(formatPaceTime(zoneTime(dist, paceMs, zones[key])));
      }
      return row;
    });

    autoTable(doc, {
      startY: cursorY,
      head: [["Distance", ...ZONE_LABELS]],
      body: tableBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: {
        fontSize: 8,
        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        textColor: TEXT_DARK,
        lineColor: BORDER_LIGHT,
        lineWidth: 0.2,
        font: "helvetica",
      },
      headStyles: {
        fillColor: EAC_RED,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: ROW_ALT,
      },
      columnStyles: {
        0: { fontStyle: "bold", textColor: CHARCOAL },
      },
      didDrawPage: () => {
        drawHeader(doc, logoDataUrl, pageWidth);
        drawFooter(doc, pageWidth, pageHeight);
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = (doc as any).lastAutoTable.finalY + 6;
  }

  drawFooter(doc, pageWidth, pageHeight);

  return doc.output("blob") as Blob;
}
