# Audit Bilan Muscu §293 — 2026-05-20

*Audit en lecture seule du flux Bilan Muscu → Mésocycle livré par les
Chantiers C + D, vagues A/B/C et fixes UX (commits `0ab5a3752` à
`824f75a71`).*

## Synthèse exécutive

**État global** : 🟢 — Le flux bout-en-bout est solide. RPC `apply` / `revert`
correctement transactionnelles et auto-authentifiées, RLS coach club-wide
cohérente avec `strength_assessments`, moteur TS pur testé (51 unit + 12 API
+ 25 RLS = 88 tests verts dédiés), invariant `[primary, complement?, mobility?]`
vague C respecté côté engine et RPC.

- **Findings critiques** : **0**
- **Findings moyens** : **3**
- **Findings mineurs / dette propre** : **4**

**3 recommandations prioritaires** :

1. **Nettoyer `is_core` héritage §291 sur `upper_strength`** — 8 des 14 cores
   sont du gainage (L-Sit, Ab Wheel, Hollow Body Hold, Planche…). Pour un
   nageur `advanced`, le tri `level desc` du moteur fait remonter L-Sit
   (advanced) avant les Tractions Prise Neutre / Dips (intermediate) → focus
   sprint upper_strength devient **gainage** au lieu de **tirage**. Pour un
   nageur `beginner`, **les 4 cores beginner sont uniquement du gainage**
   (Abdos, Plank walkout, Hollow Body Hold, Planche dynamique). La vague A
   McEvoy (mig `00174`) ajoute 6 piliers mais ne dégage pas le legacy — la
   promesse McEvoy n'est tenue que pour le cas central « sprinter
   intermediate ».
2. **Aligner `max_week_count=16` avec Σ_max_weeks=17** sur le template
   `sprint_50 saison` (mig `00175`). Le moteur `periodize` accepte jusqu'à
   17 semaines, mais l'UI clampe à 16. Asymétrie résiduelle sans impact
   immédiat (UI bornée), à fixer pour cohérence.
3. **Indexer `strength_session_items.raw_payload->>'mesocycle_id'`** — la
   RPC `revert` et `getMesocycleSessionsContent` filtrent là-dessus sans
   index → seq scan. OK pour 0-1 mésocycle/nageur ; à anticiper si N²
   mésocycles × 480 items/coup.

## Résultats par axe

### 3.1 Sécurité / RLS — 🟢

- **RPC `apply_strength_mesocycle`** (`00172`, l. 41) : `SECURITY DEFINER`
  confirmé en base (`pg_proc.prosecdef = true`). Garde-auth ligne 76-80 :
  ```sql
  IF v_caller_id <> p_athlete_id AND v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'apply_strength_mesocycle: caller % not authorized'
  ```
  → un nageur **ne peut pas** appliquer un mésocycle pour un autre nageur.
  Couvert par le test RLS RPC « autre athlète bloqué » (`strength-mesocycle-rpc.test.ts`).
- **RPC `revert_strength_mesocycle`** (`00173`, l. 64-73) : auth identique
  + **refuse les non-`active`** : `IF v_status <> 'active' THEN RAISE EXCEPTION`.
  Couvert par les tests RLS RPC.
- **Scope coach club-wide** : `pg_policies` renvoie 2 policies par table
  (`_own` athlète + `_coach` FOR ALL coach/admin). Cohérent avec la mig
  corrective `00171` qui aligne sur `strength_assessments`.
- **Override sécurité** (`mesocycleEngine.ts:207-262`) : `prioritizeBuckets`
  applique l'override mobility ligne 237-245 — si `painZones.length > 0` OU
  `dysfns.length > 0`, mobility est splice() en tête et `overrideApplied=true`.
  Couvert par 6 tests `prioritizeBuckets > override sécurité`.
- **Granularité zones** : la DB utilise 16 zones granulaires
  (`left_shoulder`, `right_shoulder`, `lower_back`, `neck`, `upper_back`,
  `left_*`/`right_*` pour shoulder/elbow/wrist/hip/knee/ankle, `left_calf`).
  `BodyHeatMap` côté questionnaire produit les mêmes zones (couvert par les
  tests engine ligne `should exclude exercises with contraindication on
  pain zone`).

