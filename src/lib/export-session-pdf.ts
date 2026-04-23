import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import eacLogoUrl from "@assets/logo-eac.png";
import type { SwimSessionTemplate } from "@/lib/api/types";
import type { SlotInstance } from "@/hooks/useSlotCalendar";
import type { SwimPayloadFields } from "@/lib/types";
import {
  groupItemsByBlock,
  normalizeIntensity,
  getStrokeLabel,
  formatRecoveryDisplay,
} from "@/lib/swimConsultationUtils";
import { calculateSwimTotalDistance } from "@/lib/swimSessionUtils";

// ── EAC Branding (identique à export-records-pdf.ts) ──
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

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayIndex = (date.getDay() + 6) % 7;
  const dayName = DAY_NAMES[dayIndex];
  const monthName = date.toLocaleDateString("fr-FR", { month: "long" });
  return `${dayName} ${d} ${monthName} ${y}`;
}

function formatTime(hhmm: string): string {
  return hhmm.slice(0, 5);
}

async function loadLogoAsDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(eacLogoUrl);
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

const HEADER_H = 22;

function drawPageHeader(doc: jsPDF, logoDataUrl: string | null, pageWidth: number): void {
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
  doc.text("SÉANCE D'ENTRAÎNEMENT", textX, 16);
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, HEADER_H, pageWidth, 0.4, "F");
}

function drawMetadataBand(
  doc: jsPDF,
  instance: SlotInstance,
  pageWidth: number,
  startY: number,
): number {
  const H = 15;
  doc.setFillColor(...GRAY_BG);
  doc.rect(0, startY, pageWidth, H, "F");

  const dateStr = formatDateFr(instance.date);
  const timeStr = `${formatTime(instance.slot.start_time)} – ${formatTime(instance.slot.end_time)}`;
  const locationStr = instance.slot.location ?? "";
  const groupStr = instance.groups.map((g) => g.group_name).join(", ");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...CHARCOAL);
  doc.text(dateStr, 10, startY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  const metaLine = [timeStr, locationStr].filter(Boolean).join("   ·   ");
  doc.text(metaLine, 10, startY + 11);

  if (groupStr) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    doc.text(`Groupes : ${groupStr}`, pageWidth - 10, startY + 8, { align: "right" });
  }

  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(0, startY + H, pageWidth, startY + H);

  return startY + H;
}

function drawSessionTitleRow(
  doc: jsPDF,
  sessionName: string,
  description: string | null | undefined,
  totalDistance: number,
  pageWidth: number,
  startY: number,
): number {
  const baseH = 11;
  const y = startY + 7.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...CHARCOAL);
  doc.text(sessionName.toUpperCase(), 10, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...EAC_RED);
  doc.text(`${totalDistance.toLocaleString("fr-FR")} m`, pageWidth - 10, y, { align: "right" });

  const desc = (description ?? "").trim();
  if (desc) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    const lines = doc.splitTextToSize(desc, pageWidth - 20) as string[];
    doc.text(lines.slice(0, 2), 10, y + 4.5);
    return startY + baseH + 6;
  }

  return startY + baseH;
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

