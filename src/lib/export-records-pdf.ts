// src/lib/export-records-pdf.ts
// Generates a branded PDF of club records — one page per pool/sex combination.
// Design: full-width EAC header band with logo, two-tone cell rendering,
// red accent bars, branded footer. Sports-institutional aesthetic.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ClubRecord } from "@/lib/api";

// §211 — Logo servi depuis /public en runtime (webp 7.7K) au lieu d'inliner
// le PNG 373K via Vite.
const eacLogoUrl = `${import.meta.env.BASE_URL}logo-eac-256.webp`;

// ── EAC Branding Palette (RGB) ──

const EAC_RED: [number, number, number] = [227, 6, 19];
const EAC_RED_LIGHT: [number, number, number] = [237, 40, 52];
const EAC_DARK_RED: [number, number, number] = [180, 4, 14];
const CHARCOAL: [number, number, number] = [35, 35, 40];
const TEXT_DARK: [number, number, number] = [45, 45, 50];
const TEXT_MUTED: [number, number, number] = [125, 125, 135];
const BORDER_LIGHT: [number, number, number] = [215, 218, 225];
const ROW_ALT: [number, number, number] = [248, 249, 253];
const WHITE: [number, number, number] = [255, 255, 255];

// ── Constants ──

const AGE_COLS = [
  { age: 8, label: "8-" },
  { age: 9, label: "9" },
  { age: 10, label: "10" },
  { age: 11, label: "11" },
  { age: 12, label: "12" },
  { age: 13, label: "13" },
  { age: 14, label: "14" },
  { age: 15, label: "15" },
  { age: 16, label: "16" },
  { age: 17, label: "17+" },
];

const EVENTS_ORDER = [
  { id: "50_FREE", label: "50 NL" },
  { id: "100_FREE", label: "100 NL" },
  { id: "200_FREE", label: "200 NL" },
  { id: "400_FREE", label: "400 NL" },
  { id: "800_FREE", label: "800 NL" },
  { id: "1500_FREE", label: "1500 NL" },
  { id: "50_BACK", label: "50 Dos" },
  { id: "100_BACK", label: "100 Dos" },
  { id: "200_BACK", label: "200 Dos" },
  { id: "50_BREAST", label: "50 Br" },
  { id: "100_BREAST", label: "100 Br" },
  { id: "200_BREAST", label: "200 Br" },
  { id: "50_FLY", label: "50 Pap" },
  { id: "100_FLY", label: "100 Pap" },
  { id: "200_FLY", label: "200 Pap" },
  { id: "100_IM", label: "100 4N" },
  { id: "200_IM", label: "200 4N" },
  { id: "400_IM", label: "400 4N" },
];

const PAGES = [
  { pool_m: 25, sex: "M", title: "Records Hommes — Bassin 25m" },
  { pool_m: 25, sex: "F", title: "Records Femmes — Bassin 25m" },
  { pool_m: 50, sex: "M", title: "Records Hommes — Bassin 50m" },
  { pool_m: 50, sex: "F", title: "Records Femmes — Bassin 50m" },
];

// ── Helpers ──

