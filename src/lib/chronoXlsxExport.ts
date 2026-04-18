import type { ChronoRecord, ChronoRecordSwimmer } from "./api/types";
import { normalizeRecordSwimmer } from "./chrono-types";

// ── Constants (brand + semantic colors, ARGB hex for ExcelJS) ────────

const BRAND_CYAN = "FF0891B2";         // Header fill (cyan-600)
const BRAND_CYAN_DARK = "FF0E7490";    // Super-header fill (cyan-700) — visually anchors series group
const HEADER_TEXT = "FFFFFFFF";        // White on brand
const TITLE_TEXT = "FF0F172A";         // slate-900
const SUBTITLE_TEXT = "FF475569";      // slate-600
const CAPTION_TEXT = "FF94A3B8";       // slate-400
const BEST_FILL = "FFDCFCE7";          // green-100
const BEST_TEXT = "FF15803D";          // green-700
const MANUAL_TEXT = "FF64748B";        // slate-500
const ALT_ROW_FILL = "FFF8FAFC";       // slate-50
const BORDER_COLOR = "FFE2E8F0";       // slate-200
const GROUP_BORDER = "FFCBD5E1";       // slate-300 (series group divider)
const TOTAL_COL_FILL = "FFF1F5F9";     // slate-100 (S_n total column emphasis)

const EXCEL_TIME_FORMAT = "[mm]:ss.00"; // centièmes, resilient to >60 min
const MS_PER_DAY = 86_400_000;

// ── Types ──────────────────────────────────────────────────────────

export type ChronoRecordInputLike = Pick<
  ChronoRecord,
  "label" | "config" | "swimmers" | "created_at"
>;

export interface SheetModelRow {
  displayName: string;
  lane: number;
  wave: number;
  kind: "registered" | "manual";
  /** One per data column — aligned with SheetModel.columnDefs */
  cells: SheetModelCell[];
}

export interface SheetModelCell {
  /** Time in ms (for time-format cells) OR null if empty. */
  ms: number | null;
  /** This cell is a series total (S_n TOT column). */
  isTotal: boolean;
  /** This cell is an intermediate lap (time between splits). */
  isLap: boolean;
  /** This cell is THIS swimmer's best series total (only set on isTotal cells). */
  isBest: boolean;
}

export interface ColumnDef {
  kind: "meta" | "split-cum" | "split-lap" | "total";
  /** Header label shown in the sheet. */
  label: string;
  /** For total columns : series index (0-based). For split columns : series + split indices. */
  seriesIdx?: number;
  splitIdx?: number;
  /** Column width in Excel character units. */
  width: number;
}

/** Super-header group spanning multiple columns (merged in Excel). */
export interface SeriesGroup {
  seriesIdx: number;
  /** 1-indexed inclusive col boundaries within columnDefs. */
  startCol: number;
  endCol: number;
  label: string; // "SÉRIE 1", "SÉRIE 2", …
}

export interface SheetModel {
  clubName: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  columnDefs: ColumnDef[];
  /** Non-empty when nSeries > 1 (1-row header suffices for single-series). */
  seriesGroups: SeriesGroup[];
  rows: SheetModelRow[];
}

// ── Helpers (pure) ─────────────────────────────────────────────────

function maxSeriesCount(swimmers: ChronoRecordSwimmer[]): number {
  return Math.max(0, ...swimmers.map((sw) => sw.splitsByRep.length));
}

function maxSplitsInSeries(
  swimmers: ChronoRecordSwimmer[],
  seriesIdx: number,
): number {
  return Math.max(0, ...swimmers.map((sw) => sw.splitsByRep[seriesIdx]?.length ?? 0));
}

function seriesTotalMs(splits: ChronoRecordSwimmer["splitsByRep"][number]): number {
  return splits.length > 0 ? splits[splits.length - 1].cumulativeMs : 0;
}

