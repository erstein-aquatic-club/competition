import type { ChronoRecord, ChronoRecordSwimmer } from "./api/types";
import { normalizeRecordSwimmer } from "./chrono-types";
import { formatTime } from "../hooks/useChronoTimer";

export function sanitizeFilename(s: string): string {
  const cleaned = s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip accents
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "Chrono";
}

function maxSeriesCount(swimmers: ChronoRecordSwimmer[]): number {
  return Math.max(0, ...swimmers.map(sw => sw.splitsByRep.length));
}

function maxSplitsInSeries(swimmers: ChronoRecordSwimmer[], seriesIdx: number): number {
  return Math.max(0, ...swimmers.map(sw => sw.splitsByRep[seriesIdx]?.length ?? 0));
}

/** Pure — builds 2D array for xlsx. Testable without loading SheetJS. */
export function buildSheetData(record: Pick<ChronoRecord, "label" | "config" | "swimmers" | "created_at">): (string | number)[][] {
  const swimmers = record.swimmers.map(normalizeRecordSwimmer);
  const nSeries = maxSeriesCount(swimmers);
  const splitD = record.config.splitDistanceM;
  const labelFor = (i: number) => splitD > 0 ? `${(i + 1) * splitD}m` : `#${i + 1}`;

  const rows: (string | number)[][] = [];
  rows.push([record.label || "Chrono"]);
  rows.push([new Date(record.created_at).toLocaleString("fr-FR")]);
  const configParts: string[] = [];
  if (record.config.seriesCount > 0) configParts.push(`${record.config.seriesCount}×`);
  if (record.config.totalDistanceM > 0) configParts.push(`${record.config.totalDistanceM}m`);
  if (record.config.splitDistanceM > 0) configParts.push(`splits ${record.config.splitDistanceM}m`);
  configParts.push(`${record.config.laneCount} ligne${record.config.laneCount > 1 ? "s" : ""}`);
  rows.push([configParts.join(" · ")]);
  rows.push([]);

  // header
  const header: string[] = ["Nageur", "Ligne", "Vague", "Type"];
  for (let s = 0; s < nSeries; s++) {
    header.push(`S${s + 1} total`);
    const nSplits = maxSplitsInSeries(swimmers, s);
    for (let i = 0; i < nSplits; i++) {
      header.push(`S${s + 1} ${labelFor(i)}`);
    }
  }
  rows.push(header);

  for (const sw of swimmers) {
    const row: (string | number)[] = [
      sw.displayName,
      sw.lane,
      `V${sw.wave}`,
      sw.kind === "manual" ? "M" : "C",
    ];
    for (let s = 0; s < nSeries; s++) {
      const splits = sw.splitsByRep[s] ?? [];
      const total = splits.length > 0 ? splits[splits.length - 1].cumulativeMs : 0;
      row.push(total > 0 ? formatTime(total) : "");
      const nSplits = maxSplitsInSeries(swimmers, s);
      for (let i = 0; i < nSplits; i++) {
        const split = splits[i];
        row.push(split ? formatTime(split.cumulativeMs) : "");
      }
    }
    rows.push(row);
  }
  return rows;
}

export async function exportChronoToXlsx(record: Pick<ChronoRecord, "label" | "config" | "swimmers" | "created_at">): Promise<void> {
  const XLSX = await import("xlsx");
  const data = buildSheetData(record);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Chrono");
  const filename = sanitizeFilename(record.label || "Chrono") + ".xlsx";
  XLSX.writeFile(wb, filename);
}