### 3.2 Idempotence transactionnelle — 🟢

- **Snapshot AVANT toute écriture** (`00172` l. 109-143) : l'INSERT
  `strength_mesocycles` (étape 3) précède l'INSERT snapshot (étape 4)
  **uniquement** parce que `mesocycle_id` est FK obligatoire du snapshot ;
  les écritures destructives sur `strength_planning_*` (étape 5+) viennent
  après. Sous transaction, ROLLBACK total si étape 5+ échoue → état
  préservé. ✅
- **Supersede des `active`** précédents (étape 2 ligne 103-107) : un seul
  `active` par athlète garanti à la fin de la transaction.
- **`revert` n'accepte que `active`** : `RAISE 22023` sinon. Vérifié dans
  les tests RLS « revert refuse superseded ».
- **Identification des templates** via `raw_payload->>'mesocycle_id'`
  (`00173` l. 91-95) : pas de FK formelle, mais auditable. Couvert par le
  test RLS « revert restaure l'override pré-existant ». **Risque** :
  templates orphelins si un coach renomme un `strength_sessions` créé par
  le mésocycle (le revert le retrouve via `raw_payload` côté items, pas
  via le nom — donc résilient au renommage). ✅
- **Restore depuis snapshot** (l. 127-166) : `ON CONFLICT DO UPDATE` →
  idempotent. Le `id` UUID est conservé du snapshot (l. 135) — si une ligne
  avec ce id existe entre-temps, le `DO UPDATE` aligne. ✅

### 3.3 Données partielles tolérées — 🟢

- **Aucun KPI** : `scoreBuckets` retourne `null` partout → `prioritizeBuckets`
  traite `null → 0` (l. 221) → priorité maximale conservatrice. Couvert par
  test « should handle missing KPI scores ».
- **`physical_tests` null** : `scoreMobility` retourne `null` (l. 81) ;
  `dysfunctionFlags` retourne `[]` (l. 179) → mobility = 0 mais pas d'override.
- **`questionnaire` null** : `scorePsychology` retourne `null` (l. 102) →
  `psychFlag` reste false (l. 852 `psychScore !== null && psychScore < 40`).
- **Aucun groupe pour le nageur** : query MCP confirme 0 athlètes avec
  `strength_assessment` et sans `group_members`. Le fallback `target_user`
  (`00172` l. 300-303) existe et est correctement écrit, mais n'est pas
  exercé en pratique aujourd'hui. **Couverture test à vérifier dans
  `strength-mesocycle-rpc.test.ts`.**

### 3.4 Cohérence catalogue ↔ moteur ↔ DB — 🟡

- **Noms colonnes** (PIÈGE connu §6.2) : `information_schema.columns`
  renvoie `nb_series_endurance/_force`, `pourcentage_charge_1rm_*`,
  `recup_series_*` (lowercase). `strength-catalog.ts:28-32, 82-85` utilise
  les bons noms ✅ — bug `d28831157` ne récurre pas.
- **Tag `is_core` par bucket** (DB query) :
  | bucket | core | total | attendu prompt |
  |---|---:|---:|---|
  | lower_power | 5 | 17 | ~5 ✅ |
  | lower_strength | 3 | 19 | ~3 ✅ |
  | mobility | 2 | 15 | ~2 ✅ |
  | upper_power | 2 | 7 | ~2 ✅ |
  | upper_strength | **14** | 36 | ~14 ✅ |

  → comptes alignés avec l'attendu. **MAIS** : la composition de
  `upper_strength` core mélange piliers + gainage hérité §291 — voir
  finding A ci-dessous.

- **Template `sprint_50 saison`** (mig 00175) : structure conforme à 7
  phases McEvoy. `upper_strength=1.0` leader, `lower_power=0.9`,
  `lower_strength=0.85`, `upper_power=0.5`, `mobility=0.3`. Plage 8-16,
  Σ_nominal=11, Σ_min=8 ✅ mais **Σ_max=17 ≠ max_week_count=16** —
  voir finding B.

- **`getMesocycleSessionsContent`** (`strength-mesocycles.ts:261-348`) :
  reconstruit le mésocycle depuis `strength_session_items.raw_payload`
  filtré par `eq('raw_payload->>mesocycle_id', mesocycleId)` ;
  `illustration_gif` résolu via JOIN `dim_exercices` ligne 269-272.
  Mapping `raw_payload.is_core/substituted/original_exercise_id` ↔
  type `MesocycleSessionExerciseContent` complet (l. 326-340). ✅

