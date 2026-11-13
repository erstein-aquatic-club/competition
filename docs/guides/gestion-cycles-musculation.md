# Musculation — ajout, génération et cycle de vie d'un plan

> État des lieux vérifié le **13 novembre 2026** sur le code de `main` et le schéma/données de l'instance EAC. Document d'exploitation et de conception, **pas** une procédure autorisant des modifications SQL manuelles en production. 
>
> **Règle d'or : un cycle doit être publié comme une opération atomique et réversible.** Une ligne `strength_mesocycles` seule ne suffit pas à créer un plan cohérent.

## 1. Vocabulaire et sources de vérité

- **Macrocycle** : préparation d'ensemble orientée vers un objectif sportif ; la base de données ne contient pas actuellement une entité "macrocycle" autonome. La préparation de saison `kind='season'` et le bloc inter-compétitions `kind='inter_competition'` sont tous deux enregistrés comme **mésocycles** dans `strength_mesocycles`. Ne pas confondre échelle de planification et nom de table.
- **Mésocycle** : objet de suivi (`athlete_id`, `event_group`, `kind`, `target_week_count`, `sessions_per_week`, `start_week_monday`, `status`, `engine_version`, `bucket_priorities`). Sert à la bannière de « Mon plan », au suivi coach et à la génération.
- **Séance modèle** : `strength_sessions`, ses exercices `strength_session_items` (séries, répétitions, intensité, récupération, `raw_payload`). La séance est exécutable via le lecteur / runner.
- **Séance datée** : `strength_planning_slot_overrides` (nageur, lundi ISO, jour 0=Lun…6=Dim, créneau, `session_template_id`, notes). Les phases/badges hebdomadaires proviennent de `strength_planning_week_overrides.week_type`.
- **Snapshot** : `strength_planning_snapshots`, état antérieur des *overrides* dans la fenêtre de publication ; indispensable pour revenir en arrière sans perte.
- **Autres systèmes historiques** : `training_plans` + `training_plan_sessions` + `training_plan_applications`, planning de groupe `strength_planning_slots`, dossiers `strength_folders`. Ils **coexistent** avec les mésocycles. `training_cycles` ne pilote **pas** directement la timeline « Mon plan » musculation.

### Chaîne de lecture effective de « Mon plan »

`src/components/strength/MyPlanTab.tsx` assemble 12 semaines à partir du lundi courant (date **locale**) et charge :

1. Le profil de l'athlète, ses `training_plan_applications` et leurs `training_plan_sessions` (**Phase 3** historique).
2. Les `strength_planning_slots` du groupe, les `strength_planning_slot_overrides` de l'athlète, et ses `strength_planning_week_overrides` (**Phase 2**), fusionnés par `mergeStrengthSlots`.
3. Les dossiers personnels `strength_folders` et le catalogue `strength_sessions` (**Phase 1**, repli).
4. Le mésocycle marqué `active` : déclenche la bannière (objectif, période, semaine X/Y, date de génération) et change la priorité.

**Priorité actuelle de source, calculée sur l'ensemble de la fenêtre et non semaine par semaine** :

- Mésocycle `active` + au moins un slot Phase 2 : **Phase 2 > Phase 3 > Phase 1**.
- Sinon : **Phase 3 > Phase 2 > Phase 1**.
- Le nom du badge de semaine = `week_type` ; l'intitulé de chaque séance = `strength_sessions.name` / `title` ; les points = nombre de séances ; le lecteur déplie les `strength_session_items`.
- Si aucune donnée reconnue : état vide ou repli dossiers. Une erreur / latence d'une requête peut actuellement faire apparaître brièvement la mauvaise source, car la garde de chargement de `MyPlanTab` se fonde surtout sur les dossiers.
- La bannière n'est pas la preuve que toutes les semaines/séances sont matérialisées : `active` et les slots sont lus séparément.
- `status='active'` n'est **pas** automatiquement mis à `completed` à la fin des semaines ; la bannière peut afficher « Cycle terminé » tout en conservant ce statut en base.
- `useStrengthPlanByISO.ts` (calendrier / autres vues) utilise principalement les slots de groupe + overrides ; sa fenêtre (12 semaines et semaine précédente) et sa logique ne sont pas entièrement identiques à celles de `MyPlanTab`. Tester toute évolution sur **les deux surfaces**.

