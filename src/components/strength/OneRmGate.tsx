import { useState } from "react";
import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  onSkipToFreeWeight: () => void;
}

export function OneRmGate({
  open,
  onOpenChange,
  missingExercises,
  athleteId,
  onSaveAndContinue,
  onSkipToFreeWeight,
}: Props) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<number, string>>({});

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const ex of missingExercises) {
        const weight = Number(values[ex.exerciseId]);
        if (weight > 0) {
          await api.update1RM({
            athlete_id: athleteId ?? undefined,
            exercise_id: ex.exerciseId,
            one_rm: weight,
          });
        }
      }
    },
    onSuccess: () => {
      toast({ title: "1RM sauvegardés" });
      onSaveAndContinue();
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de sauvegarder les 1RM.", variant: "destructive" });
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
            Ces exercices utilisent un pourcentage de votre 1RM. Renseignez votre max ou passez en poids libre.
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
            onClick={() => saveMutation.mutate()}
            disabled={!hasAnyValue || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Sauvegarde..." : "Sauvegarder et continuer"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onSkipToFreeWeight}>
            Poids libre
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
