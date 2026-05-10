import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type ClubRecord,
  type ClubPerformanceRanked,
  getImportLogs,
  getClubRecords,
  getClubRanking,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";

// ── Constants ──

const POOLS = [
  { key: "25", label: "25m" },
  { key: "50", label: "50m" },
];

const SEXES = [
  { key: "M", label: "G" },
  { key: "F", label: "F" },
];

const AGE_OPTIONS = [
  { key: "ALL", label: "Tous les âges" },
  { key: "8", label: "≤ 8 ans" },
  { key: "9", label: "9 ans" },
  { key: "10", label: "10 ans" },
  { key: "11", label: "11 ans" },
  { key: "12", label: "12 ans" },
  { key: "13", label: "13 ans" },
  { key: "14", label: "14 ans" },
  { key: "15", label: "15 ans" },
  { key: "16", label: "16 ans" },
  { key: "17", label: "≥ 17 ans" },
];

const STROKE_SECTIONS = [
  {
    key: "FREE",
    label: "Nage Libre",
    events: [
      { id: "50_FREE", label: "50 NL" },
      { id: "100_FREE", label: "100 NL" },
      { id: "200_FREE", label: "200 NL" },
      { id: "400_FREE", label: "400 NL" },
      { id: "800_FREE", label: "800 NL" },
      { id: "1500_FREE", label: "1500 NL" },
    ],
  },
  {
    key: "BACK",
    label: "Dos",
    events: [
      { id: "50_BACK", label: "50 Dos" },
      { id: "100_BACK", label: "100 Dos" },
      { id: "200_BACK", label: "200 Dos" },
    ],
  },
  {
    key: "BREAST",
    label: "Brasse",
    events: [
      { id: "50_BREAST", label: "50 Br" },
      { id: "100_BREAST", label: "100 Br" },
      { id: "200_BREAST", label: "200 Br" },
    ],
  },
  {
    key: "FLY",
    label: "Papillon",
    events: [
      { id: "50_FLY", label: "50 Pap" },
      { id: "100_FLY", label: "100 Pap" },
      { id: "200_FLY", label: "200 Pap" },
    ],
  },
  {
    key: "IM",
    label: "4 Nages",
    events: [
      { id: "100_IM", label: "100 4N" },
      { id: "200_IM", label: "200 4N" },
      { id: "400_IM", label: "400 4N" },
    ],
  },
];

// ── Helpers ──

