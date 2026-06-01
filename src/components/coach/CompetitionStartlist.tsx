/**
 * CompetitionStartlist — coach-facing enriched startlist viewer.
 *
 * A wide right-side Sheet. The coach pastes a liveffn "liste de départ par
 * structure" URL, generates the listing, links unmatched names to app swimmers
 * (persisted on the competition), and reads an enriched schedule per swimmer or
 * chronologically: day/time, série/couloir, best recent perf + how long ago,
 * and the objective target time (same numbers as the fiches objectifs).
 *
 * ALL backend + assembly logic lives elsewhere (Tasks 1-5):
 *   - parseStartlist / matchSwimmers / buildStartlistRows (pure)
 *   - fetchStartlistHtml (edge proxy) / getAthletes / getSwimmerPerformances
 *   - getObjectivesByCompetition / updateCompetition
 * This file only fetches, wires the maps, and renders.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Target, AlertTriangle, RefreshCw, Link2Off } from "lucide-react";

import {
  fetchStartlistHtml,
  getAthletes,
  getSwimmerPerformances,
  updateCompetition,
} from "@/lib/api";
import type { Competition } from "@/lib/api";
import { getObjectivesByCompetition } from "@/lib/api/objectives";
import { supabase } from "@/lib/supabase";

import { parseStartlist } from "@/lib/liveffn/parseStartlist";
import { startlistKey, autoMatch } from "@/lib/liveffn/matchSwimmers";
import {
  buildStartlistRows,
  bySwimmer,
  chronological,
  type StartlistRow,
} from "@/lib/liveffn/buildStartlistRows";
import { formatTime, strokeFromCode, STROKE_COLORS } from "@/lib/objectiveHelpers";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Relative-time label for a perf date — copied verbatim from
 * ObjectiveCard.tsx so the wording matches the fiches objectifs.
 */
function timeAgo(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 60) return `il y a ${days}j`;
  const months = Math.round(days / 30);
  return `il y a ${months}m`;
}

const NON_LIE = "__none__"; // Select value sentinel for "Non lié" (→ null)

/** liveffn URL validation: host liveffn.com + path ending startlist.php. */
function isValidStartlistUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return /(^|\.)liveffn\.com$/i.test(u.hostname) && /startlist\.php$/i.test(u.pathname);
  } catch {
    return false;
  }
}

// ── Match Select (link a startlist swimmer to an app athlete) ────