**Point UX :** un titre tel que `Nom du fichier | AAAA-MM-JJ | Force haut` n'est pas un nom adapté à une carte mobile. Conserver la provenance dans des métadonnées, afficher **« Force haut »** sur la carte et les informations techniques dans le détail.

## 2. Parcours A — générer un cycle avec le moteur existant

Parcours actuel : `MesocycleEntry` → `/strength/mesocycle-generate` (ou `/coach/mesocycle-generate/:athleteId`) → `/strength/mesocycle-preview` → RPC `apply_strength_mesocycle` → « Mon plan ».

### Préparation

1. Vérifier la **cible** (`athlete_id`) et les droits coach/admin. Pour un nageur, cible = lui-même. Une évaluation `strength_assessments` `bilan_pending` ou `completed` est requise (confiance réduite possible si bilan incomplet).
2. Vérifier les données de contexte : profil (âge, sexe), niveau/tier dans `strength_athlete_settings`, questionnaire et tests, KPI récents, rapports de douleurs/contre-indications, 1RM/charges du catalogue, équipements/exercices taggés dans `dim_exercices`.
3. Choisir la **nage** + la **distance** (taxonomie `strength_stroke_signatures` × `strength_distance_profiles`), le type de préparation (`season` / `inter_competition`), le nombre de semaines (bornes du profil), les jours choisis, les jours « amorce SNC », et la **date réelle de départ**. Le nombre de séances/semaine = nombre de jours cochés.
4. L'écran écrit les paramètres provisoires dans `sessionStorage['eac_pending_mesocycle_params']`. Ne pas considérer ce stockage client comme un brouillon fiable ou un identifiant de publication.

### Fabrication

5. `composeTemplate` associe signature de nage, profil de distance et type de préparation. `generateMesocyclePreview` appelle le moteur **local** `src/lib/strength/mesocycleEngine.ts`, sans écrire en base. Les tables `strength_periodization_templates` historiques (14 modèles) documentent la doctrine, mais le parcours contemporain compose le modèle nage × distance ; `p_template_id` de l'apply reçoit `null`.
6. Le moteur calcule notamment les scores/priorités de qualités (force/puissance haut et bas, mobilité, tronc/psychologie), sélectionne des exercices du catalogue en filtrant compatibilité et contre-indications, alloue les volumes, répartit les phases et prescriptions semaine par semaine, ajoute échauffement/mobilité/activation. Les 6 cycles techniques sont `prepa_generale`, `force_max`, `puissance`, `maintien`, `affutage`, `pic`.
7. **Attention :** les plages `sets/reps/intensityPct1rm` de `periodizationCycles.ts` décrivent une intention mais ne bornent pas toutes les sorties. Les cycles de force et les modulations de puissance utilisent largement les **valeurs par exercice de `dim_exercices`** (par ex. puissance = % de force – 15 points), avec des règles d'affûtage. Auditer réellement la séance obtenue : ne pas déduire ses paramètres du seul label de phase.
8. L'aperçu doit permettre la revue **de chaque semaine et chaque séance**, y compris le nombre d'exercices *principaux* vs exercices d'échauffement, les jours, l'objectif, les douleurs et les charges. La combinaison de plusieurs épreuves à poids différents n'est **pas** un champ natif du formulaire courant : un libellé composite importé n'induit pas une composition multi-épreuves du moteur.

### Publication atomique

9. `applyMesocycle(input, generated, startDate)` sérialise en `p_weeks` et appelle `apply_strength_mesocycle` (RPC, timeout côté client 30 s).
10. Dans **une transaction** la RPC : autorise la cible ; marque l'ancien mésocycle `superseded` ; crée le nouveau mésocycle ; enregistre un **snapshot** de la fenêtre ; nettoie les overrides de la fenêtre ; crée des `strength_sessions` + `strength_session_items` taggés (`raw_payload.engine_source='mesocycle'`, `mesocycle_id`, `week_number`, etc.) ; recrée phases et slots datés. Si départ mardi, le lundi de la semaine sert d'ancrage mais les séances **avant la date réelle** ne sont pas posées.
11. La UI invalide les caches React Query et revient à la vue nageur ou coach. Elle relit le mésocycle actif si l'appel réseau échoue après un succès serveur supposé. **Une requête timeout n'autorise pas à relancer aveuglément l'apply**.
12. Vérifier après écriture : un seul `active` pour le nageur, N semaines de phase, nombre de séances attendu (hors 1re semaine partielle), toutes les références de séances résolues, tous les exercices présents, provenance et snapshot présents ; affichage cohérent dans « Mon plan » et calendrier.

