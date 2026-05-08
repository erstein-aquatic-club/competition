/**
 * WellnessForm — Daily wellness questionnaire (6 items + notes).
 *
 * Opens in a drawer/bottom-sheet. After save, displays ReadinessGauge.
 * Uses intensity scale from design tokens for 1-5 pill buttons.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Check, Moon, Smile, Battery, BatteryLow, Sparkles, Flame, Frown, Laugh, Wind, Zap, Bed, Bandage, Heart, type LucideIcon } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { upsertWellness, computeReadinessScore, getWellnessForDate } from "@/lib/api/wellness";
import { getPainReportsForDate, upsertPainReports } from "@/lib/api/painReports";
import type { WellnessCheck } from "@/lib/api/types";
import { slideInFromBottom } from "@/lib/animations";
import { ReadinessGauge } from "./ReadinessGauge";
import { BodyHeatMap } from "./BodyHeatMap";

// ── Types ──────────────────────────────────────────────────────

export interface WellnessFormProps {
  userId: number;
  date: string; // ISO date
  existingData?: WellnessCheck | null;
  onSaved: () => void;
}

// ── Intensity pill helpers ─────────────────────────────────────

const INTENSITY_CLASSES: Record<number, string> = {
  1: "bg-intensity-1 border-intensity-1 text-white",
  2: "bg-intensity-2 border-intensity-2 text-white",
  3: "bg-intensity-3 border-intensity-3 text-white",
  4: "bg-intensity-4 border-intensity-4 text-white",
  5: "bg-intensity-5 border-intensity-5 text-white",
};

// ── Item definitions ───────────────────────────────────────────

interface WellnessItem {
  key: string;
  label: string;
  icons: [LucideIcon, LucideIcon]; // [low, high]
  positive?: boolean; // true = higher is better (colors reversed: 5=green, 1=red)
  labelLow: string;
  labelHigh: string;
}

const ITEMS: WellnessItem[] = [
  { key: "sleep_quality", label: "Sommeil (qualité)", icons: [Moon, Smile], positive: true, labelLow: "Mauvais", labelHigh: "Excellent" },
  { key: "fatigue", label: "Fatigue", icons: [Battery, BatteryLow], labelLow: "Aucune", labelHigh: "Épuisé(e)" },
  { key: "soreness", label: "Courbatures", icons: [Sparkles, Flame], labelLow: "Aucune", labelHigh: "Intense" },
  { key: "mood", label: "Humeur", icons: [Frown, Laugh], positive: true, labelLow: "Déprimé(e)", labelHigh: "Au top" },
  { key: "stress", label: "Stress", icons: [Wind, Zap], labelLow: "Zen", labelHigh: "Débordé(e)" },
];

// ── Component ──────────────────────────────────────────────────

export function WellnessForm({ userId, date, existingData, onSaved }: WellnessFormProps) {
  // Fetch existing data if not provided as prop
  const { data: fetchedData } = useQuery({
    queryKey: ["wellness", userId, date],
    queryFn: () => getWellnessForDate(userId, date),
    enabled: !!userId && existingData === undefined,
    staleTime: 60_000,
  });
  const existing = existingData ?? fetchedData;

  // State for each item
  const [sleepQuality, setSleepQuality] = useState(existing?.sleep_quality ?? 0);
  const [sleepHours, setSleepHours] = useState(existing?.sleep_hours ?? 7.5);
  const [fatigue, setFatigue] = useState(existing?.fatigue ?? 0);
  const [soreness, setSoreness] = useState(existing?.soreness ?? 0);
  const [mood, setMood] = useState(existing?.mood ?? 0);
  const [stress, setStress] = useState(existing?.stress ?? 0);
  const [notes, setNotes] = useState(existing?.notes ?? "");

  // Pain reports state
  const [hasPain, setHasPain] = useState(false);
  const [painZones, setPainZones] = useState<Record<string, number>>({});

  // Fetch existing pain reports for this date
  const { data: existingPainReports } = useQuery({
    queryKey: ["pain-reports", userId, date],
    queryFn: () => getPainReportsForDate(userId, date),
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Sync state when fetched data arrives (async query resolve)
  useEffect(() => {
    if (existing) {
      setSleepQuality(existing.sleep_quality);
      setSleepHours(existing.sleep_hours);
      setFatigue(existing.fatigue);
      setSoreness(existing.soreness);
      setMood(existing.mood);
      setStress(existing.stress);
      setNotes(existing.notes ?? "");
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync pain reports when fetched
  useEffect(() => {
    if (existingPainReports && existingPainReports.length > 0) {
      setHasPain(true);
      const zones: Record<string, number> = {};
      for (const r of existingPainReports) {
        zones[r.body_zone] = r.intensity;
      }
      setPainZones(zones);
    }
  }, [existingPainReports]);

  // Success state: show gauge after save
  const [savedScore, setSavedScore] = useState<number | null>(null);

  const stateMap: Record<string, [number, (v: number) => void]> = {
    sleep_quality: [sleepQuality, setSleepQuality],
    fatigue: [fatigue, setFatigue],
    soreness: [soreness, setSoreness],
    mood: [mood, setMood],
    stress: [stress, setStress],
  };

  const allFilled =
    sleepQuality >= 1 && fatigue >= 1 && soreness >= 1 && mood >= 1 && stress >= 1;

  const mutation = useMutation({
    mutationFn: async () => {
      const readiness = computeReadinessScore({
        sleep_quality: sleepQuality,
        sleep_hours: sleepHours,
        fatigue,
        soreness,
        mood,
        stress,
      });
      const wellnessResult = await upsertWellness({
        user_id: userId,
        date,
        sleep_quality: sleepQuality,
        sleep_hours: sleepHours,
        fatigue,
        soreness,
        mood,
        stress,
        readiness_score: readiness,
        notes: notes.trim() || null,
      });

      // Save pain reports
      const painEntries = hasPain
        ? Object.entries(painZones).map(([body_zone, intensity]) => ({
            body_zone,
            intensity,
          }))
        : [];
      await upsertPainReports(userId, date, painEntries);

      return wellnessResult;
    },
    onSuccess: (data) => {
      setSavedScore(data.readiness_score);
      // Delay so the user can see the gauge
      setTimeout(() => onSaved(), 1800);
    },
  });

  // ── Success view ─────────────────────────────────────────────
  if (savedScore !== null) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-10 gap-4"
      >
        <ReadinessGauge score={savedScore} size={100} />
        <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          Enregistré
        </div>
      </motion.div>
    );
  }

  // ── Form view ────────────────────────────────────────────────
  return (
    <motion.div
      variants={slideInFromBottom}
      initial="hidden"
      animate="visible"
      className="space-y-5 pb-4"
    >
      {/* 1-5 rated items */}
      {ITEMS.map((item) => {
        const [value, setValue] = stateMap[item.key];
        const [IconLow, IconHigh] = item.icons;
        return (
          <div key={item.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <IconLow className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">{item.label}</span>
              <IconHigh className="h-4 w-4 text-muted-foreground ml-auto" aria-hidden="true" />
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => {
                // For positive items (higher=better), reverse color: 5→intensity-1 (green), 1→intensity-5 (red)
                const colorIndex = item.positive ? 6 - n : n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setValue(n)}
                    className={[
                      "flex-1 h-11 rounded-xl border text-sm font-bold transition-all active:scale-95",
                      value === n
                        ? INTENSITY_CLASSES[colorIndex]
                        : "bg-muted border-border text-muted-foreground hover:bg-muted/70",
                    ].join(" ")}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between px-0.5">
              <span className="text-[10px] text-muted-foreground">{item.labelLow}</span>
              <span className="text-[10px] text-muted-foreground">{item.labelHigh}</span>
            </div>
          </div>
        );
      })}

      {/* Sleep hours stepper */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Bed className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-semibold text-foreground">Heures de sommeil</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={sleepHours <= 0}
            onClick={() => setSleepHours((v) => Math.max(0, +(v - 0.5).toFixed(1)))}
            className="h-11 w-11 rounded-2xl border border-border bg-card hover:bg-muted flex items-center justify-center transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="-0.5h"
          >
            <Minus className="h-5 w-5" />
          </button>
          <div className="min-w-[80px] text-center">
            <span className="text-2xl font-display font-bold tabular-nums text-foreground">
              {sleepHours.toFixed(1)}
            </span>
            <span className="text-sm font-semibold text-muted-foreground ml-0.5">h</span>
          </div>
          <button
            type="button"
            disabled={sleepHours >= 16}
            onClick={() => setSleepHours((v) => Math.min(16, +(v + 0.5).toFixed(1)))}
            className="h-11 w-11 rounded-2xl border border-border bg-card hover:bg-muted flex items-center justify-center transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="+0.5h"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optionnel)"
          rows={2}
          maxLength={1000}
          className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
        />
      </div>

      {/* Pain toggle + heat map */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setHasPain((v) => !v);
            if (hasPain) setPainZones({});
          }}
          className={[
            "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all",
            hasPain
              ? "border-red-400/50 bg-red-500/10 text-red-700 dark:text-red-400"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
          ].join(" ")}
        >
          {hasPain ? (
            <Bandage className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{hasPain ? "Douleurs signalées" : "As-tu des douleurs ?"}</span>
          {hasPain && Object.keys(painZones).length > 0 && (
            <span className="ml-auto text-xs bg-red-500/20 px-1.5 py-0.5 rounded-full">
              {Object.keys(painZones).length} zone{Object.keys(painZones).length > 1 ? "s" : ""}
            </span>
          )}
        </button>
        <AnimatePresence>
          {hasPain && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] text-muted-foreground text-center mb-2">
                  Touche les zones douloureuses (1x = légère, 2x = modérée, 3x = forte)
                </p>
                <BodyHeatMap
                  selectedZones={painZones}
                  onChange={setPainZones}
                  mode="edit"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Submit */}
      <button
        type="button"
        disabled={!allFilled || mutation.isPending}
        onClick={() => mutation.mutate()}
        className={[
          "w-full h-12 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]",
          allFilled
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        ].join(" ")}
      >
        {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
      </button>

      {mutation.isError && (
        <p className="text-xs text-destructive text-center">
          Erreur : {(mutation.error as Error)?.message ?? "Veuillez réessayer."}
        </p>
      )}
    </motion.div>
  );
}