function MatchSelect({
  value,
  candidates,
  onChange,
}: {
  value: number | null;
  candidates: Array<{ id: number; display_name: string }>;
  onChange: (v: number | null) => void;
}) {
  return (
    <Select
      value={value == null ? NON_LIE : String(value)}
      onValueChange={(v) => onChange(v === NON_LIE ? null : Number(v))}
    >
      <SelectTrigger className="h-7 w-44 text-[11px]">
        <SelectValue placeholder="Lier à un nageur…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NON_LIE} className="text-[11px] text-muted-foreground">
          Non lié
        </SelectItem>
        {candidates.map((c) => (
          <SelectItem key={c.id} value={String(c.id)} className="text-[11px]">
            {c.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Race row ────────────────────────────────────────────────────

function RaceRow({
  row,
  index,
  showSwimmer,
}: {
  row: StartlistRow;
  index: number;
  showSwimmer: boolean;
}) {
  const stroke = row.eventCode ? strokeFromCode(row.eventCode) : null;
  const accent = stroke ? STROKE_COLORS[stroke] ?? "border-l-muted-foreground/20" : "border-l-muted-foreground/20";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border/60 border-l-4 bg-card px-2.5 py-1.5",
        "animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none fill-mode-both",
        accent,
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[13px] font-semibold truncate leading-tight">
            {row.eventLabel}
          </span>
          {showSwimmer && (
            <span className="text-[10px] text-muted-foreground truncate">
              · {row.swimmerName}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight">
          {row.day && row.time ? `${row.day} · ${row.time}` : row.day || row.time || "—"}
        </p>
        {(row.heat != null || row.lane != null) && (
          <p className="text-[10px] text-muted-foreground/60 tabular-nums leading-tight">
            {row.heat != null && `série ${row.heat}`}
            {row.heat != null && row.lane != null && " · "}
            {row.lane != null && `couloir ${row.lane}`}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right space-y-0.5">
        {/* Best recent perf */}
        {row.linked ? (
          row.bestPerf ? (
            <p className="text-[11px] font-mono tabular-nums text-muted-foreground leading-tight">
              {formatTime(row.bestPerf.time)}
              {row.bestPerf.date && (
                <span className="text-muted-foreground/40 font-sans ml-1">
                  {timeAgo(row.bestPerf.date)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/40 leading-tight">—</p>
          )
        ) : (
          <p className="text-[11px] text-muted-foreground/30 leading-tight">—</p>
        )}

        {/* Objective target */}
        {row.linked && row.objectiveTarget != null ? (
          <p className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-primary font-semibold leading-tight">
            <Target className="h-3 w-3" aria-hidden />
            {formatTime(row.objectiveTarget)}
          </p>
        ) : row.linked ? (
          <p className="text-[10px] text-muted-foreground/30 leading-tight">—</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────

type Props = {
  competition: Competition;
  open: boolean;
  onOpenChange: (b: boolean) => void;
};

type View = "swimmer" | "chrono";

export default function CompetitionStartlist({ competition, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  // ── State (all hooks above any early return) ──
  const [url, setUrl] = useState(competition.liveffn_startlist_url ?? "");
  const [overrides, setOverrides] = useState<Record<string, number | null>>(
    competition.startlist_athlete_map ?? {},
  );
  const [view, setView] = useState<View>("swimmer");
  const [shouldFetch, setShouldFetch] = useState<boolean>(
    !!competition.liveffn_startlist_url,
  );

  const urlValid = isValidStartlistUrl(url);
  const savedUrl = competition.liveffn_startlist_url ?? "";

  // ── Athletes (match candidates) ──
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
  });

  const candidates = useMemo(
    () =>
      athletes
        .filter((a) => a.id != null)
        .map((a) => ({ id: a.id as number, display_name: a.display_name })),
    [athletes],
  );

  // ── Save URL ──
  const saveUrlMutation = useMutation({
    mutationFn: (liveffn_startlist_url: string) =>
      updateCompetition(competition.id, { liveffn_startlist_url }),
    onSuccess: () => {
      toast("Lien enregistré");
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
    },
    onError: (err: Error) => toast.error("Erreur", { description: err.message }),
  });

  // ── Persist a single mapping (merged) ──
  const saveMapMutation = useMutation({
    mutationFn: (map: Record<string, number | null>) =>
      updateCompetition(competition.id, { startlist_athlete_map: map }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
    },
    onError: (err: Error) => toast.error("Erreur", { description: err.message }),
  });

  // ── Fetch + parse the startlist HTML ──
  const startlistQuery = useQuery({
    queryKey: ["startlist", competition.id, savedUrl],
    enabled: open && shouldFetch && !!savedUrl,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const html = await fetchStartlistHtml(savedUrl);
      return parseStartlist(html);
    },
  });

  const parsed = startlistQuery.data;
  const swimmers = useMemo(() => parsed?.swimmers ?? [], [parsed]);

  // ── Matching ──
  const matches = useMemo(
    () => autoMatch(swimmers, candidates, overrides),
    [swimmers, candidates, overrides],
  );

  // numeric ids that ended up matched
  const matchedIds = useMemo(
    () => Array.from(new Set(Object.values(matches).filter((v): v is number => typeof v === "number"))),
    [matches],
  );
  const matchedKey = matchedIds.slice().sort((a, b) => a - b).join(",");

  // ── Enrichment: perfs per matched id + objectives (UUID→numeric bridge) ──
  const enrichmentQuery = useQuery({
    queryKey: ["startlist-enrichment", competition.id, matchedKey],
    enabled: open && matchedIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [perfPairs, objectives, authRes] = await Promise.all([
        Promise.all(
          matchedIds.map((id) =>
            getSwimmerPerformances({ userId: id }).then((p) => [id, p] as const),
          ),
        ),
        getObjectivesByCompetition(competition.id),
        supabase.rpc("get_auth_uids_for_users", { p_user_ids: matchedIds }),
      ]);

      const perfsByUser: Record<
        number,
        Array<{ event_code: string; pool_length?: number | null; time_seconds?: number | null; competition_date?: string | null }>
      > = {};
      for (const [id, perfs] of perfPairs) perfsByUser[id] = perfs;

      // UUID → numeric user id (objectives are keyed by auth UUID).
      const uidToNumeric = new Map<string, number>();
      for (const r of (authRes.data ?? []) as Array<{ auth_uid: string; user_id: number }>) {
        uidToNumeric.set(r.auth_uid, r.user_id);
      }

      const objectivesByUser: Record<
        number,
        Array<{ event_code: string; target_time_seconds?: number | null }>
      > = {};
      for (const obj of objectives) {
        const numericId = uidToNumeric.get(obj.athlete_id);
        if (numericId == null) continue;
        if (!obj.event_code) continue;
        (objectivesByUser[numericId] ??= []).push({
          event_code: obj.event_code,
          target_time_seconds: obj.target_time_seconds ?? null,
        });
      }

      return { perfsByUser, objectivesByUser };
    },
  });

  // ── athleteName map (numeric id → display_name) ──
  const athleteName = useMemo(() => {
    const m: Record<number, string> = {};
    for (const c of candidates) m[c.id] = c.display_name;
    return m;
  }, [candidates]);

  // ── Assembled rows ──
  const rows = useMemo(() => {
    if (swimmers.length === 0) return [];
    return buildStartlistRows({
      swimmers,
      matches,
      athleteName,
      perfsByUser: enrichmentQuery.data?.perfsByUser ?? {},
      objectivesByUser: enrichmentQuery.data?.objectivesByUser ?? {},
    });
  }, [swimmers, matches, athleteName, enrichmentQuery.data]);

  const grouped = useMemo(() => bySwimmer(rows), [rows]);
  const chrono = useMemo(() => chronological(rows), [rows]);

  // ── Handlers ──
  const handleSaveUrl = () => {
    if (!urlValid) return;
    saveUrlMutation.mutate(url.trim());
  };

  const handleGenerate = () => {
    // Save the URL first if it changed, then enable the fetch.
    const trimmed = url.trim();
    if (trimmed !== savedUrl) {
      saveUrlMutation.mutate(trimmed, {
        onSuccess: () => {
          setShouldFetch(true);
          void startlistQuery.refetch();
        },
      });
    } else {
      setShouldFetch(true);
      void startlistQuery.refetch();
    }
  };

  const handleMatchChange = (key: string, value: number | null) => {
    setOverrides((prev) => {
      const next = { ...prev, [key]: value };
      saveMapMutation.mutate(next);
      return next;
    });
  };

  const fetchError =
    startlistQuery.error instanceof Error ? startlistQuery.error.message : null;
  const isFetching = startlistQuery.isFetching;

  // ── Render ──
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Liste de départ liveffn</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* ── URL field ── */}
          <div className="space-y-1.5">
            <Label
              htmlFor="startlist-url"
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Lien liveffn (liste de départ par structure)
            </Label>
            <div className="flex gap-2">
              <Input
                id="startlist-url"
                placeholder="https://…liveffn.com/…/startlist.php"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-[13px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveUrl}
                disabled={!urlValid || saveUrlMutation.isPending}
              >
                Enregistrer
              </Button>
            </div>
            {url.trim() !== "" && !urlValid && (
              <p className="text-[10px] text-destructive/70">
                Lien invalide — attendu un lien liveffn.com terminant par startlist.php
              </p>
            )}
            <Button
              className="w-full mt-1"
              onClick={handleGenerate}
              disabled={!urlValid || isFetching}
            >
              {isFetching ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Génération…
                </>
              ) : (
                "Générer le listing"
              )}
            </Button>
          </div>

          {/* ── States ── */}
          {isFetching && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">Récupération de la liste…</span>
            </div>
          )}

          {!isFetching && fetchError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-[13px] text-destructive">{fetchError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void startlistQuery.refetch()}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Réessayer
              </Button>
            </div>
          )}

          {!isFetching && !fetchError && parsed && swimmers.length === 0 && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center">
              <p className="text-[13px] text-muted-foreground">
                Aucun engagement trouvé (vérifie le lien)
              </p>
            </div>
          )}

          {/* ── Results ── */}
          {!isFetching && !fetchError && swimmers.length > 0 && (
            <div className="space-y-4">
              {/* View toggle */}
              <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5 text-[12px]">
                <button
                  type="button"
                  onClick={() => setView("swimmer")}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium transition-colors",
                    view === "swimmer"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Par nageur
                </button>
                <button
                  type="button"
                  onClick={() => setView("chrono")}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium transition-colors",
                    view === "chrono"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Chronologique
                </button>
              </div>

              {enrichmentQuery.isFetching && (
                <p className="text-[11px] text-muted-foreground/60 inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Chargement des perfs & objectifs…
                </p>
              )}

              {/* By swimmer */}
              {view === "swimmer" && (
                <div className="space-y-4">
                  {grouped.map((group) => {
                    // The startlist key lives in the first row's key prefix.
                    const key = group.rows[0]?.key.split("::")[0] ?? group.swimmerName;
                    const linkedId = matches[key] ?? null;
                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[13px] font-semibold truncate">
                              {group.swimmerName}
                            </h3>
                            {!group.linked && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                                <Link2Off className="h-3 w-3" />
                                non lié
                              </span>
                            )}
                          </div>
                          <MatchSelect
                            value={linkedId}
                            candidates={candidates}
                            onChange={(v) => handleMatchChange(key, v)}
                          />
                        </div>
                        <div className="space-y-1">
                          {group.rows.map((row, i) => (
                            <RaceRow key={row.key} row={row} index={i} showSwimmer={false} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Chronological */}
              {view === "chrono" && (
                <div className="space-y-1">
                  {chrono.map((row, i) => (
                    <RaceRow key={row.key} row={row} index={i} showSwimmer />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
