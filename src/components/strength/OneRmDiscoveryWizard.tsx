// Wizard de calibration 1RM — Task 5 : squelette + étape A (mouvement à vide + branche douleur).
//
// Ce composant guide la PREMIÈRE série d'un exercice pendant une séance de muscu pour
// estimer la 1RM, en remplacement de l'ancienne montée en charge grossière. Les étapes
// prévues : (A) mouvement à vide / léger + retex, (B) paliers d'échauffement suggérés,
// (C) série de travail avec RIR explicite → calcul 1RM, puis validation post-série 2.
//
// Cette tâche n'implémente QUE l'étape A + la branche d'abandon douleur. Les étapes B/C et
// l'intégration arrivent plus tard. La machine à états (`WizardStep`) est laissée extensible.
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReloadAppetite } from "@/lib/strength/oneRmCalibration";

type WizardStep = "empty" | "warmup" | "working";

type Ease = "ok" | "hesitant" | "hard";

export interface OneRmDiscoveryWizardProps {
  exerciseName: string;
  /** 1RM déjà connue (saisie coach) — sert d'ancrage aux paliers (étapes ultérieures). */
  known1rm: number | null;
  /** Saute les paliers d'échauffement (étapes ultérieures). */
  shortMode?: boolean;
  /** Appelé quand la 1RM est calculée à la fin de la série de travail (étapes ultérieures). */
  onComputed: (
    oneRm: number,
    workingSet: { weight: number; reps: number; rir: number; pain: boolean },
  ) => void;
  /** Branche sécurité : le nageur signale une douleur et choisit comment poursuivre. */
  onPainAbort: (action: "lighten" | "substitute" | "skip") => void;
}

const EASE_OPTIONS: Array<{ value: Ease; label: string }> = [
  { value: "ok", label: "OK" },
  { value: "hesitant", label: "Hésitant" },
  { value: "hard", label: "Difficile" },
];

const APPETITE_OPTIONS: Array<{ value: ReloadAppetite; label: string }> = [
  { value: "little", label: "un peu" },
  { value: "medium", label: "moyen" },
  { value: "lot", label: "beaucoup" },
];

/** Bouton rond sélectionnable, tap-friendly (mains mouillées au bord du bassin). */
function PillButton({
  selected,
  onClick,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-semibold transition-all",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/25 bg-muted/30 text-muted-foreground/70",
      )}
    >
      {children}
    </button>
  );
}

export function OneRmDiscoveryWizard({
  exerciseName,
  known1rm,
  shortMode,
  onComputed,
  onPainAbort,
}: OneRmDiscoveryWizardProps) {
  // Machine à états extensible : seul "empty" est rendu pour l'instant.
  const [step, setStep] = useState<WizardStep>("empty");
  const [pain, setPain] = useState<boolean | null>(null);
  const [ease, setEase] = useState<Ease | null>(null);
  const [appetite, setAppetite] = useState<ReloadAppetite | null>(null);

  // Réfère known1rm/shortMode/onComputed (utilisés aux étapes B/C) sans les laisser inutilisés.
  void known1rm;
  void shortMode;
  void onComputed;
  void step;

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-tight">{exerciseName}</h3>
        <p className="text-sm text-muted-foreground">
          Mouvement à vide ou très léger : exécute le geste complet pour réveiller la
          coordination, puis donne ton retex avant de charger.
        </p>
      </div>

      {/* Carte retex : douleur / aisance / appétit de recharge */}
      <div className="space-y-4">
        {/* 1) Douleur oui/non */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Douleur ?</span>
          <div className="flex gap-2">
            <PillButton
              ariaLabel="Douleur : oui"
              selected={pain === true}
              onClick={() => setPain(true)}
            >
              oui
            </PillButton>
            <PillButton
              ariaLabel="Douleur : non"
              selected={pain === false}
              onClick={() => setPain(false)}
            >
              non
            </PillButton>
          </div>
        </div>

        {/* Branche sécurité affichée quand douleur = oui */}
        {pain === true && (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              On arrête la montée en charge : pas de série lourde sur une gêne. Choisis comment
              poursuivre.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPainAbort("lighten")}
                className="h-11 rounded-full border border-input bg-background px-4 text-sm font-semibold"
              >
                Alléger
              </button>
              <button
                type="button"
                onClick={() => onPainAbort("substitute")}
                className="h-11 rounded-full border border-input bg-background px-4 text-sm font-semibold"
              >
                Substituer
              </button>
              <button
                type="button"
                onClick={() => onPainAbort("skip")}
                className="h-11 rounded-full border border-input bg-background px-4 text-sm font-semibold"
              >
                Passer l'exercice
              </button>
            </div>
          </div>
        )}

        {/* 2) Aisance technique */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Aisance technique</span>
          <div className="flex gap-2">
            {EASE_OPTIONS.map((opt) => (
              <PillButton
                key={opt.value}
                ariaLabel={`Aisance : ${opt.label}`}
                selected={ease === opt.value}
                onClick={() => setEase(opt.value)}
              >
                {opt.label}
              </PillButton>
            ))}
          </div>
        </div>

        {/* 3) Appétit de recharge */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Je peux recharger :</span>
          <div className="flex gap-2">
            {APPETITE_OPTIONS.map((opt) => (
              <PillButton
                key={opt.value}
                ariaLabel={`Recharger : ${opt.label}`}
                selected={appetite === opt.value}
                onClick={() => setAppetite(opt.value)}
              >
                {opt.label}
              </PillButton>
            ))}
          </div>
        </div>
      </div>

      {/* Avancer vers les paliers (étape B — implémentée plus tard). */}
      <button
        type="button"
        disabled={pain == null || pain === true}
        onClick={() => setStep("warmup")}
        className={cn(
          "h-11 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity",
          (pain == null || pain === true) && "opacity-40",
        )}
      >
        Palier suivant
      </button>
    </Card>
  );
}
