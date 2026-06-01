/**
 * CompetitionDetail — full-screen coach view for a single competition.
 *
 * Replaces the cramped side-sheet form with a full-screen container and a
 * 3-tab segmented control (Nageurs · Paramètres · Jour J):
 *   - Nageurs    : manage participants + a liveffn "engaged swimmers" suggestion
 *   - Paramètres : the competition fields, INCLUDING the single-source liveffn URL
 *   - Jour J     : embeds the CompetitionStartlistPanel (UX-4)
 *
 * The liveffn startlist is fetched ONCE at this level (shared React-Query key
 * `["startlist", id, url]`); the Jour J panel reuses the same cache → no double
 * network call. matchedIds derived here feed the Nageurs suggestion so the
 * coach sees engaged swimmers WITHOUT opening Jour J.
 *
 * Hooks discipline: ALL hooks are declared at the top, before any return; tabs
 * switch by conditional RENDER (no early return) — guards against React #310.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  Search,
  Check,
  Sparkles,
  Trash2,
  ListOrdered,
} from "lucide-react";

import {
  getAthletes,
  getGroups,
  getCompetitionAssignments,
  setCompetitionAssignments,
  updateCompetition,
  deleteCompetition,
  fetchStartlistHtml,
} from "@/lib/api";
import type { Competition, CompetitionInput } from "@/lib/api";
import { parseStartlist } from "@/lib/liveffn/parseStartlist";
import { autoMatch } from "@/lib/liveffn/matchSwimmers";
import { suggestedParticipants } from "@/lib/liveffn/suggestParticipants";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CompetitionStartlistPanel } from "@/components/coach/CompetitionStartlist";

// ── Helpers (mirrors CoachCompetitionsScreen) ──────────────────────

function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const dateCls =
  "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Tab = "nageurs" | "parametres" | "jourj";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "nageurs", label: "Nageurs" },
  { id: "parametres", label: "Paramètres" },
  { id: "jourj", label: "Jour J" },
];

const POOL_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 25, label: "25 m" },
  { value: 50, label: "50 m" },
  { value: null, label: "—" },
];

// ── Component ───────────────────────────────────────────────────

export default function CompetitionDetail({
  competition,
  initialTab,
  onBack,
  onDeleted,
}: {
  competition: Competition;
  initialTab?: Tab;
  onBack: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();

  // ── Tab state ──
  const [tab, setTab] = useState<Tab>(initialTab ?? "nageurs");

  // ── Shared reference data ──
  const url = competition.liveffn_startlist_url ?? "";

  const athletesQuery = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });
  const assignmentsQuery = useQuery({
    queryKey: ["competition-assignments", competition.id],
    queryFn: () => getCompetitionAssignments(competition.id),
  });

  // ── Shared liveffn startlist (SAME key as the panel → dedup, single fetch) ──
  const startlistQuery = useQuery({
    queryKey: ["startlist", competition.id, url],
    queryFn: async () => parseStartlist(await fetchStartlistHtml(url)),
    enabled: !!url,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // ── Nageurs local state ──
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null);

  // ── Paramètres local state ──
  const [name, setName] = useState(competition.name);
  const [date, setDate] = useState(competition.date);
  const [endDate, setEndDate] = useState(competition.end_date ?? competition.date ?? "");
  const [location, setLocation] = useState(competition.location ?? "");
  const [description, setDescription] = useState(competition.description ?? "");
  const [liveffnUrl, setLiveffnUrl] = useState(url);
  const [poolLength, setPoolLength] = useState<number | null>(competition.pool_length ?? null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Derived: assignment ids (server) merged with optimistic local set ──
  const assignedIds = useMemo<number[]>(() => {
    if (selectedIds != null) return [...selectedIds];
    return (assignmentsQuery.data ?? []).map((a) => a.athlete_id);
  }, [selectedIds, assignmentsQuery.data]);

  const assignedSet = useMemo(() => new Set(assignedIds), [assignedIds]);

  // ── Derived: liveffn matched ids (computed once; panel reuses cache) ──
  const matchedIds = useMemo(() => {
    const swimmers = startlistQuery.data?.swimmers ?? [];
    const candidates = (athletesQuery.data ?? [])
      .filter((a) => a.id != null)
      .map((a) => ({ id: a.id as number, display_name: a.display_name }));
    const matches = autoMatch(swimmers, candidates, competition.startlist_athlete_map ?? {});
    return Object.values(matches);
  }, [startlistQuery.data, athletesQuery.data, competition.startlist_athlete_map]);

  const suggestions = useMemo(
    () => suggestedParticipants(matchedIds, assignedIds),
    [matchedIds, assignedIds],
  );

  // ── athleteName map (numeric id → display_name) ──
  const athleteName = useMemo(() => {
    const m: Record<number, string> = {};
    for (const a of athletesQuery.data ?? []) if (a.id != null) m[a.id] = a.display_name;
    return m;
  }, [athletesQuery.data]);

  // ── Filtered athlete list ──
  const filteredAthletes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (athletesQuery.data ?? []).filter(
      (a) => a.id != null && (q === "" || a.display_name.toLowerCase().includes(q)),
    );
  }, [athletesQuery.data, search]);

  // ── Persist assignments ──
  const assignMutation = useMutation({
    mutationFn: (ids: number[]) => setCompetitionAssignments(competition.id, ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["competition-assignments", competition.id],
      });
    },
    onError: (err: Error) => toast.error("Erreur", { description: err.message }),
  });

  const persistAssignments = useCallback(
    (ids: number[]) => {
      setSelectedIds(new Set(ids));
      assignMutation.mutate(ids);
    },
    [assignMutation],
  );

  const toggleAthlete = useCallback(
    (id: number) => {
      const next = new Set(assignedSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistAssignments([...next]);
    },
    [assignedSet, persistAssignments],
  );

  const addGroup = useCallback(
    (groupId: number) => {
      const next = new Set(assignedSet);
      for (const a of athletesQuery.data ?? []) {
        if (a.id != null && a.group_id === groupId) next.add(a.id);
      }
      persistAssignments([...next]);
    },
    [assignedSet, athletesQuery.data, persistAssignments],
  );

  const acceptSuggestions = useCallback(() => {
    persistAssignments([...new Set([...assignedIds, ...suggestions])]);
    toast("Nageurs engagés ajoutés");
  }, [assignedIds, suggestions, persistAssignments]);

  // ── Save competition fields ──
  const updateMutation = useMutation({
    mutationFn: (input: Partial<CompetitionInput>) =>
      updateCompetition(competition.id, input),
    onSuccess: () => {
      toast("Compétition mise à jour");
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
    },
    onError: (err: Error) => toast.error("Erreur", { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompetition(competition.id),
    onSuccess: () => {
      toast("Compétition supprimée");
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
      onDeleted?.();
    },
    onError: (err: Error) => toast.error("Erreur", { description: err.message }),
  });

  const dateRangeInvalid = Boolean(date && endDate && endDate < date);

  const handleStartChange = (v: string) => {
    setDate(v);
    if (!endDate || endDate < v) setEndDate(v);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Nom requis", { description: "Veuillez saisir un nom." });
      return;
    }
    if (!date) {
      toast.error("Date requise", { description: "Veuillez saisir une date." });
      return;
    }
    if (dateRangeInvalid) {
      toast.error("Dates invalides", { description: "La fin précède le début." });
      return;
    }
    updateMutation.mutate({
      name: name.trim(),
      date,
      end_date: endDate || date || null,
      location: location.trim() || null,
      description: description.trim() || null,
      liveffn_startlist_url: liveffnUrl.trim() || null,
      pool_length: poolLength,
    });
  };

  // ── Header bits ──
  const jx = daysUntil(competition.date);
  const headerSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (competition.date) {
      const sameDay = !competition.end_date || competition.end_date === competition.date;
      parts.push(
        sameDay
          ? formatDateFr(competition.date)
          : `${formatDateFr(competition.date)} → ${formatDateFr(competition.end_date!)}`,
      );
    }
    if (competition.location && competition.location !== "??") parts.push(competition.location);
    return parts.join(" · ");
  }, [competition.date, competition.end_date, competition.location]);

  // ── Render ──
  return (
    <div className="flex min-h-screen flex-col bg-background pb-24">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="px-4 pt-3 pb-2.5">
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="Retour"
              className="-ml-1.5 mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-[17px] font-semibold leading-tight truncate">
                {competition.name}
              </h1>
              {headerSubtitle && (
                <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                  {headerSubtitle}
                </p>
              )}
            </div>

            {jx >= 0 && (
              <span className="shrink-0 self-start rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-bold tabular-nums text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                J-{jx}
              </span>
            )}
          </div>

          {/* ── Segmented control ── */}
          <div className="mt-3 inline-flex w-full rounded-xl border border-border/60 bg-muted/40 p-0.5 text-[13px]">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={tab === t.id ? "page" : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 px-4 pt-4">
        {/* ── Tab 1 — Nageurs ── */}
        {tab === "nageurs" && (
          <div className="space-y-4">
            {/* Suggestion banner */}
            {url && suggestions.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <p className="text-[13px] font-semibold leading-tight">
                      {suggestions.length} nageur{suggestions.length > 1 ? "s" : ""} engagé
                      {suggestions.length > 1 ? "s" : ""} détecté
                      {suggestions.length > 1 ? "s" : ""} via liveffn
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {suggestions
                        .map((id) => athleteName[id])
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={acceptSuggestions}
                  disabled={assignMutation.isPending}
                >
                  Ajouter {suggestions.length > 1 ? "ces nageurs" : "ce nageur"}
                </Button>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                placeholder="Rechercher un nageur…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-[13px]"
              />
            </div>

            {/* Group quick-add */}
            <Select
              value=""
              onValueChange={(gid) => addGroup(Number(gid))}
            >
              <SelectTrigger className="h-9 text-[13px]">
                <SelectValue placeholder="Ajouter un groupe…" />
              </SelectTrigger>
              <SelectContent>
                {(groupsQuery.data ?? [])
                  .filter((g) => !g.is_temporary)
                  .map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Count */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nageurs
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground/60">
                {assignedSet.size} sélectionné{assignedSet.size > 1 ? "s" : ""}
              </span>
            </div>

            {/* Checkbox list */}
            <div className="space-y-1">
              {filteredAthletes.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  Aucun nageur trouvé
                </p>
              ) : (
                filteredAthletes.map((a) => {
                  const id = a.id as number;
                  const checked = assignedSet.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleAthlete(id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/60 bg-card hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-transparent",
                        )}
                      >
                        {checked && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {a.display_name}
                      </span>
                      {a.group_label && (
                        <span className="shrink-0 text-[11px] text-muted-foreground/60">
                          {a.group_label}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2 — Paramètres ── */}
        {tab === "parametres" && (
          <div className="space-y-7">
            {/* ── Section : Infos ── */}
            <section className="space-y-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Infos
              </h2>

              {/* Name */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="comp-name"
                  className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                >
                  Nom
                </Label>
                <Input
                  id="comp-name"
                  placeholder="Ex : Championnats Régionaux"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-[15px] font-medium"
                  maxLength={200}
                />
              </div>

              {/* Dates */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Dates
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="comp-date" className="pl-0.5 text-[10px] text-muted-foreground/60">
                      Début
                    </label>
                    <input
                      id="comp-date"
                      type="date"
                      value={date}
                      onChange={(e) => handleStartChange(e.target.value)}
                      className={cn(dateCls, "tabular-nums")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="comp-end-date" className="pl-0.5 text-[10px] text-muted-foreground/60">
                      Fin
                    </label>
                    <input
                      id="comp-end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={date || undefined}
                      className={cn(dateCls, "tabular-nums")}
                    />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="comp-location"
                  className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                >
                  Lieu
                </Label>
                <Input
                  id="comp-location"
                  placeholder="Ex : Piscine de Strasbourg"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              {/* Bassin */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Bassin
                </span>
                <div
                  role="radiogroup"
                  aria-label="Longueur du bassin"
                  className="inline-flex w-full rounded-xl border border-border/60 bg-muted/40 p-0.5 text-[13px]"
                >
                  {POOL_OPTIONS.map((opt) => {
                    const active = poolLength === opt.value;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPoolLength(opt.value)}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-2 font-medium tabular-nums transition-colors",
                          active
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="comp-description"
                  className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                >
                  Notes
                </Label>
                <Textarea
                  id="comp-description"
                  placeholder="Informations complémentaires..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="resize-none"
                />
              </div>
            </section>

            {/* ── Section : Liste de départ ── */}
            <section className="space-y-4 border-t border-border/40 pt-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Liste de départ
              </h2>

              {/* liveffn URL (single source) */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="comp-liveffn"
                  className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                >
                  Lien liveffn
                </Label>
                <Input
                  id="comp-liveffn"
                  placeholder="https://…liveffn.com/…/startlist.php"
                  value={liveffnUrl}
                  onChange={(e) => setLiveffnUrl(e.target.value)}
                  className="text-[13px]"
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Utilisé par l&apos;onglet « Jour J » pour générer la liste de départ.
                </p>
              </div>
            </section>

            {/* Save */}
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={updateMutation.isPending || !name.trim() || !date || dateRangeInvalid}
            >
              {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>

            {/* ── Section : Zone danger ── */}
            <section className="space-y-3 border-t border-border/40 pt-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-destructive/60">
                Zone danger
              </h2>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/20 py-2.5 text-center text-[12px] font-medium text-destructive/70 transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer cette compétition
              </button>
            </section>
          </div>
        )}

        {/* ── Tab 3 — Jour J ── */}
        {tab === "jourj" && (
          <div>
            {url ? (
              <CompetitionStartlistPanel competition={competition} />
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-6 text-center space-y-3">
                <ListOrdered className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="text-[13px] text-muted-foreground">
                  Ajoute le lien liveffn dans l&apos;onglet{" "}
                  <span className="font-semibold text-foreground">Paramètres</span> pour
                  générer la liste de départ.
                </p>
                <Button variant="outline" size="sm" onClick={() => setTab("parametres")}>
                  Ouvrir Paramètres
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete confirm ── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la compétition</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La compétition &laquo;{" "}
              {competition.name} &raquo; sera supprimée définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