### Ajuster et annuler

- Ajustement coach : `/strength/mesocycle-adjust/:athleteId` → nouvelle preview → **nouvel apply** avec `week_offset`. Le plan antérieur est `superseded`, pas édité à l'aveugle.
- Rejet : `revert_strength_mesocycle(id)` utilise **les tags `mesocycle_id` des items et le snapshot** pour supprimer les séances concernées et restaurer les overrides précédents. **Ne jamais appeler cette RPC sur un cycle importé hors protocole**, même si `strength_mesocycles.status='active'`.
- Ne pas effacer des séances historiques exécutées / liées à `strength_session_runs` ou `strength_set_logs` sans stratégie explicite de conservation.

## 3. Parcours B — importer un plan externe (PDF, tableur, programme coach)

### État aujourd'hui

**Il n'existe pas, dans le parcours moteur étudié, d'importateur PDF transactionnel équivalent à `apply_strength_mesocycle`.** Un import réalisé en ajoutant directement des enregistrements aux tables peut bien alimenter « Mon plan » sans hériter des protections du moteur.

Contrôle réel, **cas d'import daté du 10/11/2026** (sans informations personnelles) :
- Cycle `active` de 6 semaines à partir du lundi 09/11, 4 séances nominales/semaine.
- **23** slots datés de 09/11 à 14/12 : 3 la première semaine (départ effectif mardi), puis 4 par semaine. Lundi absent en S46 = **attendu**, pas un bug.
- Séances importées présentes, avec 2 à 4 exercices et des labels de phases lisibles.
- **0 snapshot** lié à ce mésocycle ; **0 item** portant son `raw_payload.mesocycle_id` ; `bucket_priorities={}` ; `engine_version` identifie une origine PDF manuelle.
- Une application historique `training_plan_applications` de 10 semaines subsiste pour le même nageur, **sans `end_date`**. Tant que les overrides du méso sont visibles, la Phase 2 l'emporte. Après disparition de cette fenêtre, le repli et les libellés peuvent être ambigus.
- Risque critique : le **revert actuel** accepte un `snapshot` absent en le traitant comme un tableau vide ; faute de tags, il ne retrouve pas les templates à supprimer. Il peut donc **marquer le mésocycle `reverted` tout en laissant ses séances planifiées intactes**. Ne pas lancer ce revert sur cet import.

### Procédure d'ajout sûre **avec l'architecture existante** (en attendant un importateur)

**Aucune écriture ad hoc directement en production**. Pour un PDF :

1. Convertir le PDF en **données structurées** revues par un coach : identité cible (id, pas nom seul), titre propre, objectif(s), origine, date de compétition, date de début, nombre de semaines, liste de dates de séances, rôle (force/puissance/amorce/repos), type de semaine et exercices.
2. Associer chaque exercice à un **`dim_exercices.id` existant**. Vérifier séries, répétitions, %1RM / charge absolue (ne pas les confondre), récupération entre séries / exercices, notes, ordre, échauffement vs principal. Enregistrer la source dans une métadonnée, pas dans chaque titre affiché.
3. **Valider hors production** : dates au calendrier civil local (lundi ISO, jour 0–6), phase et semaine, maximum d'exercices principaux selon les contraintes **du programme concerné**, non-doublon de date/créneau, exercice existant, prévention blessures et jours de récupération. Afficher le diff avec le plan courant.
4. Publier exclusivement via une **RPC transactionnelle dédiée** (à développer, §4) ou un pipeline DBA versionné reprenant toutes les garanties de l'apply : snapshot AVANT remplacement, marqueurs de provenance sur chaque item, lien `mesocycle_id`, statut unique, suppression contrôlée des anciens slots, retour d'un identifiant et vérification post-écriture.
5. Vérifier 3 vues : « Mon plan », calendrier, détail/exécution d'une séance. Tester aussi le remplacement et un retour arrière sur données de test avant toute utilisation en production.