function findBestSeriesIdx(splitsByRep: ChronoRecordSwimmer["splitsByRep"]): number {
  let bestIdx = -1;
  let bestMs = Infinity;
  for (let i = 0; i < splitsByRep.length; i++) {
    if (splitsByRep[i].length === 0) continue;
    const total = seriesTotalMs(splitsByRep[i]);
    if (total > 0 && total < bestMs) {
      bestMs = total;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function sanitizeFilename(s: string): string {
  const cleaned = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "Chrono";
}

/** Convert ms → Excel serial time (fraction of a 24h day). */
export function msToExcelTime(ms: number): number {
  return ms / MS_PER_DAY;
}

/** Human-readable French subtitle. */
function buildSubtitle(record: ChronoRecordInputLike): string {
  const dateFr = new Date(record.created_at).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const parts: string[] = [dateFr];
  const cfg = record.config;
  if (cfg.seriesCount > 0 && cfg.totalDistanceM > 0) {
    parts.push(`${cfg.seriesCount} × ${cfg.totalDistanceM} m`);
  } else if (cfg.totalDistanceM > 0) {
    parts.push(`${cfg.totalDistanceM} m`);
  } else if (cfg.seriesCount > 0) {
    parts.push(`${cfg.seriesCount} séries`);
  }
  if (cfg.splitDistanceM > 0) parts.push(`Splits ${cfg.splitDistanceM} m`);
  parts.push(`${cfg.laneCount} ligne${cfg.laneCount > 1 ? "s" : ""}`);
  if (cfg.waveOverrides) {
    const customWaves = Object.keys(cfg.waveOverrides)
      .map(Number)
      .sort((a, b) => a - b);
    if (customWaves.length > 0) {
      const customLabels = customWaves.map((n) => `V${n}`).join(", ");
      parts.push(`${customLabels} personnalisée${customWaves.length > 1 ? "s" : ""}`);
    }
  }
  return parts.join(" · ");
}

function buildGeneratedAt(): string {
  const now = new Date();
  const date = now.toLocaleDateString("fr-FR");
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `Généré par Suivi Natation V2 · ${date} ${time}`;
}

// ── Pure builder — testable without ExcelJS ────────────────────────

export function buildSheetModel(record: ChronoRecordInputLike): SheetModel {
  const swimmers = record.swimmers.map(normalizeRecordSwimmer);
  const nSeries = maxSeriesCount(swimmers);
  const splitD = record.config.splitDistanceM;
  const splitLabel = (i: number) => (splitD > 0 ? `${(i + 1) * splitD} m` : `#${i + 1}`);

  const columnDefs: ColumnDef[] = [
    { kind: "meta", label: "Nageur", width: 24 },
    { kind: "meta", label: "Lig.", width: 6 },
    { kind: "meta", label: "Vag.", width: 6 },
    { kind: "meta", label: "T.", width: 5 },
  ];
  for (let s = 0; s < nSeries; s++) {
    columnDefs.push({
      kind: "total",
      label: "TOTAL",
      seriesIdx: s,
      width: 12,
    });
    const nSplits = maxSplitsInSeries(swimmers, s);
    for (let i = 0; i < nSplits; i++) {
      const dLabel = splitLabel(i);
      columnDefs.push({
        kind: "split-cum",
        label: `${dLabel} cumul.`,
        seriesIdx: s,
        splitIdx: i,
        width: 12,
      });
      columnDefs.push({
        kind: "split-lap",
        label: `${dLabel} interm.`,
        seriesIdx: s,
        splitIdx: i,
        width: 12,
      });
    }
  }

  const rows: SheetModelRow[] = swimmers.map((sw) => {
    const bestIdx = findBestSeriesIdx(sw.splitsByRep);
    const completedSeriesCount = sw.splitsByRep.filter((s) => s.length > 0).length;
    const cells: SheetModelCell[] = [];
    for (let s = 0; s < nSeries; s++) {
      const splits = sw.splitsByRep[s] ?? [];
      const total = seriesTotalMs(splits);
      cells.push({
        ms: total > 0 ? total : null,
        isTotal: true,
        isLap: false,
        isBest: s === bestIdx && completedSeriesCount > 1 && total > 0,
      });
      const nSplits = maxSplitsInSeries(swimmers, s);
      for (let i = 0; i < nSplits; i++) {
        const split = splits[i];
        // Cumulative time at this split
        cells.push({
          ms: split ? split.cumulativeMs : null,
          isTotal: false,
          isLap: false,
          isBest: false,
        });
        // Lap (intermediate) time between previous and current split
        cells.push({
          ms: split ? split.lapMs : null,
          isTotal: false,
          isLap: true,
          isBest: false,
        });
      }
    }
    return {
      displayName: sw.displayName,
      lane: sw.lane,
      wave: sw.wave,
      kind: sw.kind,
      cells,
    };
  });

  // Build series super-header groups (only when > 1 series — otherwise 1 row header is enough).
  const seriesGroups: SeriesGroup[] = [];
  if (nSeries > 1) {
    for (let s = 0; s < nSeries; s++) {
      let startCol = -1;
      let endCol = -1;
      columnDefs.forEach((def, idx) => {
        if (def.seriesIdx !== s) return;
        const col1 = idx + 1;
        if (startCol < 0) startCol = col1;
        endCol = col1;
      });
      if (startCol > 0) {
        seriesGroups.push({
          seriesIdx: s,
          startCol,
          endCol,
          label: `SÉRIE ${s + 1}`,
        });
      }
    }
  }

  return {
    clubName: "Erstein Aquatic Club",
    title: (record.label || "Chrono").trim() || "Chrono",
    subtitle: buildSubtitle(record),
    generatedAt: buildGeneratedAt(),
    columnDefs,
    seriesGroups,
    rows,
  };
}

// ── Side-effectful — lazy exceljs + download ───────────────────────

/** Trigger a download in the browser (no DOM in tests). */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick to give the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportChronoToXlsx(record: ChronoRecordInputLike): Promise<void> {
  const model = buildSheetModel(record);
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Suivi Natation V2";
  wb.created = new Date();
  wb.properties.date1904 = false;

  const ws = wb.addWorksheet("Chrono", {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const nCols = model.columnDefs.length;
  const lastColLetter = ws.getColumn(nCols).letter;

  // ── Row 1 — Club caption
  ws.getRow(1).height = 16;
  ws.mergeCells(`A1:${lastColLetter}1`);
  const clubCell = ws.getCell("A1");
  clubCell.value = model.clubName.toUpperCase();
  clubCell.font = { name: "Calibri", size: 9, bold: true, color: { argb: CAPTION_TEXT } };
  clubCell.alignment = { horizontal: "left", vertical: "middle" };

  // ── Row 2 — blank spacer
  ws.getRow(2).height = 4;

  // ── Row 3 — Title (hero)
  ws.getRow(3).height = 30;
  ws.mergeCells(`A3:${lastColLetter}3`);
  const titleCell = ws.getCell("A3");
  titleCell.value = model.title;
  titleCell.font = { name: "Calibri", size: 20, bold: true, color: { argb: TITLE_TEXT } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };

  // ── Row 4 — Subtitle
  ws.getRow(4).height = 18;
  ws.mergeCells(`A4:${lastColLetter}4`);
  const subCell = ws.getCell("A4");
  subCell.value = model.subtitle;
  subCell.font = { name: "Calibri", size: 11, italic: true, color: { argb: SUBTITLE_TEXT } };
  subCell.alignment = { horizontal: "left", vertical: "middle" };

  // ── Row 5 — blank spacer
  ws.getRow(5).height = 10;

  // ── Headers (1 row for single-series, 2 rows with super-header for multi-series) ─
  const hasSuperHeader = model.seriesGroups.length > 0;
  const SUPER_HEADER_ROW = 6;
  const HEADER_ROW = hasSuperHeader ? 7 : 6;

  // Super-header row (SÉRIE 1, SÉRIE 2, …)
  if (hasSuperHeader) {
    ws.getRow(SUPER_HEADER_ROW).height = 22;
    // Merge meta cols vertically (rows 6-7) so "Nageur / Lig. / Vag. / T." spans both header rows.
    for (let c = 1; c <= 4; c++) {
      ws.mergeCells(SUPER_HEADER_ROW, c, HEADER_ROW, c);
    }
    // Super-header cells for each series group
    for (const group of model.seriesGroups) {
      ws.mergeCells(SUPER_HEADER_ROW, group.startCol, SUPER_HEADER_ROW, group.endCol);
      const cell = ws.getCell(SUPER_HEADER_ROW, group.startCol);
      cell.value = group.label;
      cell.font = {
        name: "Calibri",
        size: 11,
        bold: true,
        color: { argb: HEADER_TEXT },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: false,
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_CYAN_DARK } };
      cell.border = {
        right: { style: "medium", color: { argb: GROUP_BORDER } },
      };
    }
  }

  const headerRow = ws.getRow(HEADER_ROW);
  headerRow.height = hasSuperHeader ? 24 : 26;
  model.columnDefs.forEach((def, i) => {
    const colIdx = i + 1;
    // Meta cols are merged vertically — only set style on top (row 6) when super-header present.
    if (hasSuperHeader && def.kind === "meta") {
      const metaCell = ws.getCell(SUPER_HEADER_ROW, colIdx);
      metaCell.value = def.label;
      metaCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: HEADER_TEXT } };
      metaCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_CYAN_DARK } };
      metaCell.border = {
        right: colIdx === 4 ? { style: "medium", color: { argb: GROUP_BORDER } } : undefined,
      };
      return;
    }
    const cell = headerRow.getCell(colIdx);
    cell.value = def.label;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_CYAN } };
    // Bottom border on header row, right border at series group boundaries.
    const isGroupEnd = model.seriesGroups.some((g) => g.endCol === colIdx);
    cell.border = {
      bottom: { style: "medium", color: { argb: BRAND_CYAN } },
      right: isGroupEnd ? { style: "medium", color: { argb: GROUP_BORDER } } : undefined,
    };
  });

  // ── Data rows
  let rowIdx = HEADER_ROW + 1;
  model.rows.forEach((row, idx) => {
    const xlRow = ws.getRow(rowIdx);
    xlRow.height = 22;
    const isAlt = idx % 2 === 1;
    const isManual = row.kind === "manual";

    const fontBase = {
      name: "Calibri",
      size: 11,
      italic: isManual,
      color: { argb: isManual ? MANUAL_TEXT : TITLE_TEXT },
    };

    // Nageur
    const nameCell = xlRow.getCell(1);
    nameCell.value = row.displayName;
    nameCell.font = { ...fontBase, bold: !isManual };
    nameCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

    // Ligne
    const laneCell = xlRow.getCell(2);
    laneCell.value = row.lane;
    laneCell.font = fontBase;
    laneCell.alignment = { horizontal: "center", vertical: "middle" };

    // Vague
    const waveCell = xlRow.getCell(3);
    waveCell.value = `V${row.wave}`;
    waveCell.font = fontBase;
    waveCell.alignment = { horizontal: "center", vertical: "middle" };

    // Type (M for manual, blank for registered to reduce noise)
    const typeCell = xlRow.getCell(4);
    typeCell.value = isManual ? "M" : "";
    typeCell.font = { ...fontBase, bold: isManual };
    typeCell.alignment = { horizontal: "center", vertical: "middle" };

    // Data cells
    row.cells.forEach((c, i) => {
      const xlCell = xlRow.getCell(5 + i);
      if (c.ms == null) {
        xlCell.value = null;
      } else {
        xlCell.value = msToExcelTime(c.ms);
        xlCell.numFmt = EXCEL_TIME_FORMAT;
      }
      xlCell.font = {
        ...fontBase,
        bold: c.isTotal,
        italic: fontBase.italic || c.isLap,
        size: c.isLap ? 10 : 11,
        color: {
          argb: c.isBest
            ? BEST_TEXT
            : c.isTotal
            ? TITLE_TEXT
            : c.isLap
            ? CAPTION_TEXT
            : SUBTITLE_TEXT,
        },
      };
      xlCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    });

    // Row fills (manual > alt > total-column emphasis)
    for (let col = 1; col <= nCols; col++) {
      const cell = xlRow.getCell(col);
      const def = model.columnDefs[col - 1];
      if (col > 4 && def.kind === "total") {
        const dataIdx = col - 5;
        const c = row.cells[dataIdx];
        if (c?.isBest) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BEST_FILL } };
        } else if (isAlt) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_COL_FILL } };
        } else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_COL_FILL } };
        }
      } else if (isAlt) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_FILL } };
      }
      // Meta/series group divider column
      const isMetaEnd = col === 4 && hasSuperHeader;
      const isGroupEnd = model.seriesGroups.some((g) => g.endCol === col);
      cell.border = {
        bottom: { style: "thin", color: { argb: BORDER_COLOR } },
        right: isMetaEnd || isGroupEnd ? { style: "thin", color: { argb: GROUP_BORDER } } : undefined,
      };
    }

    // Add trophy marker for best total — overwrite cell to include emoji prefix
    row.cells.forEach((c, i) => {
      if (!c.isBest || c.ms == null) return;
      const xlCell = xlRow.getCell(5 + i);
      // Replace numeric time with a formatted string (loses Excel time type but gains emoji)
      // Use a rich-text cell to keep the time numeric while prefixing the emoji.
      // ExcelJS rich text doesn't allow mixing number + text, so fallback to formula:
      // TEXT(value, "[mm]:ss.00") & " 🏆" — but that yields text. Simpler: just use a string.
      xlCell.value = `🏆 ${formatMs(c.ms)}`;
      xlCell.numFmt = "@"; // text format
      xlCell.font = { ...fontBase, bold: true, color: { argb: BEST_TEXT } };
    });

    rowIdx++;
  });

  // ── Column widths
  model.columnDefs.forEach((def, i) => {
    ws.getColumn(i + 1).width = def.width;
  });

  // ── Freeze header
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 1 }];

  // ── Print titles (repeat header rows on each printed page)
  const firstHeaderRow = hasSuperHeader ? SUPER_HEADER_ROW : HEADER_ROW;
  ws.pageSetup.printTitlesRow = `${firstHeaderRow}:${HEADER_ROW}`;

  // ── Footer — generated-at caption
  const footerRow = rowIdx + 1;
  ws.getRow(footerRow).height = 14;
  ws.mergeCells(`A${footerRow}:${lastColLetter}${footerRow}`);
  const footCell = ws.getCell(`A${footerRow}`);
  footCell.value = model.generatedAt;
  footCell.font = { name: "Calibri", size: 8, italic: true, color: { argb: CAPTION_TEXT } };
  footCell.alignment = { horizontal: "left", vertical: "middle" };

  // ── Write + download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filename = sanitizeFilename(model.title) + ".xlsx";
  triggerDownload(blob, filename);
}

// ── Time format helper (display only, not for Excel cell values) ───

function formatMs(ms: number): string {
  if (ms < 0) return "--:--.--";
  const totalSec = ms / 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec - minutes * 60;
  const secStr = seconds.toFixed(2).padStart(5, "0");
  return `${minutes}:${secStr}`;
}
