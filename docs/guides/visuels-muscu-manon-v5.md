# Visuels des exercices — Manon BURGY (200 NL V5)

Source : cycle Manon BURGY, 16/11/2026–27/06/2027. 15 exercices distincts (535 occurrences).

## Catalogue

| ID | Exercice | Visuel |
|---|---|---|
| 2 | Développé couché | GIF existant |
| 8 | Box Jump | GIF existant |
| 17 | Bench Pull explosif/rapide | GIF existant |
| 26 | Back Squat | GIF existant |
| 45 | Pallof press | GIF existant |
| 47 | Gainage latéral | GIF existant |
| 49 | Face pull | GIF existant |
| 54 | Lancer latéral MB | GIF existant |
| 60 | Bench Pull force/technique | GIF existant |
| 109 | Pull-over poulie haute | GIF existant du *Straight-Arm Pulldown barre* (ex. 12) |
| 115 | Mobilité active | GIF original : épaules / bassin / jambes |
| 117 | Tractions assistées | GIF original avec élastique, sans le confondre avec une traction stricte |
| 118 | Hang Power Clean | GIF original, départ suspendu et réception haute |
| 119 | Pompes dynamiques | GIF original, poussée rapide |
| 120 | Gainage frontal | GIF original, maintien statique, sans reps |

## GIF originaux

Source : `scripts/generate-manon-gifs.mjs`, programme dessiné et encodé directement avec `gifenc` (MIT). Aucun emprunt de média protégé à une bibliothèque de GIFs.

- 320×220 px, 18 images, ~2 s en boucle.
- Stockage public généré dans `public/exercise-gifs/manon/` via `prebuild` / `predev`.
- Déployé à `/competition/exercise-gifs/manon/<id>-<nom>.gif`.
- GIF inclus dans le précache Workbox grâce à `globPatterns` (`gif`).
- Les schémas montrent le *mouvement général*, pas tous les réglages ni la vitesse réelle. Les prescriptions de charge, d'assistance et de tempo restent dans la fiche de séance, non dans le GIF.
- Ne pas utiliser le GIF d'une traction stricte pour une traction assistée, ni un power clean au sol pour un hang power clean.

**Limite de l'audit :** disponibilité des 9 fichiers préexistants vérifiée en base et dans Storage ; lisibilité image par image non contrôlée avec un lecteur GIF. Vérifier le rendu réel sur iPhone lors de la recette.

## Modification de la bibliothèque

Le programme des 32 semaines et les 535 prescriptions restent inchangés. Les URL `dim_exercices.illustration_gif` sont modifiées uniquement pour les IDs concernés, après merge et déploiement des assets.

Si un nouveau cycle réutilise ces mêmes IDs, il bénéficie des GIFs à l'identique.
