import type { ResultsSnapshot } from "../../../lib/api/types";
import {
  collapseByEvent,
  eventVerdict,
  type CollapsedEvent,
  type EventVerdict,
} from "../../../lib/competitions/resultVerdicts";

export interface SwimmerEventResult {
  collapsed: CollapsedEvent;
  verdict: EventVerdict | null; // null for UNLINKED swimmers or sentinel events
}

export interface SwimmerResults {
  key: string;
  userId: number | null;
  name: string; // linked → athleteName[userId] ; else "LASTNAME Firstname"
  linked: boolean;
  events: SwimmerEventResult[];
}

export interface ResultsSynthesis {
  totals: {
    newBests: number;
    podiums: number;
    finalsA: number;
    objectivesMet: number;
  };
  swimmers: SwimmerResults[]; // linked first (input order), then unlinked (input order)
  unmatchedCount: number; // number of swimmers with userId == null
}

type PerfRow = {
  event_code: string;
  pool_length?: number | null;
  time_seconds?: number | null;
  competition_date?: string | null;
};
type ObjectiveRow = {
  event_code: string;
  pool_length?: number | null;
  target_time_seconds?: number | null;
};

/**
 * Assemble tout ce que l'onglet Résultats affiche, à partir du snapshot importé
 * et des perfs/objectifs des nageurs liés. Fonction pure (aucun I/O).
 *
 * Règles de comptage des totaux :
 * - podiums / finalsA : comptés pour TOUS les nageurs (la place et la finale
 *   viennent de la page liveffn, pas de notre base) — y compris non liés.
 * - newBests / objectivesMet : comptés UNIQUEMENT pour les nageurs liés
 *   (nécessitent l'historique perfs / les objectifs en base).
 */
export function buildResultsSynthesis(input: {
  snapshot: ResultsSnapshot;
  athleteName: Record<number, string>;
  perfsByUser: Record<number, PerfRow[]>;
  objectivesByUser: Record<number, ObjectiveRow[]>;
  poolLength: number | null;
  compDate: string;
}): ResultsSynthesis {
  const { snapshot, athleteName, perfsByUser, objectivesByUser, poolLength, compDate } = input;

  const built: SwimmerResults[] = snapshot.swimmers.map((sw) => {
    const mapped = snapshot.athleteMap[sw.key];
    const userId = mapped == null ? null : mapped;
    const linked = userId != null;
    const fallbackName = `${sw.lastName} ${sw.firstName}`.trim();
    const name = linked ? athleteName[userId] ?? fallbackName : fallbackName;

    const collapsedEvents = collapseByEvent(sw.races);
    const perfs = linked ? perfsByUser[userId] ?? [] : [];
    const objectives = linked ? objectivesByUser[userId] ?? [] : [];

    const events: SwimmerEventResult[] = collapsedEvents.map((collapsed) => {
      const isSentinel = collapsed.eventCode.startsWith("?");
      const verdict =
        linked && collapsed.bestTime != null && !isSentinel
          ? eventVerdict({
              eventCode: collapsed.eventCode,
              poolLength,
              time: collapsed.bestTime,
              place: collapsed.finalPlace,
              compDate,
              perfs,
              objectives,
            })
          : null;
      return { collapsed, verdict };
    });

    return { key: sw.key, userId, name, linked, events };
  });

  // linked first (preserving order), then unlinked (preserving order)
  const swimmers = [
    ...built.filter((s) => s.linked),
    ...built.filter((s) => !s.linked),
  ];

  let newBests = 0;
  let podiums = 0;
  let finalsA = 0;
  let objectivesMet = 0;

  for (const s of built) {
    for (const ev of s.events) {
      // Place-based stats: count ALL swimmers.
      if (ev.collapsed.finalPlace != null && ev.collapsed.finalPlace <= 3) podiums += 1;
      if (ev.collapsed.qualifiedFinal === "A") finalsA += 1;
      // DB-derived stats: linked-only (verdict is null when unlinked/sentinel).
      if (ev.verdict?.isNewBest === true) newBests += 1;
      if (ev.verdict?.objective?.met === true) objectivesMet += 1;
    }
  }

  const unmatchedCount = built.filter((s) => s.userId == null).length;

  return {
    totals: { newBests, podiums, finalsA, objectivesMet },
    swimmers,
    unmatchedCount,
  };
}
