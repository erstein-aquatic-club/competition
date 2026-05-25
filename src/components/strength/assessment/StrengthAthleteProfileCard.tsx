/**
 * StrengthAthleteProfileCard — bloc coach de réglage du profil muscu d'un nageur.
 *
 * Deux axes coach-set, persistants par athlète (table `strength_athlete_settings`),
 * consommés à la génération du mésocycle :
 *   - niveau de pratique muscu  → filtre les exercices (G3) ;
 *   - niveau de performance/tier → cale les barèmes KPI (G1).
 *
 * Autosave : chaque changement persiste les DEUX valeurs courantes (upsert), avec
 * indicateur discret. Défauts affichés si la ligne n'existe pas encore
 * (intermédiaire / club = identité barème). Lecture seule garantie côté serveur
 * par la RLS (athlète ne peut pas écrire) ; ce bloc n'est rendu que côté coach.
 *
 * Design : docs/plans/2026-05-24-muscu-dejeunification-g1-g3-design.md §4.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStrengthAthleteSettings,
  upsertStrengthAthleteSettings,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, Loader2, SlidersHorizontal } from "lucide-react";
import {
  hasUnderLeveledProfile,
  RECOMMENDED_LEVEL_FOR_TIER,
} from "@/lib/strength/strengthProfileMismatch";
import { toast } from "sonner";

type PracticeLevel = "beginner" | "intermediate" | "advanced";
type PerformanceTier = "club" | "regional" | "national" | "elite";

const PRACTICE_LEVELS: { value: PracticeLevel; label: string }[] = [
  { value: "beginner", label: "Débutant" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "advanced", label: "Confirmé" },
];
const PERFORMANCE_TIERS: { value: PerformanceTier; label: string }[] = [
  { value: "club", label: "Club" },
  { value: "regional", label: "Régional" },
  { value: "national", label: "National" },
  { value: "elite", label: "Élite" },
];

/** Défauts applicatifs = comportement actuel (cf. design §5). */
const DEFAULT_LEVEL: PracticeLevel = "intermediate";
const DEFAULT_TIER: PerformanceTier = "club";

export function StrengthAthleteProfileCard({
  athleteId,
}: {
  athleteId: number;
}) {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    // Même clé que MesocyclePreview → l'invalidation rafraîchit aussi l'aperçu.
    queryKey: ["strength-athlete-settings", athleteId],
    queryFn: () => getStrengthAthleteSettings(athleteId),
    enabled: athleteId != null,
  });

  const [level, setLevel] = useState<PracticeLevel>(DEFAULT_LEVEL);
  const [tier, setTier] = useState<PerformanceTier>(DEFAULT_TIER);
  // Confirmation transitoire "Enregistré" (s'efface après ~2 s).
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  // Synchronise l'état local quand la ligne charge / change (null → défauts).
  useEffect(() => {
    setLevel((settings?.practice_level as PracticeLevel | null) ?? DEFAULT_LEVEL);
    setTier((settings?.performance_tier as PerformanceTier | null) ?? DEFAULT_TIER);
  }, [settings?.practice_level, settings?.performance_tier]);

  const mutation = useMutation({
    mutationFn: (patch: {
      practice_level: PracticeLevel;
      performance_tier: PerformanceTier;
    }) => upsertStrengthAthleteSettings(athleteId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["strength-athlete-settings", athleteId],
      });
      setShowSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setShowSaved(false), 2000);
    },
    onError: (err: Error) => {
      toast.error("Échec de l'enregistrement du profil", {
        description: err.message || "Réessaie dans un instant.",
      });
    },
  });

  /** Persiste les deux valeurs courantes (l'upsert écrit la paire complète). */
  const persist = (next: {
    practice_level: PracticeLevel;
    performance_tier: PerformanceTier;
  }) => mutation.mutate(next);

  const underLeveled = hasUnderLeveledProfile(level, tier);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Profil muscu
          <span
            className="ml-auto flex items-center gap-1 text-[11px] font-normal text-muted-foreground"
            aria-live="polite"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Enregistrement…
              </>
            ) : showSaved ? (
              <>
                <Check className="h-3 w-3 text-primary" />
                Enregistré
              </>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="-mt-1 text-xs text-muted-foreground">
          Calibre la génération du mésocycle : le niveau de pratique filtre les
          exercices, le niveau de performance cale les barèmes.
        </p>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        ) : (
          <>
            {/* Niveau de pratique muscu → filtre les exercices (G3) */}
            <div className="space-y-1.5">
              <label
                htmlFor="practice-level"
                className="text-xs font-semibold text-foreground"
              >
                Niveau de pratique muscu
              </label>
              <Select
                value={level}
                onValueChange={(v) => {
                  const next = v as PracticeLevel;
                  setLevel(next);
                  persist({ practice_level: next, performance_tier: tier });
                }}
              >
                <SelectTrigger id="practice-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRACTICE_LEVELS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Filtre les exercices : les mouvements avancés ne sont proposés
                qu'au niveau confirmé.
              </p>
            </div>

            {/* Niveau de performance → cale les barèmes KPI (G1) */}
            <div className="space-y-1.5">
              <label
                htmlFor="performance-tier"
                className="text-xs font-semibold text-foreground"
              >
                Niveau de performance
              </label>
              <Select
                value={tier}
                onValueChange={(v) => {
                  const next = v as PerformanceTier;
                  setTier(next);
                  persist({ practice_level: level, performance_tier: next });
                }}
              >
                <SelectTrigger id="performance-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_TIERS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Cale les barèmes KPI sur la population de référence (relève la
                barre aux niveaux supérieurs).
              </p>
            </div>

            {underLeveled && (
              <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 space-y-1.5 leading-tight">
                  <p className="text-[11px]">
                    Niveau «&nbsp;
                    {PERFORMANCE_TIERS.find((t) => t.value === tier)?.label}&nbsp;» mais
                    pratique «&nbsp;
                    {PRACTICE_LEVELS.find((l) => l.value === level)?.label}&nbsp;» : les
                    tractions lestées, l'haltérophilie et la pliométrie avancée ne seront
                    pas proposées.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const target = RECOMMENDED_LEVEL_FOR_TIER[tier];
                      setLevel(target);
                      persist({ practice_level: target, performance_tier: tier });
                    }}
                    className="rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100"
                  >
                    Aligner sur Confirmé
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
