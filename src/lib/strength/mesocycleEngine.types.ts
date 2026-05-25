/**
 * Types de l'objet mésocycle — Moteur de génération Bilan Muscu (Chantier C).
 *
 * Ce fichier définit l'interface-pivot du chantier : `GeneratedMesocycle`.
 * Toutes les fonctions du moteur (`scoreBuckets`, `prioritizeBuckets`, …) et
 * l'intégration (RPC, UI) s'y branchent.
 *
 * Aucune I/O ici — types purs, sans import Supabase.
 *
 * @see mesocycleEngine.ts — les 6 fonctions qui produisent/consomment ces types.
 * @see docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md §5-6
 */

import type {
  StrengthBucket,
  PeriodizationCycle,
  PeriodizationStructure,
  PeriodizationTemplateKind,
} from '@/lib/api/types';
import type { BaremeConfidence } from '@/lib/strength/kpiBaremes';

// ── Scoring des seaux ──────────────────────────────────────────────────────────

/**
 * Nom du seau « psychologie » — non entraînable (pas d'exercices), produit un
 * flag dans la sortie plutôt que du volume.
 */
export type PsychBucket = 'psychology';

/**
 * Ensemble des 6 seaux du Bilan Muscu : 5 entraînables (`StrengthBucket`) +
 * 1 psychologique (`psychology`).
 */
export type AllBucket = StrengthBucket | PsychBucket;

/**
 * Score 0-100 par seau. `null` si aucune donnée disponible (KPI manquant,
 * bilan mobilité absent…) — abaisse `data_confidence` mais ne bloque pas.
 */
export type BucketScores = Record<AllBucket, number | null>;

// ── Priorité des seaux ────────────────────────────────────────────────────────

/**
 * Seau priorisé après calcul combiné `bucket_emphasis × (100 − score)` et
 * application des overrides de sécurité (douleur intense, dysfonction).
 */
export interface BucketPriority {
  /** Identifiant du seau. */
  bucket: AllBucket;
  /**
   * Score combiné = `bucket_emphasis × (100 − score)`.
   * Plus élevé → plus prioritaire.
   */
  score: number;
  /**
   * Rang de priorité (1 = le plus prioritaire).
   * Le `mobility` est forcé à 1 en cas de douleur intense ou dysfonction.
   */
  rank: number;
  /**
   * Raison lisible FR expliquant le rang — affiché dans l'aperçu du nageur
   * et l'audit coach (« le pourquoi »).
   *
   * Exemples : "Force basse + épreuve sprint = focus" ;
   *            "Douleur épaule → correctif prioritaire".
   */
  rationale: string;
  /** `true` si le rang a été forcé par un override de sécurité. */
  overrideApplied: boolean;
}

// ── Allocation de volume ──────────────────────────────────────────────────────

/**
 * Volume alloué à un seau entraînable pour une semaine type.
 * `psychology` n'apparaît pas ici — il produit un `psychFlag` à la place.
 */
export interface BucketAllocation {
  bucket: StrengthBucket;
  /**
   * Nombre de séances allouées à ce seau sur la semaine.
   * Peut être fractionnaire (0.5 = un slot partagé) en interne mais sera
   * arrondi au moment de la génération des séances.
   */
  sessionsPerWeek: number;
  /** `'focus'` (2 seaux prioritaires, ~60 %) ou `'maintien'` (~40 %). */
  role: 'focus' | 'maintien';
}

// ── Exercice chargé ────────────────────────────────────────────────────────────

/**
 * Un exercice sélectionné + ses paramètres de charge pour une séance.
 * La charge provient soit du catalogue (`dim_exercices`) soit du schéma
 * générique du cycle (cf. `periodizationCycles.ts`).
 */
