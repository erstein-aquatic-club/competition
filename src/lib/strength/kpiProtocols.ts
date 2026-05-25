import type { StrengthKpiKey } from '@/lib/api/types';

export interface KpiProtocol {
  key: StrengthKpiKey;
  label: string;          // "Saut vertical"
  bucket: string;         // seau alimenté
  unit: string;           // "cm" | "kg"
  attempts: number;       // nombre d'essais (meilleur retenu)
  /** Étapes du protocole, dans l'ordre, affichées dans le wizard. */
  steps: string[];
  /** Rôle du binôme pendant la mesure. */
  partnerRole: string;
  /** Méthode de mesure chiffrée. */
  measurement: string;
  gifUrl: string | null;  // Chantier A
  /**
   * Autorise une mesure ≤ 0 (charge nulle au poids de corps ou négative
   * assistée). Réservé à `weighted_pullup` — le barème a des ancres ≤ 0. §301.
   */
  allowNonPositive?: boolean;
}

export const KPI_PROTOCOLS: Record<StrengthKpiKey, KpiProtocol> = {
  // Mesure de PUISSANCE (et non plus de hauteur) : poids + temps de vol
  // chronométré → hauteur → puissance de pic (Sayers) → puissance relative
  // W/kg, grandeur scorée. Cf. docs/plans/bilan-muscu-barème-puissance-detente.md.
  vertical_jump: {
    key: 'vertical_jump',
    label: 'Détente verticale (puissance)',
    bucket: 'Puissance bas du corps',
    unit: 'W/kg',
    attempts: 3,
    steps: [
      'Saisir le poids du nageur (kg) — il entre dans le calcul de la puissance.',
      'Debout, départ immobile. Descendre en flexion, puis sauter le plus haut possible en détente sèche (sans élan ni pas de course).',
      'Jambes tendues pendant tout le vol : ne PAS ramener les genoux sous la poitrine. Un « tuck » rallonge artificiellement le temps de vol et fausse la mesure.',
      'Réception sur l\'avant des pieds, au même endroit que le décollage. 3 sauts.',
    ],
    partnerRole:
      'Chronomètre le temps de vol de chaque saut — du décollage des pieds à leur retour au sol. Annonce et note les 3 temps.',
    measurement:
      'Temps de vol (s) → hauteur (h = g·t²/8) → puissance de pic (équation de Sayers) → puissance relative en W/kg. Moyenne des 3 essais retenue (chrono manuel → la moyenne est plus répétable que le meilleur).',
    gifUrl: null,
  },
  broad_jump: {
    key: 'broad_jump',
    label: 'Saut en longueur',
    bucket: 'Puissance bas du corps',
    unit: 'cm',
    attempts: 3,
    steps: [
      'Debout derrière une ligne, pieds joints.',
      'Sauter le plus loin possible vers l\'avant, réception stable.',
    ],
    partnerRole: 'Mesure la distance ligne de départ → talon le plus reculé.',
    measurement: 'Distance en cm, réception stabilisée. Meilleur de 3.',
    gifUrl: null,
  },
  // `key` reste 'imtp' (compat DB / `StrengthKpiKey`) — le test n'est plus
  // isométrique : faute de plateau de force, c'est un tirage mi-cuisse à
  // charge maximale (kg). Alimente toujours le seau « force bas du corps ».
  imtp: {
    key: 'imtp',
    label: 'Tirage mi-cuisse à la barre',
    bucket: 'Force bas du corps',
    unit: 'kg',
    attempts: 2,
    steps: [
      'Barre posée sur les pins du rack, réglés à hauteur mi-cuisse.',
      'Prise pronation, dos droit : tirer la barre vers le haut (extension de hanches) sur 1 répétition complète.',
      'Monter la charge progressivement jusqu\'à la charge max réussie sur 1 répétition.',
    ],
    partnerRole: 'Compte les disques, valide l\'amplitude complète, note la charge max réussie.',
    measurement: 'Charge max soulevée sur 1 tirage mi-cuisse complet, en kg. Meilleur des 2 essais retenus.',
    gifUrl: null,
  },
  weighted_pullup: {
    key: 'weighted_pullup',
    label: 'Traction lestée',
    bucket: 'Force haut du corps',
    unit: 'kg',
    attempts: 3,
    steps: [
      'Ceinture de lest, prise pronation largeur d\'épaules.',
      'Réaliser 1 traction complète menton au-dessus de la barre.',
      'Augmenter la charge jusqu\'à la charge max sur 1 répétition.',
      'Au poids de corps sans lest : note 0. Si la traction nécessite une aide '
        + '(élastique), note la charge d\'assistance en NÉGATIF (ex. -7,5).',
    ],
    partnerRole: 'Valide l\'amplitude complète et note la charge réussie (0 au poids de corps, négatif si assisté).',
    measurement: 'Charge additionnelle max sur 1 traction stricte, en kg (0 = poids de corps, négatif = assisté).',
    gifUrl: null,
    allowNonPositive: true,
  },
  // `key` reste 'medball_vertical_throw' (compat DB / `StrengthKpiKey`) — §309 le
  // test n'est plus un lancer vertical allongé (hauteur estimée à l'œil, non
  // fiable, sans norme) mais un LANCER ASSIS pour la distance (Seated Medicine
  // Ball Throw), objectif et répétable, scoré sur l'indice masse×distance qui
  // permet de choisir la masse du ballon (cf. `medballPower.ts`).
  medball_vertical_throw: {
    key: 'medball_vertical_throw',
    label: 'Lancer médecine-ball assis',
    bucket: 'Puissance haut du corps',
    unit: 'kg·m', // indice scoré = masse(kg) × meilleure distance(m)
    attempts: 3,
    steps: [
      'Choisir une masse de ballon adaptée (le lancer doit rester mesurable : ni plafonné, ni trop court). Garder la MÊME masse d\'un bilan à l\'autre pour le suivi.',
      'Assis au sol, jambes tendues, dos plaqué contre un mur, ballon tenu à deux mains contre la poitrine.',
      'Lancer le ballon vers l\'avant le plus loin possible (~45°) sans décoller le dos du mur. 3 essais.',
    ],
    partnerRole: 'Mesure au mètre ruban, du mur jusqu\'au 1er contact du ballon au sol. Note la masse du ballon + les 3 distances.',
    measurement: 'Masse du ballon (kg) + meilleure distance (m) → indice masse × distance (kg·m). Meilleur de 3.',
    gifUrl: null,
  },
};

/**
 * Démo KPI → exercice du catalogue dont le `illustration_gif` illustre le geste.
 * §301 T2 : seuls les mouvements ayant un GIF catalogue **exact** sont mappés ;
 * `KpiGifPanel` résout l'URL et l'affiche, sinon retombe sur l'illustration SVG.
 * `null` = pas de match exact (un GIF d'un mouvement voisin serait trompeur)
 * → SVG conservé en attendant un clip dédié.
 *
 *  - `broad_jump`       → 21 « Saut en longueur »
 *  - `weighted_pullup`  → 13 « Tractions lestées »
 *  - les 3 autres (détente sèche, tirage mi-cuisse, lancer vertical allongé)
 *    n'ont pas d'équivalent catalogue exact.
 */
export const KPI_DEMO_EXERCISE_ID: Record<StrengthKpiKey, number | null> = {
  vertical_jump: null,
  broad_jump: 21,
  imtp: null,
  weighted_pullup: 13,
  medball_vertical_throw: null,
};
