/**
 * pdfPalette.ts — Palette PDF pour les exports allures (§186).
 * Utilise le format jsPDF : tableaux RGB [r, g, b] (valeurs 0–255).
 */

export type RgbColor = [number, number, number];

/** Couleurs principales par nage (fond du badge stroke). */
export const STROKE_COLORS_RGB: Record<string, RgbColor> = {
  NL:     [59,  130, 246],  // blue-500
  Dos:    [14,  156, 218],  // sky-500
  Brasse: [16,  185, 129],  // emerald-500
  Pap:    [140,  92, 246],  // violet-500
  "4N":   [249, 115,  22],  // orange-500
} as const;

/** Teinte claire par nage (fond ligne cible dans le tableau). */
export const STROKE_TINTS_RGB: Record<string, RgbColor> = {
  NL:     [236, 240, 254],  // blue-50
  Dos:    [234, 247, 254],  // sky-50
  Brasse: [236, 253, 245],  // emerald-50
  Pap:    [245, 243, 255],  // violet-50
  "4N":   [255, 247, 237],  // orange-50
} as const;

/** Fond de cellule par zone d'intensité. */
export const ZONE_BG_RGB: Record<string, RgbColor> = {
  V0:  [220, 245, 217],  // green-100
  V1:  [217, 232, 254],  // blue-100
  V2:  [254, 243, 200],  // yellow-100
  V3:  [254, 233, 211],  // orange-100
  V4:  [254, 220, 224],  // rose-100
  MAX: [254, 201, 201],  // red-200
} as const;

/** Couleur de texte par zone d'intensité. */
export const ZONE_TEXT_RGB: Record<string, RgbColor> = {
  V0:  [14,  100,  31],  // green-700
  V1:  [19,   74, 197],  // blue-700
  V2:  [136,  96,   8],  // yellow-700
  V3:  [192,  65,  13],  // orange-700
  V4:  [191,  26,  46],  // rose-700
  MAX: [181,  18,  18],  // red-700
} as const;

/** Couleurs générales de mise en page. */
export const PDF_GENERAL = {
  CHARCOAL:            [38,  38,  46] as RgbColor,
  TEXT_MUTED:          [140, 140, 150] as RgbColor,
  BORDER_LIGHT:        [222, 222, 229] as RgbColor,
  BORDER_MED:          [191, 191, 199] as RgbColor,
  ROW_ALT:             [248, 248, 249] as RgbColor,
  PILL_BG:             [240, 240, 243] as RgbColor,
  PILL_BORDER:         [209, 209, 216] as RgbColor,
  WHITE:               [255, 255, 255] as RgbColor,
  ORANGE_RECAP_TINT:   [254, 238, 227] as RgbColor,
} as const;