export async function exportSessionPdf(
  session: SwimSessionTemplate,
  instance: SlotInstance,
): Promise<void> {
  const items = session.items ?? [];
  const blocks = groupItemsByBlock(items);
  const totalDistance = calculateSwimTotalDistance(items);

  // ── Compute row count for auto font scaling ──
  let rowCount = 0;
  for (const block of blocks) {
    rowCount++; // block header
    for (const item of block.items) {
      rowCount++; // exercise row
      if ((item.notes ?? "").trim()) rowCount++; // notes subrow
    }
  }
  rowCount += Math.max(0, blocks.length - 1); // milestones between blocks
  rowCount++; // "Fin de séance" row

  // Layout constants (mm)
  const META_H = 15;
  const HAS_DESC = !!(session.description ?? "").trim();
  const TITLE_H = HAS_DESC ? 17 : 11;
  const MARGIN_GAP = 3;
  const FOOTER_H = 14;
  const PAGE_H = 297;
  const availableH = PAGE_H - HEADER_H - META_H - TITLE_H - MARGIN_GAP - FOOTER_H;

  // Base 9pt ≈ 5.8mm row height (with padding)
  const BASE_FONT = 9;
  const BASE_ROW_H = 7.5;
  const maxRows = availableH / BASE_ROW_H;
  const fontSize = rowCount <= maxRows
    ? BASE_FONT
    : Math.max(6, BASE_FONT * (maxRows / rowCount));

  const logoDataUrl = await loadLogoAsDataUrl();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  drawPageHeader(doc, logoDataUrl, pageWidth);
  drawFooter(doc, pageWidth, pageHeight);

  let curY = HEADER_H;
  curY = drawMetadataBand(doc, instance, pageWidth, curY);
  curY = drawSessionTitleRow(doc, session.name || "Séance", session.description, totalDistance, pageWidth, curY);
  curY += MARGIN_GAP;

  // ── Build autoTable body ──
  type CellObj = {
    content: string;
    colSpan?: number;
    styles?: Record<string, unknown>;
  };
  type BodyRow = (string | CellObj)[];
  const body: BodyRow[] = [];

  let cumulDist = 0;

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];

    // Block distance (items × their reps × block reps)
    const blockDist = block.items.reduce((sum, item) => {
      const p = (item.raw_payload as SwimPayloadFields) ?? {};
      const reps = Number(p.exercise_repetitions) || 1;
      const dist = Number(item.distance) || 0;
      return sum + reps * dist;
    }, 0) * (block.repetitions || 1);
    cumulDist += blockDist;

    // Block header row
    const blockLabel = [
      block.title.toUpperCase(),
      block.repetitions && block.repetitions > 1 ? `×${block.repetitions}` : null,
      blockDist > 0 ? `${blockDist.toLocaleString("fr-FR")} m` : null,
    ]
      .filter(Boolean)
      .join("   ");

    body.push([
      {
        content: blockLabel,
        colSpan: 5,
        styles: {
          fillColor: CHARCOAL,
          textColor: WHITE,
          fontStyle: "bold",
          fontSize: fontSize - 0.5,
          cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 },
        },
      },
    ]);

    // Exercise rows
    for (const item of block.items) {
      const p = (item.raw_payload as SwimPayloadFields) ?? {};
      const reps = Number(p.exercise_repetitions);
      const dist = Number(item.distance) || 0;

      const label =
        reps > 1 && dist > 0
          ? `${reps}×${dist}m`
          : dist > 0
            ? `${dist}m`
            : item.label || "—";

      const strokeStr = getStrokeLabel(p.exercise_stroke) ?? "—";
      const intensity = normalizeIntensity(p.exercise_intensity ?? item.intensity ?? null);
      const intensityStr = intensity ?? "—";

      const restSec = Number(p.exercise_rest) || 0;
      const restType = p.exercise_rest_type as string | undefined;
      const restStr =
        restSec > 0
          ? `${restType === "departure" ? "d:" : "r:"}${formatRecoveryDisplay(restSec)}`
          : "—";

      const equipment = Array.isArray(p.exercise_equipment) ? p.exercise_equipment : [];
      const equipStr = equipment.join(", ") || "—";

      body.push([label, strokeStr, intensityStr, restStr, equipStr]);

      // Notes/modalités subrow
      const notes = (item.notes ?? "").trim();
      if (notes) {
        body.push([
          {
            content: `↳  ${notes}`,
            colSpan: 5,
            styles: {
              fontStyle: "italic",
              textColor: TEXT_MUTED,
              fillColor: ROW_ALT,
              fontSize: Math.max(5.5, fontSize - 1.5),
              cellPadding: { top: 0.8, right: 4, bottom: 1.2, left: 12 },
            },
          },
        ]);
      }
    }

    // Milestone row between blocks
    if (bi < blocks.length - 1) {
      body.push([
        {
          content: `——————  ${cumulDist.toLocaleString("fr-FR")} m cumulés  ——————`,
          colSpan: 5,
          styles: {
            fillColor: [238, 240, 247] as [number, number, number],
            textColor: TEXT_MUTED,
            halign: "center",
            fontStyle: "italic",
            fontSize: Math.max(5.5, fontSize - 2),
            cellPadding: { top: 1.2, right: 4, bottom: 1.2, left: 4 },
          },
        },
      ]);
    }
  }

  // "Fin de séance" final row
  body.push([
    {
      content: `FIN DE SÉANCE   —   ${totalDistance.toLocaleString("fr-FR")} m total`,
      colSpan: 5,
      styles: {
        fillColor: CHARCOAL,
        textColor: [180, 180, 185] as [number, number, number],
        halign: "center",
        fontStyle: "italic",
        fontSize: Math.max(6, fontSize - 1),
        cellPadding: { top: 2, right: 4, bottom: 2, left: 4 },
      },
    },
  ]);

  autoTable(doc, {
    startY: curY,
    head: [
      [
        { content: "Exercice", styles: { halign: "left" } },
        "Nage",
        "Intensité",
        "Récupération",
        "Matériel",
      ],
    ],
    body,
    theme: "plain",
    styles: {
      fontSize,
      cellPadding: { top: 1.8, right: 2.5, bottom: 1.8, left: 2.5 },
      valign: "middle",
      textColor: TEXT_DARK,
      lineWidth: 0,
    },
    headStyles: {
      fillColor: [55, 58, 68] as [number, number, number],
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: fontSize - 0.5,
      halign: "center",
      cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 72, fontStyle: "bold" },
      1: { halign: "center", cellWidth: 32 },
      2: { halign: "center", cellWidth: 22 },
      3: { halign: "center", cellWidth: 28 },
      4: { halign: "left", cellWidth: 36 },
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    margin: { left: 10, right: 10, bottom: 14 },
    didDrawCell(data) {
      if (data.section === "body") {
        doc.setDrawColor(...BORDER_LIGHT);
        doc.setLineWidth(0.08);
        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height,
        );
      }
      if (data.section === "head") {
        doc.setFillColor(...EAC_RED);
        doc.rect(
          data.cell.x,
          data.cell.y + data.cell.height - 0.5,
          data.cell.width,
          0.5,
          "F",
        );
      }
    },
  });

  const dateSlug = instance.date.replaceAll("-", "");
  doc.save(`coach-seance-${dateSlug}.pdf`);
}