### 3.5 Logique du moteur (TDD) — 🟢

- `npm test` : **886/886 verts** (vs 884 dans implementation-log, +2 récents).
- `npm run test:rls` ciblé : **25/25 verts** (13 table + 12 RPC).
- **Vague C `pickComplement`** (l. 702-712) : invariant correct —
  `primary === focusBuckets[0]` → `focusBuckets[1]` et vice-versa,
  primary en maintien → top focus, `primary === 'mobility'` → null,
  `< 2 focus` → null. Couvert par tests « buildSession multi-bucket ».
- **Ordre `buckets[]`** = `[primary, complement?, 'mobility'?]` (l. 761-765).
  `bucket[0]` consommé par la RPC apply pour le nom de template
  (`'[Méso XX] S03 J2 · force_max · upper_strength'`) ✅.
- **`periodize`** (l. 447-503) : throw si `target ∉ [Σ_min, Σ_max]` (l. 456-465).
  Algo round-robin pour étirement / compression. ✅
- **Sprint_50 saison 10 sem** : target=10 < Σ_nominal=11 → comprime d'1 sem.
  Phases comprimables : indices 1 (force_max), 3 (puissance), 4 (maintien),
  5 (affutage). Round-robin from i=0 → comprime force_max d'1 →
  séquence : prepa_generale(1) + force_max(2) + prepa_generale(1) +
  puissance(3) + maintien(1) + affutage(1) + pic(1) = 10. **Cohérent avec
  la spec McEvoy de référence**.

### 3.6 UI / UX — 🟢

- **Tuile `MesocycleEntry`** (`MesocycleEntry.tsx`, 97 l.) : conditionnée par
  `assessment.status === 'completed'`, variante violet « action » vs neutre
  « régénérer ». ✅
- **`MesocycleGeneration`** (831 l.) : durée bornée par
  `[min_week_count, max_week_count]` du template (l. 254, 399, 662, 679).
  Décompte semaines→compétitions affiché si gap ≤ max_week_count (l. 419).
  ✅
- **`MesocyclePreview`** : useMemo correctement câblés pour
  `MesocycleInput` (l. 271) et `generateMesocyclePreview` (l. 299-305).
  `Set<number>()` initial **VIDE** (l. 726) → toutes les semaines repliées
  par défaut ✅ ; bouton Tout déplier/replier (l. 751-756). GIF lightbox
  câblé l. 869-870.
- **`CoachMesocyclePanel`** (818 l.) : à l'inverse, **toutes les semaines
  dépliées au premier load** (`useEffect` l. 510-515). C'est explicitement
  documenté (« Toutes les semaines sont dépliées par défaut — cohérent
  avec l'aperçu nageur depuis le commit §293 UX fix ») mais c'est en fait
  **incohérent avec le comportement nageur final**. Voir finding D ci-dessous.
- **`Profile.tsx`** champ Sexe (l. 797-824) : ToggleGroup M/F branché sur
  `sex: 'M' | 'F' | ''`. `updateProfile` envoie `null` si vide (l. 504). ✅
- **`ExerciseGifLightbox`** (103 l.) : utilisé dans le panneau coach
  (l. 673-677) et dans MesocyclePreview (l. 869-870). Fullscreen au tap ✅.
- **Cas mort « profil incomplet »** : géré dans `MesocyclePreview` —
  affiche un écran d'invite Profil au lieu de planter (gating
  `athlete.sex` / `athlete.birthdate`).

### 3.7 Cohérence engine ↔ persistance ↔ relecture — 🟢

- Sérialisation camelCase → snake_case correcte
  (`strength-mesocycles.ts:44-77`). Toutes les clés `MesocycleExercise`
  utiles persistent dans `raw_payload` (`00172` l. 239-250).
- **`illustrationGif` PAS dans `raw_payload`** — résolu via JOIN
  `dim_exercices` côté `getMesocycleSessionsContent` (l. 290-292, 322-324).
  Cohérent avec le design.