export interface MesocycleExercise {
  /** ID de l'exercice dans `dim_exercices`. */
  exerciseId: number;
  /** Nom FR de l'exercice (snapshot au moment de la génération). */
  nomExercice: string;
  /** Seau auquel l'exercice appartient. */
  bucket: StrengthBucket;
  /**
   * `true` si l'exercice est exercice « cœur » du seau (is_core = true dans
   * `dim_exercices`) — affiché en premier dans l'UI.
   */
  isCore: boolean;
  /** Nombre de séries. */
  sets: number;
  /** Nombre de répétitions par série. */
  reps: number;
  /**
   * Charge en % du 1RM. `null` pour les exercices au poids du corps ou de
   * mobilité (pas de notion de 1RM).
   */
  intensityPct1rm: number | null;
  /** Récupération entre séries, en secondes. */
  restSeconds: number;
  /**
   * Intention d'exécution FR (ex : « Déplacer à vitesse maximale »).
   * Vient du schéma de charge générique ou du catalogue.
   */
  intention: string | null;
  /**
   * `true` si l'exercice a été substitué à cause d'une contre-indication
   * (intersection `contraindication_zones` ∩ `painZones`).
   */
  substituted: boolean;
  /** ID de l'exercice original si `substituted === true`. `null` sinon. */
  originalExerciseId: number | null;
  /** URL de l'illustration GIF (propagée depuis le catalogue). */
  illustrationGif: string | null;
}

// ── Exercice sélectionné (intermédiaire) ──────────────────────────────────────

/**
 * Exercice retenu par `selectExercises` pour un seau, avant chargement par cycle.
 *
 * Sortie de `selectExercises` : on a filtré le catalogue (seau + niveau du
 * nageur + zones de douleur) et trié (core en premier). La charge (sets,
 * reps, %1RM, récup, intention) n'est pas encore appliquée — elle dépend du
 * cycle de la semaine et est posée par `generateMesocycle`.
 */
export interface SelectedExercise {
  /** L'exercice du catalogue retenu. */
  exercise: CatalogExercise;
  /**
   * `true` si cet exercice a été choisi en remplacement d'un exercice `core`
   * exclu pour cause de contre-indication (zone de douleur).
   */
  substituted: boolean;
  /** Id de l'exercice qu'il remplace, ou `null`. */
  originalExerciseId: number | null;
}

// ── Séance ─────────────────────────────────────────────────────────────────────

/**
 * Rôle d'une séance dans la logique « jour-aware » (amorce PAP §307).
 *
 * - `amorce_pap` : micro-dose post-activation-potentiation un jour de sprint
 *   piscine (lundi/jeudi par défaut) — 1 lourd-court + 1 explosif + warmup.
 * - `developpement` : séance « off-pool » qui porte le vrai stimulus de
 *   périodisation, biaisée force.
 * - `mobilite_corrective` : séance dictée par l'override sécurité mobilité
 *   (douleur intense / dysfonction) — jamais convertie en PAP.
 */
export type SessionRole = 'amorce_pap' | 'developpement' | 'mobilite_corrective';

/**
 * Une séance d'une semaine du mésocycle.
 */
export interface MesocycleSession {
  /**
   * Numéro de la séance dans la semaine (1, 2, 3…).
   * Correspond à l'ordre dans `MesocycleWeek.sessions`.
   */
  sessionNumber: number;
  /**
   * Jour de la semaine sur lequel tombe la séance (0=Lun…6=Dim). Posé par le
   * moteur : en mode jour-aware via `input.weekdays`, sinon dérivé d'une carte
   * legacy alignée sur la RPC `apply_strength_mesocycle`.
   */
  weekday: number;
  /** Rôle de la séance (classification jour-aware §307). */
  role: SessionRole;
  /**
   * Seaux travaillés dans cette séance (peut être plusieurs si séances mixtes).
   */
  buckets: StrengthBucket[];
  /** Exercices ordonnés pour cette séance (mobilité d'abord, puis les blocs). */
  exercises: MesocycleExercise[];
}

// ── Semaine périodisée (intermédiaire) ────────────────────────────────────────

/**
 * Une semaine après distribution des phases du template — uniquement le cycle,
 * sans les séances.
 *
 * Sortie de `periodize` : l'orchestrateur `generateMesocycle` y greffera les
 * séances (`MesocycleSession[]`) pour produire les `MesocycleWeek` finales.
 */
