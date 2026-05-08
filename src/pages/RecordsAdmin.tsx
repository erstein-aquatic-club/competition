import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, summarizeApiError, type ClubRecordSwimmer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, ArrowRight, ChevronDown, Eye, GitMerge, Plus, RefreshCw, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineBanner } from "@/components/shared/InlineBanner";

const SEX_OPTIONS = [
  { value: "M", label: "Garçon" },
  { value: "F", label: "Fille" },
];

const formatSource = (source: ClubRecordSwimmer["source_type"]) =>
  source === "user" ? "Compte" : "Ancien";

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR") + " " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR");
};

const isStale = (value?: string | null, daysThreshold = 30) => {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  const diffMs = Date.now() - date.getTime();
  return diffMs > daysThreshold * 24 * 60 * 60 * 1000;
};

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "success":
      return "default" as const;
    case "running":
      return "secondary" as const;
    case "error":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "success":
      return "OK";
    case "running":
      return "En cours";
    case "error":
      return "Erreur";
    case "pending":
      return "En attente";
    default:
      return status;
  }
};

type SwimmerCardProps = {
  swimmer: ClubRecordSwimmer;
  onUpdate: (payload: Record<string, unknown>) => void;
  onImport?: () => void;
  onMerge?: () => void;
  importPending: boolean;
};

