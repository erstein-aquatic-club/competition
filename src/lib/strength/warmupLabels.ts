/**
 * warmupLabels — helpers purs d'affichage de l'échauffement intelligent (§351).
 *
 * Sert au marquage UI des blocs d'échauffement matérialisés par le moteur :
 *   - Bloc 1 `common`     → « Échauffement articulaire »
 *   - Bloc 2 `corrective` → « Mobilité corrective », + pastille axe · côté faible
 *
 * Les libellés d'axe réutilisent `MOBILITY_EVOLUTION_AXES` (source unique des
 * labels FR des 6 axes mobilité/mouvement, §347).
 */
import { MOBILITY_EVOLUTION_AXES } from "./mobilityEvolution";

export type WarmupKind = "common" | "corrective" | "activation";

/** Métadonnées d'échauffement (§353) lues depuis le `raw_payload` d'un item de séance. */
export interface WarmupMeta {
  kind: WarmupKind | null;
  correctiveAxis: string | null;
  correctiveSide: "left" | "right" | "both" | null;
}

/**
 * §353 — lit `warmup_kind`/`corrective_axis`/`corrective_side` depuis le
 * `raw_payload` d'un `StrengthSessionItem` (persisté par §351/§352), avec le même
 * garde de validation que `getMesocycleSessionsContent`. Tout `null` si le payload
 * est absent/invalide ; l'axe correctif n'est lu que pour `kind === 'corrective'`.
 */
export function warmupMetaFromItem(item: {
  raw_payload?: Record<string, unknown> | null;
}): WarmupMeta {
  const p = item.raw_payload ?? null;
  if (!p) return { kind: null, correctiveAxis: null, correctiveSide: null };
  const k = p.warmup_kind;
  const kind: WarmupKind | null =
    k === "common" || k === "corrective" || k === "activation" ? k : null;
  const s = p.corrective_side;
  const correctiveSide: WarmupMeta["correctiveSide"] =
    s === "left" || s === "right" || s === "both" ? s : null;
  const correctiveAxis =
    kind === "corrective" && p.corrective_axis != null ? String(p.corrective_axis) : null;
  return { kind, correctiveAxis, correctiveSide };
}

/** En-tête FR d'une sous-section d'échauffement. */
export function warmupSectionLabel(kind: WarmupKind): string {
  if (kind === "common") return "Échauffement articulaire";
  if (kind === "corrective") return "Mobilité corrective";
  return "Activation musculaire";
}

/** Map axe → label FR (dérivée de MOBILITY_EVOLUTION_AXES, source unique). */
const AXIS_LABEL_FR: Record<string, string> = Object.fromEntries(
  MOBILITY_EVOLUTION_AXES.map((a) => [a.key, a.label]),
);

/** Suffixe FR du côté faible ciblé ; `null` pour `both` (bilatéral → pas de suffixe). */
export function correctiveSideLabel(
  side: "left" | "right" | "both" | null | undefined,
): string | null {
  if (side === "left") return "côté gauche";
  if (side === "right") return "côté droit";
  return null;
}

/**
 * Pastille d'un item correctif : « Hanche · côté gauche » (ou « Hanche » si
 * bilatéral / côté absent). `null` si l'axe est inconnu → aucune pastille.
 */
export function correctiveChipLabel(
  axis: string | null | undefined,
  side: "left" | "right" | "both" | null | undefined,
): string | null {
  if (!axis) return null;
  const axisLabel = AXIS_LABEL_FR[axis] ?? axis;
  const sideLabel = correctiveSideLabel(side);
  return sideLabel ? `${axisLabel} · ${sideLabel}` : axisLabel;
}
