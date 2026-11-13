# Focus musculation — sécurisation des séances PWA (13/11/2026)

## Objectif

Une séance doit rester récupérable après un kill iOS, une navigation dans l'app ou une coupure réseau. Une synchronisation ne peut être annoncée comme réussie si des séries manquent ou si aucun enregistrement distant n'a été mis à jour.

## Changements proposés

- **Réconciliation par identité** `exercise_id + set_index` : ne plus utiliser `remoteCount` puis `logs.slice(remoteCount)` (échec si les séries 1 et 3 ont été sauvées, mais pas la 2). Le résultat `errors` bloque désormais la finalisation.
- **Création hors ligne** : ID numérique négatif (compatible avec le state React actuel) ; les logs restent localement jusqu'à leur enregistrement atomique. Reconnaissance des anciens IDs locaux `Date.now()` supérieurs à l'entier SQL 32 bits.
- **Déduplication serveur** : migration `00230_strength_run_offline_dedup.sql` et RPC `save_strength_run_offline_idempotent`, index unique par athlète et clé cliente. Protège contre le cas « écriture réussie, réponse HTTP perdue ». Réutilise les autorisations existantes de `save_strength_run_atomic`.
- **File locale** : les mutations musculation critiques ne sont plus supprimées automatiquement après 7 jours ou 5 tentatives. Les mutations sont rejouées seulement sous le compte athlète correspondant.
- **Restauration** : ne plus écraser le snapshot avant que les effets de restauration React soient terminés ; autoriser la reprise en mode `list` ; `nav:reset` ne détruit pas une séance active ; bouton « Reprendre » visible dans Muscu.
- **Brouillons** : ne plus effacer la saisie à la simple pression de « Enregistrer » ; restaurer les entrées de charge/répétitions et l'échéance du repos.
- **PWA** : éviter la recharge automatique de version au milieu d'une séance active ; le Focus partage le diagnostic réseau de l'app.

## Ordre de déploiement (IMPORTANT)

1. Déployer **d'abord** la migration SQL `00230_strength_run_offline_dedup.sql` sur Supabase.
2. Vérifier l'existence de `public.save_strength_run_offline_idempotent(jsonb)` et les permissions `EXECUTE` du rôle `authenticated`.
3. Déployer ensuite la branche frontend / PWA après validation de la PR et des tests CI.
4. Tester sur iPhone PWA réel les transitions Wi-Fi → 4G → mode avion → reconnexion.

Une version frontend déployée avant la migration ne pourra pas synchroniser les nouvelles séances créées hors ligne : il faut respecter cet ordre.

## Scénarios de recette

| Parcours | Attendu |
| --- | --- |
| Réseau normal, 3 séries puis terminer | 1 séance, 3 séries, statut terminé |
| Série 1 et 3 distantes, série 2 absente | série 2 seulement retransmise, aucun faux succès |
| Démarrer en mode avion, saisir puis se reconnecter | 1 séance serveur créée atomiquement, séries et 1RM associées |
| Terminer hors ligne et relancer après 8 jours | mutation conservée jusqu'à synchronisation |
| ACK perdu sur sauvegarde d'une séance locale | même `client_dedup_key` : 1 seule séance distante |
| Quitter Focus via la navigation, tuer la PWA puis rouvrir | séance restaurée et bouton Reprendre disponible |
| Kill iOS pendant un repos | échéance absolue du repos récupérée |
| Échec d'enregistrement final permanent | brouillon non supprimé, possibilité de réessayer |
| Basculer vers un autre compte sur le même appareil | pas de replay des données muscu de l'athlète précédent |

## Limites restant à traiter

- L'identifiant distant actuel des séries est `(run_id, exercise_id, set_index)`. Deux occurrences distinctes du même exercice, toutes deux avec une « série 1 », ne peuvent pas encore être différenciées. Ce patch refuse les collisions ambiguës au lieu d'annoncer un faux succès ; une migration vers `session_item_id` / UUID de série est recommandée.
- `Mon plan` ne garde plus de cache PWA persistant depuis le correctif fraîcheur #82. Une ouverture entièrement hors ligne, sans séance déjà préparée, peut rester indisponible. Prévoir un cache snapshot lecture seule versionné sans réintroduire de plan périmé en ligne.
- Les API Safari/iOS ne garantissent pas un service worker de fond continuellement actif : la file sera synchronisée au retour dans l'app et à la connexion, pas pendant que la PWA reste suspendue.
- Un vrai test instrumenté sur iPhone ainsi qu'une recette d'intégration Supabase après migration sont indispensables. Les tests automatisés de la PR vérifient les unités et l'UI simulée ; ils ne constituent pas une preuve de robustesse à 100 % en conditions physiques.

Aucune donnée de production n'est modifiée par cette branche ; la migration sera appliquée uniquement après fusion/déploiement selon le processus opérationnel habituel.
