import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronDown, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/lib/api";

interface ExercisePickerDrawerProps {
  exercises: Exercise[];
  selectedId: number;
  onSelect: (exerciseId: number) => void;
}

export function ExercisePickerDrawer({ exercises, selectedId, onSelect }: ExercisePickerDrawerProps) {
  const [open, setOpen] = useState(false);

  const current = exercises.find((ex) => ex.id === selectedId);
  const strengthExercises = exercises.filter((ex) => ex.exercise_type !== "warmup");
  const warmupExercises = exercises.filter((ex) => ex.exercise_type === "warmup");

  const handleSelect = (exerciseId: number) => {
    onSelect(exerciseId);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50"
      >
        {current?.illustration_gif ? (
          <img
            src={current.illustration_gif}
            alt=""
            className="h-7 w-7 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-left font-medium">
          {current?.nom_exercice ?? "Choisir un exercice"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-0">
            <DrawerTitle>Choisir un exercice</DrawerTitle>
          </DrawerHeader>
          <Command className="mt-2" shouldFilter>
            <CommandInput placeholder="Rechercher..." className="h-12" />
            <CommandList className="max-h-[60dvh] px-1 pb-safe">
              <CommandEmpty>Aucun exercice trouvé</CommandEmpty>
              {strengthExercises.length > 0 && (
                <CommandGroup heading="Travail">
                  {strengthExercises.map((ex) => (
                    <ExerciseItem
                      key={ex.id}
                      exercise={ex}
                      isSelected={ex.id === selectedId}
                      onSelect={() => handleSelect(ex.id)}
                    />
                  ))}
                </CommandGroup>
              )}
              {warmupExercises.length > 0 && (
                <CommandGroup heading="Échauffement">
                  {warmupExercises.map((ex) => (
                    <ExerciseItem
                      key={ex.id}
                      exercise={ex}
                      isSelected={ex.id === selectedId}
                      onSelect={() => handleSelect(ex.id)}
                    />
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function ExerciseItem({
  exercise,
  isSelected,
  onSelect,
}: {
  exercise: Exercise;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={exercise.nom_exercice}
      onSelect={onSelect}
      className="flex items-center gap-3 rounded-xl px-2 py-2.5"
    >
      {exercise.illustration_gif ? (
        <img
          src={exercise.illustration_gif}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Dumbbell className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{exercise.nom_exercice}</span>
      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </CommandItem>
  );
}
