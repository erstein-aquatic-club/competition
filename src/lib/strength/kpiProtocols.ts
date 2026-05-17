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
    label: 'Saut vertical',
    bucket: 'Puissance bas du corps',
    unit: 'cm',
    attempts: 3,
    steps: [
      'Debout, pieds écartés largeur de hanches.',
      'Fléchir puis sauter le plus haut possible, bras tendus vers le haut.',
      'Toucher le mur / la mire le plus haut possible.',
    ],
    partnerRole: 'Repère la hauteur atteinte (doigts) et la mesure au mètre.',
    measurement: 'Hauteur atteinte − hauteur bras tendu debout, en cm. Meilleur de 3.',
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
  imtp: {
    key: 'imtp',
    label: 'Tirage isométrique mi-cuisse',
    bucket: 'Force bas du corps',
    unit: 'kg',
    attempts: 2,
    steps: [
      'Barre fixée à mi-cuisse, dos droit, prise pronation.',
      'Tirer au maximum vers le haut pendant 3-5 s sans bouger la barre.',
    ],
    partnerRole: 'Lance le chrono et lit la valeur sur le dynamomètre / la jauge.',
    measurement: 'Force maximale développée, en kg. Meilleur de 2.',
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
