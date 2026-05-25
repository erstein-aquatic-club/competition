/**
 * Mapping FR des zones anatomiques utilisées par le catalogue muscu
 * (`dim_exercices.contraindication_zones`) et le questionnaire douleur
 * (`BodyHeatMap` / `BodySvg`).
 *
 * Convention DB (vérifiée via `dim_exercices`) : zones granulaires
 * `left_*` / `right_*` pour les latéralisées (shoulder, elbow, wrist, hip,
 * knee, ankle, calf) + zones axiales (`neck`, `upper_back`, `lower_back`).
 *
 * Le mapping legacy générique (`shoulder`, `knee`, `back`, …) est gardé en
 * fallback de compatibilité — certains anciens textes peuvent encore les
 * employer.
 */

export const ZONE_LABEL_FR: Record<string, string> = {
  // Axiales
  neck: 'nuque',
  upper_back: 'haut du dos',
  lower_back: 'bas du dos',

  // Latéralisées
  left_shoulder: 'épaule G',
  right_shoulder: 'épaule D',
  left_elbow: 'coude G',
  right_elbow: 'coude D',
  left_wrist: 'poignet G',
  right_wrist: 'poignet D',
  left_hip: 'hanche G',
  right_hip: 'hanche D',
  left_knee: 'genou G',
  right_knee: 'genou D',
  left_ankle: 'cheville G',
  right_ankle: 'cheville D',
  left_calf: 'mollet G',
  right_calf: 'mollet D',
  left_groin: 'aine G',
  right_groin: 'aine D',

  // Fallbacks génériques (compatibilité ascendante)
  shoulder: 'épaule',
  elbow: 'coude',
  wrist: 'poignet',
  hip: 'hanche',
  knee: 'genou',
  ankle: 'cheville',
  back: 'dos',
};

/** Convertit une zone (clé brute) en label FR lisible, fallback sur la clé. */
export function zoneLabelFr(zone: string): string {
  return ZONE_LABEL_FR[zone] ?? zone;
}
