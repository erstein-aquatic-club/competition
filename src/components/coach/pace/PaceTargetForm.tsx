import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parsePaceTime, formatPaceTime } from "../../../lib/paceCalculator";
import type { Stroke } from "../../../lib/paceCalculator";

export const DISTANCES_BY_STROKE: Record<Stroke, number[]> = {
  NL:     [50, 100, 200, 400, 800, 1500],
  Dos:    [50, 100, 200],
  Brasse: [50, 100, 200],
  Pap:    [50, 100, 200],
  "4N":   [100, 200, 400],
};

const STROKE_OPTIONS: { value: Stroke; label: string }[] = [
  { value: "NL",     label: "NL — Nage libre" },
  { value: "Dos",    label: "Dos" },
  { value: "Brasse", label: "Brasse" },
  { value: "Pap",    label: "Pap" },
  { value: "4N",     label: "4N — Quatre nages" },
];

interface Props {
  initial?: { stroke: Stroke; target_distance_m: number; target_time_ms: number };
  onSubmit: (v: { stroke: Stroke; target_distance_m: number; target_time_ms: number }) => void;
  onCancel: () => void;
}

export function PaceTargetForm({ initial, onSubmit, onCancel }: Props) {
  const [stroke, setStroke] = useState<Stroke | "">(initial?.stroke ?? "");
  const [distance, setDistance] = useState<string>(
    initial?.target_distance_m ? String(initial.target_distance_m) : "",
  );
  const [timeStr, setTimeStr] = useState<string>(
    initial?.target_time_ms ? formatPaceTime(initial.target_time_ms) : "",
  );
  const [timeTouched, setTimeTouched] = useState(false);

  useEffect(() => {
    if (!stroke) return;
    const valid = DISTANCES_BY_STROKE[stroke];
    if (!valid.includes(Number(distance))) setDistance("");
  }, [stroke]);

  const parsedMs = parsePaceTime(timeStr);
  const distOptions = stroke ? DISTANCES_BY_STROKE[stroke] : [];
  const isValid = stroke !== "" && distance !== "" && parsedMs !== null;
  const showTimeError = timeTouched && timeStr.length > 0 && parsedMs === null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !stroke) return;
    onSubmit({ stroke, target_distance_m: Number(distance), target_time_ms: parsedMs! });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Nage
          </Label>
          <Select value={stroke} onValueChange={(v) => setStroke(v as Stroke)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              {STROKE_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value} className="text-sm">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Distance
          </Label>
          <Select value={distance} onValueChange={setDistance} disabled={!stroke}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="— m" />
            </SelectTrigger>
            <SelectContent>
              {distOptions.map((d) => (
                <SelectItem key={d} value={String(d)} className="text-sm">
                  {d >= 1000 ? `${d / 1000} km` : `${d} m`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="ptf-time"
          className="text-[10px] uppercase tracking-widest text-muted-foreground/70"
        >
          Temps cible
        </Label>
        <Input
          id="ptf-time"
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          onBlur={() => setTimeTouched(true)}
          placeholder="1:05.4"
          className={`h-8 font-mono text-sm${showTimeError ? " border-destructive/50" : ""}`}
          autoComplete="off"
          spellCheck={false}
        />
        {parsedMs !== null && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            = {formatPaceTime(parsedMs)}
          </p>
        )}
        {showTimeError && (
          <p className="text-[11px] text-destructive/70">Format : 1:05.4 ou 65.4</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={!isValid}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
