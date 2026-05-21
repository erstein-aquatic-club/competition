import { useState } from "react";
import { update1RM } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dumbbell, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingExercises: Array<{ exerciseId: number; exerciseName: string }>;
  athleteId: number | string | null;
  onSaveAndContinue: () => void;
  /** §297 — Lance la séance ; les exos sans 1RM saisi entrent en mode
   *  estimation inline (ramp-up sur série 1) côté WorkoutRunner. */
  onEstimateInline: (skippedExerciseIds: number[]) => void;
}

export function OneRmGate({
  open,
  onOpenChange,
  missingExercises,
  athleteId,
  onSaveAndContinue,
  onEstimateInline,
}: Props) {
  const [values, setValues] = useState<Record<number, string>>({});

  const saveMutation = useMutation({
    mutationFn: async (mode: "saveAndContinue" | "estimateInline") => {
      const savedIds: number[] = [];
      const skippedIds: number[] = [];
      for (const ex of missingExercises) {
        const weight = Number(values[ex.exerciseId]);
        if (weight > 0) {
          await update1RM({
            athlete_id: athleteId ?? undefined,
            exercise_id: ex.exerciseId,
            one_rm: weight,
          });
          savedIds.push(ex.exerciseId);
        } else {
          skippedIds.push(ex.exerciseId);
        }
      }
      return { mode, savedIds, skippedIds };
    },
    onSuccess: ({ mode, savedIds, skippedIds }) => {
      if (savedIds.length > 0) toast("1RM sauvegardés");
      if (mode === "estimateInline") {
        onEstimateInline(skippedIds);
      } else {
        onSaveAndContinue();
      }
    },
    onError: () => {
      toast.error("Erreur", { description: "Impossible de sauvegarder les 1RM." });
    },
  });

  const hasAnyValue = Object.values(values).some((v) => Number(v) > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            1RM requis
          </SheetTitle>
          <SheetDescription>
            Ces exercices utilisent un % de votre 1RM. Renseignez vos max,
            ou laissez l'app les estimer pendant la séance (séries de chauffe).
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {missingExercises.map((ex) => (
            <div key={ex.exerciseId} className="flex items-center gap-3">
              <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{ex.exerciseName}</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  placeholder="kg"
                  className="w-20 h-9 text-right"
                  value={values[ex.exerciseId] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [ex.exerciseId]: e.target.value }))}
                />
                <span className="text-xs text-muted-foreground">kg</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => saveMutation.mutate("saveAndContinue")}
            disabled={!hasAnyValue || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Sauvegarde..." : "Sauvegarder et continuer"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate("estimateInline")}
          >
            Estimer pendant la séance
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
