import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEquipmentIconUrl } from "@/components/swim/EquipmentPill";
import { intensityTone } from "@/components/swim/IntensityDots";
import { IntensityDotsSelector } from "@/components/swim/IntensityDotsSelector";
import { normalizeIntensityValue } from "@/lib/swimTextParser";
import type { SwimExercise } from "@/lib/swimTextParser";

interface SwimExerciseFormProps {
  exercise: SwimExercise;
  onChange: (field: keyof SwimExercise, value: string | number | null | string[]) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  showDelete?: boolean;
}

const formatRecoveryTime = (seconds: number | null) => {
  if (!seconds) return "";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min > 0 && sec > 0) return `${min}'${sec.toString().padStart(2, "0")}`;
  if (min > 0) return `${min}'00`;
  return `${sec}s`;
};

const parseRecoveryMinSec = (seconds: number | null) => {
  if (!seconds) return { min: 0, sec: 0 };
  return { min: Math.floor(seconds / 60), sec: seconds % 60 };
};

const equipmentOptions = [
  { value: "palmes", label: "Palmes" },
  { value: "tuba", label: "Tuba" },
  { value: "plaquettes", label: "Plaquettes" },
  { value: "pull", label: "Pull" },
  { value: "elastique", label: "Élastique" },
];

const strokeOptions = [
  { value: "pap", label: "Papillon" },
  { value: "dos", label: "Dos" },
  { value: "brasse", label: "Brasse" },
  { value: "crawl", label: "Nage Libre" },
  { value: "4n", label: "4 nages" },
  { value: "nac", label: "NAC" },
  { value: "spe", label: "Spé" },
];

const strokeTypeOptions = [
  { value: "nc", label: "NC" },
  { value: "educ", label: "Educ" },
  { value: "jambes", label: "Jambes" },
];

const formatIntensityLabel = (value: string) => (value === "Max" ? "MAX" : value);

const intensityTextTone: Record<string, string> = {
  V0: "text-intensity-1",
  V1: "text-intensity-2",
  V2: "text-intensity-3",
  V3: "text-intensity-4",
  Max: "text-intensity-5",
  Prog: "text-intensity-prog",
};

const intensityRingTone: Record<string, string> = {
  V0: "ring-intensity-1/30",
  V1: "ring-intensity-2/30",
  V2: "ring-intensity-3/30",
  V3: "ring-intensity-4/30",
  Max: "ring-intensity-5/30",
  Prog: "ring-intensity-prog/30",
};

export function SwimExerciseForm({ exercise, onChange, onDelete, onDuplicate, showDelete = true }: SwimExerciseFormProps) {
  const normalizedIntensity = normalizeIntensityValue(exercise.intensity);
  const modalitesText = exercise.modalities ?? "";

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground">Rép.</div>
            <div className="mt-1">
              <Input
                type="number"
                min={1}
                value={exercise.repetitions ?? ""}
                onChange={(e) =>
                  onChange("repetitions", e.target.value === "" ? null : Number(e.target.value))
                }
                className="rounded-2xl"
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground">Dist. (m)</div>
            <div className="mt-1">
              <Input
                type="number"
                min={0}
                value={exercise.distance ?? ""}
                onChange={(e) => onChange("distance", e.target.value === "" ? null : Number(e.target.value))}
                className="rounded-2xl"
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground">Nage</div>
            <div className="mt-1">
              <Select value={exercise.stroke} onValueChange={(value) => onChange("stroke", value)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {strokeOptions.map((stroke) => (
                    <SelectItem key={stroke.value} value={stroke.value}>
                      {stroke.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground">Type</div>
            <div className="mt-1">
              <Select value={exercise.strokeType} onValueChange={(value) => onChange("strokeType", value)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {strokeTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-muted-foreground">
                Intensité (clic sur points)
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full bg-card px-2.5 py-1 text-xs font-semibold ring-1",
                  intensityRingTone[normalizedIntensity],
                  intensityTextTone[normalizedIntensity]
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    intensityTone[normalizedIntensity] ?? "bg-muted"
                  )}
                />
                {formatIntensityLabel(normalizedIntensity)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <IntensityDotsSelector
                value={exercise.intensity}
                onChange={(value) => onChange("intensity", value)}
              />
            </div>
          </div>

          <div className="col-span-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Récupération</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => onChange("restType", "departure")}
                  className={cn(
                    "rounded-full px-2.5 py-1 transition-colors",
                    exercise.restType === "departure"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Départ
                </button>
                <button
                  type="button"
                  onClick={() => onChange("restType", "rest")}
                  className={cn(
                    "rounded-full px-2.5 py-1 transition-colors",
                    exercise.restType === "rest"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Repos
                </button>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={parseRecoveryMinSec(exercise.rest).min || ""}
                  onChange={(e) => {
                    const min = e.target.value === "" ? 0 : Number(e.target.value);
                    const sec = parseRecoveryMinSec(exercise.rest).sec;
                    onChange("rest", min * 60 + sec || null);
                  }}
                  placeholder="0"
                  className="w-12 rounded-2xl text-center"
                />
                <span className="text-[11px] text-muted-foreground">min</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={parseRecoveryMinSec(exercise.rest).sec || ""}
                  onChange={(e) => {
                    const sec = e.target.value === "" ? 0 : Number(e.target.value);
                    const min = parseRecoveryMinSec(exercise.rest).min;
                    onChange("rest", min * 60 + sec || null);
                  }}
                  placeholder="0"
                  className="w-12 rounded-2xl text-center"
                />
                <span className="text-[11px] text-muted-foreground">sec</span>
              </div>
              {exercise.rest ? (
                <button
                  type="button"
                  onClick={() => onChange("rest", null)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Effacer
                </button>
              ) : null}
            </div>
          </div>

          <div className="col-span-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Équipements</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {equipmentOptions.map((equipment) => {
                const active = exercise.equipment.includes(equipment.value);
                const iconUrl = getEquipmentIconUrl(equipment.value);
                return (
                  <button
                    key={equipment.value}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? exercise.equipment.filter((item) => item !== equipment.value)
                        : [...exercise.equipment, equipment.value];
                      onChange("equipment", next);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full",
                        active ? "bg-white/10" : "bg-muted"
                      )}
                    >
                      {iconUrl ? (
                        <img src={iconUrl} alt="" className="h-4 w-4" aria-hidden="true" loading="lazy" />
                      ) : null}
                    </span>
                    {equipment.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="col-span-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Modalités</div>
            <div className="mt-1">
              <Textarea
                value={modalitesText}
                onChange={(e) => onChange("modalities", e.target.value)}
                placeholder="Une modalité par ligne"
                rows={3}
                className="rounded-2xl"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Dupliquer exercice"
              title="Dupliquer exercice"
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
          {showDelete && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
              aria-label="Supprimer exercice"
              title="Supprimer exercice"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
