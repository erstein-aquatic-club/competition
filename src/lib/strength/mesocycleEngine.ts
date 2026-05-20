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
import { getBareme, kpiScore } from './kpiBaremes';
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
  return kpiScore(bareme.anchors, m.value);
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
  };
}

// ── prioritizeBuckets ────────────────────────────────────────────────────────

/** Tous les seaux dans un ordre stable (utilisé pour itérer et casser les égalités). */
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
): Partial<Record<StrengthBucket, SelectedExercise[]>> {
  const athleteLevelNum = LEVEL_ORDER[athleteLevel];
  const painSet = new Set(painZones);

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

    // Tri : core en premier, puis niveau décroissant (intermediate > beginner > null).
    const ordered = safe.slice().sort((a, b) => {
      if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
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
export const ENGINE_VERSION = '1.0.0';

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
  );

  const periodizedWeeks = periodize(input.template, input.targetWeekCount);

  const weeks: MesocycleWeek[] = periodizedWeeks.map((pw) =>
    buildWeek(pw, bucketAllocations, selected, input.sessionsPerWeek),
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

/** Pour une semaine, construit `sessionsPerWeek` séances chargées. */
function buildWeek(
  pw: PeriodizedWeek,
  allocations: BucketAllocation[],
  selected: Partial<Record<StrengthBucket, SelectedExercise[]>>,
  sessionsPerWeek: number,
): MesocycleWeek {
  const slots = distributeSessionSlots(allocations, sessionsPerWeek);
  const sessions: MesocycleSession[] = slots.map((slot, idx) =>
    buildSession(idx + 1, slot.primary, slot.complement, pw.cycle, selected),
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

  return finalPrimaries.map((primary) => ({
    primary,
    complement: pickComplement(primary, focusBuckets),
  }));
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

/**
 * Construit une séance multi-bucket : warmup mobility + bloc PRIMAIRE +
 * (optionnellement) bloc COMPLEMENT. Si `primary === 'mobility'` (override
 * sécurité), la séance est entièrement mobilité, mono-bucket.
 *
 * Ordre des `buckets` : [primary, complement?, 'mobility'?]. `buckets[0]` =
 * primary est utilisé par la RPC apply pour le nom du template
 * (`[Méso XX] S03 J2 · force_max · upper_strength`).
 */
function buildSession(
  sessionNumber: number,
  primary: StrengthBucket,
  complement: StrengthBucket | null,
  cycle: PeriodizationCycle,
  selected: Partial<Record<StrengthBucket, SelectedExercise[]>>,
): MesocycleSession {
  const mobilityPool = selected.mobility ?? [];

  let exercises: MesocycleExercise[];
  const buckets: StrengthBucket[] = [];

  if (primary === 'mobility') {
    // Cas override sécurité — la séance entière est mobilité.
    exercises = mobilityPool
      .slice(0, MOBILITY_ONLY_COUNT)
      .map((s) => toMesocycleExercise(s, cycle));
    buckets.push('mobility');
  } else {
    const primaryPool = selected[primary] ?? [];
    const useComplement = complement != null && complement !== primary;
    const complementPool = useComplement ? (selected[complement] ?? []) : [];

    const warmup = mobilityPool
      .slice(0, MOBILITY_WARMUP_COUNT)
      .map((s) => toMesocycleExercise(s, cycle));
    const primaryBlock = primaryPool
      .slice(0, PRIMARY_BLOCK_COUNT)
      .map((s) => toMesocycleExercise(s, cycle));
    const complementBlock = complementPool
      .slice(0, COMPLEMENT_BLOCK_COUNT)
      .map((s) => toMesocycleExercise(s, cycle));

    // Ordre chronologique : warmup → primary → complement.
    exercises = [...warmup, ...primaryBlock, ...complementBlock];

    // Ordre des tags buckets : primary en tête (pour le nom de session côté
    // RPC), puis complement, puis mobility.
    buckets.push(primary);
    if (useComplement && complementBlock.length > 0) {
      buckets.push(complement as StrengthBucket);
    }
    if (warmup.length > 0) buckets.push('mobility');
  }

  return { sessionNumber, buckets, exercises };
}

/** Centre d'un intervalle, arrondi à l'entier. */
function midRange(range: readonly [number, number]): number {
  return Math.round((range[0] + range[1]) / 2);
}

/**
 * Charge un exercice catalogue avec les paramètres dictés par le cycle :
 * - `catalogue.endurance` → colonnes `*_endurance` de `dim_exercices`,
 * - `catalogue.force`     → colonnes `*_force`,
 * - `generique`           → schéma de charge du cycle (midpoint des intervalles).
 *
 * Fallbacks défensifs si une colonne attendue est nulle (ex : mobility n'a pas
 * de %1RM ni de schéma force).
 */
function toMesocycleExercise(
  selectedEx: SelectedExercise,
  cycle: PeriodizationCycle,
): MesocycleExercise {
  const ex = selectedEx.exercise;
  const cycleConfig = PERIODIZATION_CYCLES[cycle];

  let sets: number;
  let reps: number;
  let intensityPct1rm: number | null;
  let restSeconds: number;
  let intention: string | null;

  if (cycleConfig.loading.kind === 'catalogue') {
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
    const scheme = cycleConfig.loading.scheme;
    sets = midRange(scheme.sets);
    reps = midRange(scheme.reps);
    intensityPct1rm = midRange(scheme.intensityPct1rm);
    restSeconds = midRange(scheme.restSeconds);
    intention = scheme.intention;
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
