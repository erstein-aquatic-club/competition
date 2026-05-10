/**
 * FilieresEditor — Coach-side editor for swim training filières.
 * Replaces the inline `FiliereEditorOverlay` in SwimPlanningDemo.tsx.
 *
 * Pattern: full-screen slide-up overlay containing a two-screen flow
 *   (A) List of 8 filières → (B) Detail editor — with explicit save,
 *   per-filière reset, dirty guard and live swimmer-preview.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSwimFilieres, updateSwimFiliere, resetSwimFiliere } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FILIERES, FILIERE_MAP, FILIERE_STYLES } from "@/lib/swimFilieres";
import type { SwimFiliere, SwimFiliereInput } from "@/lib/api/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────────────────────

type Draft = {
  description: string;
  examples: string;
  heart_rate: string;
  lactate: string;
  effort: string;
  duration: string;
  distance: string;
  reps: string;
  intensity: string;
  recovery: string;
  work_type: string;
  level_intensity: number | null;
  level_duration: number | null;
  level_recovery: number | null;
  level_lactate: number | null;
};

const EMPTY_DRAFT: Draft = {
  description: "",
  examples: "",
  heart_rate: "",
  lactate: "",
  effort: "",
  duration: "",
  distance: "",
  reps: "",
  intensity: "",
  recovery: "",
  work_type: "",
  level_intensity: null,
  level_duration: null,
  level_recovery: null,
  level_lactate: null,
};

function fromFiliere(f: SwimFiliere): Draft {
  return {
    description: f.description ?? "",
    examples: f.examples ?? "",
    heart_rate: f.heart_rate ?? "",
    lactate: f.lactate ?? "",
    effort: f.effort ?? "",
    duration: f.duration ?? "",
    distance: f.distance ?? "",
    reps: f.reps ?? "",
    intensity: f.intensity ?? "",
    recovery: f.recovery ?? "",
    work_type: f.work_type ?? "",
    level_intensity: f.level_intensity ?? null,
    level_duration: f.level_duration ?? null,
    level_recovery: f.level_recovery ?? null,
    level_lactate: f.level_lactate ?? null,
  };
}

/** True if `draft` differs from `source` on any editable field. */
function isDraftDirty(draft: Draft, source: Draft): boolean {
  const keys = Object.keys(draft) as (keyof Draft)[];
  return keys.some((k) => draft[k] !== source[k]);
}

/** Build an update payload containing only changed fields (empty text → null). */
function buildDiff(draft: Draft, source: Draft, id: string): SwimFiliereInput {
  const out: Record<string, string | number | null> = { id };
  const textKeys = [
    "description",
    "examples",
    "heart_rate",
    "lactate",
    "effort",
    "duration",
    "distance",
    "reps",
    "intensity",
    "recovery",
    "work_type",
  ] as const;
  for (const k of textKeys) {
    if (draft[k] !== source[k]) {
      const v = draft[k].trim();
      out[k] = v === "" ? null : v;
    }
  }
  const levelKeys = [
    "level_intensity",
    "level_duration",
    "level_recovery",
    "level_lactate",
  ] as const;
  for (const k of levelKeys) {
    if (draft[k] !== source[k]) {
      out[k] = draft[k];
    }
  }
  return out as unknown as SwimFiliereInput;
}

/** "Personnalisé" = any editable field differs from the hardcoded constant. */
function isPersonalized(f: SwimFiliere): boolean {
  const c = FILIERE_MAP.get(f.id);
  if (!c) return false;
  const t = c.technicals;
  const l = c.levels;
  return (
    (f.description ?? "") !== "" ||
    (f.examples ?? "") !== "" ||
    (f.heart_rate ?? t.heartRate) !== t.heartRate ||
    (f.lactate ?? t.lactate) !== t.lactate ||
    (f.effort ?? t.effort) !== t.effort ||
    (f.duration ?? t.duration) !== t.duration ||
    (f.distance ?? t.distance) !== t.distance ||
    (f.reps ?? t.reps) !== t.reps ||
    (f.intensity ?? t.intensity) !== t.intensity ||
    (f.recovery ?? t.recovery) !== t.recovery ||
    (f.work_type ?? t.workType) !== t.workType ||
    (f.level_intensity ?? l.intensity) !== l.intensity ||
    (f.level_duration ?? l.duration) !== l.duration ||
    (f.level_recovery ?? l.recovery) !== l.recovery ||
    (f.level_lactate ?? l.lactate) !== l.lactate
  );
}

