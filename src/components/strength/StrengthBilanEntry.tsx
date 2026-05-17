/**
 * StrengthBilanEntry — points d'entrée "Bilan Muscu" sur /strength (§288).
 *
 * Deux entrées, affichées dans l'onglet "S'entraîner" du module muscu :
 *
 *  1. QuestionnairePrompt — carte d'action prioritaire, conditionnelle.
 *     Visible uniquement quand l'utilisateur connecté a un bilan en statut
 *     `questionnaire_pending` : le coach attend son questionnaire. Le système
 *     de notifications qui routera le nageur ici est un chantier ultérieur —
 *     d'ici là, cette carte est le seul point d'entrée in-app.
 *
 *  2. KpiWizardEntry — entrée standard vers l'assistant de saisie des 5 KPIs
 *     de force. Toujours visible (nageur ou coach : le wizard gère le rôle).
 *
 * Les deux suivent le pattern de tuiles de /strength :
 * `rounded-2xl border bg-card` + icône en pastille + ChevronRight.
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getLatestAssessment } from "@/lib/api";
import { ClipboardCheck, ClipboardList, ChevronRight } from "lucide-react";

/**
 * Carte conditionnelle : le coach a demandé un bilan, le nageur doit remplir
 * son questionnaire. Plus visible que l'entrée KPI car c'est une action
 * attendue côté coach. Ne rend rien tant qu'il n'y a pas de bilan en
 * `questionnaire_pending`.
 */
export function QuestionnairePrompt({ userId }: { userId: number | null }) {
  const [, navigate] = useLocation();

  const { data: assessment } = useQuery({
    queryKey: ["strength-assessment-latest", userId],
    queryFn: () => getLatestAssessment(userId!),
    enabled: userId != null,
    staleTime: 60_000,
  });

  if (!assessment || assessment.status !== "questionnaire_pending") return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/strength/questionnaire")}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-violet-300 bg-violet-50 px-4 py-3.5 text-left shadow-sm transition-colors active:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/40 dark:active:bg-violet-900/40"
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white dark:bg-violet-500">
        <ClipboardList className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-70 motion-reduce:hidden" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-violet-500 ring-2 ring-violet-50 dark:ring-violet-950" />
        </span>
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
          Action demandée
        </p>
        <p className="mt-0.5 text-sm font-semibold text-violet-900 dark:text-violet-100">
          Ton coach a demandé un bilan
        </p>
        <p className="mt-0.5 truncate text-[11px] text-violet-700/90 dark:text-violet-300/80">
          Remplis ton questionnaire pour le préparer
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
    </button>
  );
}

/**
 * Entrée standard vers le KPI wizard. Toujours visible — le wizard gère
 * lui-même le rôle (un coach passe par l'étape de sélection du nageur).
 */
export function KpiWizardEntry() {
  const [, navigate] = useLocation();

  return (
    <button
      type="button"
      onClick={() => navigate("/strength/kpi-wizard")}
      className="flex w-full items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors active:bg-muted"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ClipboardCheck className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-sm font-semibold">Bilan KPIs de force</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          Mesurer les 5 tests — saisie guidée
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
