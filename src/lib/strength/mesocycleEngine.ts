/**
 * Moteur de génération du mésocycle Bilan Muscu — Chantier C+D (§293).
 *
 * Fonctions pures, sans I/O, testées unitairement. Interface-pivot :
 * `GeneratedMesocycle` (cf. mesocycleEngine.types.ts).
 *
 * @see docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md §5
 */

import type {
  PainReport,
  PeriodizationCycle,
  StrengthBucket,
  StrengthKpiKey,
  StrengthKpiMeasurement,
  StrengthPeriodizationTemplate,
  StrengthPhysicalTests,
} from '@/lib/api/types';
import type { BaremeConfidence } from './kpiBaremes';
import { getBareme, kpiScore, shiftAnchors } from './kpiBaremes';
import { PERIODIZATION_CYCLES } from './periodizationCycles';
import type {
  AllBucket,
  BucketAllocation,
  BucketPriority,
  BucketScores,
  CatalogExercise,
  DataConfidence,
  GeneratedMesocycle,
  MesocycleExercise,
  MesocycleInput,
  MesocycleReasoning,
  MesocycleSession,
  MesocycleWeek,
  PeriodizedWeek,
  SelectedExercise,
  SessionRole,
} from './mesocycleEngine.types.ts';

/** Sélectionne la mesure la plus récente pour chaque KPI. */
function latestByKpi(
  measurements: StrengthKpiMeasurement[],
): Partial<Record<StrengthKpiKey, StrengthKpiMeasurement>> {
  const out: Partial<Record<StrengthKpiKey, StrengthKpiMeasurement>> = {};
  for (const m of measurements) {
    const prev = out[m.kpi_key];
    if (!prev || m.measured_at > prev.measured_at) {
      out[m.kpi_key] = m;
    }
  }
  return out;
}

/** Score 0-100 d'un KPI via le barème (sexe + bande d'âge), ou null si absent. */
function scoreKpi(
  kpi: StrengthKpiKey,
  latest: Partial<Record<StrengthKpiKey, StrengthKpiMeasurement>>,
  athlete: MesocycleInput['athlete'],
): number | null {
  const m = latest[kpi];
  if (!m) return null;
  const bareme = getBareme(kpi, athlete.sex, athlete.ageBand);
  return kpiScore(shiftAnchors(bareme.anchors, athlete.performanceTier), m.value);
}