export interface PeriodizedWeek {
  /** Numéro de la semaine dans le mésocycle (1 = première semaine). */
  weekNumber: number;
  /** Cycle de périodisation de cette semaine. */
  cycle: PeriodizationCycle;
}

// ── Semaine ────────────────────────────────────────────────────────────────────

/**
 * Une semaine du mésocycle.
 */
export interface MesocycleWeek {
  /** Numéro de la semaine (1 = première semaine). */
  weekNumber: number;
  /** Cycle de périodisation de cette semaine (ex : `'force_max'`). */
  cycle: PeriodizationCycle;
  /** Séances de la semaine. */
  sessions: MesocycleSession[];
}

// ── Snapshot du raisonnement ──────────────────────────────────────────────────

/**
 * Confiance globale dans les données disponibles au moment de la génération.
 *
 * - `full` : toutes les mesures KPI + bilan coach disponibles.
 * - `partial` : au moins une mesure KPI manquante ou bilan coach incomplet.
 * - `low` : plus de la moitié des mesures manquantes.
 */
export type DataConfidence = 'full' | 'partial' | 'low';

/**
 * Snapshot du raisonnement du moteur — affiché dans l'aperçu nageur et
 * l'audit coach. Permet de comprendre « le pourquoi » de chaque choix.
 */
export interface MesocycleReasoning {
  /** Scores 0-100 des 6 seaux (null si donnée manquante). */
  bucketScores: BucketScores;
  /** Seaux ordonnés par priorité décroissante. */
  bucketPriorities: BucketPriority[];
  /** Allocations de volume par seau entraînable. */
  bucketAllocations: BucketAllocation[];
  /**
   * Confiance globale dans les données.
   * Abaissée automatiquement si des KPI ou le bilan coach sont manquants.
   */
  dataConfidence: DataConfidence;
  /**
   * `true` si le score `psychology` est bas (< 40) — recommandation de soutien
   * affiché à côté du plan (pas de volume dédié).
   */
  psychFlag: boolean;
  /**
   * Niveau de confiance le plus bas parmi les barèmes KPI utilisés.
   * Reflète la fiabilité des normes (solid > transposed > placeholder).
   */
  lowestBaremeConfidence: BaremeConfidence;
  /**
   * Liste des zones de douleur déclarées ayant entraîné une exclusion ou
   * substitution d'exercice.
   */
  activeContraindications: string[];
}

// ── Objet mésocycle ─────────────────────────────────────────────────────────

/**
 * Mésocycle complet généré par le moteur.
 *
 * C'est l'**interface-pivot du Chantier C+D** : produite par `generateMesocycle`,
 * elle est sérialisée en JSON pour la RPC `apply_strength_mesocycle` (Phase 4)
 * et consommée par l'UI d'aperçu (Phase 5).
 */
export interface GeneratedMesocycle {
  /** Semaines du mésocycle, dans l'ordre (index 0 = semaine 1). */
  weeks: MesocycleWeek[];
  /**
   * Nombre total de semaines (= `weeks.length`, dénormalisé pour accès rapide).
   */
  totalWeeks: number;
  /**
   * Nombre de séances par semaine (= paramètre d'entrée, dénormalisé).
   */
  sessionsPerWeek: number;
  /** ID du template de périodisation utilisé (snapshot). */
  templateId: string;
  /** Snapshot du raisonnement du moteur (scores, priorités, confiance). */
  reasoning: MesocycleReasoning;
  /** Version du moteur ayant produit ce mésocycle (semver). */
  engineVersion: string;
}

// ── Input du moteur ───────────────────────────────────────────────────────────

/**
 * Un exercice du catalogue `dim_exercices` taggé (Chantier A, migration 00164).
 * Représentation minimale nécessaire au moteur — pas d'I/O, passée en paramètre.
 */
