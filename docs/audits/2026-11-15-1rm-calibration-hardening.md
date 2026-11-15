# Patch 1RM — calibration facultative, catalogue explicite, offline

## Principes

- Une série reste enregistrable même si aucune 1RM n'est connue.
- La calibration n'est **jamais** proposée avant que la recherche des références de l'athlète soit terminée sans erreur. Hors ligne, elle ne se lance pas automatiquement.
- `one_rm_eligible` est un opt-in explicite côté catalogue, **false** par défaut. La métrique en kg ne suffit pas à rendre le test pertinent.
- Échauffement, PDC, pliométrie, gainage, métriques hauteur/distance/temps : aucune demande automatique de 1RM, aucun record estimé automatiquement.
- Une 1RM déjà connue n'entraîne aucun appel à la calibration. L'athlète peut demander un recalcul ou saisir une valeur directement sans quitter le Focus.
- La saisie et le calcul explicites passent par la queue hors ligne `record-1rm-update` et la RPC `set_strength_1rm_reference`. Les références explicitement choisies ne peuvent plus être écrasées par une série ordinaire.
- Les anciennes 1RM non pertinentes ne sont **pas supprimées** par la migration. L'interface Mes Records masque les exercices non éligibles.

## Déploiement (ordre obligatoire)

1. Déployer la migration `00231_strength_one_rm_eligibility.sql` (ajout colonne, classification initiale, trigger d'intégrité et RPC).
2. Vérifier la visibilité des colonnes et l'accès à la RPC pour une session nageur standard, ainsi que le refus RLS sur un autre athlète.
3. Déployer le frontend, y compris le nouveau service worker/PWA.
4. Vérifier les configurations spécifiques au club : un coach peut modifier `one_rm_eligible`, toujours false par défaut sur les nouveaux exercices.

## Smoke terrain à effectuer avant fusion

- 1RM existante, réseau rapide/lent : aucune carte RIR ; modifier la 1RM depuis Focus et Mes Records.
- Athlète sans 1RM : carte RIR uniquement sur exercice de force `one_rm_eligible=true` prescrit en % ; actions « Saisir ma 1RM » / « Continuer sans calcul ».
- Simulation PWA hors ligne puis redémarrage : pas de calibration forcée ; valeur saisie retrouvée via queue ; synchronisation au retour en ligne.
- Pliométrie (Depth Jump, Box Jump, squat sauté), PDC (pompes, tractions assistées), gainage et mobilité : aucune calibration, aucun bouton de recalcul, séries validables.
- Exercice de force avec % et référence absente : saisie charge + reps possible ; pas de boucle ni de repositionnement du Focus.
- Saisir une référence volontairement plus faible que le record historique, enregistrer une série plus lourde : la référence saisie doit rester inchangée.
- Reprise d'une séance interrompue et substitution d'exercice : pas de réapparition de la calibration sur un mouvement exclu.

## Limites

- Le test complet du bouton « Valider série » (drawer clavier numérique) est à effectuer en E2E/terrain : le harness jsdom existant ne le pilote pas de manière fiable.
- Les références des mouvements explosifs avec charge (p.ex. squat sauté chargé) nécessitent un futur mapping vers une **autre** 1RM de référence si le coach le souhaite ; le patch n'invente pas de maximum propre à un saut.
- Vérifier en préproduction les règles RLS existantes sur `one_rm_records` et l'ordre de la migration avant toute mise en ligne.
