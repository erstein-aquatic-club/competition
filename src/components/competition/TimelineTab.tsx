import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCompetitionRaces, getRaceRoutines, getRoutineTemplates } from "@/lib/api";
import { eventLabel } from "@/lib/objectiveHelpers";
import { Clock } from "lucide-react";

/* ── Props ──────────────────────────────────────────────── */

interface TimelineTabProps {
  competitionId: string;
  competitionDate: string;
  competitionEndDate?: string | null;
}

/* ── Timeline entry type ────────────────────────────────── */

interface TimelineEntry {
  time: string;
  label: string;
  type: "race" | "step";
  eventCode?: string;
  isFinale?: boolean;
}

/* ── Helpers ─────────────────────────────────────────────── */

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 1440) + 1440) % 1440 % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Generate array of date strings from start to end (inclusive). */
function dateRange(start: string, end?: string | null): string[] {
  const dates: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = end ? new Date(end + "T00:00:00") : s;
  const current = new Date(s);
  while (current <= e) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** Short day label: "Sam. 15", "Dim. 16" */
function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.toLocaleDateString("fr-FR", { weekday: "short" });
  // Capitalize first letter
  const capitalized = day.charAt(0).toUpperCase() + day.slice(1);
  return `${capitalized} ${d.getDate()}`;
}

/* ── Component ───────────────────────────────────────────── */

export default function TimelineTab({
  competitionId,
  competitionDate,
  competitionEndDate,
}: TimelineTabProps) {
  const days = useMemo(
    () => dateRange(competitionDate, competitionEndDate),
    [competitionDate, competitionEndDate],
  );
  const isMultiDay = days.length > 1;
  const [selectedDay, setSelectedDay] = useState(days[0]);

  /* ── Queries (shared cache with other tabs) ──────────── */

  const { data: races = [] } = useQuery({
    queryKey: ["competition-races", competitionId],
    queryFn: () => getCompetitionRaces(competitionId),
  });

  const { data: raceRoutines = [] } = useQuery({
    queryKey: ["race-routines", competitionId],
    queryFn: () => getRaceRoutines(competitionId),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["routine-templates"],
    queryFn: () => getRoutineTemplates(),
  });

  /* ── Build timeline ──────────────────────────────────── */

  const { timed, untimed } = useMemo(() => {
    // Filter races for selected day
    const dayRaces = races.filter((r) => r.race_day === selectedDay);

    // Build routine map: raceId -> RoutineTemplate
    const routineByRaceId = new Map<string, typeof templates[number]>();
    for (const rr of raceRoutines) {
      const tmpl = templates.find((t) => t.id === rr.routine_id);
      if (tmpl) routineByRaceId.set(rr.race_id, tmpl);
    }

    const timedEntries: TimelineEntry[] = [];
    const untimedRaces: typeof dayRaces = [];

    for (const race of dayRaces) {
      if (!race.start_time) {
        untimedRaces.push(race);
        continue;
      }

      // Add race entry
      const suffix = race.race_type === "finale"
        ? race.final_letter ? ` — Finale ${race.final_letter}` : " — Finale"
        : "";
      timedEntries.push({
        time: race.start_time.slice(0, 5), // HH:MM
        label: eventLabel(race.event_code) + suffix,
        type: "race",
        eventCode: race.event_code,
        isFinale: race.race_type === "finale",
      });

      // Add routine step entries
      const routine = routineByRaceId.get(race.id);
      if (routine?.steps) {
        for (const step of routine.steps) {
          timedEntries.push({
            time: addMinutesToTime(race.start_time.slice(0, 5), step.offset_minutes),
            label: step.label,
            type: "step",
          });
        }
      }
    }

    // Sort chronologically
    timedEntries.sort((a, b) => a.time.localeCompare(b.time));

    return { timed: timedEntries, untimed: untimedRaces };
  }, [races, raceRoutines, templates, selectedDay]);

  /* ── Empty state ─────────────────────────────────────── */

  if (races.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Ajoute des courses et des routines pour voir ta timeline
        </p>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Day selector (multi-day only) */}
      {isMultiDay && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                day === selectedDay
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {dayLabel(day)}
            </button>
          ))}
        </div>
      )}

      {/* Timed entries — vertical timeline */}
      {timed.length > 0 && (
        <div className="relative ml-[44px] border-l-2 border-border">
          {timed.map((entry, i) => (
            <div key={`${entry.time}-${entry.label}-${i}`} className="relative flex items-start pb-4 last:pb-0">
              {/* Time label — positioned to the left of the line */}
              <span className={`absolute -left-[52px] w-[44px] text-right text-xs font-mono tabular-nums leading-5 ${
                entry.isFinale ? "font-semibold text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"
              }`}>
                {entry.time}
              </span>

              {/* Dot on the line */}
              <div className="absolute -left-[5px] top-1.5">
                {entry.isFinale ? (
                  <div className="h-3 w-3 -ml-[1px] rounded-full bg-yellow-500 ring-2 ring-yellow-500/30" />
                ) : entry.type === "race" ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                )}
              </div>

              {/* Label */}
              <div className="pl-4">
                {entry.isFinale ? (
                  <span className="text-sm leading-5 font-bold text-yellow-700 dark:text-yellow-300">
                    ★ {entry.label}
                  </span>
                ) : (
                  <span
                    className={`text-sm leading-5 ${
                      entry.type === "race" ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {entry.label}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Untimed races */}
      {untimed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Heure à définir
          </p>
          {untimed.map((race) => (
            <div
              key={race.id}
              className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2.5"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500/50 shrink-0" />
              <span className="text-sm font-medium">
                {eventLabel(race.event_code)}
                {race.race_type === "finale" && (race.final_letter ? ` — Finale ${race.final_letter}` : " — Finale")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* No entries for selected day */}
      {timed.length === 0 && untimed.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune course ce jour
          </p>
        </div>
      )}
    </div>
  );
}