const SwimmerCard = ({ swimmer, onUpdate, onImport, onMerge, importPending }: SwimmerCardProps) => {
  const stale = isStale((swimmer as any).last_imported_at);
  const incomplete = swimmer.is_active && (!swimmer.iuf || !swimmer.sex || !swimmer.birthdate);
  const rowKey = swimmer.id ?? `user-${swimmer.user_id ?? "unknown"}`;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 space-y-2",
        incomplete && "border-amber-300 bg-amber-50/30 dark:border-amber-700 dark:bg-amber-950/20",
        stale && !incomplete && swimmer.is_active && "border-amber-200/50",
        !swimmer.is_active && "opacity-60",
      )}
    >
      {/* Row 1: Name + Source + Active toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold truncate">{swimmer.display_name}</p>
          <Badge
            variant={swimmer.source_type === "manual" ? "secondary" : "outline"}
            className="shrink-0 text-[10px] px-1.5 py-0"
          >
            {formatSource(swimmer.source_type)}
          </Badge>
        </div>
        <Switch
          checked={Boolean(swimmer.is_active)}
          onCheckedChange={(checked) => onUpdate({ is_active: checked })}
        />
      </div>

      {/* Row 2: Editable fields — IUF, Sexe, Année */}
      <div className="flex items-center gap-2">
        <Input
          key={`${rowKey}-${swimmer.iuf ?? ""}`}
          defaultValue={swimmer.iuf ?? ""}
          placeholder="IUF"
          onBlur={(e) => onUpdate({ iuf: e.target.value.trim() || null })}
          className={cn(
            "h-8 text-xs flex-1 min-w-0",
            !swimmer.iuf && swimmer.is_active && "ring-2 ring-destructive/50",
          )}
        />
        <Select
          value={swimmer.sex ?? ""}
          onValueChange={(value) => onUpdate({ sex: value || null })}
        >
          <SelectTrigger
            className={cn(
              "h-8 w-24 text-xs shrink-0",
              !swimmer.sex && swimmer.is_active && "ring-2 ring-destructive/50",
            )}
          >
            <SelectValue placeholder="Sexe" />
          </SelectTrigger>
          <SelectContent>
            {SEX_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          key={`${rowKey}-birth-${swimmer.birthdate ?? ""}`}
          type="number"
          placeholder="Année"
          defaultValue={swimmer.birthdate ? new Date(swimmer.birthdate).getFullYear() : ""}
          onBlur={(e) => {
            const year = e.target.value.trim();
            if (year && /^\d{4}$/.test(year)) {
              onUpdate({ birthdate: `${year}-01-01` });
            } else if (!year) {
              onUpdate({ birthdate: null });
            }
          }}
          className={cn(
            "h-8 w-[4.5rem] text-xs shrink-0",
            !swimmer.birthdate && swimmer.is_active && "ring-2 ring-amber-400/50",
          )}
        />
      </div>

      {/* Row 3: Last import + action buttons */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[11px]",
            stale && swimmer.is_active ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          Maj : {formatDateOnly((swimmer as any).last_imported_at)}
        </span>
        <div className="flex items-center gap-1.5">
          {onMerge && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onMerge}
            >
              <GitMerge className="h-3 w-3 mr-1" />
              Fusionner
            </Button>
          )}
          {swimmer.is_active && swimmer.iuf ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={importPending}
              onClick={onImport}
            >
              Importer
            </Button>
          ) : swimmer.is_active && !swimmer.iuf ? (
            <span className="text-[11px] text-muted-foreground">IUF requis</span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default function RecordsAdmin() {
  const role = useAuth((state) => state.role);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [newSwimmer, setNewSwimmer] = useState({
    display_name: "",
    iuf: "",
    sex: "",
  });
  const [swimmers, setSwimmers] = useState<ClubRecordSwimmer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [rateLimits, setRateLimits] = useState<{ coach_monthly: number; athlete_monthly: number; admin_monthly: number } | null>(null);
  const [autoSync, setAutoSync] = useState<{
    enabled: boolean;
    day: number;
    hour: number;
    last_run: string | null;
  } | null>(null);
  const [mergeSource, setMergeSource] = useState<ClubRecordSwimmer | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);

  const canAccess = role === "coach" || role === "admin";
  const isAdmin = role === "admin";

  // Import logs query
  const { data: importLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["import-logs"],
    queryFn: () => api.getImportLogs({ limit: 20 }),
    enabled: canAccess,
  });

  const load = useCallback(async () => {
    if (!canAccess) return;
    setIsLoading(true);
    setError(null);
    try {
      // Auto-sync users first
      await api.syncClubRecordSwimmersFromUsers();
      const data = await api.getClubRecordSwimmers();
      setSwimmers(data);
    } catch (err) {
      const summary = summarizeApiError(err, "Impossible de charger la liste.");
      setError(summary.message);
      setSwimmers([]);
    } finally {
      setIsLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load rate limit settings
  useEffect(() => {
    if (!isAdmin) return;
    void api.getAppSettings("import_rate_limits").then((value) => {
      if (value) setRateLimits(value);
    });
    void api.getAppSettings("ffn_auto_sync").then((value) => {
      if (value) setAutoSync(value);
    });
  }, [isAdmin]);

  const createSwimmer = useMutation({
    mutationFn: () =>
      api.createClubRecordSwimmer({
        display_name: newSwimmer.display_name.trim(),
        iuf: newSwimmer.iuf.trim() || null,
        sex: newSwimmer.sex ? (newSwimmer.sex as "M" | "F") : null,
        is_active: true,
      }),
    onSuccess: () => {
      toast({ title: "Nageur ajouté" });
      setNewSwimmer({ display_name: "", iuf: "", sex: "" });
      setShowAddForm(false);
      void load();
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Impossible d'ajouter le nageur", variant: "destructive" });
    },
  });

  const updateSwimmer = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.updateClubRecordSwimmer(id, payload),
    onSuccess: () => {
      void load();
      toast({ title: "Sauvegardé" });
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Mise à jour impossible", variant: "destructive" });
    },
  });

  const updateUserSwimmer = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: Record<string, unknown> }) =>
      api.updateClubRecordSwimmerForUser(userId, payload),
    onSuccess: () => {
      void load();
      toast({ title: "Sauvegardé" });
    },
    onError: () => {
      toast({ title: "Mise à jour impossible", variant: "destructive" });
    },
  });

  const updateSwimmerEntry = (swimmer: ClubRecordSwimmer, payload: Record<string, unknown>) => {
    if (swimmer.source_type === "user" && swimmer.user_id) {
      updateUserSwimmer.mutate({ userId: swimmer.user_id, payload });
      return;
    }
    if (swimmer.id) {
      updateSwimmer.mutate({ id: swimmer.id, payload });
    }
  };

  const importRecords = useMutation({
    mutationFn: () => api.importClubRecords(),
    onSuccess: (result: any) => {
      const summary = result?.summary ?? result;
      const s = result?.recalc_stats;
      let desc = summary
        ? `Performances importées: ${summary.imported ?? 0}. Erreurs: ${summary.errors ?? 0}.`
        : "";
      if (s) {
        desc += ` Records: ${s.club_records_upserted} (${s.processed} perfs traitées).`;
        if (s.skipped_no_age) desc += ` Ignorées (pas d'âge): ${s.skipped_no_age}.`;
      }
      toast({ title: "Import terminé", description: desc });
      void load();
      void refetchLogs();
      void queryClient.invalidateQueries({ queryKey: ["club-records"] });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes("Rate limit") || err?.message?.includes("Limite")
        ? err.message
        : "Import impossible";
      toast({ title: msg, variant: "destructive" });
      void refetchLogs();
    },
  });

  // Per-swimmer import mutation
  const importSingle = useMutation({
    mutationFn: ({ iuf, name }: { iuf: string; name?: string }) =>
      api.importSingleSwimmer(iuf, name),
    onSuccess: (result, variables) => {
      toast({
        title: `Import de ${variables.name ?? variables.iuf}`,
        description: `${result.total_found} performances trouvées, ${result.new_imported} nouvelles importées.`,
      });
      void refetchLogs();
      // Trigger club records recalculation after individual import
      void api.recalculateClubRecords().then(() => {
        void queryClient.invalidateQueries({ queryKey: ["club-records"] });
      });
      void load();
    },
    onError: (_err: any, variables) => {
      const msg = _err?.message?.includes("Rate limit") || _err?.message?.includes("Limite")
        ? _err.message
        : `Erreur import ${variables.name ?? variables.iuf}`;
      toast({ title: msg, variant: "destructive" });
      void refetchLogs();
    },
  });

  const saveRateLimits = useMutation({
    mutationFn: (limits: { coach_monthly: number; athlete_monthly: number; admin_monthly: number }) =>
      api.updateAppSettings("import_rate_limits", limits),
    onSuccess: () => {
      toast({ title: "Limites sauvegardées" });
    },
    onError: () => {
      toast({ title: "Erreur de sauvegarde", variant: "destructive" });
    },
  });

  const saveAutoSync = useMutation({
    mutationFn: (config: { enabled: boolean; day: number; hour: number; last_run: string | null }) =>
      api.updateAppSettings("ffn_auto_sync", config),
    onSuccess: () => {
      toast({ title: "Planning sauvegardé" });
    },
    onError: () => {
      toast({ title: "Erreur de sauvegarde", variant: "destructive" });
    },
  });

  const mergeSwimmers = useMutation({
    mutationFn: ({ manualId, userSwimmerId }: { manualId: number; userSwimmerId: number }) =>
      api.mergeClubRecordSwimmers(manualId, userSwimmerId),
    onSuccess: (result) => {
      toast({
        title: "Profils fusionnés",
        description: `IUF ${result.iuf_transferred ?? "—"} transféré, ${result.performances_reassigned} performance(s) rattachée(s).`,
      });
      setMergeSource(null);
      setMergeTargetId(null);
      void load();
      void queryClient.invalidateQueries({ queryKey: ["club-records"] });
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Fusion impossible", variant: "destructive" });
    },
  });

  const { activeSwimmers, inactiveSwimmers } = useMemo(() => {
    const sorted = [...swimmers].sort((a, b) => {
      if (a.source_type !== b.source_type) return a.source_type.localeCompare(b.source_type);
      return a.display_name.localeCompare(b.display_name);
    });
    return {
      activeSwimmers: sorted.filter((s) => s.is_active),
      inactiveSwimmers: sorted.filter((s) => !s.is_active),
    };
  }, [swimmers]);

  const userSwimmers = useMemo(
    () => swimmers.filter((s) => s.source_type === "user" && s.is_active),
    [swimmers],
  );

  const mergeTarget = useMemo(
    () => (mergeTargetId ? swimmers.find((s) => s.id === mergeTargetId) ?? null : null),
    [mergeTargetId, swimmers],
  );

  const incompleteCount = useMemo(
    () => swimmers.filter((s) => s.is_active && (!s.iuf || !s.sex || !s.birthdate)).length,
    [swimmers],
  );

  const recalculate = useMutation({
    mutationFn: () => api.recalculateClubRecords(),
    onSuccess: (result: any) => {
      const s = result?.recalc_stats;
      const desc = s
        ? `${s.swimmers_with_sex} nageur(s), ${s.total_performances} perfs, ${s.processed} traitées, ${s.club_records_upserted} records.${
            s.skipped_no_swimmer ? ` Ignorées (pas de nageur): ${s.skipped_no_swimmer}.` : ""
          }${s.skipped_no_event_code ? ` Ignorées (épreuve inconnue): ${s.skipped_no_event_code}.` : ""}${
            s.skipped_no_age ? ` Ignorées (pas d'âge): ${s.skipped_no_age}.` : ""
          }${s.unmapped_event_codes?.length ? ` Épreuves inconnues: ${s.unmapped_event_codes.join(", ")}` : ""}`
        : "";
      toast({ title: "Records recalculés", description: desc });
      void queryClient.invalidateQueries({ queryKey: ["club-records"] });
    },
    onError: () => {
      toast({ title: "Erreur de recalcul", variant: "destructive" });
    },
  });

  if (!canAccess) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Records club</h1>
        <p className="text-sm text-muted-foreground">Accès réservé aux coachs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Records club</h1>
          <p className="text-sm text-muted-foreground">
            Import des performances FFN et gestion des nageurs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => importRecords.mutate()} disabled={importRecords.isPending}>
            {importRecords.isPending ? "Import en cours…" : "Mettre à jour"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recalculate.mutate()}
            disabled={recalculate.isPending}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", recalculate.isPending && "animate-spin")} />
            Recalculer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/records-club")}
          >
            <Eye className="h-4 w-4 mr-1" />
            Voir les records
          </Button>
        </div>
      </div>

      {/* Add swimmer — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground py-1 active:opacity-70"
        >
          <Plus className="h-4 w-4" />
          Ajouter un ancien nageur
          <ChevronDown className={cn("h-3 w-3 transition-transform", showAddForm && "rotate-180")} />
        </button>
        {showAddForm && (
          <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] rounded-xl border bg-card p-3">
            <Input
              placeholder="Nom du nageur"
              value={newSwimmer.display_name}
              onChange={(event) => setNewSwimmer((prev) => ({ ...prev, display_name: event.target.value }))}
            />
            <Input
              placeholder="IUF"
              value={newSwimmer.iuf}
              onChange={(event) => setNewSwimmer((prev) => ({ ...prev, iuf: event.target.value }))}
            />
            <Select
              value={newSwimmer.sex}
              onValueChange={(value) => setNewSwimmer((prev) => ({ ...prev, sex: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sexe" />
              </SelectTrigger>
              <SelectContent>
                {SEX_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => createSwimmer.mutate()}
              disabled={!newSwimmer.display_name.trim() || createSwimmer.isPending}
            >
              Ajouter
            </Button>
          </div>
        )}
      </div>

      {/* Swimmers list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Nageurs suivis
          </h2>
          {!isLoading && swimmers.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {activeSwimmers.length} actif{activeSwimmers.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Incomplete warning */}
        <InlineBanner
          variant="warning"
          icon={<AlertCircle />}
          label={`${incompleteCount} nageur${incompleteCount > 1 ? "s" : ""} incomplet${incompleteCount > 1 ? "s" : ""}`}
          sublabel="IUF, sexe et année de naissance requis pour les records"
          visible={!isLoading && incompleteCount > 0}
          animate={false}
        />

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="ml-auto h-6 w-10 rounded bg-muted" />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-8 flex-1 rounded bg-muted" />
                  <div className="h-8 w-24 rounded bg-muted" />
                  <div className="h-8 w-[4.5rem] rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Empty state */}
        {!isLoading && !error && swimmers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Aucun nageur disponible.</p>
        )}

        {/* Active swimmers cards */}
        {!isLoading && !error && activeSwimmers.length > 0 && (
          <div className="space-y-2">
            {activeSwimmers.map((swimmer) => (
              <SwimmerCard
                key={swimmer.id ?? `user-${swimmer.user_id ?? "unknown"}`}
                swimmer={swimmer}
                onUpdate={(payload) => updateSwimmerEntry(swimmer, payload)}
                onImport={
                  swimmer.iuf
                    ? () => importSingle.mutate({ iuf: swimmer.iuf!, name: swimmer.display_name })
                    : undefined
                }
                onMerge={
                  swimmer.source_type === "manual" && swimmer.is_active
                    ? () => { setMergeSource(swimmer); setMergeTargetId(null); }
                    : undefined
                }
                importPending={importSingle.isPending}
              />
            ))}
          </div>
        )}

        {/* Archive (inactive swimmers) */}
        {!isLoading && !error && inactiveSwimmers.length > 0 && (
          <div className="border-t pt-2">
            <button
              type="button"
              onClick={() => setShowArchive(!showArchive)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", showArchive && "rotate-180")} />
              Archive ({inactiveSwimmers.length} nageur{inactiveSwimmers.length > 1 ? "s" : ""} inactif{inactiveSwimmers.length > 1 ? "s" : ""})
            </button>
            {showArchive && (
              <div className="mt-2 space-y-2">
                {inactiveSwimmers.map((swimmer) => (
                  <SwimmerCard
                    key={swimmer.id ?? `user-${swimmer.user_id ?? "unknown"}`}
                    swimmer={swimmer}
                    onUpdate={(payload) => updateSwimmerEntry(swimmer, payload)}
                    importPending={importSingle.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import logs */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Historique des imports
        </h2>
        {importLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun import effectué.</p>
        ) : (
          <div className="space-y-1.5">
            {importLogs.map((log: any) => (
              <div
                key={log.id}
                className="rounded-lg border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {log.swimmer_name ?? log.swimmer_iuf}
                  </span>
                  <Badge
                    variant={statusBadgeVariant(log.status)}
                    className="text-[10px] px-1.5 py-0 shrink-0"
                  >
                    {statusLabel(log.status)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                  <span>{log.performances_found ?? 0} trouvées</span>
                  <span>{log.performances_imported ?? 0} importées</span>
                  <span>{formatDateTime(log.started_at)}</span>
                </div>
                {log.error_message && (
                  <p className="text-[11px] text-destructive truncate mt-0.5">{log.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Merge Dialog */}
      <Dialog open={!!mergeSource} onOpenChange={(open) => { if (!open) { setMergeSource(null); setMergeTargetId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fusionner les profils</DialogTitle>
            <DialogDescription>
              Transférer l'IUF, le sexe et l'année de l'ancien profil vers le compte du nageur.
            </DialogDescription>
          </DialogHeader>

          {mergeSource && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Left: manual (source) */}
                <div className="rounded-xl border p-3 space-y-1.5 bg-muted/30">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ancien</p>
                  <p className="text-sm font-semibold">{mergeSource.display_name}</p>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>IUF : <span className="font-mono">{mergeSource.iuf ?? "—"}</span></p>
                    <p>Sexe : {mergeSource.sex === "M" ? "Garçon" : mergeSource.sex === "F" ? "Fille" : "—"}</p>
                    <p>Année : {mergeSource.birthdate ? new Date(mergeSource.birthdate).getFullYear() : "—"}</p>
                  </div>
                </div>

                {/* Right: user (target) */}
                <div className="rounded-xl border p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compte</p>
                  <Select
                    value={mergeTargetId ? String(mergeTargetId) : ""}
                    onValueChange={(v) => setMergeTargetId(Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choisir un nageur inscrit…" />
                    </SelectTrigger>
                    <SelectContent>
                      {userSwimmers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mergeTarget && (
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      <p>IUF : <span className="font-mono">{mergeTarget.iuf ?? "—"}</span></p>
                      <p>Sexe : {mergeTarget.sex === "M" ? "Garçon" : mergeTarget.sex === "F" ? "Fille" : "—"}</p>
                      <p>Année : {mergeTarget.birthdate ? new Date(mergeTarget.birthdate).getFullYear() : "—"}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Transfer indicators */}
              {mergeTarget && (
                <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Transferts prévus</p>
                  {mergeSource.iuf && !mergeTarget.iuf && (
                    <p className="text-xs flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                      IUF <span className="font-mono text-primary">{mergeSource.iuf}</span>
                    </p>
                  )}
                  {mergeSource.sex && !mergeTarget.sex && (
                    <p className="text-xs flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                      Sexe : {mergeSource.sex === "M" ? "Garçon" : "Fille"}
                    </p>
                  )}
                  {mergeSource.birthdate && !mergeTarget.birthdate && (
                    <p className="text-xs flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                      Année : {new Date(mergeSource.birthdate).getFullYear()}
                    </p>
                  )}
                  {mergeSource.iuf && (
                    <p className="text-xs flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                      Performances FFN rattachées au compte
                    </p>
                  )}
                  <p className="text-xs flex items-center gap-1.5 text-destructive">
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    L'entrée « {mergeSource.display_name} » sera supprimée
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeSource(null); setMergeTargetId(null); }}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={!mergeSource || !mergeTargetId || mergeSwimmers.isPending}
              onClick={() => {
                if (mergeSource?.id && mergeTargetId) {
                  mergeSwimmers.mutate({ manualId: mergeSource.id, userSwimmerId: mergeTargetId });
                }
              }}
            >
              {mergeSwimmers.isPending ? "Fusion…" : "Fusionner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin settings */}
      {isAdmin && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Paramètres d'import</CardTitle>
              <CardDescription>Limites mensuelles d'import par rôle.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="h-4 w-4" />
            </Button>
          </CardHeader>
          {showSettings && rateLimits && (
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground">Coach (par mois)</label>
                  <Input
                    type="number"
                    value={rateLimits.coach_monthly}
                    onChange={(e) => setRateLimits({ ...rateLimits, coach_monthly: Number(e.target.value) })}
                    min={-1}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nageur (par mois)</label>
                  <Input
                    type="number"
                    value={rateLimits.athlete_monthly}
                    onChange={(e) => setRateLimits({ ...rateLimits, athlete_monthly: Number(e.target.value) })}
                    min={-1}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Admin (par mois, -1=illimité)</label>
                  <Input
                    type="number"
                    value={rateLimits.admin_monthly}
                    onChange={(e) => setRateLimits({ ...rateLimits, admin_monthly: Number(e.target.value) })}
                    min={-1}
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => saveRateLimits.mutate(rateLimits)}
                disabled={saveRateLimits.isPending}
              >
                Enregistrer
              </Button>
              {autoSync && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Mise à jour auto FFN</p>
                      <p className="text-xs text-muted-foreground">
                        Import hebdomadaire des performances de tous les nageurs actifs
                      </p>
                    </div>
                    <Switch
                      checked={autoSync.enabled}
                      onCheckedChange={(checked) => setAutoSync({ ...autoSync, enabled: checked })}
                    />
                  </div>
                  {autoSync.enabled && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Jour</label>
                        <Select
                          value={String(autoSync.day)}
                          onValueChange={(v) => setAutoSync({ ...autoSync, day: Number(v) })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              { value: "1", label: "Lundi" },
                              { value: "2", label: "Mardi" },
                              { value: "3", label: "Mercredi" },
                              { value: "4", label: "Jeudi" },
                              { value: "5", label: "Vendredi" },
                              { value: "6", label: "Samedi" },
                              { value: "0", label: "Dimanche" },
                            ].map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Heure (UTC)</label>
                        <Select
                          value={String(autoSync.hour)}
                          onValueChange={(v) => setAutoSync({ ...autoSync, hour: Number(v) })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {String(i).padStart(2, "0")}:00
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {autoSync.last_run && (
                    <p className="text-xs text-muted-foreground">
                      Dernière exécution : {formatDateTime(autoSync.last_run)}
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => saveAutoSync.mutate(autoSync)}
                    disabled={saveAutoSync.isPending}
                  >
                    Enregistrer
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