function formatTime(ms: number): string {
  const totalCenti = Math.round(ms / 10);
  const centi = totalCenti % 100;
  const totalSec = Math.floor(totalCenti / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  const pad2 = (v: number) => String(v).padStart(2, "0");
  if (min > 0) return `${min}:${pad2(sec)}.${pad2(centi)}`;
  return `${sec}.${pad2(centi)}`;
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return `${firstName.charAt(0)}. ${lastName}`;
}

function isRecordFromCurrentYear(recordDate: string | null | undefined): boolean {
  if (!recordDate) return false;
  const currentYear = new Date().getFullYear();
  const recordYear = new Date(recordDate).getFullYear();
  return recordYear === currentYear;
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

// ── Page Elements ──

const HEADER_H = 24;

function drawHeader(
  doc: jsPDF,
  logoDataUrl: string | null,
  title: string,
  pageWidth: number,
) {
  // Main red band
  doc.setFillColor(...EAC_RED);
  doc.rect(0, 0, pageWidth, HEADER_H, "F");

  // Top accent strip (darker red)
  doc.setFillColor(...EAC_DARK_RED);
  doc.rect(0, 0, pageWidth, 1.2, "F");

  // Subtle diagonal stripes for texture (lighter red on red)
  doc.setFillColor(...EAC_RED_LIGHT);
  for (let i = 0; i < 6; i++) {
    const x = pageWidth - 80 + i * 18;
    doc.triangle(x, 0, x + 45, 0, x + 22, HEADER_H, "F");
  }

  // Logo with white rounded rectangle backdrop
  const logoSize = 17;
  const logoPad = 1.5;
  const logoX = 8;
  const logoY = (HEADER_H - logoSize) / 2;
  if (logoDataUrl) {
    try {
      doc.setFillColor(...WHITE);
      doc.roundedRect(
        logoX - logoPad, logoY - logoPad,
        logoSize + logoPad * 2, logoSize + logoPad * 2,
        2.5, 2.5, "F",
      );
      doc.addImage(logoDataUrl, "WEBP", logoX, logoY, logoSize, logoSize);
    } catch {
      // Continue without logo
    }
  }

  // Text anchor (offset if logo present)
  const textX = logoDataUrl ? logoX + logoSize + logoPad + 5 : 12;

  // Club name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...WHITE);
  doc.text("ERSTEIN AQUATIC CLUB", textX, 9.5);

  // Thin separator line
  doc.setDrawColor(255, 180, 180);
  doc.setLineWidth(0.15);
  doc.line(textX, 11.5, textX + 70, 11.5);

  // Page title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(title, textX, 16.5);

  // Edition date
  doc.setFontSize(6.5);
  doc.setTextColor(255, 190, 190);
  doc.text(
    `Édité le ${new Date().toLocaleDateString("fr-FR")}`,
    textX,
    21,
  );

  // Legend for new records (right side)
  const currentYear = new Date().getFullYear();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(255, 210, 210);
  doc.text(
    `★ Records ${currentYear}`,
    pageWidth - 12,
    21,
    { align: "right" },
  );

  // Bottom edge accent (dark line)
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, HEADER_H, pageWidth, 0.5, "F");
}

function drawFooter(
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  pageNum: number,
  totalPages: number,
) {
  const y = pageHeight - 7;

  // Red accent line
  doc.setDrawColor(...EAC_RED);
  doc.setLineWidth(0.4);
  doc.line(10, y, pageWidth - 10, y);

  // Small red square decorative accent
  doc.setFillColor(...EAC_RED);
  doc.rect(10, y - 1, 2, 2, "F");

  // Club name (left)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...EAC_RED);
  doc.text("ERSTEIN AQUATIC CLUB", 15, y + 4.5);

  // Page number (center)
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${pageNum} / ${totalPages}`, pageWidth / 2, y + 4.5, {
    align: "center",
  });

  // Right text
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Records du club", pageWidth - 10, y + 4.5, { align: "right" });
}

// ── Main Export ──

export async function exportRecordsPdf(records: ClubRecord[]): Promise<void> {
  const lookup = new Map<string, ClubRecord>();
  for (const r of records) {
    lookup.set(`${r.pool_m}_${r.sex}_${r.event_code}_${r.age}`, r);
  }

  const logoDataUrl = await loadLogoAsDataUrl();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = PAGES.length;

  let isFirstPage = true;

  for (let pageIdx = 0; pageIdx < PAGES.length; pageIdx++) {
    const page = PAGES[pageIdx];
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    drawHeader(doc, logoDataUrl, page.title, pageWidth);
    drawFooter(doc, pageWidth, pageHeight, pageIdx + 1, totalPages);

    // Build table data
    const head = [["Épreuve", ...AGE_COLS.map((a) => a.label)]];

    // Store records with metadata for later rendering
    const recordsMetadata = new Map<string, ClubRecord>();
    const body: string[][] = [];
    for (const event of EVENTS_ORDER) {
      const row: string[] = [event.label];
      let hasAny = false;
      for (const ageCol of AGE_COLS) {
        const rec = lookup.get(
          `${page.pool_m}_${page.sex}_${event.id}_${ageCol.age}`,
        );
        if (rec) {
          hasAny = true;
          const cellKey = `${body.length}_${ageCol.age}`;
          recordsMetadata.set(cellKey, rec);
          row.push(`${formatTime(rec.time_ms)}\n${shortName(rec.athlete_name)}`);
        } else {
          row.push("");
        }
      }
      if (hasAny) body.push(row);
    }

    if (body.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...TEXT_MUTED);
      doc.text("Aucun record enregistré", pageWidth / 2, 50, {
        align: "center",
      });
      continue;
    }

    autoTable(doc, {
      startY: HEADER_H + 4,
      head,
      body,
      theme: "plain",
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.5, right: 1.2, bottom: 1.5, left: 1.2 },
        valign: "middle",
        halign: "center",
        textColor: TEXT_DARK,
        lineWidth: 0,
      },
      headStyles: {
        fillColor: CHARCOAL,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        cellPadding: { top: 2.5, right: 1.2, bottom: 2.5, left: 1.2 },
      },
      columnStyles: {
        0: {
          halign: "left",
          fontStyle: "bold",
          cellWidth: 28,
          textColor: CHARCOAL,
          cellPadding: { top: 1.5, right: 1.2, bottom: 1.5, left: 3.5 },
        },
        1: { cellWidth: 24 },
        2: { cellWidth: 24 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { cellWidth: 24 },
        6: { cellWidth: 24 },
        7: { cellWidth: 24 },
        8: { cellWidth: 24 },
        9: { cellWidth: 24 },
        10: { cellWidth: 24 },
      },
      alternateRowStyles: {
        fillColor: ROW_ALT,
      },
      margin: { left: 12, right: 12, bottom: 10 },
      willDrawCell(data) {
        // Suppress default text for all body cells — we render custom text
        if (data.section === "body" && data.cell.raw) {
          data.cell.text = [];
        }
      },
      didDrawCell(data) {
        // Red left accent bar + larger font for event column
        if (data.section === "body" && data.column.index === 0) {
          doc.setFillColor(...EAC_RED);
          doc.rect(data.cell.x, data.cell.y, 0.7, data.cell.height, "F");

          // Render event label with larger font for better readability
          if (data.cell.raw) {
            const eventLabel = String(data.cell.raw);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(...CHARCOAL);
            doc.text(
              eventLabel,
              data.cell.x + 3.5,
              data.cell.y + data.cell.height / 2 + 1.5,
              { align: "left" },
            );
          }
        }

        // Custom two-tone rendering for time + name cells with current year highlight
        if (
          data.section === "body" &&
          data.column.index > 0 &&
          data.cell.raw
        ) {
          const raw = String(data.cell.raw);
          if (!raw.trim()) return;
          const lines = raw.split("\n");
          const cx = data.cell.x + data.cell.width / 2;

          // Check if this is a current year record
          const cellKey = `${data.row.index}_${AGE_COLS[data.column.index - 1].age}`;
          const recordMeta = recordsMetadata.get(cellKey);
          const isNewRecord = recordMeta && isRecordFromCurrentYear(recordMeta.record_date);

          // Highlight background for current year records
          if (isNewRecord) {
            doc.setFillColor(255, 250, 240); // Subtle warm highlight
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
          }

          if (lines.length >= 2) {
            // Time: bold, dark, prominent (larger for readability)
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(...TEXT_DARK);
            doc.text(lines[0], cx, data.cell.y + data.cell.height * 0.35, {
              align: "center",
            });

            // NEW badge for current year records
            if (isNewRecord) {
              doc.setFont("helvetica", "bold");
              doc.setFontSize(6);
              doc.setTextColor(...EAC_RED);
              doc.text("★", cx + 10, data.cell.y + data.cell.height * 0.35, {
                align: "center",
              });
            }

            // Name: regular, muted, larger
            doc.setFont("helvetica", "normal");
            doc.setFontSize(5.5);
            doc.setTextColor(...TEXT_MUTED);
            doc.text(lines[1], cx, data.cell.y + data.cell.height * 0.72, {
              align: "center",
            });
          } else if (lines[0]) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6);
            doc.setTextColor(...TEXT_MUTED);
            doc.text(
              lines[0],
              cx,
              data.cell.y + data.cell.height / 2 + 1,
              { align: "center" },
            );
          }
        }

        // Subtle bottom border on all body cells
        if (data.section === "body") {
          doc.setDrawColor(...BORDER_LIGHT);
          doc.setLineWidth(0.1);
          doc.line(
            data.cell.x,
            data.cell.y + data.cell.height,
            data.cell.x + data.cell.width,
            data.cell.y + data.cell.height,
          );
        }

        // Red bottom edge on header cells for visual anchor
        if (data.section === "head") {
          doc.setFillColor(...EAC_RED);
          doc.rect(
            data.cell.x,
            data.cell.y + data.cell.height - 0.6,
            data.cell.width,
            0.6,
            "F",
          );
        }
      },
    });
  }

  doc.save("records-club-eac.pdf");
}
