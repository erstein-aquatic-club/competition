# Visuels musculation — Manon BURGY (200 NL V5)

Audit du 14 novembre 2026 : 15 exercices de catalogue utilisés par le cycle (535 lignes).

## Exercices sans visuel à l'origine

| ID | Exercice | Visuel choisi | Particularité |
|---|---|---|---|
| 117 | Tractions assistées | `tractions-assistees.gif` | Assistance par machine ; méthode/bande réelle à saisir |
| 118 | Hang Power Clean | `hang-power-clean.gif` | Départ en suspension, réception haute |
| 119 | Pompes dynamiques | `pompes-dynamiques.gif` | Pompe classique en animation ; **intention de vitesse** indiquée par la consigne, pas clap forcé |
| 120 | Gainage frontal | `gainage-frontal.gif` | Isométrie : pose fixe volontaire |
| 109 | Pull-over poulie haute, barre large | GIF existant id 12 `straight-arm-pulldown-barre-pattern-papillon.gif` | Même matériel / geste |
| 115 | Mobilité active | GIF existant id 75 `plank-walkout-inchworm.gif` | **Exemple uniquement** : la séance prévoit une mobilité globale non détaillée |

## Provenance et licences

### Trois GIF issus de workout-motion

- Œuvre originale : [februarysea/workout-motion](https://github.com/februarysea/workout-motion), commit `424fbcc1548b6e14a2276bc0886c13c7a228eb81`.
- Mouvements : `assisted-pull-up`, `hang-clean`, `forearm-plank`.
- Source : SVG vectoriels dessinés par les auteurs ; conversion en GIF par les scripts de ce dépôt, sans recours à une banque commerciale d'images.
- **Licence : PolyForm Noncommercial 1.0.0**, pas MIT, limitée aux usages non commerciaux autorisés. Ne pas réutiliser ces GIF dans des produits commerciaux sans autorisation.
- Attribution exigée : **Required Notice: Copyright (c) 2026 februarysea and workout-motion contributors (https://github.com/februarysea/workout-motion)**.
- Textes d'origine : `docs/assets/workout-motion-LICENSE.txt` et `docs/assets/workout-motion-NOTICE.txt`.

### Pompes

- GIF de démonstration : `harshvishu/free-exercise-db-with-videos`, `.github/media/push-ups.gif`.
- Source : https://github.com/harshvishu/free-exercise-db-with-videos ; annonce licence MIT (voir `LICENSE` du dépôt).
- Correspond au **geste de la pompe**, pas à une obligation de saut ni de claquement des mains. La consigne de séance reste « poussée rapide ».
- L'empreinte Git blob de l'actif importé est contrôlée par le générateur pour éviter les changements de source silencieux.

## Hébergement, cache et ergonomie

- GIFs intégrés dans `public/exercise-gifs/` ; accessibles hors ligne après installation de la PWA via précache Workbox.
- Champ `dim_exercices.illustration_gif` configuré sur le chemin relatif `exercise-gifs/<nom>.gif` pour fonctionner en développement (`/`) et en production (`/competition/`).
- GIFs déjà hébergés sur Supabase conservés (pas de remplacement inutile). Le GIF de mobilité reste clairement identifié comme **exemple d'exercice**.
- Les animations ne doivent jamais remplacer la prescription (tempo, assistance, séries et mots-clés eau) ; ce sont des repères visuels.

## Contrôle d'intégrité

1. Tester chaque fichier GIF avec Pillow (format, nombre de frames, poids < 1,9 Mo).
2. Vérifier que les 15 exercices du cycle disposent d'un `illustration_gif` non nul.
3. Tester « Mon plan » et « Focus » sur mobile, online/offline et retour à l'application après une mise à jour PWA.
