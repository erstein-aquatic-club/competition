/**
 * MesocycleEntry — point d'entrée "Génère ton mésocycle" sur /strength (§293).
 *
 * Conditionnel : visible UNIQUEMENT quand le bilan muscu est complet
 * (`status === 'completed'`). Sinon, retourne `null` — l'écran de bilan
 * (`<QuestionnairePrompt/>` / `<KpiWizardEntry/>`) est la marche d'avant.
 *
 * Pendant ce premier mésocycle, on est dans l'esprit « action attendue »
 * → carte violette (même palette que `<QuestionnairePrompt/>`). Une fois
 * qu'un mésocycle existe déjà, la tuile devient calme (variant 'neutral').
 *
 * Navigation → `/strength/mesocycle-generate`.
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getActiveMesocycle, getLatestAssessment } from "@/lib/api";
import { Dumbbell, ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Tuile d'entrée vers la génération de mésocycle.
 * - Bilan non complété → null (autre tuile prend le relais).
 * - Aucun mésocycle actif → carte violette "Action attendue".
 * - Mésocycle actif → tuile neutre "Régénérer un mésocycle".
 */
export function MesocycleEntry() {
  const userId = useAuth((s) => s.userId);
  const [, navigate] = useLocation();

  const { data: assessment } = useQuery({
    queryKey: ["strength-assessment-latest", userId],
    queryFn: () => getLatestAssessment(userId!),
    enabled: userId != null,
    staleTime: 60_000,
  });

  const { data: activeMesocycle } = useQuery({
    queryKey: ["strength-mesocycle-active", userId],
    queryFn: () => getActiveMesocycle(userId!),
    enabled: userId != null,
    staleTime: 60_000,
  });

  if (!assessment || assessment.status !== "completed") return null;

  const hasActive = activeMesocycle != null;

  if (hasActive) {
    // Tuile neutre — il a déjà un plan, l'action de régénération est secondaire.
    return (
      <button
        type="button"
        onClick={() => navigate("/strength/mesocycle-generate")}
        className="flex w-full items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors active:bg-muted"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
          <Dumbbell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold">Régénérer un mésocycle muscu</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            Remplace le plan actif par un nouveau cycle périodisé
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  // Premier mésocycle — variante violette « action attendue ».
  return (
    <button
      type="button"
      onClick={() => navigate("/strength/mesocycle-generate")}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-violet-300 bg-violet-50 px-4 py-3.5 text-left shadow-sm transition-colors active:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/40 dark:active:bg-violet-900/40"
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white dark:bg-violet-500">
        <Dumbbell className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 ring-2 ring-violet-50 dark:bg-violet-400 dark:ring-violet-950">
          <Sparkles className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
          Prêt à générer
        </p>
        <p className="mt-0.5 text-sm font-semibold text-violet-900 dark:text-violet-100">
          Génère ton mésocycle muscu
        </p>
        <p className="mt-0.5 truncate text-[11px] text-violet-700/90 dark:text-violet-300/80">
          Plan personnalisé basé sur ton bilan
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
    </button>
  );
}
