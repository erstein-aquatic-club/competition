import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { SwimRecordWithPool } from "@/lib/types";

function formatDateShort(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatTimeSeconds(value?: number | null) {
  if (value === null || value === undefined) return "—";
  const ms = Math.round(Math.max(0, value * 1000));
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centi = Math.floor((ms % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centi).padStart(2, "0")}`;
  }
  return `${seconds}.${String(centi).padStart(2, "0")}`;
}

export interface RecordCardProps {
  record: SwimRecordWithPool;
  onClick: (record: SwimRecordWithPool) => void;
}

function RecordCardImpl({ record, onClick }: RecordCardProps) {
  return (
    <Card
      className="rounded-2xl h-full cursor-pointer active:scale-[0.97] transition-transform"
      onClick={() => onClick(record)}
    >
      <CardContent className="p-0">
        <div className="flex flex-col gap-1 px-3 py-3">
          <span className="text-sm font-semibold truncate">{record.event_name}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-primary font-bold tabular-nums text-sm">
              {formatTimeSeconds(record.time_seconds)}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatDateShort(record.record_date)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const RecordCard = memo(RecordCardImpl, (prev, next) =>
  prev.record === next.record && prev.onClick === next.onClick,
);
