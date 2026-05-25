/**
 * AssessmentScoreField — un axe de notation 0-3 du bilan physique coach, avec
 * la rubrique complète qui rend la note reproductible (§301 T5).
 *
 * Au-delà du simple slider 0-3 (qui ne légendait que les extrêmes), ce champ :
 *  - affiche le **repère chiffré / protocole** de mesure (`gauge`) ;
 *  - surface le **descripteur du niveau choisi** dès que le coach tape une note
 *    (« un 2, c'est exactement ça ») ;
 *  - déplie les **4 niveaux** avec une **photo de référence** par niveau si elle
 *    existe (convention `public/assessment-refs/<key>-<level>.jpg`, fallback
 *    texte gracieux sinon) ;
 *  - rappelle la **note du dernier bilan complété** + l'évolution.
 *
 * Conçu via /frontend-design — reprend le langage visuel de l'écran bilan
 * (cards muted/30, accents primary, pastilles 0-3 de ScaleField).
 */
import { useState } from "react";
import { ChevronDown, Ruler, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

export function AssessmentScoreField({
  item,
  value,
  previous,
  onChange,
}: {
  item: AssessmentScoreItem;
  /** Note courante (−1 = non encore notée). */
  value: number;
  /** Note du dernier bilan complété pour cet axe (null si aucun). */
  previous: number | null;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = value >= 0;
  const delta = picked && previous != null ? value - previous : null;

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

      {/* Sélecteur 0-3 */}
      <ScaleField
        label={item.label}
        value={value}
        onChange={onChange}
        min={0}
        steps={4}
        labelLow={`0 · ${item.labelLow}`}
        labelHigh={`3 · ${item.labelHigh}`}
      />

      {/* Descripteur du niveau choisi + illustration ROM */}
      {picked ? (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground tabular-nums">
              {value}
            </span>
            <p className="text-[12px] leading-snug text-foreground">
              {item.levels[value as AssessmentLevel]}
            </p>
          </div>
          <AssessmentRomIllustration axisKey={item.key} score={value} />
        </div>
      ) : (
        <p className="text-[11px] leading-snug text-muted-foreground">{item.hint}</p>
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
                value === lvl && "bg-primary/5 ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                    value === lvl
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
