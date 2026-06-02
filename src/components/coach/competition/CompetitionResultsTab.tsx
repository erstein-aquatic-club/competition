/**
 * CompetitionResultsTab — onglet "Résultats" coach (§364, Task 7b).
 *
 * Modèle SNAPSHOT (≠ liste de départ qui est live) : le coach importe les
 * résultats liveffn une fois, ils sont figés dans `competition.results_snapshot`.
 * Cet onglet :
 *   1. lit `competition.liveffn_results_url` (champ POSSÉDÉ par l'onglet Paramètres) ;
 *   2. propose "Importer / Réimporter" → fetchResultsHtml → parseResults →
 *      autoMatch (réutilise la carte Jour J `startlist_athlete_map`) →
 *      saveResultsSnapshot, puis invalide ["competitions"] ;
 *   3. quand un snapshot existe, charge l'enrichissement (perfs + objectifs, via
 *      le pont UUID→numérique identique à CompetitionStartlistPanel) et rend la
 *      synthèse pure `buildResultsSynthesis` : header de stats très visuel +
 *      cartes par nageur avec verdicts (record perso, objectif, finale…).
 *
 * Toute la logique d'assemblage est PURE et vit dans resultsSynthesis.ts /
 * resultVerdicts.ts — ce fichier ne fait que fetcher, câbler les maps et rendre.
 *
 * #310 — TOUS les hooks sont en haut, inconditionnels, AVANT tout `return`.
 * Le rendu est conditionnel via JSX (le snapshot peut être null) ; on ne sort
 * jamais tôt avant les hooks. (Même discipline que SwimmerRaceSheet.)
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Trophy,
  Medal,
  Award,
  Target,
  Link2Off,
  Download,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  Check,
} from "lucide-react";

import { getAthletes, getSwimmerPerformances } from "@/lib/api";
import type { Competition, ResultsSnapshot } from "@/lib/api";
import { fetchResultsHtml, saveResultsSnapshot } from "@/lib/api/competitions";
import { getObjectivesByCompetition } from "@/lib/api/objectives";
import { supabase } from "@/lib/supabase";

import { parseResults } from "@/lib/liveffn/parseResults";
import { autoMatch } from "@/lib/liveffn/matchSwimmers";
import { buildResultsSynthesis } from "@/components/coach/competition/resultsSynthesis";
import type { SwimmerResults, SwimmerEventResult } from "@/components/coach/competition/resultsSynthesis";
import {
  formatTime,
  eventLabel,
  strokeFromCode,
  STROKE_COLORS,
} from "@/lib/objectiveHelpers";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Header stat tiles (B — synthèse "très visuelle") ────────────────

type Tone = "amber" | "yellow" | "blue" | "green";

const TONE_ACTIVE: Record<Tone, string> = {
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  blue: "border-primary/40 bg-primary/10 text-primary",
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

function StatTile({
  icon: Icon,
  count,
  label,
  tone,
}: {
  icon: typeof Trophy;
  count: number;
  label: string;
  tone: Tone;
}) {
  const active = count > 0;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-3 text-center transition-colors",
        active
          ? TONE_ACTIVE[tone]
          : "border-border/60 bg-muted/30 text-muted-foreground/40",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="text-2xl font-bold tabular-nums leading-none">{count}</span>
      <span className="text-[10px] uppercase tracking-wider leading-tight">
        {label}
      </span>
    </div>
  );
}

// ── Verdict badges ──────────────────────────────────────────────────

function NewBestBadge({ delta }: { delta: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
      <Trophy className="h-3 w-3" aria-hidden />
      Record perso
      {delta != null && (
        <span className="font-mono tabular-nums">
          −{formatTime(Math.abs(delta))}
        </span>
      )}
    </span>
  );
}

function ObjectiveBadge({
  objective,
}: {
  objective: NonNullable<SwimmerEventResult["verdict"]>["objective"];
}) {
  if (!objective) return null;
  if (objective.met) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" aria-hidden />
        objectif <span className="font-mono tabular-nums">{formatTime(objective.target)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      objectif <span className="font-mono tabular-nums">{formatTime(objective.target)}</span>
      <span className="text-destructive/80 font-mono tabular-nums">
        (+{formatTime(objective.gap)})
      </span>
    </span>
  );
}

function FinalChip({ tier }: { tier: "A" | "B" | "C" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        tier === "A"
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      Finale {tier}
    </span>
  );
}

// ── Event row (C — réutilise l'idiome RaceRow de la liste de départ) ──

function EventRow({
  ev,
  index,
  expanded,
  onToggle,
}: {
  ev: SwimmerEventResult;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { collapsed, verdict } = ev;
  const stroke = collapsed.eventCode ? strokeFromCode(collapsed.eventCode) : null;
  const accent = stroke
    ? STROKE_COLORS[stroke] ?? "border-l-muted-foreground/20"
    : "border-l-muted-foreground/20";

  const place = collapsed.finalPlace;
  const isPodium = place != null && place <= 3;
  const hasSplits = collapsed.races.some((r) => r.splits.length > 0);

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 border-l-4 bg-card",
        "animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none fill-mode-both",
        accent,
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasSplits}
        className={cn(
          "flex w-full items-start gap-2.5 px-2.5 py-1.5 text-left min-h-[44px]",
          hasSplits &&
            "transition-colors hover:bg-accent/40 active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          hasSplits && "rounded-lg",
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[13px] font-semibold truncate leading-tight">
              {eventLabel(collapsed.eventCode)}
            </span>
            {place != null && (
              <span
                className={cn(
                  "text-[11px] tabular-nums leading-tight",
                  isPodium
                    ? "font-semibold text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
              >
                {isPodium && <Medal className="inline h-3 w-3 mr-0.5 -mt-0.5" aria-hidden />}
                {place}ᵉ
              </span>
            )}
          </div>

          {/* Verdict line */}
          <div className="flex flex-wrap items-center gap-1">
            {verdict?.isNewBest ? (
              // Précédence : record perso masque le rang historique.
              <NewBestBadge delta={verdict.bestDelta} />
            ) : verdict?.isFirstEver ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                1ʳᵉ perf
              </span>
            ) : verdict?.historyRank != null ? (
              <span className="text-[10px] text-muted-foreground/60">
                {verdict.historyRank}ᵉ perf all-time
              </span>
            ) : null}

            {verdict?.objective && <ObjectiveBadge objective={verdict.objective} />}

            {collapsed.qualifiedFinal && <FinalChip tier={collapsed.qualifiedFinal} />}
          </div>
        </div>

        <div className="shrink-0 text-right space-y-0.5">
          <p className="text-[13px] font-mono tabular-nums font-semibold leading-tight">
            {collapsed.bestTime != null ? formatTime(collapsed.bestTime) : "—"}
          </p>
          {collapsed.points != null && (
            <p className="text-[10px] text-muted-foreground/60 tabular-nums leading-tight">
              {collapsed.points} pts
            </p>
          )}
        </div>

        {hasSplits && (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 self-center text-muted-foreground/40 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        )}
      </button>

      {/* Expandable splits */}
      {expanded && hasSplits && (
        <div className="border-t border-border/40 px-2.5 py-1.5 space-y-1.5">
          {collapsed.races.map((race, ri) =>
            race.splits.length > 0 ? (
              <div key={ri} className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {race.timeDisplay}
                </p>
                <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
                  {race.splits.map((s, si) => (
                    <div key={si} className="flex justify-between gap-1">
                      <span className="text-muted-foreground/60">{s.distance}</span>
                      <span className="font-mono">{s.lap}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

// ── Swimmer card ────────────────────────────────────────────────────

function SwimmerCard({ swimmer }: { swimmer: SwimmerResults }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <h3 className="text-[13px] font-semibold truncate">{swimmer.name}</h3>
        {!swimmer.linked && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wider">
            <Link2Off className="h-3 w-3" aria-hidden />
            non lié
          </span>
        )}
      </div>
      <div className="space-y-1">
        {swimmer.events.map((ev, i) => {
          const evKey = ev.collapsed.eventCode || `?${i}`;
          return (
            <EventRow
              key={evKey}
              ev={ev}
              index={i}
              expanded={expanded.has(evKey)}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(evKey)) next.delete(evKey);
                  else next.add(evKey);
                  return next;
                })
              }
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────

export default function CompetitionResultsTab({
  competition,
}: {
  competition: Competition;
}) {
  const queryClient = useQueryClient();

  // ── State (all hooks above any early return — #310) ──
  // Après import, le prop `competition` n'est pas mis à jour en place : on
  // invalide ["competitions"] pour faire re-rendre le parent avec le nouveau
  // snapshot. En attendant ce re-render, on garde une copie locale du snapshot
  // fraîchement importé pour l'afficher immédiatement.
  const [localSnapshot, setLocalSnapshot] = useState<ResultsSnapshot | null>(null);
  const [localImportedAt, setLocalImportedAt] = useState<string | null>(null);

  const savedUrl = competition.liveffn_results_url ?? "";

  // ── Athletes (match candidates + athleteName) ──
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

  const athleteName = useMemo(() => {
    const m: Record<number, string> = {};
    for (const c of candidates) m[c.id] = c.display_name;
    return m;
  }, [candidates]);

  // ── Active snapshot: the just-imported local copy wins over the prop. ──
  // The prop only refreshes after the parent re-fetches ["competitions"]; on a
  // re-import the (stale, still-truthy) prop would otherwise shadow the fresh
  // local snapshot until that lands. Local-first is safe because this component
  // is remounted per competition (CoachCompetitionsScreen keys it by id), so
  // localSnapshot is never carried across competitions.
  const snapshot = localSnapshot ?? competition.results_snapshot ?? null;
  const importedAt = localImportedAt ?? competition.results_imported_at ?? null;

  // matched ids = distinct non-null values of the snapshot's athleteMap
  const matchedIds = useMemo(
    () =>
      snapshot
        ? Array.from(
            new Set(
              Object.values(snapshot.athleteMap).filter(
                (v): v is number => typeof v === "number",
              ),
            ),
          )
        : [],
    [snapshot],
  );
  const matchedKey = matchedIds.slice().sort((a, b) => a - b).join(",");

  // ── Enrichment: perfs per matched id + objectives (UUID→numeric bridge) ──
  // Copié VERBATIM de CompetitionStartlistPanel.enrichmentQuery.
  const enrichmentQuery = useQuery({
    queryKey: ["results-enrichment", competition.id, matchedKey],
    enabled: matchedIds.length > 0,
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
        Array<{
          event_code: string;
          pool_length?: number | null;
          time_seconds?: number | null;
          competition_date?: string | null;
        }>
      > = {};
      for (const [id, perfs] of perfPairs) perfsByUser[id] = perfs;

      // UUID → numeric user id (objectives are keyed by auth UUID).
      const uidToNumeric = new Map<string, number>();
      for (const r of (authRes.data ?? []) as Array<{ auth_uid: string; user_id: number }>) {
        uidToNumeric.set(r.auth_uid, r.user_id);
      }

      const objectivesByUser: Record<
        number,
        Array<{ event_code: string; pool_length?: number | null; target_time_seconds?: number | null }>
      > = {};
      for (const obj of objectives) {
        const numericId = uidToNumeric.get(obj.athlete_id);
        if (numericId == null) continue;
        if (!obj.event_code) continue;
        (objectivesByUser[numericId] ??= []).push({
          event_code: obj.event_code,
          pool_length: obj.pool_length ?? null,
          target_time_seconds: obj.target_time_seconds ?? null,
        });
      }

      return { perfsByUser, objectivesByUser };
    },
  });

  // ── Synthesis (pure) ──
  const synthesis = useMemo(
    () =>
      snapshot
        ? buildResultsSynthesis({
            snapshot,
            athleteName,
            perfsByUser: enrichmentQuery.data?.perfsByUser ?? {},
            objectivesByUser: enrichmentQuery.data?.objectivesByUser ?? {},
            poolLength: competition.pool_length ?? null,
            compDate: competition.date,
          })
        : null,
    [snapshot, athleteName, enrichmentQuery.data, competition.pool_length, competition.date],
  );

  // ── Import mutation ──
  const importMutation = useMutation({
    mutationFn: async () => {
      const html = await fetchResultsHtml(savedUrl);
      const parsed = parseResults(html);
      const candidatesForMatch = athletes
        .filter((a) => a.id != null)
        .map((a) => ({ id: a.id as number, display_name: a.display_name }));
      // Réutilise la carte Jour J (startlist_athlete_map) comme overrides.
      const athleteMap = autoMatch(
        parsed.swimmers,
        candidatesForMatch,
        competition.startlist_athlete_map ?? {},
      );
      const importedAtIso = new Date().toISOString();
      const finalSnapshot: ResultsSnapshot = { ...parsed, athleteMap };
      await saveResultsSnapshot(competition.id, savedUrl, finalSnapshot, importedAtIso);
      return { snapshot: finalSnapshot, importedAtIso };
    },
    onSuccess: ({ snapshot: snap, importedAtIso }) => {
      // Affichage immédiat (le prop competition n'est pas rafraîchi en place).
      setLocalSnapshot(snap);
      setLocalImportedAt(importedAtIso);
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
      toast.success("Résultats importés");
    },
    onError: (err: Error) => toast.error("Erreur", { description: err.message }),
  });

  const isImporting = importMutation.isPending;
  const importedDate = importedAt
    ? new Date(importedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // ── Render (conditional via JSX, never an early return before hooks) ──
  return (
    <div className="space-y-5">
      {/* ── Import controls (URL owned by Paramètres) ── */}
      {!savedUrl ? (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center">
          <p className="text-[13px] text-muted-foreground">
            Ajoute le lien liveffn{" "}
            <span className="font-semibold text-foreground">Résultats</span> dans
            l&apos;onglet{" "}
            <span className="font-semibold text-foreground">Paramètres</span> pour
            importer les résultats.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button onClick={() => importMutation.mutate()} disabled={isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Import…
              </>
            ) : snapshot ? (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Réimporter
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Importer les résultats
              </>
            )}
          </Button>
          {importedDate && (
            <span className="text-[11px] text-muted-foreground/60">
              Importé le {importedDate}
            </span>
          )}
        </div>
      )}

      {/* ── Empty (URL present, never imported) ── */}
      {savedUrl && !snapshot && !isImporting && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center">
          <p className="text-[13px] text-muted-foreground">
            Aucun résultat importé. Clique sur{" "}
            <span className="font-semibold text-foreground">Importer les résultats</span>.
          </p>
        </div>
      )}

      {/* ── Synthesis + per-swimmer cards ── */}
      {synthesis && (
        <div className="space-y-5">
          {/* B — Synthesis header (très visuel) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              icon={Trophy}
              count={synthesis.totals.newBests}
              label="records perso"
              tone="amber"
            />
            <StatTile
              icon={Medal}
              count={synthesis.totals.podiums}
              label="podiums"
              tone="yellow"
            />
            <StatTile
              icon={Award}
              count={synthesis.totals.finalsA}
              label="finales A"
              tone="blue"
            />
            <StatTile
              icon={Target}
              count={synthesis.totals.objectivesMet}
              label="objectifs atteints"
              tone="green"
            />
          </div>

          {enrichmentQuery.isFetching && (
            <p className="text-[11px] text-muted-foreground/60 inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Chargement des perfs & objectifs…
            </p>
          )}

          {enrichmentQuery.isError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-[13px] text-destructive">
                  Impossible de charger les perfs & objectifs (records / objectifs
                  indisponibles).
                </p>
              </div>
            </div>
          )}

          {/* C — Per-swimmer cards (linked first, then unlinked) */}
          <div className="space-y-4">
            {synthesis.swimmers.map((sw) => (
              <SwimmerCard key={sw.key} swimmer={sw} />
            ))}
          </div>

          {/* D — Unmatched note */}
          {synthesis.unmatchedCount > 0 && (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <Link2Off className="h-3 w-3" aria-hidden />
              {synthesis.unmatchedCount} nageur
              {synthesis.unmatchedCount > 1 ? "s" : ""} non lié
              {synthesis.unmatchedCount > 1 ? "s" : ""} — relie-les depuis l&apos;onglet
              Jour J pour leurs records & objectifs.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