const formatTime = (ms?: number | null) => {
  if (!ms && ms !== 0) return "-";
  const totalCenti = Math.round(ms / 10);
  const centi = totalCenti % 100;
  const totalSec = Math.floor(totalCenti / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  const pad2 = (v: number) => String(v).padStart(2, "0");
  if (min > 0) return `${min}:${pad2(sec)}.${pad2(centi)}`;
  return `${sec}.${pad2(centi)}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("fr-FR");
};

const formatYear = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : String(d.getFullYear());
};

const formatLastUpdate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return (
    d.toLocaleDateString("fr-FR") +
    " à " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
};

const getAgeLabel = (age: number) =>
  age === 8 ? "≤8" : age === 17 ? "≥17" : String(age);

// ── Segmented Control ──

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ──

export default function RecordsClub() {
  const [pool, setPool] = useState("50");
  const [sex, setSex] = useState("M");
  const [ageFilter, setAgeFilter] = useState("17");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [expandedAgeKey, setExpandedAgeKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const ageValue = ageFilter === "ALL" ? null : Number(ageFilter);

  // Reset expansion on filter change
  const handlePoolChange = useCallback((val: string) => {
    setPool(val);
    setExpandedEvent(null);
    setExpandedAgeKey(null);
  }, []);

  const handleSexChange = useCallback((val: string) => {
    setSex(val);
    setExpandedEvent(null);
    setExpandedAgeKey(null);
  }, []);

  const handleAgeChange = useCallback((val: string) => {
    setAgeFilter(val);
    setExpandedEvent(null);
    setExpandedAgeKey(null);
  }, []);

  // Last import log
  const { data: lastImportLogs } = useQuery({
    queryKey: ["last-import"],
    queryFn: () => getImportLogs({ limit: 1 }),
  });

  // Records
  const {
    data: records = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["club-records", pool, sex, ageFilter],
    queryFn: () =>
      getClubRecords({
        pool_m: Number(pool),
        sex,
        age: ageValue,
      }),
  });

  // Ranking query key — depends on mode
  const expandedRankingKey = useMemo(() => {
    if (!expandedEvent) return null;
    // Specific age: ranking for the expanded event + current age
    if (ageValue !== null) {
      return `${expandedEvent}__${pool}__${sex}__${ageFilter}`;
    }
    // All ages: ranking for drilled-down age row
    return expandedAgeKey;
  }, [expandedEvent, ageValue, expandedAgeKey, pool, sex, ageFilter]);

  const { data: rankingData, isFetching: rankingLoading } = useQuery({
    queryKey: ["club-ranking", expandedRankingKey],
    queryFn: () => {
      if (!expandedRankingKey) return [] as ClubPerformanceRanked[];
      const parts = expandedRankingKey.split("__");
      return getClubRanking({
        event_code: parts[0],
        pool_m: Number(parts[1]),
        sex: parts[2],
        age: Number(parts[3]),
      });
    },
    enabled: !!expandedRankingKey,
  });

  // Group records by event, sorted by age
  const recordsByEvent = useMemo(() => {
    const map = new Map<string, ClubRecord[]>();
    for (const r of records) {
      const list = map.get(r.event_code) ?? [];
      list.push(r);
      map.set(r.event_code, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.age - b.age);
    }
    return map;
  }, [records]);

  // Best record per event (fastest time)
  const bestByEvent = useMemo(() => {
    const map = new Map<string, ClubRecord>();
    for (const [eventCode, list] of recordsByEvent) {
      let best = list[0];
      for (const r of list) {
        if (r.time_ms < best.time_ms) best = r;
      }
      map.set(eventCode, best);
    }
    return map;
  }, [recordsByEvent]);

  const toggleEventExpand = useCallback((eventCode: string) => {
    setExpandedEvent((prev) => {
      setExpandedAgeKey(null);
      return prev === eventCode ? null : eventCode;
    });
  }, []);

  const toggleAgeRanking = useCallback(
    (record: ClubRecord) => {
      const key = `${record.event_code}__${pool}__${sex}__${record.age}`;
      setExpandedAgeKey((prev) => (prev === key ? null : key));
    },
    [pool, sex],
  );

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const allRecords = await getClubRecords({});
      const { exportRecordsPdf } = await import("@/lib/export-records-pdf");
      await exportRecordsPdf(allRecords);
    } catch {
      // Silently fail
    } finally {
      setExporting(false);
    }
  }, []);

  // Sections that have data
  const activeSections = useMemo(
    () =>
      STROKE_SECTIONS.map((section) => ({
        ...section,
        activeEvents: section.events.filter((e) => recordsByEvent.has(e.id)),
      })).filter((s) => s.activeEvents.length > 0),
    [recordsByEvent],
  );

  return (
    <div className="space-y-3">
      <h1 className="sr-only">Records du club</h1>
      {/* Header */}
      <PageHeader
        title="Records du club"
        subtitle={
          lastImportLogs?.[0]?.status === "success"
            ? `MAJ : ${formatLastUpdate(
                lastImportLogs[0].completed_at ?? lastImportLogs[0].started_at,
              ) ?? "-"}`
            : undefined
        }
        icon={<Trophy className="h-3.5 w-3.5" />}
        backHref="/hall-of-fame"
        backLabel="Retour aux classements"
        action={(
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={exporting}
            className="border-primary/20 text-primary hover:bg-primary/5"
          >
            <Download className="h-4 w-4 mr-1" />
            {exporting ? "..." : "PDF"}
          </Button>
        )}
      />

      <div className="flex items-center gap-2">
        <SegmentedControl
          options={POOLS}
          value={pool}
          onChange={handlePoolChange}
        />
        <SegmentedControl
          options={SEXES}
          value={sex}
          onChange={handleSexChange}
        />
        <div className="ml-auto w-36">
          <Select value={ageFilter} onValueChange={handleAgeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGE_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 w-full rounded-xl bg-muted animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="font-semibold">Impossible de charger les données</h3>
          <p className="text-sm text-muted-foreground mt-2">
            {error instanceof Error
              ? error.message
              : "Une erreur s'est produite"}
          </p>
          <Button onClick={() => refetch()} className="mt-4">
            Réessayer
          </Button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && records.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucun record pour ces filtres.
        </p>
      )}

      {/* Content — stroke sections */}
      {!isLoading && !error && activeSections.length > 0 && (
        <div className="space-y-5 pb-4">
          {activeSections.map((section) => (
            <div key={section.key}>
              {/* Section header */}
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 w-1 rounded-full bg-primary" />
                <h2 className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </h2>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Event cards */}
              <div className="space-y-1.5">
                {section.activeEvents.map((event) => {
                  const best = bestByEvent.get(event.id)!;
                  const ageRecords = recordsByEvent.get(event.id) ?? [];
                  const isExpanded = expandedEvent === event.id;

                  return (
                    <EventCard
                      key={event.id}
                      eventLabel={event.label}
                      bestRecord={best}
                      ageRecords={ageRecords}
                      isExpanded={isExpanded}
                      isAllAges={ageValue === null}
                      onToggle={() => toggleEventExpand(event.id)}
                      onAgeRowTap={toggleAgeRanking}
                      expandedAgeKey={expandedAgeKey}
                      rankingData={rankingData}
                      rankingLoading={rankingLoading}
                      pool={pool}
                      sex={sex}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Event Card ──

function EventCard({
  eventLabel,
  bestRecord,
  ageRecords,
  isExpanded,
  isAllAges,
  onToggle,
  onAgeRowTap,
  expandedAgeKey,
  rankingData,
  rankingLoading,
  pool,
  sex,
}: {
  eventLabel: string;
  bestRecord: ClubRecord;
  ageRecords: ClubRecord[];
  isExpanded: boolean;
  isAllAges: boolean;
  onToggle: () => void;
  onAgeRowTap: (record: ClubRecord) => void;
  expandedAgeKey: string | null;
  rankingData?: ClubPerformanceRanked[];
  rankingLoading: boolean;
  pool: string;
  sex: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        isExpanded ? "border-primary/25 shadow-sm" : "border-border",
      )}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3.5 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">
            {eventLabel}
          </span>
          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <span className="font-mono text-primary font-bold tabular-nums text-[15px] leading-none">
                {formatTime(bestRecord.time_ms)}
              </span>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                  {bestRecord.athlete_name}
                </span>
                {isAllAges && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {getAgeLabel(bestRecord.original_age ?? bestRecord.age)}a
                  </span>
                )}
                {formatYear(bestRecord.record_date) && (
                  <span className="text-[10px] text-muted-foreground/60">
                    ({formatYear(bestRecord.record_date)})
                  </span>
                )}
              </div>
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border">
          {isAllAges ? (
            <AgeBreakdown
              records={ageRecords}
              bestTime={bestRecord.time_ms}
              onAgeRowTap={onAgeRowTap}
              expandedAgeKey={expandedAgeKey}
              rankingData={rankingData}
              rankingLoading={rankingLoading}
              pool={pool}
              sex={sex}
            />
          ) : (
            <RankingPanel
              record={bestRecord}
              eventLabel={eventLabel}
              rankingData={rankingData}
              rankingLoading={rankingLoading}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Age Breakdown (all-ages mode expansion) ──

function AgeBreakdown({
  records,
  bestTime,
  onAgeRowTap,
  expandedAgeKey,
  rankingData,
  rankingLoading,
  pool,
  sex,
}: {
  records: ClubRecord[];
  bestTime: number;
  onAgeRowTap: (record: ClubRecord) => void;
  expandedAgeKey: string | null;
  rankingData?: ClubPerformanceRanked[];
  rankingLoading: boolean;
  pool: string;
  sex: string;
}) {
  return (
    <div className="divide-y divide-border/50">
      {records.map((record) => {
        const isBest = record.time_ms === bestTime;
        const key = `${record.event_code}__${pool}__${sex}__${record.age}`;
        const isAgeExpanded = expandedAgeKey === key;
        const isCascaded =
          record.original_age != null && record.original_age !== record.age;
        const originalAgeLabel = record.original_age
          ? getAgeLabel(record.original_age)
          : null;

        return (
          <div key={record.age}>
            <button
              type="button"
              onClick={() => onAgeRowTap(record)}
              className={cn(
                "w-full text-left px-3.5 py-2 flex items-center gap-2.5 hover:bg-muted/40 transition-colors",
                isBest && "bg-primary/[0.03]",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-semibold w-7 text-center shrink-0 tabular-nums",
                  isBest ? "text-primary" : "text-muted-foreground",
                )}
              >
                {getAgeLabel(record.age)}a
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums text-sm shrink-0",
                  isBest
                    ? "text-primary font-bold"
                    : "text-foreground font-medium",
                )}
              >
                {formatTime(record.time_ms)}
              </span>
              <span className="text-xs text-muted-foreground flex-1 truncate">
                {record.athlete_name}
                {isCascaded && originalAgeLabel && (
                  <span className="ml-1 opacity-70">({originalAgeLabel}a)</span>
                )}
              </span>
              {formatYear(record.record_date) && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatYear(record.record_date)}
                </span>
              )}
              {isBest && (
                <Trophy className="h-3 w-3 text-rank-gold shrink-0" />
              )}
              {isAgeExpanded ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </button>

            {/* Inline ranking for this age */}
            {isAgeExpanded && (
              <InlineRanking
                record={record}
                rankingData={rankingData}
                rankingLoading={rankingLoading}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inline Ranking (nested within age breakdown) ──

function InlineRanking({
  record,
  rankingData,
  rankingLoading,
}: {
  record: ClubRecord;
  rankingData?: ClubPerformanceRanked[];
  rankingLoading: boolean;
}) {
  const isCascaded =
    record.original_age != null && record.original_age !== record.age;

  const rows = useMemo(() => {
    const agePerfs = rankingData ?? [];
    if (!isCascaded) return agePerfs;

    const recordEntry: ClubPerformanceRanked = {
      id: -1,
      athlete_name: record.athlete_name,
      swimmer_iuf: record.swimmer_iuf ?? null,
      sex: record.sex,
      pool_m: record.pool_m,
      event_code: record.event_code,
      event_label: record.event_label,
      age: record.original_age ?? record.age,
      actual_age: record.original_age ?? record.age,
      time_ms: record.time_ms,
      record_date: record.record_date,
    };

    return [recordEntry, ...agePerfs];
  }, [rankingData, record, isCascaded]);

  return (
    <div className="bg-muted/30 px-3.5 py-2 ml-7 border-l-2 border-primary/20">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        Classement ({getAgeLabel(record.age)} ans)
      </p>
      {rankingLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-4 w-full rounded bg-muted animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune donnée.</p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((perf, idx) => {
            const isRecordHolder = idx === 0 && isCascaded && perf.id === -1;
            return (
              <div
                key={perf.id === -1 ? "record-holder" : perf.id}
                className={cn(
                  "flex items-center gap-2 text-xs py-0.5",
                  idx === 0 && "font-semibold text-primary",
                )}
              >
                <span className="w-4 text-center shrink-0 text-[10px]">
                  {idx === 0 ? (
                    <Trophy className="inline h-3 w-3 text-rank-gold" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="font-mono tabular-nums w-14 shrink-0 text-[11px]">
                  {formatTime(perf.time_ms)}
                </span>
                <span className="flex-1 truncate text-[11px]">
                  {perf.athlete_name}
                  {isRecordHolder && (
                    <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                      (record)
                    </span>
                  )}
                </span>
                {formatYear(perf.record_date) && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatYear(perf.record_date)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Ranking Panel (specific-age mode expansion) ──

function RankingPanel({
  record,
  eventLabel,
  rankingData,
  rankingLoading,
}: {
  record: ClubRecord;
  eventLabel: string;
  rankingData?: ClubPerformanceRanked[];
  rankingLoading: boolean;
}) {
  const isCascaded =
    record.original_age != null && record.original_age !== record.age;
  const originalAgeLabel = record.original_age
    ? getAgeLabel(record.original_age)
    : null;
  const ageLabel = getAgeLabel(record.age);

  const rows = useMemo(() => {
    const agePerfs = rankingData ?? [];
    if (!isCascaded) return agePerfs;

    const recordEntry: ClubPerformanceRanked = {
      id: -1,
      athlete_name: record.athlete_name,
      swimmer_iuf: record.swimmer_iuf ?? null,
      sex: record.sex,
      pool_m: record.pool_m,
      event_code: record.event_code,
      event_label: record.event_label,
      age: record.original_age ?? record.age,
      actual_age: record.original_age ?? record.age,
      time_ms: record.time_ms,
      record_date: record.record_date,
    };

    return [recordEntry, ...agePerfs];
  }, [rankingData, record, isCascaded]);

  return (
    <div className="bg-muted/20 px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Classement — {eventLabel} ({ageLabel} ans)
      </p>

      {rankingLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-5 w-full rounded bg-muted animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucune donnée de classement.
        </p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((perf, idx) => {
            const isRecordHolder = idx === 0 && isCascaded && perf.id === -1;
            return (
              <div
                key={perf.id === -1 ? "record-holder" : perf.id}
                className={cn(
                  "flex items-center gap-2 text-xs py-1 rounded-md px-1",
                  idx === 0 && "font-semibold text-primary",
                  isRecordHolder && "bg-primary/5",
                )}
              >
                <span className="w-5 text-center shrink-0">
                  {idx === 0 ? (
                    <Trophy className="inline h-3 w-3 text-rank-gold" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="font-mono tabular-nums w-16 shrink-0">
                  {formatTime(perf.time_ms)}
                </span>
                <span className="flex-1 truncate">
                  {perf.athlete_name}
                  {isRecordHolder && originalAgeLabel && (
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      (record {originalAgeLabel}a)
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {perf.actual_age ?? perf.age}a
                </span>
                {formatYear(perf.record_date) && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatYear(perf.record_date)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
