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
  StrengthBucket,
  StrengthKpiKey,
  StrengthKpiMeasurement,
  StrengthPeriodizationTemplate,
  StrengthPhysicalTests,
} from '@/lib/api/types';
import { getBareme, kpiScore } from './kpiBaremes';
import type {
  AllBucket,
  BucketAllocation,
  BucketPriority,
  BucketScores,
  MesocycleInput,
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

/** Détecte les zones de douleur intense (intensity ≥ 3). */
function intensePainZones(painReports: PainReport[]): string[] {
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
  painReports: PainReport[],
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
