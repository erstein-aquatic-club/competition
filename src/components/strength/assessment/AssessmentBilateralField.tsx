/**
 * AssessmentBilateralField — un axe de notation 0-3 saisi en BILATÉRAL
 * Gauche / Droite, avec note libre repliable (§346).
 *
 * Reprend la rubrique complète d'`AssessmentScoreField` (repère de mesure,
 * descripteur du niveau, dépliant 4 niveaux + photos) mais expose DEUX
 * sélecteurs 0-3 côte à côte (Gauche | Droite) plus un champ note optionnel.
 *
 * Le déficit unilatéral compte : le descripteur surfacé est celui du côté le
 * plus FAIBLE (= score effectif §A1), pour aligner l'UI sur le moteur méso.
 *
 * Conçu via /frontend-design — langage visuel de l'écran bilan (cards
 * muted/30, accents primary, pastilles 0-3 de ScaleField), raffinement plutôt
 * que réinvention.
 */
import { useState } from "react";
import {
  ChevronDown,
  Ruler,
  TrendingUp,
  TrendingDown,
  Minus,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScaleField } from "@/components/strength/questionnaire/ScaleField";
import {
  type AssessmentScoreItem,
  type AssessmentLevel,
} from "./assessmentScores";
import { AssessmentRomIllustration } from "./AssessmentRomIllustration";

const LEVELS: AssessmentLevel[] = [0, 1, 2, 3];

/** Base publique des photos de référence (Vite en prod, '/' en test/node). */
const REF_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

function refPhotoSrc(key: string, level: AssessmentLevel): string {
  return `${REF_BASE}assessment-refs/${key}-${level}.jpg`;
}

/** Photo de référence d'un niveau — se masque seule si le fichier n'existe pas. */
function RefPhoto({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className="mt-1.5 aspect-video w-full rounded-lg border object-cover"
    />
  );
}

export interface BilateralValue {
  left: number;
  right: number;
  note: string;
}

export function AssessmentBilateralField({
  item,
  value,
  previous,
  onChange,
}: {
  item: AssessmentScoreItem;
  /** Notes courantes G/D (−1 = non encore notée) + note libre. */
  value: BilateralValue;
  /** Score effectif (min G/D) du dernier bilan complété (null si aucun). */
  previous: number | null;
  onChange: (value: BilateralValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(value.note.trim().length > 0);

  const bothPicked = value.left >= 0 && value.right >= 0;
  // Côté le plus faible = score effectif (corrige le déficit unilatéral).
  const effective = bothPicked ? Math.min(value.left, value.right) : -1;
  const delta = bothPicked && previous != null ? effective - previous : null;

  const set = (patch: Partial<BilateralValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-2">
      {/* Libellé + rappel note précédente */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{item.label}</span>
        {previous != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            Précédent&nbsp;: {previous}
            {delta != null && delta !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center",
                  delta > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
              >
                {delta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
            {delta === 0 && <Minus className="h-3 w-3" />}
          </span>
        )}
      </div>

      {/* Repère de mesure */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
        <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-snug text-muted-foreground">{item.gauge}</p>
      </div>

      {/* Deux sélecteurs 0-3 côte à côte : Gauche | Droite */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-muted/20 p-2.5">
          <ScaleField
            label={`${item.label} — Gauche`}
            value={value.left}
            onChange={(v) => set({ left: v })}
            min={0}
            steps={4}
            labelLow="0"
            labelHigh="3"
          />
        </div>
        <div className="rounded-xl border bg-muted/20 p-2.5">
          <ScaleField
            label={`${item.label} — Droite`}
            value={value.right}
            onChange={(v) => set({ right: v })}
            min={0}
            steps={4}
            labelLow="0"
            labelHigh="3"
          />
        </div>
      </div>

      {/* Descripteur du niveau effectif (côté faible) + illustration ROM */}
      {bothPicked ? (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground tabular-nums">
              {effective}
            </span>
            <p className="text-[12px] leading-snug text-foreground">
              {value.left !== value.right && (
                <span className="mr-1 font-semibold text-muted-foreground">
                  Côté faible —
                </span>
              )}
              {item.levels[effective as AssessmentLevel]}
            </p>
          </div>
          <AssessmentRomIllustration axisKey={item.key} score={effective} />
        </div>
      ) : (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {item.hint} — note les deux côtés.
        </p>
      )}

      {/* Note libre repliable */}
      <button
        type="button"
        onClick={() => setNoteOpen((o) => !o)}
        aria-expanded={noteOpen}
        className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <StickyNote className="h-3.5 w-3.5" />
        <span>
          {value.note.trim()
            ? "Note"
            : `Ajouter une note (${item.label})`}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 transition-transform",
            noteOpen && "rotate-180",
          )}
        />
      </button>
      {noteOpen && (
        <textarea
          aria-label={`Note — ${item.label}`}
          value={value.note}
          onChange={(e) => set({ note: e.target.value })}
          rows={2}
          placeholder="Observation libre (asymétrie, douleur, compensation…)"
          className="w-full resize-none rounded-xl border bg-muted/20 px-3 py-2 text-[12px] leading-snug text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      )}

      {/* Dépliant : les 4 niveaux + photos de référence */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>Voir les 4 niveaux{previous == null ? "" : " & photos de référence"}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-2 rounded-xl border bg-muted/20 p-2.5">
          {LEVELS.map((lvl) => (
            <div
              key={lvl}
              className={cn(
                "rounded-lg px-2 py-1.5",
                effective === lvl && "bg-primary/5 ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                    effective === lvl
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {lvl}
                </span>
                <p className="text-[11px] leading-snug text-foreground">
                  {item.levels[lvl]}
                </p>
              </div>
              <RefPhoto
                src={refPhotoSrc(item.key, lvl)}
                alt={`${item.label} — niveau ${lvl}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