**Ne pas** bricoler l'import en ajoutant seulement `strength_mesocycles` + `strength_planning_slot_overrides` : c'est une publication non réversible.

## 4. Simplification recommandée du flux

Objectif produit : **une seule porte d'entrée « Nouveau cycle »**, deux origines, **un seul contrat de publication**, un seul lecteur de plans.

### Étapes UI cibles

1. **Cible + source** : « Générer avec le moteur » / « Importer une programmation » (PDF, CSV ou saisie structurée).
2. **Paramètres communs** : athlète, objectif(s) et distances, compétition cible, date de départ, durée, créneaux/jours, provenance. En mode import, ne pas réappliquer les modèles sportifs du générateur.
3. **Prévisualisation commune** : calendrier de semaines, phases, séances, exercices, volumes et alertes ; contrôler les doublons, la date de compétition, le nombre d'exercices et la fraîcheur des données.
4. **Impact explicite** : « Remplacera les semaines du … au … », nombre de séances modifiées, plan actif actuel, snapshot préparé, risque d'effacer des changements coach postérieurs. Confirmation unique.
5. **Publier** via **un service** qui matérialise le format canonique `CycleDraft` (quelle que soit l'origine). L'ancienne et la nouvelle version restent traçables. Récapitulatif + lien direct vers la semaine 1.

### Contrat `CycleDraft` proposé (non implémenté)

```ts
type CycleDraft = {
  athleteId: number;
  source: { type: "engine" | "pdf" | "manual"; reference?: string; version?: string };
  objectives: { stroke: string; distance: string; priority?: number }[];
  kind: "season" | "inter_competition";
  startDate: string; // YYYY-MM-DD local
  targetCompetitionDate?: string;
  weeks: Array<{
    monday: string; // ISO, lundi
    phaseLabel: string;
    sessions: Array<{
      date: string; timeSlot: "morning" | "afternoon" | "evening";
      label: string; role?: string; notes?: string;
      exercises: Array<{
        exerciseId: number; block: "warmup" | "main";
        order: number; sets?: number; reps?: number;
        pct1rm?: number; restSeconds?: number; notes?: string;
      }>;
    }>;
  }>;
  clientRequestId: string; // clé d'idempotence unique par publication
};
```

### Invariants serveur (non négociables)

- **Transaction unique + verrou par athlète** (`pg_advisory_xact_lock` ou verrou de ligne approprié) pour éviter les deux publications concurrentes ; **idempotence** `clientRequestId` persistée et indexée ; une seule version active par athlète (index partiel possible après nettoyage).
- Vérification forte du rôle / cible depuis le contexte authentifié, jamais depuis les champs fournis par le navigateur ; RLS vérifiée, aucun secret `service_role` dans le client.
- Snapshot **toujours présent** (un tableau vide est autorisé **seulement si un snapshot existe réellement**) ; identité de chaque élément généré / importé liée au cycle via **colonnes / tags explicites** ; pas de recherche par un préfixe de titre ou de notes.
- **Provenance structurée** (`source_type`, `source_reference`, `published_at`, `published_by`, version du moteur / empreinte de l'import) ; `event_group` canonique, sans libellé composite opaque ; objectifs multiples dans un champ dédié si besoin.
- Id de plan versionné et fenêtre **bornée par dates**, sans purge des semaines hors périmètre ; préserver les sessions déjà exécutées. Avant remplacement, calculer les différences et détecter les modifications intervenues depuis l'aperçu (**conflit optimiste**).
- Revert **défensif** : si snapshot absent, refuser avec message et **ne jamais modifier** le statut. Ne supprimer/restaurer que les éléments appartenant au cycle et prévus par le snapshot ; journaliser l'événement. Éviter toute restauration automatique qui écrase une édition coach ultérieure.
- **Lecteur canonique par semaine** : résolution de la source pour chaque semaine (et pas « un slot dans 12 semaines => tout est Phase 2 »), période réelle, tags de provenance et états explicites (futur/en cours/terminé/archivé) ; même fonction de résolution pour dashboard/calendrier/« Mon plan ». Limiter la portée du catalogue chargé aux sessions du nageur.
- Un préflight sans mutation retourne : erreurs bloquantes (jours, IDs, doublons, dates), avertissements (séries, fatigue/volume, objectifs multiples non pris en charge) et **diff** de planning. Les alertes métier sont configurables par épreuve/profil, pas un plafond global arbitraire.

### Découpage d'implémentation recommandé

| Priorité | Livraison | Vérification |
|---|---|---|
| **P0** | Bloquer le revert si snapshot absent + test ; contrôle d'intégrité du cycle importé actif | Aucune mutation si import incomplet |
| **P0** | Affichage de titre court (sans `PDF | date`) et état de chargement multi-sources | Cartes mobiles lisibles, aucun flash d'ancien plan |
| **P1** | Service unique de lecture (`resolveStrengthPlanWeek`) entre MyPlan et calendrier ; priorité source par semaine | Transitions et fins de cycles sans régression |
| **P1** | RPC transactionnelle `publish_strength_cycle` + staging/validation + snapshot + idempotence + schéma de provenance | Import PDF et moteur publient le même format |
| **P2** | Wizard deux sources avec aperçu/diff commun ; import CSV/PDF revu par coach | Publication en 5 étapes, annulation sûre |
| **P2** | Nettoyage guidé des `training_plan_applications` anciennes et gestion explicite des cycles achevés | Pas de repli silencieux sur plan périmé |

## 4 bis. Fraîcheur des plans dans la PWA (correctif PR #81)

**Problème identifié le 13/11/2026 :** la durée de fraîcheur React Query (10 min), la persistance de requêtes (24 h) et le Workbox `NetworkFirst` Supabase (cache de secours à 5 s, max 1 h) pouvaient donner des plans périmés. L'invalidation historique de `MesocyclePreview` oubliait `strength_catalog`, empêchant de voir immédiatement le détail des nouvelles séances.

**Invariant de produit :** un plan publié et validé par Supabase est visible par un utilisateur connecté et en ligne sans attendre l'expiration d'un cache PWA. Le délai réseau normal reste inévitable ; on n'affiche pas un succès si la publication serveur échoue. En cas d'absence de réseau, ne pas confondre les anciennes données éventuellement disponibles avec un plan à jour.

**Implémentation proposée dans la PR #81 (à déployer et vérifier) :**

1. **HTTP :** la règle Workbox `NetworkOnly` pour les tables REST de planification et modèles de séance est définie **avant** le `NetworkFirst` Supabase générique. Pas de réponse ancienne depuis CacheStorage en cas de timeout. Le cache des actifs statiques (JS/CSS) et des autres domaines fonctionnels reste intact.
2. **Mémoire React Query :** les clés critiques (`strength-mesocycle-*`, `strength_planning_*`, `strength-planning-*`, `strength_catalog`, `training_plan_*`, `strength_folders`) passent en `staleTime=0`, `refetchOnMount='always'`, `refetchOnWindowFocus='always'`, `refetchOnReconnect='always'`. Les callbacks de publication/édition appellent `invalidateStrengthPlanningQueries` pour les deux conventions de clés.
3. **Persistance locale :** les clés critiques sont exclues du snapshot React Query localStorage. Les autres données restent cachées pour le mode hors ligne. **Compromis assumé :** un démarrage PWA totalement hors ligne ne peut pas promettre l'affichage des plans si aucune donnée récente n'a été chargée dans le processus courant ; une solution offline dédiée et explicitement horodatée pourra être envisagée ultérieurement.
4. **Synchronisation distante :** `StrengthPlanningSync` sous le QueryClientProvider s'abonne aux changements Supabase Realtime (publication SQL `00229_strength_planning_realtime.sql`) pour les mésocycles, affectations et créneaux ; l'abonnement concerne le nageur/groupe ou le coach selon son rôle. Un événement **ne modifie pas** localement les séances : il invalide les clés et provoque une relecture canonique.
5. **PWA iOS suspendue :** `visibilitychange`, `pageshow`, `focus`, `online` et reconnexion du canal déclenchent également une relecture ciblée. Pas de `window.location.reload()` forcé qui risquerait une page blanche ou une perte de saisie.
6. **Migration :** Realtime Postgres Changes n'était pas activé sur ces tables à la date de l'audit. Le mécanisme distant ne fonctionnera pleinement **qu'après l'application de la migration 00229** et l'activation du nouveau code client. Vérifier les politiques RLS avant toute extension du périmètre temps réel.

**Recette avant fusion/déploiement :**
- Publier depuis une autre session/appareil un cycle de 6 semaines et vérifier que la PWA nageur déjà ouverte montre le nouveau cycle et ses séances sans rechargement manuel.
- Faire de même pour une nouvelle `training_plan_application`, un créneau sportif modifié, un jour de repos et une suppression (les suppressions sont rattrapées à la reprise/reconnexion, pas via un filtre Realtime DELETE).
- Répéter avec PWA en arrière-plan puis retour au premier plan, en Wi-Fi lent et après déconnexion/reconnexion ; confirmer l'absence de plan figé lié au cache.
- Vérifier que les domaines non-musculation gardent leurs caches et qu'aucune donnée d'un autre nageur n'est visible par le canal Realtime (RLS).
- Exécuter les tests TypeScript/Vitest et tester une installation PWA iOS réelle ; les tests unitaires de catégorisation du cache ne remplacent pas le test réseau/realtime.

---

## 5. Contrôles de qualité et tests à ajouter

- **Chemin nominal** : un plan de 6 semaines, démarrant mardi, avec 3 puis 4 séances/semaine, apparaît dans « Mon plan », calendrier, lecteur et runner. Les journées absentes restent absentes.
- **Source mixte** : une ancienne application `training_plan_applications` coexiste ; seule la nouvelle planification s'affiche pour ses semaines, sans revenir à l'ancienne pendant le chargement ou après son terme.
- **Titres** : le texte source/provenance ne pollue pas les cartes ; il reste accessible au besoin.
- **Snapshot/revert** : restauration exacte sur import et génération ; si snapshot absent, **erreur explicite sans mutation** ; pas de suppression de séances exécutées, pas d'écrasement d'édition postérieure.
- **Idempotence/concurrence** : double clic, retry timeout, deux coachs concurrents produisent **une seule publication**, sans doublons.
- **État et RLS** : athlète A ne peut pas cibler B ; un coach autorisé peut publier ; aucun `SECURITY DEFINER` n'expose une mutation non autorisée.
- **Fuseaux** : lundi calculé en date locale, passages été/hiver, semaines S52/S01 ; `startDate` distinct de `start_week_monday`.
- **Moteur** : respecter le contenu du programme de sprint (quelques exercices principaux, vraie récupération) et vérifier les valeurs produites à partir de `dim_exercices`, pas seulement les bornes déclaratives des phases.

## 6. Fichiers et points d'entrée

| Sujet | Source |
|---|---|
| Vue nageur / arbitrage des sources | `src/components/strength/MyPlanTab.tsx`, `MyPlanWeekCard.tsx`, `MyPlanSessionRow.tsx` |
| Bannière / numérotation | `MyPlanMesocycleBanner.tsx`, `src/lib/strength/mesocycleProgress.ts` |
| Calendrier | `src/hooks/useStrengthPlanByISO.ts` |
| Démarrage / formulaire | `src/components/strength/MesocycleEntry.tsx`, `src/pages/MesocycleGeneration.tsx` |
| Aperçu / publication / résilience réseau | `src/pages/MesocyclePreview.tsx` |
| Génération et modalités de charge | `src/lib/strength/mesocycleEngine.ts`, `mesocycleEngine.types.ts`, `composeTemplate.ts`, `periodizationCycles.ts` |
| API et matérialisation | `src/lib/api/strength-mesocycles.ts`, migration `supabase/migrations/00227_apply_mesocycle_carry_corrective_payload.sql` |
| Retour arrière | `supabase/migrations/00173_revert_strength_mesocycle.sql`, `CoachMesocyclePanel.tsx` |
| Plan coach historique et slots | `src/lib/api/training-plans.ts`, `src/lib/api/strength-planning.ts`, `src/lib/strengthPlanningMerge.ts` |
| Recherches antérieures | `docs/audits/2026-05-30-audit-flux-mesocycle.md`, `docs/plans/bilan-muscu-mapping-mesocycle-planning.md` |

---

**Statut de ce document** : diagnostic vérifié + procédure d'exploitation prudente + spécification proposée. Les garde-fous et la fraîcheur PWA font l'objet de la PR #81 (non déployée tant que non fusionnée et migrée) ; le parcours d'import unifié reste à développer.
