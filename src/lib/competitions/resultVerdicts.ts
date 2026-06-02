import { eventCodeFromFfnName } from "../objectiveHelpers";
import type { ResultsSnapshotRace } from "../api/types";

type Perf = {
  event_code: string;
  pool_length?: number | null;
  time_seconds?: number | null;
  competition_date?: string | null;
};

export interface CollapsedEvent {
  eventCode: string;
  bestTime: number | null;
  finalPlace: number | null;
  qualifiedFinal: "A" | "B" | "C" | null;
  points: number | null;
  races: ResultsSnapshotRace[];
}

const PHASE_RANK: Record<ResultsSnapshotRace["phase"], number> = {
  finaleA: 5, finaleB: 4, finaleC: 3, demi: 2, series: 1, unknown: 0,
};

/** Replie les courses d'un nageur par eventCode : place = phase la + haute, temps = min. */
export function collapseByEvent(races: ResultsSnapshotRace[]): CollapsedEvent[] {
  const byCode = new Map<string, ResultsSnapshotRace[]>();
  for (const r of races) {
    const code = r.eventCode ?? `?${r.rawEvent}`;
    const arr = byCode.get(code);
    if (arr) arr.push(r); else byCode.set(code, [r]);
  }
  const out: CollapsedEvent[] = [];
  for (const [eventCode, group] of byCode) {
    const ranked = [...group].sort((a, b) => PHASE_RANK[b.phase] - PHASE_RANK[a.phase]);
    const top = ranked[0];
    const times = group.map((r) => r.timeSeconds).filter((t): t is number => t != null);
    const finalRow = group.find((r) => r.phase.startsWith("finale"));
    const qualifiedFinal = finalRow
      ? (finalRow.phase.replace("finale", "") as "A" | "B" | "C")
      : null;
    out.push({
      eventCode,
      bestTime: times.length ? Math.min(...times) : null,
      finalPlace: top.place,
      qualifiedFinal,
      points: group.map((r) => r.points).find((p) => p != null) ?? null,
      races: group,
    });
  }
  return out;
}

export interface EventVerdict {
  isNewBest: boolean;
  isFirstEver: boolean;
  bestDelta: number | null;
  objective: { target: number; met: boolean; gap: number } | null;
  historyRank: number | null;
}

/**
 * Normalise un event_code de performance vers la forme compacte ("50NL").
 * Les perfs FFN stockent des libellés ("50 NL") ; le snapshot/les tests
 * utilisent la forme compacte. On accepte les deux.
 */
function toCompactCode(eventCode: string): string {
  return eventCodeFromFfnName(eventCode) ?? eventCode;
}

export function eventVerdict(input: {
  eventCode: string;
  poolLength: number | null;
  time: number;
  place: number | null;
  compDate: string;
  perfs: Perf[];
  objectives: Array<{ event_code: string; pool_length?: number | null; target_time_seconds?: number | null }>;
}): EventVerdict {
  const { eventCode, poolLength, time, compDate, perfs, objectives } = input;

  // Perfs antérieures à ce meet, même épreuve, même bassin (si connu des deux côtés).
  const sameScope = perfs.filter(
    (p) =>
      p.time_seconds != null
      && (p.competition_date ?? "") < compDate
      && toCompactCode(p.event_code) === eventCode
      && (poolLength == null || p.pool_length == null || p.pool_length === poolLength),
  );

  let bestPriorTime: number | null = null;
  for (const p of sameScope) {
    const t = p.time_seconds as number;
    if (bestPriorTime === null || t < bestPriorTime) bestPriorTime = t;
  }

  const isFirstEver = bestPriorTime === null;

  // Le nageur a-t-il déjà nagé CETTE épreuve dans un AUTRE bassin (avant ce meet) ?
  // Si oui, son 1er temps sur le bassin courant est trivialement un record de bassin.
  const hasPriorOtherBasin = perfs.some(
    (p) =>
      p.time_seconds != null
      && (p.competition_date ?? "") < compDate
      && toCompactCode(p.event_code) === eventCode
      && poolLength != null
      && p.pool_length != null
      && p.pool_length !== poolLength,
  );

  const isNewBest = bestPriorTime !== null
    ? time < bestPriorTime
    : hasPriorOtherBasin; // premier temps absolu = false ; premier sur ce bassin = true
  const bestDelta = bestPriorTime !== null ? time - bestPriorTime : null;

  // Objectif : meilleur (plus exigeant) target pour l'épreuve, bassin-aware.
  let target: number | null = null;
  for (const o of objectives) {
    if (toCompactCode(o.event_code) !== eventCode && o.event_code !== eventCode) continue;
    if (o.pool_length != null && poolLength != null && o.pool_length !== poolLength) continue;
    if (o.target_time_seconds == null) continue;
    if (target === null || o.target_time_seconds < target) target = o.target_time_seconds;
  }
  const objective = target != null
    ? { target, met: time <= target, gap: time - target }
    : null;

  // Rang historique en fallback uniquement (si pas d'objectif).
  let historyRank: number | null = null;
  if (objective === null) {
    const faster = sameScope.filter((p) => (p.time_seconds as number) < time).length;
    historyRank = faster + 1;
  }

  return { isNewBest, isFirstEver, bestDelta, objective, historyRank };
}