/** Moyenne des scores non-null. `null` si tous sont null. */
function meanScore(scores: (number | null)[]): number | null {
  const present = scores.filter((s): s is number => s !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Score mobilité 0-100 depuis le bilan coach (`physical_tests`).
 *
 * 6 sous-scores (mobility × 3 + movement × 3), chacun 0-3 → somme / 18 × 100.
 * `null` si le bilan est absent.
 */
function scoreMobility(
  physicalTests: MesocycleInput['assessment']['physical_tests'],
): number | null {
  if (!physicalTests) return null;
  const { mobility, movement } = physicalTests;
  const sum =
    mobility.shoulder_flexion +
    mobility.t_spine +
    mobility.hip +
    movement.scapula_control +
    movement.trunk_neck_alignment +
    movement.hip_hinge;
  return (sum / 18) * 100;
}

/**
 * Score psychologie 0-100 depuis le questionnaire.
 *
 * Agrège confiance (1-5, ↑=mieux) + motivation (1-5, ↑=mieux) + (6 − stress)
 * (stress 1-5, ↓=mieux) → somme ∈ [3, 15] → ((somme − 3) / 12) × 100.
 * `null` si le questionnaire est absent.
 */
function scorePsychology(
  questionnaire: MesocycleInput['assessment']['questionnaire'],
): number | null {
  if (!questionnaire) return null;
  const { confidence, motivation, stress } = questionnaire.psychology;
  const sum = confidence + motivation + (6 - stress);
  return ((sum - 3) / 12) * 100;
}

/**
 * Scoring des 6 seaux du Bilan Muscu — convertit l'évaluation + les KPI en
 * scores 0-100 (ou null si la donnée manque).
 *
 * Mapping (cf. design §5) :
 * - `lower_strength` ← `imtp`
 * - `lower_power`    ← moyenne(`vertical_jump`, `broad_jump`)
 * - `upper_strength` ← `weighted_pullup`
 * - `upper_power`    ← `medball_vertical_throw`
 * - `mobility`       ← `physical_tests` (bilan coach)
 * - `psychology`     ← `questionnaire.psychology`
 * - `core`           ← **non scoré** (toujours `null`). Socle permanent sans KPI
 *   dédié (cf. design R5 §2, option a). Tenu hors priorisation (`ALL_BUCKETS`)
 *   pour ne PAS être sur-priorisé par `emphasis × (100 − 0)` ; inséré comme bloc
 *   systématique à la place (cf. `buildSession`).
 */
export function scoreBuckets(
  assessment: MesocycleInput['assessment'],
  kpiMeasurements: StrengthKpiMeasurement[],
  athlete: MesocycleInput['athlete'],
): BucketScores {
  const latest = latestByKpi(kpiMeasurements);

  const verticalJump = scoreKpi('vertical_jump', latest, athlete);
  const broadJump = scoreKpi('broad_jump', latest, athlete);

  return {
    lower_strength: scoreKpi('imtp', latest, athlete),
    lower_power: meanScore([verticalJump, broadJump]),
    upper_strength: scoreKpi('weighted_pullup', latest, athlete),
    upper_power: scoreKpi('medball_vertical_throw', latest, athlete),
    mobility: scoreMobility(assessment.physical_tests),
    psychology: scorePsychology(assessment.questionnaire),
    // core : pas de KPI (option a) → null. NON priorisé (hors ALL_BUCKETS).
    core: null,
  };
}

// ── prioritizeBuckets ────────────────────────────────────────────────────────

/**
 * Seaux **priorisés** dans un ordre stable (itération + tie-break).
 *
 * §R5 — `core` est volontairement ABSENT : il n'est pas scoré (option a) et ne
 * doit pas entrer dans `emphasis × (100 − score)` (sinon `null→0` le sur-priorise
 * sur tout). Il est traité comme un bloc systématique en aval (`buildSession`),
 * pas comme un seau prioritaire.
 */
const ALL_BUCKETS: AllBucket[] = [
  'lower_strength',
  'lower_power',
  'upper_strength',
  'upper_power',
  'mobility',
  'psychology',
];

/** Libellés FR des seaux pour la rationale lisible. */
const BUCKET_LABEL_FR: Record<AllBucket, string> = {
  lower_strength: 'Force bas du corps',
  lower_power: 'Puissance bas du corps',
  upper_strength: 'Force haut du corps',
  upper_power: 'Puissance haut du corps',
  mobility: 'Mobilité',
  psychology: 'Psychologie',
  core: 'Tronc / gainage',
};

/**
 * Forme minimale d'une déclaration de douleur acceptée par le moteur — accepte
 * indifféremment un `PainReport` (table) ou un `QuestionnairePainEntry`
 * (saisi dans le questionnaire de l'évaluation).
 */
export type PainInput = Pick<PainReport, 'body_zone' | 'intensity'>;

/** Détecte les zones de douleur intense (intensity ≥ 3). */
function intensePainZones(painReports: ReadonlyArray<PainInput>): string[] {
  return painReports
    .filter((p) => p.intensity >= 3)
    .map((p) => p.body_zone);
}

/** Détecte une dysfonction de mouvement (sub-score = 0) dans physical_tests. */
function dysfunctionFlags(physicalTests: StrengthPhysicalTests | null): string[] {
  if (!physicalTests) return [];
  const flags: string[] = [];
  const { mobility, movement } = physicalTests;
  for (const [k, v] of Object.entries(mobility)) {
    if (v === 0) flags.push(k);
  }
  for (const [k, v] of Object.entries(movement)) {
    if (v === 0) flags.push(k);
  }
  return flags;
}

/**
 * Priorise les 6 seaux pour la génération du mésocycle.
 *
 * Score combiné = `bucket_emphasis × (100 − bucket_score)`. Le seau le plus
 * faible **et** le plus sollicité par l'épreuve ressort en tête (cf. design §5).
 *
 * **Override sécurité** : douleur intense (`pain_reports.intensity ≥ 3`) ou
 * dysfonction de mouvement (`physical_tests` sub-score = 0) → `mobility` est
 * forcé rang 1, les autres seaux décalés.
 *
 * **Données manquantes** : `score = null` → traité comme 0 (conservateur, monte
 * en priorité — le mésocycle doit travailler ce qui n'a pas pu être mesuré).
 *
 * **psychology** : pas dans `bucket_emphasis` → emphasis 0 → toujours dernier,
 * sauf si on lui assigne explicitement une emphasis (extension future).
 */
export function prioritizeBuckets(
  bucketScores: BucketScores,
  template: StrengthPeriodizationTemplate,
  painReports: ReadonlyArray<PainInput>,
  physicalTests: StrengthPhysicalTests | null,
): BucketPriority[] {
  const emphasisFor = (b: AllBucket): number => {
    if (b === 'psychology') return 0;
    return template.structure.bucket_emphasis[b as StrengthBucket] ?? 0;
  };

  // 1. Score combiné par seau (ordre stable d'ALL_BUCKETS pour départager les ex æquo).
  const items = ALL_BUCKETS.map((bucket, idx) => {
    const raw = bucketScores[bucket];
    const score = raw ?? 0; // null → 0 (conservateur)
    const emphasis = emphasisFor(bucket);
    const combined = emphasis * (100 - score);
    const rationale = buildRationale(bucket, raw, emphasis);
    return { bucket, raw, emphasis, combined, rationale, stableIdx: idx };
  });

  // 2. Tri décroissant par score combiné, stable sur l'ordre d'ALL_BUCKETS.
  items.sort((a, b) => {
    if (b.combined !== a.combined) return b.combined - a.combined;
    return a.stableIdx - b.stableIdx;
  });

  // 3. Overrides sécurité.
  const painZones = intensePainZones(painReports);
  const dysfns = dysfunctionFlags(physicalTests);
  const overrideMobility = painZones.length > 0 || dysfns.length > 0;

  if (overrideMobility) {
    const mobIdx = items.findIndex((i) => i.bucket === 'mobility');
    if (mobIdx > 0) {
      const [mob] = items.splice(mobIdx, 1);
      items.unshift(mob);
    }
  }

  // 3bis. §322 — Focus événement forcé : les seaux `forced_focus` du template
  // (ex. `upper_power` pour un sprint — la puissance explosive « domine ») sont
  // remontés dans les créneaux focus quel que soit leur score, APRÈS l'éventuel
  // override mobilité (la sécurité prime). Doctrine événement > point faible.
  const forcedFocus = template.structure.forced_focus ?? [];
  if (forcedFocus.length > 0) {
    const prefix = overrideMobility ? items.slice(0, 1) : [];
    const tail = overrideMobility ? items.slice(1) : items.slice();
    const forced = forcedFocus
      .map((b) => tail.find((i) => i.bucket === b))
      .filter((x): x is (typeof items)[number] => x != null);
    const rest = tail.filter((i) => !forced.includes(i));
    items.splice(0, items.length, ...prefix, ...forced, ...rest);
  }

  // 4. Sérialiser → BucketPriority[] avec rang + override flag + rationale finale.
  return items.map((it, idx): BucketPriority => {
    const rank = idx + 1;
    const isMobilityOverride = overrideMobility && it.bucket === 'mobility';
    const rationale = isMobilityOverride
      ? buildOverrideRationale(painZones, dysfns)
      : it.rationale;
    return {
      bucket: it.bucket,
      score: it.combined,
      rank,
      rationale,
      overrideApplied: isMobilityOverride,
    };
  });
}

function buildRationale(
  bucket: AllBucket,
  rawScore: number | null,
  emphasis: number,
): string {
  const label = BUCKET_LABEL_FR[bucket];
  if (rawScore === null) {
    return `${label} — donnée manquante, priorisé par défaut (conservateur).`;
  }
  if (emphasis === 0) {
    return `${label} — non sollicité par l'épreuve (emphasis 0).`;
  }
  if (rawScore < 50) {
    return `${label} faible (${Math.round(rawScore)}/100) — sollicité ×${emphasis.toFixed(2)} par l'épreuve → focus.`;
  }
  return `${label} ${Math.round(rawScore)}/100 — sollicité ×${emphasis.toFixed(2)} → maintien.`;
}

// ── allocateVolume ───────────────────────────────────────────────────────────

/** Part de volume allouée aux 2 seaux focus (vs maintien). */
const FOCUS_SHARE = 0.6;
const MAINTIEN_SHARE = 0.4;
/** Nombre de seaux en rôle focus (top-2 du classement entraînable). */
const FOCUS_COUNT = 2;

/**
 * Répartit le volume hebdo sur les 5 seaux entraînables, à partir du
 * classement de priorité.
 *
 * - Top 2 (parmi les entraînables, psychology exclue) = **focus**, partageant
 *   ~60 % du volume → chacun `0.3 × sessionsPerWeek`.
 * - Les autres entraînables (hors `mobility`) = **maintien**, partageant
 *   ~40 % du volume → chacun `0.4 × sessionsPerWeek / nb_maintien_non_mob`.
 * - `mobility` en maintien = **échauffement systématique** : présente à chaque
 *   séance → `sessionsPerWeek = S`. Si l'override sécurité l'a fait passer
 *   en focus (top 2), elle prend la part focus comme les autres.
 *
 * `psychology` n'a pas d'exercices → exclue de la sortie (un flag est produit
 * en amont par l'orchestrateur en cas de score bas).
 */
export function allocateVolume(
  priorities: BucketPriority[],
  sessionsPerWeek: number,
): BucketAllocation[] {
  // Filtre psychology, conserve l'ordre de priorité.
  const entrainables = priorities
    .filter((p): p is BucketPriority & { bucket: StrengthBucket } => p.bucket !== 'psychology')
    .slice()
    .sort((a, b) => a.rank - b.rank);

  const focusBuckets = entrainables.slice(0, FOCUS_COUNT).map((p) => p.bucket);
  const maintienBuckets = entrainables.slice(FOCUS_COUNT).map((p) => p.bucket);

  const out: BucketAllocation[] = [];

  // Focus : part identique pour chaque seau focus.
  const focusPer = (FOCUS_SHARE * sessionsPerWeek) / focusBuckets.length;
  for (const bucket of focusBuckets) {
    out.push({ bucket, sessionsPerWeek: focusPer, role: 'focus' });
  }

  // Maintien hors mobility : se partage la part maintien.
  const maintienNonMob = maintienBuckets.filter((b) => b !== 'mobility');
  const maintienPer =
    maintienNonMob.length > 0
      ? (MAINTIEN_SHARE * sessionsPerWeek) / maintienNonMob.length
      : 0;
  for (const bucket of maintienNonMob) {
    out.push({ bucket, sessionsPerWeek: maintienPer, role: 'maintien' });
  }

  // Mobility en maintien : échauffement systématique (sessionsPerWeek complets).
  if (maintienBuckets.includes('mobility')) {
    out.push({ bucket: 'mobility', sessionsPerWeek, role: 'maintien' });
  }

  return out;
}

// ── selectExercises ──────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<'beginner' | 'intermediate' | 'advanced', number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/** Nages reconnues (préfixe des event_group composés `<nage>_<distance>`). */
const KNOWN_STROKES = new Set([
  'freestyle',
  'butterfly',
  'backstroke',
  'breaststroke',
  'medley',
]);

/**
 * Dérive la nage ciblée depuis l'`event_group` composé (§305) — ex.
 * `breaststroke_100` → `breaststroke`. Renvoie `null` pour les `event_group`
 * legacy non préfixés par une nage connue (`sprint_50`, `200m`, …) → la passe
 * de préférence préhab (§306 P2) reste alors inactive (dégradation gracieuse).
 */
function deriveStrokeKey(eventGroup: string | undefined | null): string | null {
  if (!eventGroup) return null;
  const prefix = eventGroup.split('_')[0];
  return KNOWN_STROKES.has(prefix) ? prefix : null;
}

/**
 * Sélectionne, pour chaque seau alloué, les exercices du catalogue admissibles.
 *
 * Filtres successifs :
 * 1. Seau ciblé (`exercise.bucket === bucket`).
 * 2. Niveau ≤ niveau du nageur (les exercices au-dessus sont exclus ; les
 *    exercices `level === null` sont autorisés à tous les niveaux).
 * 3. Pas de contre-indication : `contraindicationZones ∩ painZones === ∅`.
 *
 * Tri : exercices `isCore=true` en premier, puis par niveau décroissant
 * (intermediate avant beginner) — l'aval (générateur de séances) prend les
 * premiers exercices pour les blocs principaux.
 *
 * **Substitution** : pour chaque exercice `core` exclu pour contre-indication,
 * un remplaçant non-core est marqué `substituted = true` avec l'id du core
 * exclu dans `originalExerciseId`.
 *
 * Sortie : un dictionnaire `{ bucket → SelectedExercise[] }` qui n'inclut que
 * les seaux présents dans `allocations`. Une entrée peut être vide si le
 * catalogue n'a pas d'exercice admissible pour ce seau.
 */
export function selectExercises(
  allocations: BucketAllocation[],
  exerciseCatalog: CatalogExercise[],
  athleteLevel: 'beginner' | 'intermediate' | 'advanced',
  painZones: string[],
  strokeKey: string | null = null,
): Partial<Record<StrengthBucket, SelectedExercise[]>> {
  const athleteLevelNum = LEVEL_ORDER[athleteLevel];
  const painSet = new Set(painZones);

  // §306 P2 — un exo dont l'affinité préhab contient la nage ciblée est préféré.
  const matchesStroke = (e: CatalogExercise): boolean =>
    strokeKey !== null && e.strokePrehabAffinity.includes(strokeKey);

  const isContraindicated = (ex: CatalogExercise): boolean =>
    ex.contraindicationZones.some((z) => painSet.has(z));

  const fitsLevel = (ex: CatalogExercise): boolean =>
    ex.level === null || LEVEL_ORDER[ex.level] <= athleteLevelNum;

  const result: Partial<Record<StrengthBucket, SelectedExercise[]>> = {};

  for (const allocation of allocations) {
    const bucket = allocation.bucket;
    if (result[bucket]) continue; // un seul traitement par seau

    const inBucket = exerciseCatalog.filter((e) => e.bucket === bucket);
    const inLevel = inBucket.filter(fitsLevel);
    const safe = inLevel.filter((e) => !isContraindicated(e));
    const excludedCores = inLevel.filter((e) => e.isCore && isContraindicated(e));

    // Tri : core d'abord (force préservée) ; puis (§306 P2) affinité préhab nage
    // avant les autres non-cores ; puis niveau décroissant (intermediate >
    // beginner > null). L'affinité ne déloge jamais un core.
    const ordered = safe.slice().sort((a, b) => {
      // §319 — priorité coach d'abord : impose les staples (tractions lestées,
      // box jump, roue abdos…) et démote les exotiques (Front Lever) sans les
      // retirer du catalogue. Défaut 0 → départage par is_core/niveau (historique).
      if (a.selectionPriority !== b.selectionPriority) {
        return b.selectionPriority - a.selectionPriority;
      }
      if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
      const am = matchesStroke(a);
      const bm = matchesStroke(b);
      if (am !== bm) return am ? -1 : 1;
      const al = a.level ? LEVEL_ORDER[a.level] : 0;
      const bl = b.level ? LEVEL_ORDER[b.level] : 0;
      return bl - al;
    });

    const selected: SelectedExercise[] = ordered.map((e) => ({
      exercise: e,
      substituted: false,
      originalExerciseId: null,
    }));

    // Pour chaque core exclu, marquer un remplaçant non-core comme substitué.
    let cursor = 0;
    for (const excl of excludedCores) {
      while (cursor < selected.length && (selected[cursor].substituted || selected[cursor].exercise.isCore)) {
        cursor++;
      }
      if (cursor >= selected.length) break;
      selected[cursor].substituted = true;
      selected[cursor].originalExerciseId = excl.id;
      cursor++;
    }

    result[bucket] = selected;
  }

  return result;
}

// ── periodize ────────────────────────────────────────────────────────────────

/**
 * Distribue les phases du template sur `targetWeekCount` semaines.
 *
 * Algorithme :
 * 1. Vérifie `targetWeekCount ∈ [Σ min_weeks, Σ max_weeks]` — sinon throw.
 * 2. Part du `nominal_weeks` de chaque phase.
 * 3. Si `target > Σ nominal` : étire en round-robin, +1 semaine à chaque
 *    phase dont l'allocation courante < max_weeks, jusqu'à atteindre target.
 * 4. Si `target < Σ nominal` : comprime en round-robin, -1 à chaque phase
 *    dont l'allocation courante > min_weeks.
 * 5. Développe chaque phase en `n` semaines de son cycle, dans l'ordre.
 *
 * @throws Error si target hors `[Σ min, Σ max]`.
 */
export function periodize(
  template: StrengthPeriodizationTemplate,
  targetWeekCount: number,
): PeriodizedWeek[] {
  const phases = template.structure.phases;
  const totalMin = phases.reduce((s, p) => s + p.min_weeks, 0);
  const totalMax = phases.reduce((s, p) => s + p.max_weeks, 0);
  const totalNominal = phases.reduce((s, p) => s + p.nominal_weeks, 0);

  if (targetWeekCount < totalMin) {
    throw new Error(
      `periodize: targetWeekCount ${targetWeekCount} hors plage — Σ min_weeks = ${totalMin}`,
    );
  }
  if (targetWeekCount > totalMax) {
    throw new Error(
      `periodize: targetWeekCount ${targetWeekCount} hors plage — Σ max_weeks = ${totalMax}`,
    );
  }

  const allocations = phases.map((p) => p.nominal_weeks);
  let delta = targetWeekCount - totalNominal;

  while (delta > 0) {
    let changed = false;
    for (let i = 0; i < phases.length && delta > 0; i++) {
      if (allocations[i] < phases[i].max_weeks) {
        allocations[i]++;
        delta--;
        changed = true;
      }
    }
    if (!changed) break; // garde-fou, ne devrait pas arriver vu la borne max
  }

  while (delta < 0) {
    let changed = false;
    for (let i = 0; i < phases.length && delta < 0; i++) {
      if (allocations[i] > phases[i].min_weeks) {
        allocations[i]--;
        delta++;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const weeks: PeriodizedWeek[] = [];
  let weekNumber = 1;
  for (let i = 0; i < phases.length; i++) {
    for (let j = 0; j < allocations[i]; j++) {
      weeks.push({ weekNumber, cycle: phases[i].cycle });
      weekNumber++;
    }
  }
  return weeks;
}

function buildOverrideRationale(painZones: string[], dysfns: string[]): string {
  const parts: string[] = [];
  if (painZones.length > 0) {
    parts.push(`douleur intense (${painZones.join(', ')})`);
  }
  if (dysfns.length > 0) {
    parts.push(`dysfonction (${dysfns.join(', ')})`);
  }
  return `Mobilité — ${parts.join(' + ')} → correctif prioritaire.`;
}

// ── generateMesocycle ────────────────────────────────────────────────────────

/** Version sémantique du moteur — incrémentée à chaque modification de logique. */
export const ENGINE_VERSION = '1.1.0';

/** Seaux de force pure (potentiateur lourd-court d'une amorce PAP). §307. */
const STRENGTH_BUCKETS: StrengthBucket[] = ['upper_strength', 'lower_strength'];
/** Seaux de puissance (exo explosif d'une amorce PAP). §307. */
const POWER_BUCKETS: StrengthBucket[] = ['lower_power', 'upper_power'];

/**
 * Sous le seuil, un seau de force est jugé « à développer » et déclenche le
 * biais force d'une semaine de maintien sur les jours développement. §307.
 */
const FORCE_BIAS_SCORE_THRESHOLD = 60;

/** Distances qui imposent un biais force (sprint, où la force prime). §307. */
const FORCE_BIAS_DISTANCES = new Set<string>(['50', '100']);

/** Distances reconnues du suffixe `<nage>_<distance>` (§305 ; +`fond` audit R4). */
const KNOWN_DISTANCES = new Set(['50', '100', '200', '400plus', 'fond']);

/**
 * Dose d'une amorce PAP (§307) — le « dimensionnement » qui doit laisser le
 * nageur frais pour enchaîner un sprint 100 % en bassin. Centralisé ici pour
 * être ajustable d'un seul endroit (le potentiateur garde le %1RM du catalogue,
 * lourd-court ; l'explosif vise la vitesse, charge ~nulle).
 */
const PAP_POTENTIATOR = { sets: 2, reps: 2, restSeconds: 180 } as const;
const PAP_EXPLOSIVE = { sets: 2, reps: 3, restSeconds: 150 } as const;

/**
 * Carte legacy jour-de-semaine, alignée sur le tableau codé en dur dans la RPC
 * `apply_strength_mesocycle` : utilisée quand `input.weekdays` est absent.
 * 0=Lun…6=Dim ; samedi(5) n'est jamais auto-assigné en deçà de 6 séances.
 */
function legacyWeekdays(sessionsPerWeek: number): number[] {
  const MAP: Record<number, number[]> = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return MAP[sessionsPerWeek] ?? [0, 1, 2, 3, 4, 5, 6].slice(0, sessionsPerWeek);
}

/**
 * Dérive la distance ciblée depuis l'`event_group` composé (§305) — ex.
 * `freestyle_50` → `50`. Renvoie `null` si le suffixe n'est pas une distance
 * connue (dégradation gracieuse, pas de biais force forcé).
 */
function deriveDistanceKey(eventGroup: string | undefined | null): string | null {
  if (!eventGroup) return null;
  const suffix = eventGroup.split('_')[1];
  return suffix && KNOWN_DISTANCES.has(suffix) ? suffix : null;
}

/**
 * Classe le rôle d'une séance (§307) :
 * - override mobilité (sécurité) → `mobilite_corrective` (jamais converti en PAP).
 * - jour-aware + jour primer → `amorce_pap`.
 * - sinon → `developpement`.
 */
function classifyRole(
  weekday: number,
  primerWeekdays: Set<number>,
  isMobilityOverride: boolean,
  jourAware: boolean,
): SessionRole {
  if (isMobilityOverride) return 'mobilite_corrective';
  if (jourAware && primerWeekdays.has(weekday)) return 'amorce_pap';
  return 'developpement';
}

/** Nombre d'exercices par bloc d'une séance.
 *
 * Stratégie « multi-bucket à la McEvoy » (Vague C, §293) — chaque séance
 * combine désormais un bucket PRIMAIRE (le focus principal) + un bucket
 * COMPLEMENT (l'autre focus, ou le top focus si le primaire est en maintien)
 * + un warmup mobility, à l'image de « Lundi Tractions + Squat + Ab Wheel »
 * dans la prépa sprint de référence.
 */
const MOBILITY_WARMUP_COUNT = 2;
const PRIMARY_BLOCK_COUNT = 2;
const COMPLEMENT_BLOCK_COUNT = 1;
/**
 * §R5 (DRAFT) — nombre d'exos tronc insérés par séance de développement quand le
 * template porte une emphase core > 0. 1 partout pour l'instant ; le passage à 2
 * sur fly/4N/dos-long (emphasis ≥ ~0.8) est une décision d'entraînement laissée
 * en TODO coach (cf. design R5 §2 et §7).
 */
const CORE_BLOCK_COUNT = 1;
/**
 * §318 (#2) — plafond d'exercices par séance de développement. Retour terrain
 * (50 m crawl) : le bloc core §313 s'AJOUTAIT (warmup 2 + primary 2 + complement
 * 1 + core 1 = 6) → trop de volume vs la prépa McEvoy (qualité > volume). Le core
 * est désormais INCLUS dans le plafond : on rogne d'abord le warmup (mobilité
 * d'activation, le moins coûteux) jusqu'à `MIN_WARMUP_COUNT`, en préservant les
 * blocs de travail (primary + complement + core). Séance sans core inchangée (5).
 */
const MAX_SESSION_ITEMS = 5;
const MIN_WARMUP_COUNT = 1;
/** Compromis : si une séance n'a aucun exercice main (pool vide ou bucket
 *  mobility), on cible jusqu'à 5 exercices mobility pour rester productive. */
const MOBILITY_ONLY_COUNT = 5;

/** Confidence ordering (placeholder < transposed < solid). */
const CONFIDENCE_ORDER: Record<BaremeConfidence, number> = {
  placeholder: 0,
  transposed: 1,
  solid: 2,
};

/**
 * Orchestrateur du moteur : enchaîne les 5 fonctions précédentes pour produire
 * le mésocycle complet à partir d'un `MesocycleInput`.
 *
 * Pipeline :
 *   1. `scoreBuckets`        → 6 scores 0-100
 *   2. `prioritizeBuckets`   → 6 priorités (+ overrides sécurité)
 *   3. `allocateVolume`      → volume par seau entraînable
 *   4. `selectExercises`     → pool d'exercices par seau
 *   5. `periodize`           → semaine → cycle de périodisation
 *   6. (interne) construction des séances par semaine + chargement par cycle
 *   7. (interne) snapshot du raisonnement → `MesocycleReasoning`
 *
 * Données partielles tolérées — `dataConfidence` abaissée mais aucun throw.
 */
export function generateMesocycle(input: MesocycleInput): GeneratedMesocycle {
  const bucketScores = scoreBuckets(
    input.assessment,
    input.kpiMeasurements,
    input.athlete,
  );

  const painEntries: PainInput[] = input.assessment.questionnaire?.pain ?? [];
  const painZones = painEntries.map((p) => p.body_zone);

  const bucketPriorities = prioritizeBuckets(
    bucketScores,
    input.template,
    painEntries,
    input.assessment.physical_tests,
  );

  const bucketAllocations = allocateVolume(bucketPriorities, input.sessionsPerWeek);

  const selected = selectExercises(
    bucketAllocations,
    input.exerciseCatalog,
    input.athlete.level,
    painZones,
    deriveStrokeKey(input.template.event_group),
  );

  // §R5 (DRAFT) — sélection du pool `core`. Le core n'est ni scoré ni priorisé
  // (option a) → absent de `bucketAllocations`. On le sélectionne via une
  // allocation synthétique (rôle maintien, neutre) pour disposer d'un pool d'exos
  // tronc filtré niveau + contre-indications, comme les autres seaux. Inséré
  // comme bloc systématique par `buildSession` quand l'emphase core du template
  // est > 0. Rétrocompat : tant que la DB n'a pas re-taggé d'exos `core`
  // (migration 00204 non appliquée) ce pool est vide → aucun effet.
  const coreSelected = selectExercises(
    [{ bucket: 'core', sessionsPerWeek: 0, role: 'maintien' }],
    input.exerciseCatalog,
    input.athlete.level,
    painZones,
    deriveStrokeKey(input.template.event_group),
  );
  if (coreSelected.core) selected.core = coreSelected.core;

  // §R5 — l'emphase core du template (0 si DB pré-migration) décide si on insère
  // un bloc tronc systématique dans chaque séance de développement.
  const coreEmphasis = input.template.structure.bucket_emphasis.core ?? 0;

  const periodizedWeeks = periodize(input.template, input.targetWeekCount);

  // §307 — résolution jour-aware : jours muscu + jours amorce PAP.
  const jourAware = !!(input.weekdays && input.weekdays.length > 0);
  const weekdays =
    input.weekdays && input.weekdays.length > 0
      ? [...input.weekdays].sort((a, b) => a - b)
      : legacyWeekdays(input.sessionsPerWeek);
  const primerWeekdays = new Set(
    input.primerWeekdays ?? weekdays.filter((d) => d === 0 || d === 3),
  );

  // §307 — biais force : distance sprint OU force pure faible. Appliqué
  // uniquement en mode jour-aware sur les séances développement.
  const distanceKey = deriveDistanceKey(input.template.event_group);
  const maxStrengthScore = Math.max(
    bucketScores.lower_strength ?? 0,
    bucketScores.upper_strength ?? 0,
  );
  const forceBiasRequired =
    (distanceKey !== null && FORCE_BIAS_DISTANCES.has(distanceKey)) ||
    maxStrengthScore < FORCE_BIAS_SCORE_THRESHOLD;

  // §307 — override sécurité mobilité actif (douleur intense / dysfonction) :
  // toute la semaine devient corrective, la PAP est supprimée. Détecté via le
  // flag posé par `prioritizeBuckets` sur le seau mobility.
  const mobilityOverrideActive = bucketPriorities.some(
    (p) => p.bucket === 'mobility' && p.overrideApplied,
  );

  // §307 — ordre de priorité des seaux entraînables (focus puis maintien),
  // utilisé pour choisir le seau force/puissance d'une amorce PAP.
  const bucketPriorityOrder = bucketAllocations.map((a) => a.bucket);

  // §325 — amorce event-aware : si le seul créneau jambes tombe un jour primer
  // (amorce PAP, codée haut du corps), les jambes disparaissent du plan (retour
  // terrain Victoria, défaut [Lun, Mar, Jeu] = 2 amorces / 3 séances). On détecte
  // ici si AUCUN seau jambes n'est couvert par une séance de DÉVELOPPEMENT ; si
  // c'est le cas, l'explosif de l'amorce basculera sur `lower_power` (un saut)
  // pour garantir un minimum de puissance jambes, même un jour amorce.
  const isLegBucket = (b: StrengthBucket | null): boolean =>
    b === 'lower_strength' || b === 'lower_power';
  const coverageSlots = distributeSessionSlots(bucketAllocations, weekdays.length);
  const legsCoveredInDev = coverageSlots.some(
    (slot, idx) =>
      !primerWeekdays.has(weekdays[idx]) &&
      (isLegBucket(slot.primary) || isLegBucket(slot.complement)),
  );
  const papPreferLegPower = jourAware && !legsCoveredInDev;

  const weeks: MesocycleWeek[] = periodizedWeeks.map((pw) =>
    buildWeek(pw, bucketAllocations, selected, weekdays, primerWeekdays, jourAware, {
      forceBiasRequired,
      mobilityOverrideActive,
      bucketPriorityOrder,
      coreEmphasis,
      papPreferLegPower,
    }),
  );

  const reasoning = buildReasoning({
    bucketScores,
    bucketPriorities,
    bucketAllocations,
    input,
    painZones,
  });

  return {
    weeks,
    totalWeeks: weeks.length,
    sessionsPerWeek: input.sessionsPerWeek,
    templateId: input.template.id,
    reasoning,
    engineVersion: ENGINE_VERSION,
  };
}

// ── helpers internes : sessions + chargement ─────────────────────────────────

/**
 * Pour une semaine, construit une séance par jour muscu (`weekdays.length`),
 * chargée selon le cycle. §307 — chaque séance reçoit son `weekday` (trié) et
 * son `role` (PAP / développement / mobilité corrective).
 */
function buildWeek(
  pw: PeriodizedWeek,
  allocations: BucketAllocation[],
  selected: Partial<Record<StrengthBucket, SelectedExercise[]>>,
  weekdays: number[],
  primerWeekdays: Set<number>,
  jourAware: boolean,
  flags: {
    forceBiasRequired: boolean;
    mobilityOverrideActive: boolean;
    bucketPriorityOrder: StrengthBucket[];
    /** §R5 — emphase core du template (0 = pas de bloc tronc, ex. DB pré-migration). */
    coreEmphasis: number;
    /** §325 — l'amorce PAP bascule son explosif sur lower_power (jambes absentes ailleurs). */
    papPreferLegPower: boolean;
  },
): MesocycleWeek {
  let slots = distributeSessionSlots(allocations, weekdays.length);
  // §327 — garantit que le seau focus#1 forcé décroche un bloc de DÉVELOPPEMENT
  // (sinon ses créneaux primaires tombent sur les jours d'amorce PAP → jamais
  // développé ; cf. tirage poulie papillon absent du 50 papillon de François).
  if (jourAware) {
    const focusBuckets = allocations
      .filter((a) => a.role === 'focus' && a.bucket !== 'mobility')
      .map((a) => a.bucket);
    slots = ensureFocusDevelopmentSession(slots, weekdays, primerWeekdays, focusBuckets);
  }
  const sessions: MesocycleSession[] = slots.map((slot, idx) =>
    buildSession(idx + 1, weekdays[idx], slot.primary, slot.complement, pw.cycle, selected, {
      primerWeekdays,
      jourAware,
      forceBiasRequired: flags.forceBiasRequired,
      mobilityOverrideActive: flags.mobilityOverrideActive,
      bucketPriorityOrder: flags.bucketPriorityOrder,
      coreEmphasis: flags.coreEmphasis,
      papPreferLegPower: flags.papPreferLegPower,
    }),
  );
  return { weekNumber: pw.weekNumber, cycle: pw.cycle, sessions };
}

/** Une séance = un bucket primaire + (optionnellement) un bucket complément. */
interface SessionSlot {
  primary: StrengthBucket;
  /** Bucket secondaire pour pairer la séance (McEvoy : Lundi Tractions+Squat
   *  → primary=upper_strength, complement=lower_strength). `null` si moins
   *  de 2 focus entraînables ou si primary === 'mobility' (override). */
  complement: StrengthBucket | null;
}

/**
 * §324 — sibling anatomique force↔puissance d'un même segment. Sert à pairer un
 * seau « maintien » orphelin (sans créneau primaire) avec le primaire du même
 * segment : un jour jambes (force bas) accueille la puissance bas (saut), pas un
 * seau du haut du corps. Cohérent avec une séance S&C réelle.
 */
const BUCKET_SIBLING: Partial<Record<StrengthBucket, StrengthBucket>> = {
  upper_strength: 'upper_power',
  upper_power: 'upper_strength',
  lower_strength: 'lower_power',
  lower_power: 'lower_strength',
};

/**
 * Répartit `sessionsPerWeek` créneaux entre les seaux non-mobility selon leurs
 * allocations fractionnaires (méthode du plus grand reste). Mobility n'est pas
 * un "bucket principal" : c'est un échauffement systématique greffé sur chaque
 * séance (sauf si elle a été promue par l'override sécurité).
 *
 * Pour chaque créneau, choisit aussi un **complement bucket** (Vague C §293) :
 * si la séance primaire est focus#1, complement = focus#2 (et vice-versa).
 * Si primaire vient d'un bucket maintien, complement = top focus. Le résultat :
 * chaque séance combine 2 buckets entraînables comme dans la prépa McEvoy.
 */
function distributeSessionSlots(
  allocations: BucketAllocation[],
  sessionsPerWeek: number,
): SessionSlot[] {
  // Si mobility est en focus (override sécurité), elle compte comme un bucket principal.
  const candidates = allocations.filter((a) => {
    if (a.bucket === 'mobility') return a.role === 'focus';
    return true;
  });

  if (candidates.length === 0) {
    // Cas dégénéré : aucun bucket entraînable disponible → tout en mobility.
    return Array(sessionsPerWeek).fill({ primary: 'mobility', complement: null });
  }

  const items = candidates.map((a) => ({
    bucket: a.bucket,
    floor: Math.floor(a.sessionsPerWeek),
    frac: a.sessionsPerWeek - Math.floor(a.sessionsPerWeek),
  }));

  const baseSum = items.reduce((s, i) => s + i.floor, 0);
  const remaining = Math.max(0, sessionsPerWeek - baseSum);
  // Plus grand reste : on attribue +1 aux `remaining` buckets dont le reste est le plus élevé.
  const sortedByFrac = items.slice().sort((a, b) => b.frac - a.frac);
  const bonuses = new Set(sortedByFrac.slice(0, remaining).map((i) => i.bucket));

  const primaries: StrengthBucket[] = [];
  for (const item of items) {
    const count = item.floor + (bonuses.has(item.bucket) ? 1 : 0);
    for (let i = 0; i < count; i++) primaries.push(item.bucket);
  }

  // Pad si on n'a pas atteint le total (sécurité), tronc si on dépasse.
  while (primaries.length < sessionsPerWeek) {
    primaries.push(items[0].bucket);
  }
  const finalPrimaries = primaries.slice(0, sessionsPerWeek);

  // Détermine le complement par primaire (Vague C McEvoy).
  const focusBuckets = allocations
    .filter((a) => a.role === 'focus' && a.bucket !== 'mobility')
    .map((a) => a.bucket);

  // §324 — seaux entraînables alloués qui n'ont PAS décroché de créneau primaire
  // (typiquement 4 seaux non-mobilité pour 3 séances : 1 maintien reste orphelin).
  // Sans rien faire, le complément d'une séance « maintien » ré-utilise un focus
  // déjà couvert → l'orphelin disparaît du plan (cas Victoria : zéro puissance
  // jambes / ondulation sous-marine pour une dossiste sprint). On le place donc
  // en complément d'une séance à primaire maintien, sibling anatomique d'abord.
  const covered = new Set(finalPrimaries);
  const uncovered = allocations
    .filter((a) => a.bucket !== 'mobility' && !covered.has(a.bucket))
    .map((a) => a.bucket);

  return finalPrimaries.map((primary): SessionSlot => {
    // Un primaire focus garde l'appariement focus#1↔focus#2 (McEvoy). Seuls les
    // primaires « maintien » servent à héberger un orphelin (sans gonfler le
    // volume — c'est le créneau complément, pas un bloc en plus).
    const isFocus = focusBuckets.includes(primary);
    if (focusBuckets.length >= 2 && !isFocus && uncovered.length > 0) {
      const sibling = BUCKET_SIBLING[primary];
      const idx = sibling && uncovered.includes(sibling) ? uncovered.indexOf(sibling) : 0;
      const [complement] = uncovered.splice(idx, 1);
      return { primary, complement };
    }
    return { primary, complement: pickComplement(primary, focusBuckets) };
  });
}

/**
 * §327 — Garantit qu'au moins une séance de DÉVELOPPEMENT (jour hors amorce)
 * prenne le seau focus#1 en primaire, pour qu'il décroche son bloc 2 exos
 * (`PRIMARY_BLOCK_COUNT`, ex. tractions lestées + tirage poulie « schéma
 * papillon »). Sinon, quand les créneaux primaires de focus#1 tombent tous sur
 * des jours d'amorce PAP (duo lourd + explosif, jamais un bloc force complet),
 * le seau forcé n'est jamais DÉVELOPPÉ — retour terrain papillon 50 de François :
 * le tirage poulie (`upper_strength`, 2ᵉ staple) n'apparaissait dans aucune
 * séance. On échange un créneau focus#1 d'un jour amorce avec un créneau de DÉV
 * d'un seau NON-focus (pour ne pas priver focus#2 de son propre bloc dév).
 *
 * No-op si : focus#1 a déjà un créneau dév, ou il n'y a que des amorces / que du
 * dév, ou focus#1 n'est primaire nulle part. L'échange conserve l'ensemble des
 * créneaux (primaire + complément), il ne fait que les réassigner aux jours.
 */
function ensureFocusDevelopmentSession(
  slots: SessionSlot[],
  weekdays: number[],
  primerWeekdays: Set<number>,
  focusBuckets: StrengthBucket[],
): SessionSlot[] {
  if (focusBuckets.length === 0 || slots.length < 2) return slots;
  const topFocus = focusBuckets[0];
  const isPrimer = (i: number) => primerWeekdays.has(weekdays[i]);
  const devIdx = slots.map((_, i) => i).filter((i) => !isPrimer(i));
  const primerIdx = slots.map((_, i) => i).filter((i) => isPrimer(i));
  if (devIdx.length === 0 || primerIdx.length === 0) return slots;
  // focus#1 déjà développé un jour de DÉV ? rien à faire.
  if (devIdx.some((i) => slots[i].primary === topFocus)) return slots;
  // focus#1 primaire sur un jour d'amorce ?
  const srcPrimer = primerIdx.find((i) => slots[i].primary === topFocus);
  if (srcPrimer == null) return slots;
  // Cible DÉV à échanger : un seau NON-focus d'abord (squat/jambes → bon
  // potentiateur d'amorce après l'échange) ; sinon le premier DÉV disponible.
  const dstDev =
    devIdx.find((i) => !focusBuckets.includes(slots[i].primary)) ?? devIdx[0];
  const out = slots.slice();
  [out[srcPrimer], out[dstDev]] = [out[dstDev], out[srcPrimer]];
  return out;
}

/**
 * Pour une séance dont le bucket primaire est connu, choisit le bucket
 * complément à pairer (Vague C §293) :
 * - si primary est focus#1 → complement = focus#2 (et vice-versa).
 * - si primary est en maintien → complement = top focus.
 * - moins de 2 focus disponibles, ou primary === complement → null
 *   (séance mono-bucket, ancien comportement).
 */
function pickComplement(
  primary: StrengthBucket,
  focusBuckets: StrengthBucket[],
): StrengthBucket | null {
  if (focusBuckets.length < 2) return null;
  if (primary === 'mobility') return null; // override sécurité — mono-bucket
  if (primary === focusBuckets[0]) return focusBuckets[1];
  if (primary === focusBuckets[1]) return focusBuckets[0];
  // primary est un bucket de maintien → on paire avec le top focus.
  return focusBuckets[0];
}

/** Contexte jour-aware (§307) passé à `buildSession`. */
interface JourAwareContext {
  primerWeekdays: Set<number>;
  jourAware: boolean;
  forceBiasRequired: boolean;
  /**
   * `true` si un override sécurité mobilité (douleur intense / dysfonction) est
   * actif : la séance entière devient corrective, la PAP est supprimée.
   */
  mobilityOverrideActive: boolean;
  /** Seaux entraînables ordonnés par priorité (focus puis maintien). §307. */
  bucketPriorityOrder: StrengthBucket[];
  /**
   * §R5 — emphase core du template (0 si DB pré-migration). Si > 0 et qu'un exo
   * core admissible existe, un bloc tronc systématique est inséré dans la séance
   * de développement (après le warmup, avant le bloc primaire).
   */
  coreEmphasis: number;
  /**
   * §325 — `true` si les jambes ne sont couvertes par aucune séance de
   * développement (jours muscu surtout des amorces). L'explosif de l'amorce PAP
   * bascule alors sur `lower_power` (un saut) plutôt que de répéter la puissance
   * haute, pour garantir un minimum de jambes.
   */
  papPreferLegPower: boolean;
}

/**
 * Construit une séance multi-bucket : warmup mobility + bloc PRIMAIRE +
 * (optionnellement) bloc COMPLEMENT. Si `primary === 'mobility'` (override
 * sécurité), la séance est entièrement mobilité, mono-bucket.
 *
 * §307 — jour-aware : la séance reçoit son `weekday` et un `role` classé. Un
 * jour primer (`amorce_pap`) reçoit un chargement PAP dédié (lourd-court +
 * explosif + warmup, ≤3 exos). Un jour développement biaise son cycle vers
 * `force_max` si la semaine est en `maintien` et que le biais force est requis.
 * Une séance d'override mobilité (`mobilite_corrective`) garde son comportement.
 *
 * Ordre des `buckets` : [primary, complement?, 'mobility'?]. `buckets[0]` =
 * primary est utilisé par la RPC apply pour le nom du template
 * (`[Méso XX] S03 J2 · force_max · upper_strength`).
 */
function buildSession(
  sessionNumber: number,
  weekday: number,
  primary: StrengthBucket,
  complement: StrengthBucket | null,
  cycle: PeriodizationCycle,
  selected: Partial<Record<StrengthBucket, SelectedExercise[]>>,
  ctx: JourAwareContext,
): MesocycleSession {
  const mobilityPool = selected.mobility ?? [];

  // Une séance est corrective si elle est mobility-primary (override par slot,
  // comportement legacy) OU si l'override sécurité global rend toute la semaine
  // corrective — mais uniquement en mode jour-aware (§307). En legacy, seuls les
  // slots promus mobility restent correctifs, comme avant §307.
  const isMobilityOverride =
    primary === 'mobility' || (ctx.jourAware && ctx.mobilityOverrideActive);
  const role = classifyRole(weekday, ctx.primerWeekdays, isMobilityOverride, ctx.jourAware);

  // §307 — Amorce PAP : chargement dédié, ignore primary/complement classiques.
  if (role === 'amorce_pap') {
    return buildPapSession(sessionNumber, weekday, selected, mobilityPool, ctx.bucketPriorityOrder, ctx.papPreferLegPower);
  }

  let exercises: MesocycleExercise[];
  const buckets: StrengthBucket[] = [];

  if (isMobilityOverride) {
    // Cas override sécurité — la séance entière est mobilité corrective.
    // isWarmup=false ici car ce n'est pas un échauffement mais le focus
    // principal (l'effectiveWarmup côté toMesocycleExercise détectera
    // bucket=mobility et appliquera quand même le chargement endurance).
    exercises = mobilityPool
      .slice(0, MOBILITY_ONLY_COUNT)
      .map((s) => toMesocycleExercise(s, cycle, false));
    buckets.push('mobility');
  } else {
    // §307 — biais force des séances développement : une semaine de maintien
    // qui requiert le biais force est chargée comme force_max sur les blocs
    // principaux (warmup et override mobilité non affectés).
    const effectiveCycle: PeriodizationCycle =
      ctx.jourAware && ctx.forceBiasRequired && cycle === 'maintien' ? 'force_max' : cycle;

    const primaryPool = selected[primary] ?? [];
    const useComplement = complement != null && complement !== primary;
    const complementPool = useComplement ? (selected[complement] ?? []) : [];

    const primaryBlock = primaryPool
      .slice(0, PRIMARY_BLOCK_COUNT)
      .map((s) => toMesocycleExercise(s, effectiveCycle, false));
    const complementBlock = complementPool
      .slice(0, COMPLEMENT_BLOCK_COUNT)
      .map((s) => toMesocycleExercise(s, effectiveCycle, false));

    // §R5 (DRAFT) — bloc tronc systématique : inséré si le template porte une
    // emphase core > 0 ET qu'un exo core admissible existe (pool non vide après
    // filtres niveau/contre-indication). Chargé en endurance/contrôle (socle
    // permanent, jamais en pic) via `buildCoreExercise`. Tant que la DB n'a pas
    // de seau core (migration non appliquée), coreEmphasis = 0 → aucun bloc.
    const corePool = selected.core ?? [];
    const coreBlock =
      ctx.coreEmphasis > 0
        ? corePool.slice(0, CORE_BLOCK_COUNT).map((s) => buildCoreExercise(s))
        : [];

    // §318 (#2) — le warmup est dimensionné pour que le total reste ≤
    // MAX_SESSION_ITEMS : on rogne le warmup (le moins coûteux) avant les blocs
    // de travail, tout en gardant ≥ MIN_WARMUP_COUNT activation mobilité. Sans
    // bloc core, le total retombe au comportement historique (5).
    const nonWarmupCount =
      primaryBlock.length + complementBlock.length + coreBlock.length;
    const warmupCount = Math.max(
      MIN_WARMUP_COUNT,
      Math.min(MOBILITY_WARMUP_COUNT, MAX_SESSION_ITEMS - nonWarmupCount),
    );
    // §297 — Warmup items reçoivent isWarmup=true → chargement endurance
    // + intention activation, indépendamment du cycle de la semaine.
    const warmup = mobilityPool
      .slice(0, warmupCount)
      .map((s) => toMesocycleExercise(s, cycle, true));

    // Ordre chronologique : warmup → primary → complement → core (gainage en fin
    // de séance, n'entame pas la fraîcheur des blocs principaux).
    exercises = [...warmup, ...primaryBlock, ...complementBlock, ...coreBlock];

    // Ordre des tags buckets : primary en tête (pour le nom de session côté
    // RPC), puis complement, puis mobility, puis core.
    buckets.push(primary);
    if (useComplement && complementBlock.length > 0) {
      buckets.push(complement as StrengthBucket);
    }
    if (warmup.length > 0) buckets.push('mobility');
    if (coreBlock.length > 0) buckets.push('core');
  }

  return { sessionNumber, weekday, role, buckets, exercises };
}

// ── Amorce PAP (§307) ─────────────────────────────────────────────────────────

/** Charge un exercice PAP avec des paramètres explicites (hors chemin cycle). */
function buildPapExercise(
  selectedEx: SelectedExercise,
  params: { sets: number; reps: number; intensityPct1rm: number | null; restSeconds: number; intention: string },
): MesocycleExercise {
  const ex = selectedEx.exercise;
  return {
    exerciseId: ex.id,
    nomExercice: ex.nomExercice,
    bucket: (ex.bucket ?? 'mobility') as StrengthBucket,
    isCore: ex.isCore,
    sets: params.sets,
    reps: params.reps,
    intensityPct1rm: params.intensityPct1rm,
    restSeconds: params.restSeconds,
    intention: params.intention,
    substituted: selectedEx.substituted,
    originalExerciseId: selectedEx.originalExerciseId,
    illustrationGif: ex.illustrationGif,
  };
}

/** Premier exo core d'un seau du pool, sinon le premier disponible, sinon null. */
function firstCore(pool: SelectedExercise[]): SelectedExercise | null {
  return pool.find((s) => s.exercise.isCore) ?? pool[0] ?? null;
}

/**
 * Construit une séance d'amorce PAP (§307) : 1 potentiateur lourd-court (seau
 * de force le plus prioritaire présent) + 1 explosif (seau de puissance le plus
 * prioritaire présent) + 1 warmup mobilité. Volume mini (≤3 exos) pour rester
 * frais avant le sprint piscine. Ne jette jamais : inclut seulement ce qui existe.
 */
function buildPapSession(
  sessionNumber: number,
  weekday: number,
  selected: Partial<Record<StrengthBucket, SelectedExercise[]>>,
  mobilityPool: SelectedExercise[],
  bucketPriorityOrder: StrengthBucket[],
  papPreferLegPower: boolean,
): MesocycleSession {
  const exercises: MesocycleExercise[] = [];
  const buckets: StrengthBucket[] = [];

  // Le seau le plus prioritaire (parmi les seaux alloués, ordre focus→maintien)
  // d'une catégorie donnée qui dispose d'au moins un exo sélectionné.
  const pickByPriority = (category: StrengthBucket[]): StrengthBucket | null =>
    bucketPriorityOrder.find(
      (b) => category.includes(b) && (selected[b]?.length ?? 0) > 0,
    ) ?? null;

  // Potentiateur lourd-court : seau de force le plus prioritaire présent.
  const strengthBucket = pickByPriority(STRENGTH_BUCKETS);
  if (strengthBucket) {
    const sel = firstCore(selected[strengthBucket] ?? []);
    if (sel) {
      exercises.push(
        buildPapExercise(sel, {
          sets: PAP_POTENTIATOR.sets,
          reps: PAP_POTENTIATOR.reps,
          // `null` (force% non renseignée) est intentionnel : charge lourde « au
          // ressenti » plutôt que 0 % — un potentiateur n'est jamais à vide.
          intensityPct1rm: sel.exercise.pourcentageCharge1rmForce,
          restSeconds: PAP_POTENTIATOR.restSeconds,
          intention: 'Potentiateur lourd — explosivité, pas de fatigue.',
        }),
      );
      buckets.push(strengthBucket);
    }
  }

  // Explosif : seau de puissance le plus prioritaire présent. §325 — si les
  // jambes seraient sinon totalement absentes du plan, l'explosif bascule sur
  // `lower_power` (un saut) même un jour amorce, plutôt que de répéter la
  // puissance haute — garantit un minimum de jambes (retour terrain Victoria).
  const powerBucket =
    papPreferLegPower && (selected.lower_power?.length ?? 0) > 0
      ? 'lower_power'
      : pickByPriority(POWER_BUCKETS);
  if (powerBucket) {
    const sel = firstCore(selected[powerBucket] ?? []);
    if (sel) {
      exercises.push(
        buildPapExercise(sel, {
          sets: PAP_EXPLOSIVE.sets,
          reps: PAP_EXPLOSIVE.reps,
          intensityPct1rm: sel.exercise.pourcentageCharge1rmForce ?? 0,
          restSeconds: PAP_EXPLOSIVE.restSeconds,
          intention: 'Explosif — vitesse maximale, potentialise le sprint.',
        }),
      );
      buckets.push(powerBucket);
    }
  }

  // 1 warmup mobilité (chargement endurance via le chemin existant).
  const warmupSel = mobilityPool[0] ?? null;
  if (warmupSel) {
    exercises.push(toMesocycleExercise(warmupSel, 'prepa_generale', true));
    buckets.push('mobility');
  }

  return { sessionNumber, weekday, role: 'amorce_pap', buckets, exercises };
}

/**
 * §R5 (DRAFT) — charge un exercice du seau `core` (tronc / gainage).
 *
 * Le core est un **socle permanent** (cf. design R5 §4) : chargé en
 * endurance/contrôle quelle que soit la semaine (jamais en pic/force max), comme
 * la mobilité. On lit les colonnes `*_endurance` du catalogue (séries courtes,
 * tenues), repos clampé à 60 s. Intention explicite « transfert/gainage ».
 */
function buildCoreExercise(selectedEx: SelectedExercise): MesocycleExercise {
  const ex = selectedEx.exercise;
  return {
    exerciseId: ex.id,
    nomExercice: ex.nomExercice,
    bucket: 'core',
    isCore: ex.isCore,
    sets: ex.nbSeriesEndurance ?? 3,
    reps: ex.nbRepsEndurance ?? 12,
    intensityPct1rm: ex.pourcentageCharge1rmEndurance ?? 0,
    restSeconds: Math.min(60, ex.recupSeriesEndurance ?? 45),
    intention: 'Tronc / transfert — gainage contrôlé, anti-rotation, pas l’effort max.',
    substituted: selectedEx.substituted,
    originalExerciseId: selectedEx.originalExerciseId,
    illustrationGif: ex.illustrationGif,
  };
}

/** Centre d'un intervalle, arrondi à l'entier. */
function midRange(range: readonly [number, number]): number {
  return Math.round((range[0] + range[1]) / 2);
}

/**
 * Charge un exercice avec les paramètres adaptés au contexte (§297).
 *
 * **Règle 1 — Échauffement (isWarmup ou bucket=mobility)** :
 *   Quel que soit le cycle, utilise les colonnes `*_endurance` du catalogue
 *   (charges légères, séries courtes, activation). Repos clampé à 60s max.
 *   Intention : « Activation et préparation ».
 *
 * **Règle 2 — Cycles `catalogue`** (`prepa_generale` / `force_max`) :
 *   Lit directement les colonnes `*_endurance` ou `*_force` de `dim_exercices`.
 *
 * **Règle 3 — Cycles dérivés** (`puissance` / `maintien` / `affutage` / `pic`) :
 *   Part des colonnes `*_force` du catalogue (sets, reps, %1RM, repos par
 *   exercice) et applique une modulation propre au cycle :
 *     - `puissance` : %1RM = max(0, force - 15) — charges modérées déplacées
 *       vite. Box Jump (force=0%) reste 0%, Tractions lestées (force=85%) → 70%.
 *     - `maintien`  : sets × 0.5 (volume réduit), %1RM tenu.
 *     - `affutage`  : sets × 0.4 (volume décroissant), %1RM tenu.
 *     - `pic`       : 2 séries × 2-4 reps, %1RM × 0.6 (charges légères explosives).
 *   L'intention vient du `scheme.intention` du cycle.
 *
 * Cf. `docs/plans/bilan-muscu-cycles-vocabulaire.md` § 3 pour la doctrine.
 */
function toMesocycleExercise(
  selectedEx: SelectedExercise,
  cycle: PeriodizationCycle,
  isWarmup: boolean,
): MesocycleExercise {
  const ex = selectedEx.exercise;
  const cycleConfig = PERIODIZATION_CYCLES[cycle];
  // Mobility-as-focus (override sécurité) → traité comme warmup pour le
  // chargement (charges légères, repos courts) — l'intention diffère mais
  // les paramètres restent ceux du catalogue endurance.
  const effectiveWarmup = isWarmup || ex.bucket === 'mobility';

  let sets: number;
  let reps: number;
  let intensityPct1rm: number | null;
  let restSeconds: number;
  let intention: string | null;

  if (effectiveWarmup) {
    // Règle 1 — Échauffement : colonnes endurance du catalogue, repos clampé.
    sets = ex.nbSeriesEndurance ?? 2;
    reps = ex.nbRepsEndurance ?? 10;
    intensityPct1rm = ex.pourcentageCharge1rmEndurance ?? 0;
    restSeconds = Math.min(60, ex.recupSeriesEndurance ?? 45);
    intention = isWarmup
      ? "Activation et préparation — qualité du mouvement, pas l'effort."
      : 'Mobilité corrective — contrôle, amplitude, gainage actif.';
  } else if (cycleConfig.loading.kind === 'catalogue') {
    // Règle 2 — prepa_generale ou force_max : lecture directe du catalogue.
    if (cycleConfig.loading.column === 'endurance') {
      sets = ex.nbSeriesEndurance ?? 2;
      reps = ex.nbRepsEndurance ?? 10;
      intensityPct1rm = ex.pourcentageCharge1rmEndurance;
      restSeconds = ex.recupSeriesEndurance ?? 60;
    } else {
      sets = ex.nbSeriesForce ?? 4;
      reps = ex.nbRepsForce ?? 5;
      intensityPct1rm = ex.pourcentageCharge1rmForce;
      restSeconds = ex.recupSeriesForce ?? 180;
    }
    intention = null;
  } else {
    // Règle 3 — Cycles dérivés (puissance/maintien/affutage/pic) :
    // base = colonnes *_force du catalogue, modulation par cycle.
    const baseSets = ex.nbSeriesForce ?? 4;
    const baseReps = ex.nbRepsForce ?? 5;
    const baseIntensity = ex.pourcentageCharge1rmForce;
    const baseRest = ex.recupSeriesForce ?? 180;

    if (cycle === 'puissance') {
      sets = baseSets;
      reps = baseReps;
      // Charges modérées déplacées vite : -15 pts vs force max. Pliométrie
      // pure (catalogue=0%) reste 0% — la max() le garantit.
      intensityPct1rm = baseIntensity != null ? Math.max(0, baseIntensity - 15) : 0;
      restSeconds = baseRest;
    } else if (cycle === 'maintien') {
      sets = Math.max(2, Math.round(baseSets * 0.5));
      reps = baseReps;
      intensityPct1rm = baseIntensity; // intensité tenue
      restSeconds = baseRest;
    } else if (cycle === 'affutage') {
      sets = Math.max(1, Math.round(baseSets * 0.4));
      reps = baseReps;
      intensityPct1rm = baseIntensity; // intensité tenue, volume décroissant
      restSeconds = baseRest;
    } else {
      // 'pic' — activation SNC, charges légères explosives.
      sets = 2;
      reps = Math.max(2, Math.min(4, baseReps));
      intensityPct1rm =
        baseIntensity != null ? Math.round(baseIntensity * 0.6) : 0;
      restSeconds = baseRest;
    }
    intention = cycleConfig.loading.scheme.intention;
  }

  return {
    exerciseId: ex.id,
    nomExercice: ex.nomExercice,
    bucket: (ex.bucket ?? 'mobility') as StrengthBucket,
    isCore: ex.isCore,
    sets,
    reps,
    intensityPct1rm,
    restSeconds,
    intention,
    substituted: selectedEx.substituted,
    originalExerciseId: selectedEx.originalExerciseId,
    illustrationGif: ex.illustrationGif,
  };
}

// ── reasoning : data_confidence, psych flag, contre-indications ──────────────

interface BuildReasoningInput {
  bucketScores: BucketScores;
  bucketPriorities: BucketPriority[];
  bucketAllocations: BucketAllocation[];
  input: MesocycleInput;
  painZones: string[];
}

function buildReasoning(args: BuildReasoningInput): MesocycleReasoning {
  const { bucketScores, bucketPriorities, bucketAllocations, input, painZones } = args;

  const dataConfidence = computeDataConfidence(input);
  const lowestBaremeConfidence = computeLowestBaremeConfidence(input);
  const psychScore = bucketScores.psychology;
  const psychFlag = psychScore !== null && psychScore < 40;
  const activeContraindications = computeActiveContraindications(painZones, input.exerciseCatalog);

  return {
    bucketScores,
    bucketPriorities,
    bucketAllocations,
    dataConfidence,
    psychFlag,
    lowestBaremeConfidence,
    activeContraindications,
  };
}

/** 7 sources (5 KPI + physical_tests + questionnaire). Seuil partial = ≥ 4. */
function computeDataConfidence(input: MesocycleInput): DataConfidence {
  const kpiKeys: StrengthKpiKey[] = [
    'vertical_jump',
    'broad_jump',
    'imtp',
    'weighted_pullup',
    'medball_vertical_throw',
  ];
  const presentKpis = new Set(input.kpiMeasurements.map((m) => m.kpi_key));
  let present = kpiKeys.filter((k) => presentKpis.has(k)).length;
  if (input.assessment.physical_tests) present++;
  if (input.assessment.questionnaire) present++;

  if (present >= 7) return 'full';
  if (present >= 4) return 'partial';
  return 'low';
}

/** Confiance minimale parmi les barèmes effectivement consultés. */
function computeLowestBaremeConfidence(input: MesocycleInput): BaremeConfidence {
  const presentKpis = new Set(input.kpiMeasurements.map((m) => m.kpi_key));
  if (presentKpis.size === 0) return 'placeholder';

  let lowestRank = Infinity;
  let lowest: BaremeConfidence = 'placeholder';
  for (const k of presentKpis) {
    const entry = getBareme(k, input.athlete.sex, input.athlete.ageBand);
    const rank = CONFIDENCE_ORDER[entry.confidence];
    if (rank < lowestRank) {
      lowestRank = rank;
      lowest = entry.confidence;
    }
  }
  return lowest;
}

/** Zones de douleur qui croisent au moins une contre-indication du catalogue. */
function computeActiveContraindications(
  painZones: string[],
  catalog: CatalogExercise[],
): string[] {
  const catalogZones = new Set(catalog.flatMap((e) => e.contraindicationZones));
  return painZones.filter((z) => catalogZones.has(z));
}
