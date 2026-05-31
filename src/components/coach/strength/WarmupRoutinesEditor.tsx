/**
 * WarmupRoutinesEditor — éditeur coach des routines d'échauffement (§354).
 *
 * Deux zones :
 *  - Bloc 1 : routine articulaire commune (`warmup_common_routine`) — une liste ordonnée.
 *  - Bloc 3 : activation par seau (`warmup_activation_routine`) — une liste par seau de travail.
 *
 * Chaque liste s'édite localement (↑↓ / retirer / ajouter via recherche catalogue) puis
 * se sauve atomiquement (RPC `set_warmup_*`). S'applique aux PROCHAINS mésocycles générés
 * (les plans déjà matérialisés sont inchangés). Monté dans l'onglet « Échauffement » de
 * `StrengthCatalog`.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, X, Plus, Search, Info } from "lucide-react";

import {
  getCommonWarmupRoutine,
  getActivationRoutine,
  setCommonWarmupRoutine,
  setActivationRoutine,
  listCatalogExercisesTagged,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ACTIVATION_BUCKETS: { key: string; label: string }[] = [
  { key: "upper_strength", label: "Force haut du corps" },
  { key: "upper_power", label: "Puissance haut du corps" },
  { key: "lower_strength", label: "Force bas du corps" },
  { key: "lower_power", label: "Puissance bas du corps" },
];

interface CatalogLite {
  id: number;
  nomExercice: string;
}

/** Éditeur d'UNE liste ordonnée d'exercices (réordonner / retirer / ajouter + enregistrer). */
function RoutineListEditor({
  title,
  serverIds,
  catalog,
  onSave,
  saving,
}: {
  title: string;
  serverIds: number[];
  catalog: CatalogLite[];
  onSave: (ids: number[]) => void;
  saving: boolean;
}) {
  const [ids, setIds] = useState<number[]>(serverIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Re-synchronise l'état local quand la liste serveur change (chargement / sauvegarde).
  const serverKey = serverIds.join(",");
  useEffect(() => {
    setIds(serverIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const nameOf = useMemo(() => {
    const m = new Map(catalog.map((e) => [e.id, e.nomExercice]));
    return (id: number) => m.get(id) ?? `#${id}`;
  }, [catalog]);

  const dirty = ids.join(",") !== serverKey;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setIds(next);
  };
  const removeAt = (i: number) => setIds(ids.filter((_, k) => k !== i));
  const add = (id: number) => {
    if (!ids.includes(id)) setIds([...ids, id]);
    setPickerOpen(false);
    setQuery("");
  };

  const q = query.trim().toLowerCase();
  const candidates = catalog
    .filter((e) => !ids.includes(e.id) && (q === "" || e.nomExercice.toLowerCase().includes(q)))
    .slice(0, 30);

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold">{title}</h4>
        <Button
          size="sm"
          variant={dirty ? "default" : "secondary"}
          disabled={!dirty || saving}
          onClick={() => onSave(ids)}
        >
          {saving ? "…" : "Enregistrer"}
        </Button>
      </div>

      {ids.length === 0 ? (
        <p className="py-2 text-xs italic text-muted-foreground">Aucun exercice.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {ids.map((id, i) => (
            <li key={`${id}-${i}`} className="flex items-center gap-2 py-1.5">
              <span className="w-5 shrink-0 font-mono text-[10px] font-black tabular-nums text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{nameOf(id)}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeAt(i)} aria-label="Retirer">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen ? (
        <div className="mt-2 rounded-lg border bg-muted/30 p-2">
          <div className="mb-2 flex items-center gap-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un exercice…"
              className="h-8 text-sm"
            />
            <Button size="sm" variant="ghost" onClick={() => { setPickerOpen(false); setQuery(""); }}>
              Annuler
            </Button>
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {candidates.length === 0 ? (
              <li className="px-1 py-2 text-xs italic text-muted-foreground">Aucun résultat.</li>
            ) : (
              candidates.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => add(e.id)}
                    className="w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                  >
                    {e.nomExercice}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setPickerOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un exercice
        </Button>
      )}
    </div>
  );
}

export function WarmupRoutinesEditor() {
  const queryClient = useQueryClient();

  const { data: common = [], isLoading: commonLoading } = useQuery({
    queryKey: ["strength-warmup-common"],
    queryFn: () => getCommonWarmupRoutine(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: activation = {}, isLoading: activationLoading } = useQuery({
    queryKey: ["strength-warmup-activation"],
    queryFn: () => getActivationRoutine(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: catalog = [], isLoading: catalogLoading } = useQuery({
    queryKey: ["strength-catalog-tagged"],
    queryFn: () => listCatalogExercisesTagged(),
    staleTime: 5 * 60 * 1000,
  });

  const commonMutation = useMutation({
    mutationFn: (ids: number[]) => setCommonWarmupRoutine(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength-warmup-common"] });
      toast.success("Routine articulaire enregistrée.");
    },
    onError: () => toast.error("Échec de l'enregistrement."),
  });
  const activationMutation = useMutation({
    mutationFn: ({ bucket, ids }: { bucket: string; ids: number[] }) => setActivationRoutine(bucket, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength-warmup-activation"] });
      toast.success("Activation enregistrée.");
    },
    onError: () => toast.error("Échec de l'enregistrement."),
  });

  const catalogLite: CatalogLite[] = useMemo(
    () => catalog.map((e) => ({ id: e.id, nomExercice: e.nomExercice })),
    [catalog],
  );

  const loading = commonLoading || activationLoading || catalogLoading;
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Chargement des routines…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 p-2.5 text-[12px] text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Ces routines s'appliquent aux <strong>prochains mésocycles générés</strong>. Les plans déjà
          créés ne sont pas modifiés.
        </span>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          Échauffement articulaire commun
        </h3>
        <RoutineListEditor
          title="Routine commune (toutes les séances)"
          serverIds={common}
          catalog={catalogLite}
          saving={commonMutation.isPending}
          onSave={(ids) => commonMutation.mutate(ids)}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          Activation musculaire par seau
        </h3>
        <div className="space-y-2">
          {ACTIVATION_BUCKETS.map((b) => (
            <RoutineListEditor
              key={b.key}
              title={b.label}
              serverIds={activation[b.key] ?? []}
              catalog={catalogLite}
              saving={activationMutation.isPending && activationMutation.variables?.bucket === b.key}
              onSave={(ids) => activationMutation.mutate({ bucket: b.key, ids })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