const TECH_FIELDS: {
  key: keyof Pick<
    Draft,
    | "heart_rate"
    | "lactate"
    | "effort"
    | "duration"
    | "distance"
    | "reps"
    | "intensity"
    | "recovery"
  >;
  label: string;
  hint: string;
  constKey: keyof import("@/lib/swimFilieres").FiliereTechnicals;
}[] = [
  { key: "heart_rate", label: "Fréquence cardiaque",  hint: "bpm",     constKey: "heartRate" },
  { key: "lactate",    label: "Lactate",              hint: "mmol/L",  constKey: "lactate" },
  { key: "effort",     label: "Effort (RPE)",         hint: "1-20",    constKey: "effort" },
  { key: "duration",   label: "Durée",                hint: "min",     constKey: "duration" },
  { key: "distance",   label: "Distance",             hint: "m",       constKey: "distance" },
  { key: "reps",       label: "Répétitions",          hint: "nbr",     constKey: "reps" },
  { key: "intensity",  label: "Intensité",            hint: "% VMA",   constKey: "intensity" },
  { key: "recovery",   label: "Récupération",         hint: "s/min",   constKey: "recovery" },
];

const GAUGE_FIELDS: {
  key: "level_intensity" | "level_duration" | "level_recovery" | "level_lactate";
  label: string;
  constKey: keyof import("@/lib/swimFilieres").FiliereLevels;
}[] = [
  { key: "level_intensity", label: "Intensité",     constKey: "intensity" },
  { key: "level_duration",  label: "Durée",         constKey: "duration" },
  { key: "level_recovery",  label: "Récupération",  constKey: "recovery" },
  { key: "level_lactate",   label: "Lactate",       constKey: "lactate" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Root overlay
// ─────────────────────────────────────────────────────────────────────────────

interface FilieresEditorProps {
  open: boolean;
  onClose: () => void;
}

export default function FilieresEditor({ open, onClose }: FilieresEditorProps) {
  const reducedMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const { data: filieres = [], isLoading } = useQuery({
    queryKey: ["swim-filieres"],
    queryFn: () => getSwimFilieres(),
    enabled: open,
    staleTime: 60_000,
  });

  const selectedFiliere = useMemo(
    () => filieres.find((f) => f.id === selectedId) ?? null,
    [filieres, selectedId],
  );

  // Sync draft from query when we enter detail or when data refetches after save/reset
  useEffect(() => {
    if (selectedFiliere) setDraft(fromFiliere(selectedFiliere));
  }, [selectedFiliere]);

  const sourceDraft = useMemo(
    () => (selectedFiliere ? fromFiliere(selectedFiliere) : EMPTY_DRAFT),
    [selectedFiliere],
  );
  const dirty = useMemo(
    () => (selectedFiliere ? isDraftDirty(draft, sourceDraft) : false),
    [draft, sourceDraft, selectedFiliere],
  );

  const handleClose = useCallback(() => {
    if (dirty) {
      setConfirmBack(true);
      return;
    }
    setSelectedId(null);
    onClose();
  }, [dirty, onClose]);

  const handleBack = useCallback(() => {
    if (dirty) {
      setConfirmBack(true);
      return;
    }
    setSelectedId(null);
  }, [dirty]);

  const discardAndBack = useCallback(() => {
    setConfirmBack(false);
    setSelectedId(null);
  }, []);

  const mode: "list" | "detail" = selectedId ? "detail" : "list";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="filieres-editor"
          className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden"
          initial={reducedMotion ? { opacity: 0 } : { y: "100%" }}
          animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 320 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {mode === "list" ? (
              <ListScreen
                key="list"
                filieres={filieres}
                loading={isLoading}
                onOpen={(id) => setSelectedId(id)}
                onClose={handleClose}
                reducedMotion={!!reducedMotion}
              />
            ) : selectedFiliere ? (
              <DetailScreen
                key="detail"
                filiere={selectedFiliere}
                draft={draft}
                setDraft={setDraft}
                dirty={dirty}
                onBack={handleBack}
                onRequestReset={() => setConfirmReset(true)}
                reducedMotion={!!reducedMotion}
              />
            ) : null}
          </AnimatePresence>

          {/* Dirty-guard dialog */}
          <AlertDialog open={confirmBack} onOpenChange={setConfirmBack}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tu as des changements non enregistrés. Si tu reviens en arrière
                  maintenant, ils seront perdus.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Continuer l'édition</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={discardAndBack}
                >
                  Abandonner
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Reset dialog */}
          {selectedFiliere && (
            <ResetDialog
              open={confirmReset}
              filiere={selectedFiliere}
              onOpenChange={setConfirmReset}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen A — List
// ─────────────────────────────────────────────────────────────────────────────

function ListScreen({
  filieres,
  loading,
  onOpen,
  onClose,
  reducedMotion,
}: {
  filieres: SwimFiliere[];
  loading: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      key="list-screen"
      className="absolute inset-0 flex flex-col bg-background"
      initial={reducedMotion ? { opacity: 0 } : { x: -24, opacity: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { x: -24, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <header className="shrink-0 sticky top-0 z-10 bg-background/85 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-1 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex items-center justify-center h-11 w-11 -ml-1 rounded-xl text-foreground/80 hover:text-foreground active:bg-muted/60 transition-colors motion-reduce:transition-none"
          >
            <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.2} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-eyebrow text-muted-foreground/70">
              Coach · Planification
            </p>
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground -mt-0.5">
              Filières de travail
            </h1>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-lg px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+3rem)]">
          <p className="text-[13px] leading-relaxed text-muted-foreground max-w-md">
            Configure ce que voient tes nageurs sur chaque filière —
            description, exemples, repères techniques et jauges.
          </p>

          <div className="mt-7 mb-2.5 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted-foreground/70">
              8 filières
            </span>
            <span className="text-[10px] uppercase tracking-eyebrow text-muted-foreground/40">
              Standard EAC
            </span>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
            {loading && filieres.length === 0 ? (
              <ListSkeleton />
            ) : (
              <ul role="list" className="divide-y divide-border/60">
                {(filieres.length > 0 ? filieres : FILIERES_AS_FALLBACK).map(
                  (f, idx) => (
                    <FiliereRow
                      key={f.id}
                      filiere={f}
                      index={idx}
                      onClick={() => onOpen(f.id)}
                      reducedMotion={reducedMotion}
                    />
                  ),
                )}
              </ul>
            )}
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground/60 max-w-md">
            Les modifications sont visibles par tous les nageurs dès
            l'enregistrement. Un reset restaure les valeurs physiologiques par
            défaut.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// Fallback if DB is empty (offline / first-load race). Shapes it to look like SwimFiliere.
const FILIERES_AS_FALLBACK: SwimFiliere[] = FILIERES.map((f, i) => ({
  id: f.id,
  name: f.name,
  short_name: f.short,
  color: f.color,
  sort_order: i + 1,
  description: null,
  examples: null,
  heart_rate: f.technicals.heartRate,
  lactate: f.technicals.lactate,
  effort: f.technicals.effort,
  duration: f.technicals.duration,
  distance: f.technicals.distance,
  reps: f.technicals.reps,
  intensity: f.technicals.intensity,
  recovery: f.technicals.recovery,
  work_type: f.technicals.workType,
  level_intensity: f.levels.intensity,
  level_duration: f.levels.duration,
  level_recovery: f.levels.recovery,
  level_lactate: f.levels.lactate,
}));

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="h-3 w-3 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
          <span className="h-3.5 w-40 rounded bg-muted animate-pulse motion-reduce:animate-none" />
          <span className="ml-auto h-3 w-3 rounded bg-muted animate-pulse motion-reduce:animate-none" />
        </li>
      ))}
    </ul>
  );
}

function FiliereRow({
  filiere,
  index,
  onClick,
  reducedMotion,
}: {
  filiere: SwimFiliere;
  index: number;
  onClick: () => void;
  reducedMotion: boolean;
}) {
  const style = FILIERE_STYLES[filiere.color] ?? FILIERE_STYLES.sky;
  const perso = isPersonalized(filiere);

  return (
    <motion.li
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : 0.02 * index, duration: 0.22 }}
    >
      <button
        type="button"
        onClick={onClick}
        className="group w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] text-left hover:bg-muted/40 active:bg-muted/60 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span
          className={cn(
            "h-3 w-3 rounded-full shrink-0 ring-[3px] ring-inset ring-background/0",
            style.dot,
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-foreground tracking-tight">
              {filiere.name}
            </span>
            {perso && (
              <Badge
                variant="secondary"
                className="h-[18px] px-1.5 rounded-md text-[9.5px] font-semibold uppercase tracking-eyebrow-sm bg-foreground/[0.07] text-foreground/70 border-0"
              >
                Personnalisé
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground/80 truncate">
            {filiere.description && filiere.description.trim() !== ""
              ? filiere.description
              : (FILIERE_MAP.get(filiere.id)?.technicals.workType ?? "")}
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors"
          aria-hidden
        />
      </button>
    </motion.li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen B — Detail
// ─────────────────────────────────────────────────────────────────────────────

function DetailScreen({
  filiere,
  draft,
  setDraft,
  dirty,
  onBack,
  onRequestReset,
  reducedMotion,
}: {
  filiere: SwimFiliere;
  draft: Draft;
  setDraft: (d: Draft | ((prev: Draft) => Draft)) => void;
  dirty: boolean;
  onBack: () => void;
  onRequestReset: () => void;
  reducedMotion: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const style = FILIERE_STYLES[filiere.color] ?? FILIERE_STYLES.sky;
  const constFiliere = FILIERE_MAP.get(filiere.id);

  const saveMutation = useMutation({
    mutationFn: (input: SwimFiliereInput) => updateSwimFiliere(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["swim-filieres"] });
      toast({ title: "Filière mise à jour" });
      onBack();
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const source = fromFiliere(filiere);
    const diff = buildDiff(draft, source, filiere.id);
    const keys = Object.keys(diff).filter((k) => k !== "id");
    if (keys.length === 0) return;
    saveMutation.mutate(diff);
  };

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <motion.div
      key="detail-screen"
      className="absolute inset-0 flex flex-col bg-background"
      initial={reducedMotion ? { opacity: 0 } : { x: 32, opacity: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { x: 32, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header with color identity bar */}
      <header className="shrink-0 sticky top-0 z-10 bg-background/85 backdrop-blur-xl border-b border-border/60">
        <div className={cn("h-[3px] w-full", style.fill)} aria-hidden />
        <div className="flex items-center gap-1 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="flex items-center justify-center h-11 w-11 -ml-1 rounded-xl text-foreground/80 hover:text-foreground active:bg-muted/60 transition-colors motion-reduce:transition-none"
          >
            <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.2} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span
              className={cn("h-2.5 w-2.5 rounded-full shrink-0", style.dot)}
              aria-hidden
            />
            <h1 className="text-[16px] font-semibold tracking-tight text-foreground truncate">
              {filiere.name}
            </h1>
          </div>
          {dirty && (
            <span
              className="shrink-0 h-1.5 w-1.5 rounded-full bg-primary mr-1 motion-safe:animate-pulse"
              aria-label="Modifications non enregistrées"
              role="status"
            />
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-lg px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+6rem)] space-y-8">
          {/* Live preview */}
          <LivePreview filiere={filiere} draft={draft} />

          {/* Description */}
          <Section label="Description" hint="Visible au tap sur la chip filière.">
            <Textarea
              value={draft.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Explique ce que cette filière travaille — en une ou deux phrases."
              rows={3}
              className="resize-none text-[14px] leading-relaxed"
            />
            <CharCounter value={draft.description} max={500} />
          </Section>

          {/* Examples */}
          <Section label="Exemples d'exercices" hint="Liste libre — utilise des puces si tu veux.">
            <Textarea
              value={draft.examples}
              onChange={(e) => setField("examples", e.target.value)}
              placeholder={"• 8×100m crawl (R:15s)\n• 400m technique palmes\n• 4×50m progressif"}
              rows={5}
              className="resize-none text-[14px] leading-relaxed font-mono"
            />
          </Section>

          {/* Work type */}
          <Section label="Type de travail" hint="Formats dominants dans cette filière.">
            <Input
              value={draft.work_type}
              onChange={(e) => setField("work_type", e.target.value)}
              placeholder={constFiliere?.technicals.workType ?? ""}
              className="text-[14px]"
            />
          </Section>

          {/* Technicals */}
          <Section
            label="Spécifications techniques"
            hint="Repères physiologiques — texte libre, ex. « 120-150 »."
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              {TECH_FIELDS.map((field) => {
                const fallback = constFiliere?.technicals[field.constKey] ?? "";
                return (
                  <div key={field.key} className="space-y-1.5">
                    <label
                      htmlFor={`fe-${field.key}`}
                      className="block text-[10.5px] font-semibold uppercase tracking-eyebrow-sm text-muted-foreground/80"
                    >
                      {field.label}
                      <span className="ml-1 text-muted-foreground/40 font-normal normal-case tracking-normal">
                        {field.hint}
                      </span>
                    </label>
                    <Input
                      id={`fe-${field.key}`}
                      value={draft[field.key]}
                      onChange={(e) =>
                        setField(field.key, e.target.value as Draft[typeof field.key])
                      }
                      placeholder={fallback}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="h-10 text-[13.5px] tabular-nums"
                    />
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Gauges */}
          <Section
            label="Jauges nageur"
            hint="Barres comparatives 1-5 affichées sous la description."
          >
            <div className="rounded-xl border border-border/70 bg-card divide-y divide-border/60">
              {GAUGE_FIELDS.map((g) => (
                <GaugeRow
                  key={g.key}
                  label={g.label}
                  value={draft[g.key]}
                  colorClass={style.fill}
                  onChange={(v) => setField(g.key, v)}
                />
              ))}
            </div>
          </Section>

          {/* Danger zone */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onRequestReset}
              className="inline-flex items-center gap-2 text-[13px] font-medium text-destructive/90 hover:text-destructive active:text-destructive transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive rounded-md px-2 py-1.5 -ml-2"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
              Restaurer les valeurs par défaut
            </button>
            <p className="mt-1 ml-0 text-[11px] text-muted-foreground/60 leading-relaxed">
              Efface toutes tes personnalisations pour cette filière et
              restaure les valeurs physiologiques de référence.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto max-w-lg px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <Button
            type="button"
            size="lg"
            className="w-full h-12 text-[14px] font-semibold tracking-tight"
            disabled={!dirty || saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                Enregistrement…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Enregistrer
              </>
            )}
          </Button>
        </div>
      </footer>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-eyebrow text-foreground/70">
          {label}
        </h2>
        {hint && (
          <span className="text-[10.5px] text-muted-foreground/60 normal-case tracking-normal max-w-[60%] text-right truncate">
            {hint}
          </span>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

function CharCounter({ value, max }: { value: string; max: number }) {
  const count = value.length;
  const over = count > max;
  return (
    <div
      className={cn(
        "mt-1 text-right text-[10.5px] tabular-nums",
        over ? "text-destructive" : "text-muted-foreground/50",
      )}
    >
      {count}/{max}
    </div>
  );
}

function GaugeRow({
  label,
  value,
  colorClass,
  onChange,
}: {
  label: string;
  value: number | null;
  colorClass: string;
  onChange: (v: number | null) => void;
}) {
  const variable = value === null;
  return (
    <div className="flex items-center gap-4 px-3.5 py-3">
      <span className="w-[90px] shrink-0 text-[12.5px] font-medium tracking-tight text-foreground">
        {label}
      </span>

      <div
        className={cn(
          "flex-1 flex items-center gap-1.5",
          variable && "opacity-35",
        )}
        aria-hidden={variable}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = !variable && value !== null && n <= value;
          return (
            <button
              key={n}
              type="button"
              disabled={variable}
              onClick={() => onChange(value === n ? null : n)}
              aria-label={`Niveau ${n} sur 5`}
              aria-pressed={active}
              className={cn(
                "relative flex-1 h-7 rounded-md border transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                active
                  ? cn(colorClass, "border-transparent shadow-sm")
                  : "bg-muted/40 border-border/60 hover:bg-muted/70",
              )}
            >
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums",
                  active ? "text-white/95" : "text-muted-foreground/60",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
        <span className="text-[10.5px] uppercase tracking-eyebrow-sm text-muted-foreground/70 font-medium">
          Variable
        </span>
        <Switch
          checked={variable}
          onCheckedChange={(checked) => onChange(checked ? null : 3)}
          aria-label={`${label} — variable`}
        />
      </label>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live preview — mimics the swimmer-side sheet
// ─────────────────────────────────────────────────────────────────────────────

function LivePreview({
  filiere,
  draft,
}: {
  filiere: SwimFiliere;
  draft: Draft;
}) {
  const style = FILIERE_STYLES[filiere.color] ?? FILIERE_STYLES.sky;

  const desc = draft.description.trim() || null;
  const examples = draft.examples.trim() || null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-eyebrow text-foreground/70 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-foreground/50" strokeWidth={2.2} />
          Aperçu nageur
        </h2>
        <span className="text-[10.5px] uppercase tracking-eyebrow text-muted-foreground/50">
          Live
        </span>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
        <div className={cn("h-1 w-full", style.fill)} aria-hidden />
        <div className="p-4 space-y-4">
          {/* Chip */}
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 w-fit",
              style.bg,
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden />
            <span className={cn("text-[12px] font-semibold tracking-tight", style.text)}>
              {filiere.name}
            </span>
          </div>

          {/* Gauges preview */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {GAUGE_FIELDS.map((g) => (
              <PreviewGauge
                key={g.key}
                label={g.label}
                value={draft[g.key]}
                fillClass={style.fill}
              />
            ))}
          </div>

          {/* Description preview */}
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-eyebrow text-muted-foreground/60 mb-1">
              Description
            </p>
            <p className="text-[12.5px] text-foreground/85 leading-relaxed line-clamp-3">
              {desc ?? (
                <span className="italic text-muted-foreground/40">
                  Pas encore de description
                </span>
              )}
            </p>
          </div>

          {/* Examples preview */}
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-eyebrow text-muted-foreground/60 mb-1">
              Exemples
            </p>
            <p className="text-[12.5px] text-foreground/85 leading-relaxed whitespace-pre-line line-clamp-3">
              {examples ?? (
                <span className="italic text-muted-foreground/40">
                  Pas encore d'exemples
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewGauge({
  label,
  value,
  fillClass,
}: {
  label: string;
  value: number | null;
  fillClass: string;
}) {
  const variable = value === null;
  const pct = variable ? 0 : ((value ?? 0) / 5) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground/70 tracking-tight">
          {label}
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-foreground/60">
          {variable ? "—" : `${value}/5`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/70 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
            fillClass,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset dialog
// ─────────────────────────────────────────────────────────────────────────────

function ResetDialog({
  open,
  filiere,
  onOpenChange,
}: {
  open: boolean;
  filiere: SwimFiliere;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resetMutation = useMutation({
    mutationFn: () => resetSwimFiliere(filiere.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["swim-filieres"] });
      toast({ title: "Valeurs par défaut restaurées" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle
              className="h-4 w-4 text-destructive"
              strokeWidth={2.2}
            />
            <AlertDialogTitle className="text-[15px]">
              Restaurer « {filiere.name} »
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-[13px] leading-relaxed">
            Toutes tes personnalisations seront effacées et remplacées par les
            valeurs physiologiques de référence. Cette action ne peut pas être
            annulée.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetMutation.isPending}>
            Annuler
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={resetMutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              resetMutation.mutate();
            }}
          >
            {resetMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                Restauration…
              </>
            ) : (
              "Restaurer"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
