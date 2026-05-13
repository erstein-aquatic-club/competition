import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTrainingCycle, createObjective, initSwimmerSlots } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarRange, Target, CalendarClock, Check, ChevronRight } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FFN_EVENTS, eventLabel, parseTime } from "@/lib/objectiveHelpers";
import { useAuth } from "@/lib/auth";

interface Props {
  athleteId: number;
  athleteAuthId: string | null;
  athleteName: string;
  groupId: number;
  competitions: Array<{ id: string; name: string; date: string }>;
  onComplete: () => void;
}

type WizardStep = 1 | 2 | 3;

const STEPS = [
  { num: 1 as const, label: "Cycle", icon: CalendarRange },
  { num: 2 as const, label: "Objectifs", icon: Target },
  { num: 3 as const, label: "Créneaux", icon: CalendarClock },
];

type QuickObjective = {
  eventCode: string;
  poolLength: string;
  targetTime: string;
  text: string;
  type: "chrono" | "texte";
};

const emptyObjective = (): QuickObjective => ({
  eventCode: "",
  poolLength: "25",
  targetTime: "",
  text: "",
  type: "chrono",
});

export default function PlanningWizard({
  athleteId,
  athleteAuthId,
  athleteName,
  groupId,
  competitions,
  onComplete,
}: Props) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const stepInitial = reduce ? false : { opacity: 0, x: 20 };
  const stepAnimate = reduce ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 };
  const stepExit = reduce ? { opacity: 0 } : { opacity: 0, x: -20 };
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [cycleName, setCycleName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endCompetitionId, setEndCompetitionId] = useState("");

  // Step 2 state
  const [objectives, setObjectives] = useState<QuickObjective[]>([emptyObjective()]);

  // Step 3 state
  const [inheritSlots, setInheritSlots] = useState<boolean | null>(null);

  // ── Step 1: Create cycle ──
  const cycleMutation = useMutation({
    mutationFn: async () => {
      if (!cycleName.trim()) throw new Error("Nom du cycle requis");
      if (!startDate) throw new Error("Date de début requise");
      if (!endCompetitionId) throw new Error("Compétition de fin requise");

      await createTrainingCycle({
        athlete_id: athleteId,
        group_id: null,
        start_competition_id: null,
        end_competition_id: endCompetitionId,
        start_date: startDate,
        name: cycleName.trim(),
      });
    },
    onSuccess: () => {
      toast("Cycle créé");
      void queryClient.invalidateQueries({ queryKey: ["training-cycles"] });
      setStep(2);
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  // ── Step 2: Create objectives ──
  const objectivesMutation = useMutation({
    mutationFn: async () => {
      if (!athleteAuthId) throw new Error("ID auth nageur manquant");
      const valid = objectives.filter(
        (o) => (o.type === "chrono" && o.eventCode) || (o.type === "texte" && o.text.trim()),
      );
      for (const obj of valid) {
        await createObjective({
          athlete_id: athleteAuthId,
          event_code: obj.type === "chrono" ? obj.eventCode : null,
          pool_length: obj.type === "chrono" ? Number(obj.poolLength) : null,
          target_time_seconds:
            obj.type === "chrono" && obj.targetTime ? parseTime(obj.targetTime) : null,
          text: obj.type === "texte" ? obj.text.trim() : null,
        });
      }
    },
    onSuccess: () => {
      if (objectives.some((o) => (o.type === "chrono" && o.eventCode) || (o.type === "texte" && o.text.trim()))) {
        toast("Objectifs créés");
      }
      void queryClient.invalidateQueries({ queryKey: ["objectives", athleteAuthId] });
      setStep(3);
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  // ── Step 3: Init slots ──
  const slotsMutation = useMutation({
    mutationFn: async () => {
      if (inheritSlots && userId) {
        await initSwimmerSlots(athleteId, groupId, userId);
      }
    },
    onSuccess: () => {
      if (inheritSlots) {
        toast("Planning personnalisé créé");
        void queryClient.invalidateQueries({ queryKey: ["swimmer-slots", athleteId] });
      }
      onComplete();
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const updateObjective = (index: number, patch: Partial<QuickObjective>) => {
    setObjectives((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const addObjective = () => {
    if (objectives.length < 3) setObjectives((prev) => [...prev, emptyObjective()]);
  };

  const removeObjective = (index: number) => {
    setObjectives((prev) => prev.filter((_, i) => i !== index));
  };

  const isPending = cycleMutation.isPending || objectivesMutation.isPending || slotsMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Stepper header */}
      <div className="flex items-center justify-center gap-3">
        {STEPS.map((s, idx) => {
          const completed = step > s.num;
          const current = step === s.num;
          return (
            <div key={s.num} className="flex items-center gap-2">
              {idx > 0 && (
                <div
                  className={`h-px w-6 ${
                    step > s.num ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    completed
                      ? "bg-primary text-primary-foreground"
                      : current
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {completed ? <Check className="h-4 w-4" /> : s.num}
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    current ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={stepInitial}
            animate={stepAnimate}
            exit={stepExit}
            className="rounded-2xl border bg-card p-4 space-y-4"
          >
            <div>
              <p className="text-sm font-semibold">Créer le premier cycle</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Définissez la période d'entraînement pour {athleteName}.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Nom du cycle *</Label>
              <Input
                placeholder="Ex : Préparation hiver"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Date de début *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Compétition de fin *</Label>
              <Select value={endCompetitionId} onValueChange={setEndCompetitionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une compétition" />
                </SelectTrigger>
                <SelectContent>
                  {competitions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {competitions.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Aucune compétition. Créez-en une dans l'onglet Compétitions.
                </p>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <div />
              <Button
                onClick={() => cycleMutation.mutate()}
                disabled={isPending || !cycleName.trim() || !startDate || !endCompetitionId}
              >
                {cycleMutation.isPending ? "Création..." : "Suivant"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={stepInitial}
            animate={stepAnimate}
            exit={stepExit}
            className="rounded-2xl border bg-card p-4 space-y-4"
          >
            <div>
              <p className="text-sm font-semibold">Objectifs rapides</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ajoutez jusqu'à 3 objectifs. Vous pourrez les modifier plus tard.
              </p>
            </div>

            {objectives.map((obj, idx) => (
              <div key={idx} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Objectif {idx + 1}
                  </span>
                  {objectives.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeObjective(idx)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Retirer
                    </button>
                  )}
                </div>

                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={obj.type}
                  onValueChange={(val) => {
                    if (val) updateObjective(idx, { type: val as "chrono" | "texte" });
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="chrono" className="text-xs h-7 px-2">
                    Chrono
                  </ToggleGroupItem>
                  <ToggleGroupItem value="texte" className="text-xs h-7 px-2">
                    Texte
                  </ToggleGroupItem>
                </ToggleGroup>

                {obj.type === "chrono" ? (
                  <div className="space-y-2">
                    <Select
                      value={obj.eventCode}
                      onValueChange={(val) => updateObjective(idx, { eventCode: val })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Épreuve" />
                      </SelectTrigger>
                      <SelectContent>
                        {FFN_EVENTS.map((code) => (
                          <SelectItem key={code} value={code}>
                            {eventLabel(code)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        value={obj.poolLength}
                        onValueChange={(val) => {
                          if (val) updateObjective(idx, { poolLength: val });
                        }}
                        className="justify-start"
                      >
                        <ToggleGroupItem value="25" className="text-xs h-7 px-2">
                          25m
                        </ToggleGroupItem>
                        <ToggleGroupItem value="50" className="text-xs h-7 px-2">
                          50m
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <Input
                        className="h-7 text-xs flex-1"
                        placeholder="Temps cible (m:ss:cc)"
                        value={obj.targetTime}
                        onChange={(e) => updateObjective(idx, { targetTime: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <Textarea
                    className="text-xs min-h-[40px]"
                    placeholder="Ex : Améliorer la coulée de dos"
                    rows={2}
                    maxLength={1000}
                    value={obj.text}
                    onChange={(e) => updateObjective(idx, { text: e.target.value })}
                  />
                )}
              </div>
            ))}

            {objectives.length < 3 && (
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={addObjective}>
                + Ajouter un objectif
              </Button>
            )}

            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  objectivesMutation.mutate();
                }}
                disabled={isPending}
              >
                Passer
              </Button>
              <Button
                onClick={() => objectivesMutation.mutate()}
                disabled={isPending}
              >
                {objectivesMutation.isPending ? "Enregistrement..." : "Suivant"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={stepInitial}
            animate={stepAnimate}
            exit={stepExit}
            className="rounded-2xl border bg-card p-4 space-y-4"
          >
            <div>
              <p className="text-sm font-semibold">Créneaux d'entraînement</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hériter du planning du groupe pour {athleteName} ?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setInheritSlots(true)}
                className={`rounded-xl border p-4 text-center transition ${
                  inheritSlots === true
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:bg-muted"
                }`}
              >
                <CalendarClock className="h-6 w-6 mx-auto mb-1 text-primary" />
                <p className="text-sm font-medium">Oui</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Copier les créneaux du groupe
                </p>
              </button>
              <button
                type="button"
                onClick={() => setInheritSlots(false)}
                className={`rounded-xl border p-4 text-center transition ${
                  inheritSlots === false
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:bg-muted"
                }`}
              >
                <CalendarClock className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">Non</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Configurer plus tard
                </p>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => slotsMutation.mutate()}
                disabled={isPending || inheritSlots === null}
              >
                {slotsMutation.isPending ? "Finalisation..." : "Terminer"}
                <Check className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
