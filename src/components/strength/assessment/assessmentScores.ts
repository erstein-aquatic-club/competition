/**
 * assessmentScores — static definition of the 6 movement-quality scores
 * the coach records to complete a "Bilan Muscu" (§287, Chantier B, Phase 8).
 *
 * Each score is an integer 0-3 (0 = dysfonctionnel … 3 = optimal) and maps
 * onto the `StrengthPhysicalTests` JSONB shape: two groups (mobility,
 * movement) of three scores each. Keeping the labels here — not inline in
 * the screen — keeps the form a flat data-driven loop.
 *
 * §301 T5 — chaque axe porte désormais une **rubrique 0-3 complète**
 * (descripteur observable par niveau, pas seulement les extrêmes) + un
 * **repère chiffré / protocole de mesure** (`gauge`), pour que deux coachs
 * notent la même chose. Les photos de référence par niveau, si présentes,
 * sont chargées par convention `public/assessment-refs/<key>-<level>.jpg`
 * (fallback gracieux texte si l'image n'existe pas — cf. l'écran).
 */
import type { StrengthPhysicalTests } from "@/lib/api/types";

/** Group of `StrengthPhysicalTests`. */
export type AssessmentScoreGroup = "mobility" | "movement";

/** Key of one score within its group. */
export type MobilityScoreKey = keyof StrengthPhysicalTests["mobility"];
export type MovementScoreKey = keyof StrengthPhysicalTests["movement"];

/** Niveau de notation 0-3. */
export type AssessmentLevel = 0 | 1 | 2 | 3;

export interface AssessmentScoreItem {
  group: AssessmentScoreGroup;
  /** Key within the group object. */
  key: MobilityScoreKey | MovementScoreKey;
  /** French label shown above the 0-3 selector. */
  label: string;
  /** Short helper line — what the coach is observing. */
  hint: string;
  /** Caption under score 0. */
  labelLow: string;
  /** Caption under score 3. */
  labelHigh: string;
  /**
   * Descripteur observable par niveau 0-3 (§301 T5). Affiché sous le sélecteur
   * (niveau choisi) et dans le dépliant « voir les 4 niveaux ». C'est ce qui
   * rend la note reproductible : un « 2 » a la même définition pour tous.
   */
  levels: Record<AssessmentLevel, string>;
  /** Repère chiffré / protocole de mesure standardisé (1 ligne). */
  gauge: string;
}

/** The 3 mobility scores. */
export const MOBILITY_SCORES: AssessmentScoreItem[] = [
  {
    group: "mobility",
    key: "shoulder_flexion",
    label: "Flexion d'épaule",
    hint: "Amplitude bras au-dessus de la tête, dos plaqué au mur.",
    labelLow: "Très limitée",
    labelHigh: "Complète",
    gauge:
      "Debout, dos au mur, lombaires plaquées, bras tendus au-dessus de la tête : on mesure l'écart poignets–mur.",
    levels: {
      0: "Bras n'atteignent pas la verticale, ou forte cambrure lombaire pour compenser (poignets > 15 cm du mur).",
      1: "Poignets à 5-15 cm du mur, ou cambrure lombaire nette pour y arriver.",
      2: "Poignets au contact du mur (0-5 cm) avec une légère compensation.",
      3: "Poignets à plat au mur, bras tendus, lombaires neutres (sans cambrer).",
    },
  },
  {
    group: "mobility",
    key: "t_spine",
    label: "Mobilité thoracique",
    hint: "Rotation du haut du dos sans compenser par les lombaires.",
    labelLow: "Raide",
    labelHigh: "Libre",
    gauge:
      "Assis ou en quadrupédie, main derrière la nuque, bassin fixe : angle de rotation du tronc.",
    levels: {
      0: "Rotation < 30°, compense par les lombaires ou l'épaule.",
      1: "Rotation ~30-45°, le bassin commence à suivre.",
      2: "Rotation ~45°, bassin stable, fin d'amplitude un peu raide.",
      3: "Rotation ~50-60°, fluide, bassin et lombaires immobiles.",
    },
  },
  {
    group: "mobility",
    key: "hip",
    label: "Mobilité de hanche",
    hint: "Amplitude de flexion / rotation de hanche en squat profond.",
    labelLow: "Bloquée",
    labelHigh: "Ample",
    gauge: "Squat profond pieds à plat, sans charge.",
    levels: {
      0: "Ne descend pas à la parallèle, ou talons décollent, ou dos s'enroule fortement.",
      1: "Cuisses parallèles au sol, talons au sol mais buste très penché en avant.",
      2: "Descend sous la parallèle, talons au sol, buste légèrement penché.",
      3: "Squat profond complet, talons au sol, buste droit, sans enroulement lombaire.",
    },
  },
];

/** The 3 movement-quality scores. */
export const MOVEMENT_SCORES: AssessmentScoreItem[] = [
  {
    group: "movement",
    key: "scapula_control",
    label: "Contrôle scapulaire",
    hint: "Gainage des omoplates en tirage / gainage bras tendus.",
    labelLow: "Anarchique",
    labelHigh: "Maîtrisé",
    gauge:
      "Suspension à la barre bras tendus (ou planche bras tendus) : tenue des omoplates.",
    levels: {
      0: "Omoplates décollées (winging), aucune rétraction/dépression contrôlée.",
      1: "Rétraction partielle, asymétrie ou perte de contrôle dès la mise en charge.",
      2: "Rétraction et dépression correctes, légère instabilité en fin d'amplitude.",
      3: "Omoplates plaquées, mobiles à la demande, symétriques et stables sous charge.",
    },
  },
  {
    group: "movement",
    key: "trunk_neck_alignment",
    label: "Alignement tronc / nuque",
    hint: "Tronc et nuque alignés, sans cassure lombaire ni cervicale.",
    labelLow: "Désaligné",
    labelHigh: "Aligné",
    gauge:
      "Gainage planche (ou position bras au-dessus de la tête) : ligne tête-bassin-talons.",
    levels: {
      0: "Cassure immédiate : le bassin tombe (cambrure) ou le menton/nuque part en avant.",
      1: "Alignement tenu < 20 s puis cassure lombaire ou cervicale.",
      2: "Alignement correct, légère perte sous la fatigue.",
      3: "Ligne tête-bassin-talons maintenue (> 45 s), nuque neutre, sans cassure.",
    },
  },
  {
    group: "movement",
    key: "hip_hinge",
    label: "Charnière de hanche",
    hint: "Mouvement de hip hinge propre, dos neutre, hanches en arrière.",
    labelLow: "Dysfonctionnel",
    labelHigh: "Optimal",
    gauge:
      "Hip hinge à vide, manche à balai le long du dos (3 contacts : sacrum, dorsales, nuque).",
    levels: {
      0: "Dos rond (flexion lombaire), pas de recul des hanches.",
      1: "Hinge amorcé mais le dos s'arrondit en fin d'amplitude.",
      2: "Hinge correct, dos neutre, légère compensation des genoux.",
      3: "Hanches reculent, dos neutre du début à la fin (3 contacts gardés), tibias quasi verticaux.",
    },
  },
];

/** The 0-3 scale legend, shown once at the top of the scoring section. */
export const SCORE_LEGEND: { value: number; label: string }[] = [
  { value: 0, label: "Dysfonctionnel" },
  { value: 1, label: "Insuffisant" },
  { value: 2, label: "Correct" },
  { value: 3, label: "Optimal" },
];

/** Sentinel for a score not yet picked (ScaleField treats < min as unset). */
export const SCORE_UNSET = -1;
