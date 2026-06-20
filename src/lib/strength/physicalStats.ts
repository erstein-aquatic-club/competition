/**
 * Stats physiques du nageur — synthèse des KPIs muscu mesurés pour la vue
 * « Stats physiques » du profil (§387).
 *
 * Repose entièrement sur le scoring existant (`wrappedStats.rankKpis` →
 * `kpiBaremes.kpiScore`). Le score KPI 0-100 est ANCRÉ sur des percentiles de
 * population (p10→10 … p90→90, extrapolé au-delà), donc `score ≈ rang centile`.
 * On en dérive une comparaison « top X % » à résolution fine au sommet (jusqu'à
 * top 0,01 % pour les profils d'exception) et une synthèse points forts / axes
 * de progression.
 *
 * Fonctions PURES (testables sans DOM ni réseau) — la vue ne fait que les
 * brancher sur les mesures fetchées.
 */
import type { RankedKpi } from './wrappedStats';
import type {
  StrengthKpiMeasurement,
  StrengthKpiSource,
  VerticalJumpAttempts,
  MedballThrowAttempts,
} from '@/lib/api/types';

export interface PopulationComparison {
  /** Rang centile estimé (0-100). Le score KPI est ancré percentiles → score ≈ centile. */
  percentile: number;
  /** Part de la population au-dessus, en % (100 − percentile, plancher 0,01). */
  topPct: number;
  /** Libellé « top X % » formaté (résolution fine au sommet : top 1 % → top 0,01 %). */
  topLabel: string;
  /** Libellé « Mieux que X % ». */
  betterThanLabel: string;
}

/** Format français d'un pourcentage « top » à résolution croissante au sommet. */
function formatTopPct(topPct: number): string {
  let digits: number;
  if (topPct >= 1) digits = 0; // top 5 %, top 30 %
  else if (topPct >= 0.1) digits = 1; // top 0,5 %
  else digits = 2; // top 0,01 %
  // toFixed peut produire un zéro de bord dû au flottant (100 − 99,9 ≈ 0,0999
  // → « 0,10 ») : on strippe les zéros inutiles après la virgule.
  let str = topPct.toFixed(digits);
  if (str.includes('.')) str = str.replace(/0+$/, '').replace(/\.$/, '');
  return `top ${str.replace('.', ',')} %`;
}

/**
 * Convertit un score KPI 0-100 en comparaison de population.
 *
 *  - `percentile` borné [0, 100] ;
 *  - `topPct = 100 − percentile`, planché à 0,01 (le score ne pouvant pas
 *    atteindre 100 exact, l'élite ressort en « top 0,xx % ») ;
 *  - `topLabel` n'est pertinent QUE pour les scores au-dessus de la médiane —
 *    la vue ne l'affiche pas pour un KPI faible (« top 80 % » serait trompeur),
 *    où la bande qualitative (`RankedKpi.band.label`) prend le relais.
 */
export function populationComparison(score: number): PopulationComparison {
  const percentile = Math.min(100, Math.max(0, score));
  const topPct = Math.min(100, Math.max(0.01, 100 - percentile));
  return {
    percentile,
    topPct,
    topLabel: formatTopPct(topPct),
    betterThanLabel: `Mieux que ${Math.round(percentile)} %`,
  };
}

export interface PhysicalStatsSummary {
  /** Tous les KPIs mesurés, triés fort → faible. */
  measured: RankedKpi[];
  /** Points forts : KPIs ≥ top 30 % (score ≥ 70), cappé à 3 ; fallback = meilleur relatif. */
  strengths: RankedKpi[];
  /** Axes de progression : KPIs sous la médiane (score < 50), plus faible d'abord, cappé à 3 ; fallback = plus faible relatif. */
  improvements: RankedKpi[];
  /** Indice physique global = moyenne des scores mesurés (null si aucune mesure). */
  globalScore: number | null;
  /** Comparaison population dérivée de l'indice global (null si aucune mesure). */
  globalComparison: PopulationComparison | null;
}

/**
 * Construit la synthèse à partir des KPIs scorés (`rankKpis`).
 *
 * Seuils ABSOLUS (top 30 % / médiane) pour que « point fort » et « axe de
 * progression » gardent un sens objectif. Fallbacks RELATIFS quand aucun KPI ne
 * franchit le seuil, afin que les deux sections restent informatives dès qu'il y
 * a des mesures (sans jamais classer un même KPI dans les deux).
 */
