/**
 * StrengthPlanningScreen — écran coach "Planif. Muscu" (refonte Task 6).
 *
 * Réduit à deux sections empilées :
 *   1. <StrengthAttendanceBoard /> — tableau d'assiduité muscu (Task 5).
 *   2. <CoachMesocyclesAccordion /> — accordéon des mésocycles actifs, qui
 *      déplie le panel coach (`CoachMesocyclePanel`) en place.
 *
 * L'ancien corps (sélecteur groupe/nageur + timeline lecture seule +
 * aperçu MyPlanTab) est SUPPRIMÉ : l'édition d'un plan se fait dans
 * Biblio > Plans, l'aperçu nageur dans la fiche nageur.
 */
import { useLocation } from "wouter";
import { ArrowLeft, Dumbbell } from "lucide-react";

import StrengthAttendanceBoard from "@/components/coach/strength/StrengthAttendanceBoard";
import CoachMesocyclesAccordion from "@/components/coach/strength/CoachMesocyclesAccordion";

export default function StrengthPlanningScreen() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-lg">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/coach")}
            className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Dumbbell className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Planif. Muscu
          </h1>
        </div>
      </div>

      <div className="space-y-6 px-4 pt-4">
        <StrengthAttendanceBoard />
        <CoachMesocyclesAccordion />
      </div>
    </div>
  );
}