- **`cycle_type` legacy** : `prepa_generale → endurance`, autres →
  `force` (`00172` l. 151-154). `WorkoutRunner` consomme `cycle_type`
  legacy, le panneau coach et la preview nageur consomment
  `raw_payload.periodization_cycle` (fin).
- **`notes` = `intention`** (`00172` l. 238) **et** `raw_payload.intention`
  (l. 244-245) — doublon, légère redondance acceptable.

### 3.8 Performance / scalabilité — 🟡

- **Aucun index sur `strength_session_items.raw_payload->>'mesocycle_id'`**
  (DB query `pg_indexes`). La RPC revert et `getMesocycleSessionsContent`
  feront un **seq scan** sur la table. Pour 1 athlète actif × ~480 items,
  c'est imperceptible. À l'échelle club × 2-3 mésocycles/athlète/an,
  toujours OK. À surveiller. Voir finding C.
- **480 INSERT items** par RPC apply (16 sem × 5 séances × 6 ex) : non
  mesuré, mais transaction simple — Supabase Cloud encaisse facilement.
- **`MesocyclePreview` recalcul** : `useMemo` câblé correctement (l. 271,
  299), pas de recompute non nécessaire.

### 3.9 Documentation à jour — 🟡

| Item | État |
|---|---|
| `CLAUDE.md` § Dernier § livré | ✅ §293 |
| `docs/ROADMAP.md` lead « Dernière mise à jour » | ⚠️ non vérifié (hors lecture audit, à confirmer) |
| `docs/FEATURES_STATUS.md` Génération autonome / Moteur / Vue coach | ⚠️ non vérifié |
| `docs/claude/files-map.md` fichiers §293 | ⚠️ non vérifié |
| `docs/implementation-log.md` §293 | ✅ entrée complète, mais **ne mentionne pas la vague A (00174) ni B (00175) ni C (engine multi-bucket)** dans le corps — seuls 884 tests cités vs 886 actuels |
| `docs/bilan-muscu-guide-utilisateurs.md` | ⚠️ **décalage vague C** — le guide décrit des séances mono-bucket alors que l'engine produit du multi-bucket primary+complement (§ 5.3 « Allocation du volume » est désormais sous-décrit). |

## Findings détaillés

### Finding A — `is_core` upper_strength pollué par le gainage hérité (🟡 moyen)

**Constat** : `dim_exercices` a 14 lignes `bucket='upper_strength' AND is_core=true`.
Composition détaillée par level :

| id | nom | level | nature |
|---:|---|---|---|
| 5  | Tractions prise neutre | intermediate | **pilier sprint** ✅ |
| 13 | Tractions lestées | advanced | **pilier sprint** ✅ |
| 14 | Dips | intermediate | **pilier sprint** ✅ |
| 15 | L-Sit | advanced | gainage ⚠️ |
| 23 | Relevés de jambes suspendu | intermediate | gainage ⚠️ |
| 32 | Abdos | beginner | gainage ⚠️ |
| 60 | Bench Pull | intermediate | **pilier sprint** ✅ |
| 62 | Front Lever | advanced | calisthenics |
| 72 | Ab Wheel Rollout | advanced | gainage ⚠️ |
| 75 | Plank walkout (Inchworm) | beginner | gainage ⚠️ |
| 77 | Pike Push-Up | intermediate | pilier secondaire |
| 78 | Hollow Body Hold | beginner | gainage ⚠️ |
| 79 | Planche instable (Swiss Ball) | intermediate | gainage ⚠️ |
| 82 | Planche dynamique (touché épaule) | beginner | gainage ⚠️ |

**Impact engine** : `selectExercises` (`mesocycleEngine.ts:373-429`) trie
`is_core` first puis `level desc`. `buildSession` (l. 723) prend ensuite
`PRIMARY_BLOCK_COUNT = 2` cores pour le bloc primaire.

- Pour un **sprinter `intermediate`** (défaut) : le filtre level exclut
  les advanced cores ; le tri stable par id donne en tête Tractions prise
  neutre (5) + Dips (14) → bloc primaire **conforme** à l'intention.
- Pour un **sprinter `advanced`** : le tri level desc remonte L-Sit (15,
  advanced) avant Tractions prise neutre (5, intermediate) → bloc
  primaire = **Tractions lestées + L-Sit** au lieu de **Tractions + Bench Pull**.
  Régression silencieuse vs intention McEvoy.
