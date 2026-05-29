import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

/**
 * Ecran coach d'ajustement d'un mesocycle actif en cours (mid-cycle).
 * Squelette : le formulaire complet (pivot, seances, curseurs charge, refaire
 * bilan) est ajoute dans la tache suivante.
 * Design : docs/plans/2026-05-28-mesocycle-adjust-design.md
 */
export default function MesocycleAdjust() {
  const [, params] = useRoute<{ athleteId: string }>("/strength/mesocycle-adjust/:athleteId");
  const [, navigate] = useLocation();
  const athleteId = params?.athleteId;
  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <h1 className="text-xl font-bold">Ajuster le mesocycle</h1>
      <p className="text-sm text-muted-foreground">Athlete {athleteId} — formulaire a venir.</p>
      <Button variant="outline" onClick={() => navigate(`/coach/swimmer/${athleteId}`)}>
        Retour
      </Button>
    </div>
  );
}
