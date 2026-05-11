import { useState, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { stripAccents } from "@/lib/utils";
import { ExerciseGif } from "./ExerciseGif";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { Exercise } from "@/lib/api";

interface ExercisePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  preferredType?: string | null;
  onSelect: (exercise: Exercise) => void;
  title?: string;
}

export function ExercisePicker({
  open,
  onOpenChange,
  exercises,
  preferredType,
  onSelect,
  title = "Choisir un exercice",
}: ExercisePickerProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const isOnline = useOnlineStatus();

  const filtered = useMemo(() => {
    const q = stripAccents(debouncedSearch.trim().toLowerCase());
    let list = exercises.filter((e) => e.exercise_type === "strength");
    if (q) {
      list = list.filter((e) =>
        stripAccents((e.nom_exercice ?? "").toLowerCase()).includes(q)
      );
    }
    if (preferredType) {
      list.sort((a, b) => {
        const aMatch = a.exercise_type === preferredType ? 0 : 1;
        const bMatch = b.exercise_type === preferredType ? 0 : 1;
        return aMatch - bMatch;
      });
    }
    return list;
  }, [exercises, debouncedSearch, preferredType]);

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <SheetContent
        side="bottom"
        className="flex flex-col overflow-hidden rounded-t-3xl px-4 pb-4 pt-5"
        style={{ maxHeight: "80dvh" }}
      >
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
        </SheetHeader>

        {/* Sticky search */}
        <div className="relative mt-3 shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
          <Input
            placeholder="Rechercher..."
            className="h-10 rounded-xl bg-muted/30 pl-10 pr-10 border-0 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Scrollable list — flex-1 + min-h-0 ensures it shrinks within the sheet */}
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-4 px-4 pb-[env(safe-area-inset-bottom)]">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Aucun exercice trouvé</p>
          )}
          <div className="space-y-1">
            {filtered.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50 active:scale-[0.98]"
                onClick={() => { onSelect(exercise); onOpenChange(false); setSearch(""); }}
              >
                <ExerciseGif
                  src={exercise.illustration_gif}
                  alt=""
                  offline={!isOnline}
                  className="h-10 w-10 shrink-0 rounded-lg border"
                  imgClassName="object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{exercise.nom_exercice}</p>
                  {exercise.description && (
                    <p className="text-xs text-muted-foreground truncate">{exercise.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