- Pour un **sprinter `beginner`** : seuls les beginner cores survivent →
  Abdos (32) + Plank walkout (75) → bloc primaire = **2 exercices de
  gainage**. La promesse « upper_strength = tirage / pousser » devient
  fausse. (Pour info, `Tractions assistées` n'a pas le tag is_core.)

**Cause** : la migration `00174` ajoute des `is_core` sur les piliers
McEvoy « sans toucher aux exercices de gainage déjà flaggés » (commentaire
SQL ligne 5-7). C'est l'intention explicite — mais elle entre en conflit
avec la sémantique revendiquée « pilier de seau » (§291 ↔ §293).

**Recommandations** (par ordre croissant d'invasivité) :
1. **Préférée** : retirer `is_core` des 8 exercices de gainage de
   `upper_strength` (mig 00177). Le tagging recommandé serait un drapeau
   séparé `is_core_movement` ou `is_gainage`, ou laisser le gainage en
   `mobility` / créer un bucket `core_trunk` distinct.
2. Alternative non-invasive : reposer `selectExercises` sur un nouveau
   champ `is_pilier` propre au §293, en laissant `is_core` au §291.
3. Cas mort : implémenter un fallback dans `selectExercises` qui détecte
   « tous les cores beginner = gainage » et bascule sur les non-cores.

**Preuve** : query MCP `dim_exercices WHERE bucket='upper_strength' AND
is_core=true ORDER BY id`.

### Finding B — Asymétrie Σ_max=17 ≠ max_week_count=16 sur sprint_50 saison (🟡 moyen)

**Constat** : sur le template `sprint_50` kind=`season` (mig 00175),
`max_week_count = 16`, mais Σ des `max_weeks` sur les 7 phases vaut
`2+4+2+4+2+2+1 = 17`. Le moteur `periodize` (`mesocycleEngine.ts:447-503`)
**accepte** `targetWeekCount=17` (Σ_max), mais l'UI
`MesocycleGeneration.tsx:399` clampe à `template.max_week_count=16`.

**Impact** : aucun aujourd'hui (UI bornée). Risque si un appel direct à
la RPC (test, debug, script) passe `p_target_week_count=17` → le moteur
construit 17 semaines, la RPC insère sans CHECK contraint au niveau DB
(`strength_mesocycles` ne contraint que `target_week_count > 0`). Pas de
casse, juste une **promesse non tenue** que la durée soit ≤ `max_week_count`.

**Recommandation** : ajuster `max_weeks` de la phase `force_max` (4→3) ou
de `puissance` (4→3) pour Σ_max=16. Ou — plus simple — accepter
volontairement l'extra 1 sem et relever `max_week_count` à 17. La doc McEvoy
n'a pas de 16 vs 17 valeur magique.

**Preuve** : query MCP `strength_periodization_templates WHERE
event_group='sprint_50'`.

### Finding C — Pas d'index sur `raw_payload->>'mesocycle_id'` (🟡 moyen)

**Constat** : `pg_indexes` sur `strength_session_items` renvoie 3 index
(`pkey`, `exercise_id`, `(session_id, ordre)`). **Aucun** sur
`raw_payload->>'mesocycle_id'`. La RPC revert (`00173` l. 91-95) et
`getMesocycleSessionsContent` (`strength-mesocycles.ts:274`) filtrent
sur cette clé JSON.

**Impact** : seq scan sur `strength_session_items` à chaque revert ou
lecture coach détaillée. Pour 1 athlète × 480 items, ~ms. Pour le club
sur 2-3 ans avec plusieurs mésocycles par athlète, l'accumulation
(disons 50 athlètes × 480 × 3 = 72k items) reste sous le seuil
problématique mais la marge est faible.

**Recommandation** :
```sql
CREATE INDEX strength_session_items_mesocycle_idx
  ON strength_session_items ((raw_payload->>'mesocycle_id'))
  WHERE raw_payload ? 'mesocycle_id';
```
Index partiel pour ne pas alourdir les inserts hors-mésocycle.

### Finding D — Coach panel et nageur preview divergent sur l'état initial des semaines (🟢 mineur)

**Constat** : `CoachMesocyclePanel.tsx:510-515` ouvre **toutes les semaines
au premier load** (commentaire l. 482-483 « cohérent avec l'aperçu nageur
depuis le commit §293 UX fix »). **Or** `MesocyclePreview.tsx:726`
initialise `Set()` vide → **toutes repliées par défaut**.

Le commentaire dans `CoachMesocyclePanel` est donc **factuellement faux**.
Soit le coach panel n'a pas suivi le fix UX du commit `0e296f149`, soit
l'intention est volontairement différente (le coach a besoin d'auditer
rapidement, le nageur d'une vue moins dense).

**Recommandation** : aligner les deux comportements (probablement toutes
repliées par défaut côté coach aussi, avec un bouton « Tout déplier »
proéminent) — OU mettre à jour le commentaire pour expliquer la
divergence intentionnelle.

### Finding E — `ZONE_LABEL_FR` côté coach panel ne couvre que les zones génériques (🟢 mineur)

`CoachMesocyclePanel.tsx:96-105` mappe 8 zones (shoulder, knee, hip, back,
neck, ankle, wrist, elbow). La DB utilise 16 zones granulaires
(`left_shoulder`, `right_shoulder`, `lower_back`, etc.). Pour une douleur
sur `left_shoulder`, le bandeau « Substitutions actives »
afficherait `left_shoulder` brut au lieu de `épaule gauche`.

Non bloquant — purement présentationnel. Le mapping est en
`ZONE_LABEL_FR[z] ?? z` donc résilient au manque, juste pas joli.

### Finding F — `rest_exercise_s` posé à NULL (🟢 mineur)

La RPC `apply` (`00172` l. 237) inscrit `rest_exercise_s NULL` dans tous
les items, alors que `dim_exercices` a `recup_exercices_*` (récup entre
exercices, distinct de récup entre séries). Le WorkoutRunner peut donc
ne pas afficher de récup entre exercices pour les séances générées par
le mésocycle, même si le catalogue en a une.

**Impact** : faible — la valeur par défaut WorkoutRunner doit s'en charger.
À investiguer si le coach signale.

### Finding G — Documentation utilisateurs n'intègre pas les vagues B/C (🟢 mineur)

`docs/bilan-muscu-guide-utilisateurs.md` § 5.3 décrit l'allocation comme
« la mobilité est en échauffement de chaque séance » + « 2 seaux focus
~60 % du volume ». Conforme à l'engine vague initiale.

**Manquant** : la vague C engine produit désormais des **séances
multi-bucket** (focus#1 + focus#2 dans la même séance), reproduisant
le pattern « Lundi Tractions + Squat + Ab Wheel » de McEvoy. Le guide
utilisateur ne mentionne ni ce pattern, ni les ajustements McEvoy de la
mig 00175.

Non bloquant si le nageur observe l'aperçu et comprend, mais la doc et
le code divergent désormais.

## Pièges vérifiés (du §6 du prompt)

| # | Piège | Statut | Preuve |
|---|---|---|---|
| 1 | `users.name` vs `display_name` | ✅ corrigé | grep `display_name` dans `00172` l. 272, `00173` l. 175 |
| 2 | Noms colonnes `dim_exercices` lowercase | ✅ corrigé | `strength-catalog.ts:28-32, 82-85` ; query MCP `information_schema.columns` |
| 3 | Champ Sexe absent de Profile | ✅ corrigé | `Profile.tsx:797-824` ; **4/15 profils encore incomplets** dont 1 nageur actif (user 3 « François ») |
| 4 | CTA overflow mobile | ✅ corrigé | non re-testé en live, on fait confiance au commit `91a072f39` |
| 5 | Toutes semaines dépliées | ⚠️ partiellement | côté nageur ✅ ; côté coach **non** (finding D) |
| 6 | Tractions sous-représentées mini-prépa | ✅ corrigé | mig 00176 confirme `upper_strength=0.95` leader |
| 7 | `is_core` interprété comme gainage | ⚠️ **partiellement** | mig 00174 ajoute les piliers, mais les 8 gainage du §291 **persistent** (finding A) |
| 8 | Template `sprint_50 saison` désaligné McEvoy | ✅ corrigé | mig 00175 ; **Σ_max=17 ≠ max_week_count=16** (finding B) |
| 9 | Sessions mono-bucket | ✅ corrigé | engine `pickComplement` + `buildSession` multi-bucket |

## Trous documentaires

- `docs/implementation-log.md § §293` cite **884/884 tests** — la suite est
  désormais **886/886** (vs +2 tests récents) ; l'entrée §293 n'a pas été
  rouverte pour acter vague A/B/C ni les fixes UX.
- `docs/bilan-muscu-guide-utilisateurs.md` ne mentionne pas le pattern
  multi-bucket vague C ni l'alignement McEvoy.
- Le commentaire de `CoachMesocyclePanel.tsx:482-483` (toutes semaines
  dépliées « cohérent avec l'aperçu nageur ») est **factuellement faux**.
- `CLAUDE.md § files-map.md` non re-vérifié pendant l'audit (lecture pure
  des fichiers du périmètre, pas du méta-doc).

## Annexes — sortie des vérifs

### `npx tsc --noEmit`

```
exit code 0
```

### `npm test`

```
ℹ tests 886
ℹ suites 146
ℹ pass 886
ℹ fail 0
ℹ duration_ms 38021.588
```

### `npm run test:rls -- strength-mesocycles + strength-mesocycle-rpc`

```
✓ supabase/tests/rls/strength-mesocycles.test.ts (13 tests) 762ms
✓ supabase/tests/rls/strength-mesocycle-rpc.test.ts (12 tests) 399ms
Test Files  2 passed (2)
Tests  25 passed (25)
```

### Requêtes DB diagnostiques (résumé)

| Query | Résultat clé |
|---|---|
| RPC SECURITY DEFINER | apply + revert : `prosecdef = true` |
| `is_core` par bucket | 5/17 LP · 3/19 LS · 2/15 MOB · 2/7 UP · 14/36 US |
| sprint_50 templates | season 8-16 (Σmin 8 / Σmax **17**) · inter 5-8 (Σmin 5 / Σmax 8) |
| Profils incomplets | 4/15 (1 nageur actif, 1 coach, 2 adultes hors plage) |
| GIFs coverage | 83/94 ✅ |
| Mésocycles persistés en prod | **0** (le flux n'a pas encore été utilisé en vrai) |
| Athlètes avec assessment et sans groupe | 0 (fallback notif non exercé) |
| Index sur `raw_payload->>'mesocycle_id'` | **aucun** (finding C) |

### Composition `is_core` `upper_strength` (extrait du finding A)

| id | nom | level | nature | rang attendu via tri level desc |
|---:|---|---|---|---|
| 13 | Tractions lestées | advanced | pilier | 1 (advanced) |
| 15 | L-Sit | advanced | gainage | 2 (advanced) ⚠️ |
| 62 | Front Lever | advanced | calisthenics | 3 (advanced) |
| 72 | Ab Wheel Rollout | advanced | gainage | 4 (advanced) ⚠️ |
| 5  | Tractions prise neutre | intermediate | pilier | 5 (intermediate) |
| 14 | Dips | intermediate | pilier | 6 |
| 23 | Relevés jambes suspendu | intermediate | gainage | 7 ⚠️ |
| 60 | Bench Pull | intermediate | pilier | 8 |
| 77 | Pike Push-Up | intermediate | pilier secondaire | 9 |
| 79 | Planche instable | intermediate | gainage | 10 ⚠️ |
| 32 | Abdos | beginner | gainage | 11 ⚠️ |
| 75 | Plank walkout | beginner | gainage | 12 ⚠️ |
| 78 | Hollow Body Hold | beginner | gainage | 13 ⚠️ |
| 82 | Planche dynamique | beginner | gainage | 14 ⚠️ |

→ Pour `PRIMARY_BLOCK_COUNT=2` :
- intermediate athlete : 1er core = Tractions prise neutre (5), 2e = Dips (14) ✅
- **advanced athlete** : 1er = Tractions lestées (13), 2e = **L-Sit (15)** ⚠️
- **beginner athlete** : 1er = Abdos (32), 2e = Plank walkout (75) ❌

---

*Audit clos le 2026-05-20 — aucune modification de code effectuée. Les
findings A/B/C sont les pistes d'action prioritaires pour un §294 de
clôture qualité du flux Bilan Muscu.*
