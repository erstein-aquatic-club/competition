/**
 * Stratégie de chargement par cycle de périodisation — Bilan Muscu.
 *
 * Config statique (données + types, PAS de moteur). Déclare, pour chacun des
 * 6 cycles du vocabulaire `PeriodizationCycle`, comment le moteur de génération
 * (Chantier C, hors scope ici) obtiendra les paramètres séries/reps/%1RM/récup
 * d'une semaine de ce cycle.
 *
 * Chargement hybride validé par le coach (NE PAS re-litiger) :
 *  - `catalogue` : réutilise un jeu de colonnes de `dim_exercices`
 *    (`*_endurance` ou `*_force`) — paramètres portés par chaque exercice ;
 *  - `generique` : schéma de charge porté par le cycle lui-même, appliqué
 *    uniformément à tous les exercices, indépendamment de `dim_exercices`.
 *
 * Source des valeurs : docs/plans/bilan-muscu-cycles-vocabulaire.md (§ 2, § 3).
 */

import type { PeriodizationCycle } from '@/lib/api/types';

/** Type d'un cycle : bloc (multi-semaines) ou transition (semaine isolée). */
export type CycleType = 'bloc' | 'transition';

/** Jeu de colonnes de `dim_exercices` réutilisé par une stratégie `catalogue`. */
export type CatalogueColumn = 'endurance' | 'force';

/** Une fourchette `[min, max]` (min ≤ max). */
export type Range = readonly [number, number];

/**
 * Stratégie `catalogue` — le moteur lit les colonnes `*_<column>` de
 * `dim_exercices` (séries/reps/%1RM/récup portées par chaque exercice).
 * `dim_exercices` n'est PAS modifié.
 */
export interface CatalogueLoading {
  kind: 'catalogue';
  /** Quel jeu de colonnes de `dim_exercices` réutiliser. */
  column: CatalogueColumn;
}

/**
 * Schéma de charge générique — s'applique uniformément à tous les exercices.
 * Issu de la littérature S&C (cf. doc § 3.3-3.6).
 */
export interface GenericLoadingScheme {
  // ⚠️ E3 (§343) — `sets`/`reps`/`intensityPct1rm` sont **DOCUMENTAIRES** (repères
  // de doctrine), PAS appliqués par le moteur : `toMesocycleExercise` (Règle 3)
  // conserve les séries/reps/%1RM portés par chaque exercice du catalogue et ne
  // clampe QUE `restSeconds` (`clampToRange`). Décision coach validée §332 (la
  // modulation catalogue prime ; l'option « schéma générique uniforme » a été
  // proposée puis écartée). Ne pas présumer que ces 3 bandes bornent la sortie.
  /** Repère doctrine — séries (NON appliqué, cf. ⚠️ ci-dessus). */
  sets: Range;
  /** Repère doctrine — répétitions (NON appliqué). */
  reps: Range;
  /** Repère doctrine — charge % 1RM 0-100 (NON appliqué). */
  intensityPct1rm: Range;
  /** Récupération entre séries (s) — **SEUL champ appliqué** (clamp `restSeconds`). */
  restSeconds: Range;
  /** Intention d'exécution — ce qui prime sur la prescription (appliqué : `notes`). */
  intention: string;
}

/**
 * Stratégie `generique` — schéma de charge porté par le cycle, indépendant
 * de `dim_exercices`.
 */
export interface GenericLoading {
  kind: 'generique';
  scheme: GenericLoadingScheme;
}

/** Stratégie de chargement d'un cycle (union discriminée par `kind`). */
export type CycleLoading = CatalogueLoading | GenericLoading;

/** Métadonnée + stratégie de chargement d'un cycle de périodisation. */
export interface CycleConfig {
  /** bloc (cœur du travail) ou transition (semaine d'articulation). */
  type: CycleType;
  /** Libellé FR pour l'UI (cf. doc § 2). */
  label: string;
  /** Comment le moteur obtient les paramètres de charge de ce cycle. */
  loading: CycleLoading;
}

/**
 * Config des 6 cycles de périodisation.
 *
 *  - `prepa_generale` / `force_max` : stratégie `catalogue` — réutilisent
 *    respectivement les paramètres `*_endurance` et `*_force` de
 *    `dim_exercices` (doc § 3.1, § 3.2).
 *  - `puissance` / `maintien` / `affutage` / `pic` : stratégie `generique` —
 *    schéma de charge au niveau cycle (doc § 3.3-3.6).
 */
export const PERIODIZATION_CYCLES: Record<PeriodizationCycle, CycleConfig> = {
  // § 3.1 — bloc, réutilise les paramètres d'endurance de force du catalogue.
  prepa_generale: {
    type: 'bloc',
    label: 'Préparation générale',
    loading: { kind: 'catalogue', column: 'endurance' },
  },

  // § 3.2 — bloc, réutilise les paramètres de force maximale du catalogue.
  force_max: {
    type: 'bloc',
    label: 'Force maximale',
    loading: { kind: 'catalogue', column: 'force' },
  },

  // § 3.3 — bloc, charges modérées déplacées à vitesse maximale.
  puissance: {
    type: 'bloc',
    label: 'Puissance / vitesse',
    loading: {
      kind: 'generique',
      scheme: {
        sets: [3, 4],
        reps: [3, 6],
        intensityPct1rm: [60, 80],
        restSeconds: [150, 180],
        intention: 'Déplacer la charge à vitesse maximale — la vitesse prime sur la charge.',
      },
    },
  },

  // § 3.4 — transition, volume réduit, intensité maintenue.
  maintien: {
    type: 'transition',
    label: 'Maintien',
    loading: {
      kind: 'generique',
      scheme: {
        sets: [2, 3],
        reps: [4, 8],
        intensityPct1rm: [70, 85],
        restSeconds: [120, 180],
        intention: 'Préserver les acquis : volume réduit (~40-60 %), intensité tenue, sans construire.',
      },
    },
  },

  // § 3.5 — transition, volume en décroissance, intensité/vitesse maintenues.
  affutage: {
    type: 'transition',
    label: 'Affûtage',
    loading: {
      kind: 'generique',
      scheme: {
        sets: [1, 3],
        reps: [3, 6],
        intensityPct1rm: [70, 85],
        restSeconds: [150, 180],
        intention: 'Réduire le volume avant la compétition en restant nerveux : intensité et vitesse d\'exécution maintenues.',
      },
    },
  },

  // § 3.6 — transition, séance unique très courte, charges légères à vitesse max.
  pic: {
    type: 'transition',
    label: 'Pic',
    loading: {
      kind: 'generique',
      scheme: {
        sets: [1, 2],
        reps: [2, 4],
        intensityPct1rm: [40, 60],
        restSeconds: [120, 180],
        intention: 'Activation SNC : volume minimal, charges légères déplacées vite — se sentir explosif.',
      },
    },
  },
};
