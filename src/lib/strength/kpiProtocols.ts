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
}

export const KPI_PROTOCOLS: Record<StrengthKpiKey, KpiProtocol> = {
  vertical_jump: {
    key: 'vertical_jump',
    label: 'Saut vertical (détente sèche)',
    bucket: 'Puissance bas du corps',
    unit: 'cm',
    attempts: 3,
    steps: [
      'Le nageur tient 3 morceaux de scotch. Debout face au mur, bras le long du corps.',
      'Sauter le plus haut possible en détente sèche (sans élan ni pas de course) et coller un scotch au mur, au point le plus haut atteint du bout des doigts.',
      'Un scotch par essai — 3 sauts.',
    ],
    partnerRole: 'Mesure au mètre la distance sol → haut du scotch le plus haut.',
    measurement: 'Distance sol → haut du scotch, en cm. Meilleur des 3 essais.',
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
    ],
    partnerRole: 'Valide l\'amplitude complète et note la charge réussie.',
    measurement: 'Charge additionnelle max sur 1 traction stricte, en kg.',
    gifUrl: null,
  },
  medball_vertical_throw: {
    key: 'medball_vertical_throw',
    label: 'Lancer vertical médecine-ball',
    bucket: 'Puissance haut du corps',
    unit: 'cm',
    attempts: 3,
    steps: [
      'Allongé sur le dos, médecine-ball 10 kg tenu poitrine, coudes au sol.',
      'Propulser le ballon verticalement le plus haut possible.',
    ],
    partnerRole: 'Se place de côté, estime la hauteur max atteinte par le ballon.',
    measurement: 'Hauteur verticale du lancer, en cm. Médecine-ball 10 kg. Meilleur de 3.',
    gifUrl: null,
  },
};