export interface CatalogExercise {
  id: number;
  nomExercice: string;
  bucket: StrengthBucket | null;
  /** Niveau de difficulté de l'exercice. `null` si non taggé. */
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  /** Zones anatomiques contre-indiquées (ex : `['shoulder', 'knee']`). */
  contraindicationZones: string[];
  /**
   * Nages pour lesquelles cet exo est un préhab spécifique (§306 Phase 2).
   * Quand le mésocycle cible une de ces nages, l'exo est préféré (remonté
   * au-dessus des non-cores ordinaires de son seau) sans déloger un core de
   * force. Ex : `['breaststroke']` pour les exos adducteurs.
   */
  strokePrehabAffinity: string[];
  /** `true` si exercice fondamental du seau (affiché en premier). */
  isCore: boolean;
  /** URL de l'illustration GIF (ou null si l'exercice n'en a pas). */
  illustrationGif: string | null;
  // Paramètres de charge catalogue (stratégie `catalogue` des cycles).
  nbSeriesEndurance: number | null;
  nbRepsEndurance: number | null;
  pourcentageCharge1rmEndurance: number | null;
  recupSeriesEndurance: number | null;
  nbSeriesForce: number | null;
  nbRepsForce: number | null;
  pourcentageCharge1rmForce: number | null;
  recupSeriesForce: number | null;
}

/**
 * Données d'entrée du moteur `generateMesocycle`.
 *
 * Toutes les dépendances (évaluation, mesures KPI, catalogue, template) sont
 * passées en paramètre — le moteur est pur, sans I/O.
 */
export interface MesocycleInput {
  /** Évaluation Bilan Muscu complétée (Chantier B). */
  assessment: {
    id: string;
    athlete_id: number;
    questionnaire: import('@/lib/api/types').StrengthQuestionnaire | null;
    physical_tests: import('@/lib/api/types').StrengthPhysicalTests | null;
  };
  /** Mesures KPI disponibles pour cet athlète (peuvent être partielles). */
  kpiMeasurements: import('@/lib/api/types').StrengthKpiMeasurement[];
  /** Données démographiques de l'athlète pour les barèmes. */
  athlete: {
    sex: import('@/lib/strength/kpiBaremes').BaremeSex;
    ageBand: import('@/lib/strength/kpiBaremes').AgeBand;
    /** Niveau de pratique muscu (filtre les exercices). */
    level: 'beginner' | 'intermediate' | 'advanced';
    /** Tier de performance (cale les barèmes KPI). Défaut applicatif : 'club'. */
    performanceTier: import('@/lib/strength/kpiBaremes').PerformanceTier;
  };
  /** Template de périodisation choisi par le nageur. */
  template: import('@/lib/api/types').StrengthPeriodizationTemplate;
  /** Durée cible saisie par le nageur (en semaines). */
  targetWeekCount: number;
  /** Nombre de séances par semaine (relu de l'évaluation, ajustable). */
  sessionsPerWeek: number;
  /** Jours muscu cochés (0=Lun…6=Dim), triés, sans samedi(5). Si absent → mode legacy. */
  weekdays?: number[];
  /** Sous-ensemble de weekdays en amorce PAP. Défaut: {0,3} ∩ weekdays. */
  primerWeekdays?: number[];
  /**
   * Catalogue d'exercices taggés (dim_exercices, issu de la migration 00164).
   * Passé en paramètre pour que le moteur reste pur.
   */
  exerciseCatalog: CatalogExercise[];
}

// ── Taxonomie nage × distance (§305) ─────────────────────────────────────────

export type StrokeKey = 'freestyle' | 'butterfly' | 'backstroke' | 'breaststroke' | 'medley';
export type DistanceKey = '50' | '100' | '200' | '400plus';

/** Multiplicateur par seau d'une nage vs crawl (crawl ≡ 1.0). §305. */
export interface StrokeSignature {
  stroke_key: StrokeKey;
  label: string;
  mult: Record<StrengthBucket, number>;
}

/** Emphase canonique (ancrée crawl) + arc de périodisation d'une distance. §305. */
export interface DistanceProfile {
  distance_key: DistanceKey;
  kind: PeriodizationTemplateKind;
  label: string;
  emphasis: Record<StrengthBucket, number>;
  structure: PeriodizationStructure;
  min_week_count: number;
  max_week_count: number;
}
