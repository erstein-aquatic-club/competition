import type { StrengthSessionItem } from "@/lib/api/types";

/** Contraste explicite : A force → B puissance → récupération partagée.
 * Stockage uniquement dans raw_payload, aucune migration SQL nécessaire.
 * Les anciennes séances sans cette métadonnée gardent leur parcours classique.
 */
export type TrainingIntent = "force" | "puissance" | "hypertrophie";
export type ContrastRole = "force" | "power";
export type ContrastPair = { id: string; role: ContrastRole; rest_seconds: number; rest_before_power_seconds: number; original_rest_seconds?: number };
export type ContrastRound = { id: string; role: ContrastRole; round: number; total: number; source_index: number };

export function getContrastPair(item: StrengthSessionItem | null | undefined): ContrastPair | null {
  const raw = item?.raw_payload?.contrast_pair_v1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id.trim() || (v.role !== "force" && v.role !== "power")) return null;
  const rest = Number(v.rest_seconds);
  const before = Number(v.rest_before_power_seconds ?? 0);
  const original = v.original_rest_seconds == null ? undefined : Number(v.original_rest_seconds);
  if (!Number.isFinite(rest) || rest < 0 || rest > 900 ||
      !Number.isFinite(before) || before < 0 || before > 900 ||
      (original !== undefined && (!Number.isFinite(original) || original < 0 || original > 900))) return null;
  return { id: v.id, role: v.role, rest_seconds: rest, rest_before_power_seconds: before, original_rest_seconds: original };
}

export function getContrastRound(item: StrengthSessionItem | null | undefined): ContrastRound | null {
  const raw = item?.raw_payload?.contrast_runtime_v1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== "string" || (v.role !== "force" && v.role !== "power")) return null;
  const round = Number(v.round), total = Number(v.total), source_index = Number(v.source_index);
  if (![round, total, source_index].every(Number.isInteger) || round < 1 || round > total || total > 8 || source_index < 0) return null;
  return { id: v.id, role: v.role, round, total, source_index };
}

export function validContrastPair(a: StrengthSessionItem, b: StrengthSessionItem): boolean {
  const first = getContrastPair(a), second = getContrastPair(b);
  return !!first && !!second && first.id === second.id &&
    first.role === "force" && second.role === "power" &&
    first.rest_seconds === second.rest_seconds &&
    first.rest_before_power_seconds === second.rest_before_power_seconds &&
    a.exercise_id > 0 && b.exercise_id > 0 && a.exercise_id !== b.exercise_id &&
    Number.isInteger(a.sets) && a.sets >= 2 && a.sets <= 8 && a.sets === b.sets &&
    a.block !== "warmup" && b.block !== "warmup";
}

/** Contrastes malformés : pas d'exécution silencieuse en séquence classique dans l'éditeur. */
export function validateContrastPlan(items: StrengthSessionItem[]): string[] {
  const issues: string[] = [];
  items.forEach((item, index) => {
    const pair = getContrastPair(item);
    if (!pair) {
      if (item.raw_payload?.contrast_pair_v1 != null) issues.push(`Exercice ${index + 1} : contraste invalide.`);
      return;
    }
    const partner = pair.role === "force" ? items[index + 1] : items[index - 1];
    if (!partner || !(pair.role === "force" ? validContrastPair(item, partner) : validContrastPair(partner, item))) {
      issues.push(`Exercice ${index + 1} : paire incomplète (2 exercices consécutifs, même nombre de séries requis).`);
    }
  });
  return issues;
}

export function expandContrastPlan(items: StrengthSessionItem[]): StrengthSessionItem[] {
  const result: StrengthSessionItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const a = items[index], b = items[index + 1];
    if (!b || !validContrastPair(a, b)) {
      result.push(a);
      continue;
    }
    const pair = getContrastPair(a)!;
    for (let round = 1; round <= a.sets; round += 1) {
      const data = { id: pair.id, round, total: a.sets };
      result.push({
        ...a, sets: 1, rest_seconds: pair.rest_before_power_seconds,
        raw_payload: { ...a.raw_payload, contrast_runtime_v1: { ...data, role: "force", source_index: index } },
      });
      result.push({
        ...b, sets: 1, rest_seconds: pair.rest_seconds,
        raw_payload: { ...b.raw_payload, contrast_runtime_v1: { ...data, role: "power", source_index: index + 1 } },
      });
    }
    index += 1;
  }
  return result;
}

export function contrastSetNumber(item: StrengthSessionItem | null | undefined, setIndex: number): number {
  return getContrastRound(item)?.round ?? setIndex;
}

/** Logs can be keyed by set_index (server) or set_number (optimistic UI). */
export function isContrastRoundLogged(
  item: StrengthSessionItem,
  logs: Array<{ exercise_id?: number; set_index?: number | null; set_number?: number | null }>,
): boolean {
  const round = getContrastRound(item);
  if (!round) return false;
  return logs.some((log) => log.exercise_id === item.exercise_id &&
    Number(log.set_index ?? log.set_number) === round.round);
}

export function getTrainingIntent(item: StrengthSessionItem | null | undefined, exerciseName?: string | null): TrainingIntent | null {
  if (!item) return null;
  const explicit = item.raw_payload?.training_intent;
  if (explicit === "force" || explicit === "puissance" || explicit === "hypertrophie") return explicit;
  if (getContrastPair(item)?.role === "force") return "force";
  if (getContrastPair(item)?.role === "power") return "puissance";
  if (item.block === "warmup" || item.raw_payload?.rest_day === true) return null;
  const rawName = item.raw_payload?.original_exercise_name;
  const name = (exerciseName ?? item.exercise_name ?? (typeof rawName === "string" ? rawName : "")).toLowerCase();
  if (/activation|mobilit|face pull|rotation externe|coiffe|dead bug|gainage|pallof|planche|ab wheel|étirement|poignet/.test(name)) return null;
  if (/explosif|dynamique|saut|jump|cmj|lancer|médecine.ball|medecine.ball|pliom|plyom|rebond|depth|drop landing/.test(name)) return "puissance";
  if (item.raw_payload?.periodization_cycle === "puissance") return "puissance";
  if (item.raw_payload?.periodization_cycle === "hypertrophie") return "hypertrophie";
  if (item.reps >= 8 && item.reps <= 12) return "hypertrophie";
  // 6–7 reps ne suffisent pas à qualifier une intention hypertrophie : on évite un faux badge.
  if (item.reps >= 6 && item.reps <= 7) return null;
  return "force";
}

export const TRAINING_INTENTS: Record<TrainingIntent, { label: string; cue: string; classes: string }> = {
  force: { label: "Force", cue: "Charge élevée · contrôle · récupération complète", classes: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  puissance: { label: "Puissance", cue: "Vitesse maximale · stopper si ralentissement", classes: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  hypertrophie: { label: "Hypertrophie", cue: "Tension musculaire · amplitude contrôlée", classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};
