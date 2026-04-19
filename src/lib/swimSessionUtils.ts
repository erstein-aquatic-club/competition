import type { SwimSessionItem } from "@/lib/api";
import { normalizeIntensityValue, type SwimBlock } from "@/lib/swimTextParser";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateSwimTotalDistance = (items: SwimSessionItem[] = []) =>
  items.reduce((total, item) => {
    const payload = (item.raw_payload as Record<string, unknown>) ?? {};
    const blockRepetitions = toNumber(payload.block_repetitions);
    const exerciseRepetitions = toNumber(payload.exercise_repetitions);
    const distance = toNumber(item.distance);
    return total + blockRepetitions * exerciseRepetitions * distance;
  }, 0);

export const splitModalitiesLines = (value?: string | null) =>
  value
    ? value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

/**
 * Convert parsed SwimBlocks to SwimSessionItems for persistence.
 * Shared between SwimSessionBuilder (full editor) and SlotSessionSheet (quick compose).
 */
export const buildItemsFromBlocks = (blocks: SwimBlock[]): SwimSessionItem[] => {
  let orderIndex = 0;
  return blocks.flatMap((block, blockIndex) =>
    block.exercises.map((exercise, exerciseIndex) => {
      const rawPayload = {
        block_title: block.title,
        block_description: block.description || null,
        block_order: blockIndex,
        block_repetitions: block.repetitions ?? null,
        block_modalities: block.modalities || null,
        block_equipment: block.equipment ?? [],
        exercise_repetitions: exercise.repetitions ?? null,
        exercise_rest: exercise.rest ?? null,
        exercise_rest_type: exercise.restType ?? "rest",
        exercise_stroke: exercise.stroke || null,
        exercise_stroke_type: exercise.strokeType || null,
        exercise_intensity: exercise.intensity ? normalizeIntensityValue(exercise.intensity) : null,
        exercise_modalities: exercise.modalities || null,
        exercise_equipment: exercise.equipment ?? [],
        exercise_order: exerciseIndex,
      };
      const exerciseLabel =
        exercise.repetitions && exercise.distance
          ? `${exercise.repetitions}x${exercise.distance}m`
          : exercise.distance
            ? `${exercise.distance}m`
            : null;
      return {
        ordre: orderIndex++,
        label: exerciseLabel,
        distance: exercise.distance ?? null,
        duration: null,
        intensity: exercise.intensity ? normalizeIntensityValue(exercise.intensity) : null,
        notes: exercise.modalities || null,
        raw_payload: rawPayload,
      } as SwimSessionItem;
    }),
  );
};

/**
 * Auto-name a swim session for quick-compose.
 * Format: "Mardi 15/04 soir · 2 900m"
 * Cutoff matin/soir at 13:00.
 */
export function autoNameSessionLabel(
  dateISO: string,
  startTime: string,
  totalDistance: number,
): string {
  const DAY_NAMES = [
    "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche",
  ];
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayIndex = (date.getDay() + 6) % 7; // Monday = 0
  const dayName = DAY_NAMES[dayIndex];
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");

  const hour = parseInt((startTime ?? "").slice(0, 2), 10);
  const period = Number.isFinite(hour) && hour < 13 ? "matin" : "soir";

  const distStr = totalDistance > 0
    ? ` · ${totalDistance.toLocaleString("fr-FR")}m`
    : "";

  return `${dayName} ${dd}/${mm} ${period}${distStr}`;
}
