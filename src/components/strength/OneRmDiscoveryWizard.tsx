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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { suggestNextLoad } from "@/lib/strength/oneRmCalibration";
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
  // Machine à états extensible. shortMode saute à vide + chauffe → série de travail (Task 7).
  const [step, setStep] = useState<WizardStep>(shortMode ? "working" : "empty");
  const [pain, setPain] = useState<boolean | null>(null);
  // retex capturé ici, consommé en étape C (Task 7) — ne pas supprimer comme "unused"
  const [ease, setEase] = useState<Ease | null>(null);
  const [appetite, setAppetite] = useState<ReloadAppetite | null>(null);

  // Charge du palier courant (éditable, pré-remplie par suggestNextLoad). null = pas encore entré en chauffe.
  const [charge, setCharge] = useState<string>("");
  // Charge du dernier palier validé → devient previousLoad pour la suggestion suivante.
  const [lastPalierLoad, setLastPalierLoad] = useState<number | null>(null);
  // Historique des paliers validés (chips), uniquement à des fins d'affichage.
  const [warmupHistory, setWarmupHistory] = useState<number[]>([]);

  // Réfère onComputed (utilisé en étape C / Task 7) sans le laisser inutilisé.
  void onComputed;

  // CTA bloqué tant que la douleur n'est pas répondue, ou si douleur=oui (branche sécurité).
  const blockAdvance = pain == null || pain === true;

  // Calcule la suggestion à partir de previousLoad + appétit courant, et entre en chauffe.
  function computeSuggestionInto(previousLoad: number | null) {
    const appetiteForSuggestion: ReloadAppetite = appetite ?? "medium";
    const suggested = suggestNextLoad({
      previousLoad,
      appetite: appetiteForSuggestion,
      known1rm,
    });
    setCharge(suggested != null ? String(suggested) : "");
  }

  function enterWarmup() {
    computeSuggestionInto(null);
    setStep("warmup");
  }

  function nextPalier() {
    const current = Number.parseFloat(charge);
    const recorded = Number.isFinite(current) ? current : lastPalierLoad;
    if (recorded != null) {
      setLastPalierLoad(recorded);
      setWarmupHistory((prev) => [...prev, recorded]);
    }
    computeSuggestionInto(recorded ?? lastPalierLoad);
  }

  // ── Étape série de travail (placeholder — calcul 1RM = Task 7). ──
  if (step === "working") {
    return (
      <Card className="space-y-4 p-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight">{exerciseName}</h3>
          <p className="text-sm text-muted-foreground">
            Série de travail : exécute la série effective, puis renseigne reps et RIR
            (calcul de la 1RM à venir).
          </p>
        </div>
      </Card>
    );
  }

  // ── Étape paliers de chauffe suggérés. ──
  if (step === "warmup") {
    return (
      <Card className="space-y-4 p-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight">{exerciseName}</h3>
          <p className="text-sm text-muted-foreground">
            Paliers de chauffe : la charge proposée est une suggestion — corrige-la si
            besoin, puis donne ton retex avant de monter.
          </p>
        </div>

        {warmupHistory.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {warmupHistory.map((kg, i) => (
              <span
                key={`${kg}-${i}`}
                className="rounded-full border border-muted-foreground/25 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {kg} kg
              </span>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="warmup-charge" className="text-sm font-medium">
            Charge du palier (kg)
          </label>
          <Input
            id="warmup-charge"
            type="number"
            inputMode="decimal"
            step="2.5"
            className="h-11"
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
          />
        </div>

        {/* Retex du palier : douleur + appétit de recharge (pilote la suggestion suivante). */}
        <div className="space-y-4">
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

          {pain === true && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">
                On arrête la montée en charge : pas de série lourde sur une gêne. Choisis
                comment poursuivre.
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

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pain === true}
            onClick={nextPalier}
            className={cn(
              "h-11 w-full rounded-full border border-input bg-background text-sm font-semibold transition-opacity",
              pain === true && "opacity-40",
            )}
          >
            + palier suivant
          </button>
          <button
            type="button"
            disabled={pain === true}
            onClick={() => setStep("working")}
            className={cn(
              "h-11 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity",
              pain === true && "opacity-40",
            )}
          >
            Passer à la série de travail
          </button>
        </div>
      </Card>
    );
  }

  // ── Étape mouvement à vide (Task 5). ──
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

      {/* Avancer vers les paliers de chauffe : calcule la 1ʳᵉ suggestion puis entre en chauffe. */}
      <button
        type="button"
        disabled={blockAdvance}
        onClick={enterWarmup}
        className={cn(
          "h-11 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity",
          blockAdvance && "opacity-40",
        )}
      >
        Palier suivant
      </button>
    </Card>
  );
}