export function buildPhysicalStatsSummary(ranked: RankedKpi[]): PhysicalStatsSummary {
  const measured = [...ranked].sort((a, b) => b.score - a.score);

  let strengths = measured.filter((k) => k.score >= 70).slice(0, 3);
  // measured trié desc → les plus faibles sont en fin ; on prend les 3 derniers
  // sous la médiane puis on inverse pour afficher le plus faible en premier.
  let improvements = measured.filter((k) => k.score < 50).slice(-3).reverse();

  const strengthKeys = new Set(strengths.map((k) => k.key));

  if (strengths.length === 0 && measured.length > 0) {
    strengths = [measured[0]];
    strengthKeys.add(measured[0].key);
  }
  if (improvements.length === 0 && measured.length > 1) {
    const weakest = measured[measured.length - 1];
    if (!strengthKeys.has(weakest.key)) improvements = [weakest];
  }

  const globalScore = measured.length
    ? measured.reduce((sum, k) => sum + k.score, 0) / measured.length
    : null;

  return {
    measured,
    strengths,
    improvements,
    globalScore,
    globalComparison: globalScore != null ? populationComparison(globalScore) : null,
  };
}

/** Arrondit un nombre pour l'affichage (sans zéro de bord inutile). */
export function formatNumber(value: number, decimals = 1): string {
  return String(Number(value.toFixed(decimals)));
}

/** Arrondit une mesure brute pour l'affichage (1 décimale max, sans zéro inutile). */
export function formatKpiValue(value: number): string {
  return formatNumber(value, 1);
}

/** Une ligne de détail d'essai/mesure, prête à afficher. */
export interface AttemptDetail {
  label: string;
  value: string;
}

/**
 * Décompose les `attempts` (jsonb) d'une mesure KPI en lignes lisibles, selon
 * la forme stockée (cf. `KpiAttempts`) :
 *  - `number[]`            → essais bruts (3 KPIs « valeur simple ») ;
 *  - `VerticalJumpAttempts` → poids, temps de vol, hauteur, puissance de pic ;
 *  - `MedballThrowAttempts` → masse du ballon, distances, meilleure, indice.
 *
 * Pure : pas de dépendance React. `[]` si `attempts` absent / forme inconnue.
 */
export function describeAttempts(m: StrengthKpiMeasurement): AttemptDetail[] {
  const a = m.attempts;
  if (!a) return [];
  if (Array.isArray(a)) {
    if (a.length === 0) return [];
    return [
      {
        label: a.length > 1 ? 'Essais' : 'Essai',
        value: `${a.map((v) => formatKpiValue(v)).join(' · ')} ${m.unit}`.trim(),
      },
    ];
  }
  if ('flight_times' in a) {
    const vj = a as VerticalJumpAttempts;
    return [
      { label: 'Poids saisi', value: `${formatKpiValue(vj.weight_kg)} kg` },
      {
        label: 'Temps de vol',
        value: `${vj.flight_times.map((t) => formatNumber(t, 2)).join(' · ')} s`,
      },
      { label: 'Hauteur (meilleur saut)', value: `${formatKpiValue(vj.height_cm)} cm` },
      { label: 'Puissance de pic', value: `${Math.round(vj.peak_power_w)} W` },
    ];
  }
  if ('distances_cm' in a) {
    const mb = a as MedballThrowAttempts;
    return [
      { label: 'Masse du ballon', value: `${formatKpiValue(mb.ball_mass_kg)} kg` },
      {
        label: 'Distances',
        value: `${mb.distances_cm.map((d) => formatNumber(d / 100, 2)).join(' · ')} m`,
      },
      { label: 'Meilleure distance', value: `${formatNumber(mb.best_distance_cm / 100, 2)} m` },
      { label: 'Indice (masse × distance)', value: `${formatKpiValue(mb.index_kg_m)} kg·m` },
    ];
  }
  return [];
}

/** Une ligne d'historique d'un KPI, avec Δ vs la mesure comparable précédente. */
export interface KpiHistoryRow {
  id: string;
  measuredAt: string;
  value: number;
  unit: string;
  /** Δ vs la mesure plus ancienne de MÊME unité (null si aucune / unité différente). */
  deltaVsPrev: number | null;
  source: StrengthKpiSource;
  coachReviewed: boolean;
}

/**
 * Construit les lignes d'historique d'un KPI (plus récent → plus ancien) avec le
 * Δ par rapport à la mesure comparable précédente. Le Δ n'est calculé qu'entre
 * mesures de MÊME unité (le `vertical_jump` est passé de cm à W/kg au §293 →
 * deux unités incomparables dans le même historique). Robuste à un ordre
 * d'entrée quelconque (re-trie par date décroissante).
 */
export function buildKpiHistoryRows(
  measurements: StrengthKpiMeasurement[],
): KpiHistoryRow[] {
  const desc = [...measurements].sort(
    (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime(),
  );
  return desc.map((m, i) => {
    let deltaVsPrev: number | null = null;
    for (let j = i + 1; j < desc.length; j++) {
      if (desc[j].unit === m.unit) {
        deltaVsPrev = Number((m.value - desc[j].value).toFixed(2));
        break;
      }
    }
    return {
      id: m.id,
      measuredAt: m.measured_at,
      value: m.value,
      unit: m.unit,
      deltaVsPrev,
      source: m.source,
      coachReviewed: m.coach_reviewed,
    };
  });
}
