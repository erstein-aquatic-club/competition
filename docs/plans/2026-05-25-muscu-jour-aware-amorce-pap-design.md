# Design — Muscu *jour-aware* : amorce SNC (PAP) + transfert de force

*Auteur : session du 2026-05-25. Statut : **validé**, prêt pour plan d'implémentation.*
*Déclencheur : audit bout-en-bout du parcours mesure-coach → génération de mésocycle
en vue d'une séance de mesure réelle (nageuse 21 ans, 50 m crawl, −0,2 s en 7 sem.,
expérimentée mais désentraînée). Cf. §0.*

---

## 0. Contexte & constats d'audit (le « pourquoi »)

Audit lecture-seule du chemin métier complet (moteur, RPC apply, gating, profils,
2 agents Explore sur le flux UI + le mapping séance→date). Faits vérifiés
`fichier:ligne` / SQL prod `fscnobivsgornxdwqwlk`.

**Ce qui marche pour la séance de mesure de demain :**
- Parcours coach-piloté bout-en-bout sur un seul appareil, pour un nageur tiers :
  routes `/coach/questionnaire/:id`, `/coach/kpi-wizard/:id`,
  `/coach/strength-assessment/:id`, `/coach/mesocycle-generate/:id` ;
  `KpiWizard.tsx:175` (`athleteId = isCoach ? selectedAthleteId : userId`) ;
  génération débloquée à `bilan_pending` (`mesocycleGating.ts`).
- **Pré-flight obligatoires** : profil `sex=F` + `birthdate` sinon
  `MesocyclePreview.tsx:345` bloque (`ProfileIncompleteScreen`) ; pas de wizard
  unique reliant les 4 écrans (navigation manuelle) ; `medball_vertical_throw`
  sur barème `placeholder` → score `upper_power` le moins fiable (sans gravité au
  50 où `upper_power`=0.50).

**Cohérence vs élite mondiale (21 ans F, 50 crawl) :**
- ✅ **Emphasis « quoi travailler » validée** : 50-free = `LS .85 / LP .90 /
  US 1.0 / UP .50 / MOB .30` (`00194:41-43`) — tirage-dominant, forte
  force/puissance jambes, faible mobilité/upper-power. Forme correcte pour une
  sprinteuse 50 F (audit 2026-05-25 §2-3). Emphasis **non sexée** (correct) ;
  seuls les barèmes KPI le sont.
- 🟠 **L'arc 7 semaines est le mauvais outil pour elle.** Seul l'arc
  `inter_competition` autorise 7 sem. (`00194:45-48`, plage `[5,8]`) ;
  `season` exige `[8,16]` (`00194:41-44`). Or `inter_competition` =
  **maintien → puissance → affutage → pic**, **sans bloc `force_max`** : il
  « maintient et convertit » une force qu'elle n'a pas (désentraînée). Pour
  7 sem. la périodisation donne W1-3 maintien, W4-5 puissance, W6 affutage,
  W7 pic — **zéro développement de force**, alors que la force est *le* levier
  des −0,2 s.

**Deux conflits durs avec le plan annoncé :**
1. **Date de départ figée** à « lundi de la semaine prochaine »
   (`MesocycleGeneration.tsx:300-305`, `getMonday(addDays(new Date(),7))`), non
   modifiable → un cycle généré le 2026-05-25 démarre **lundi 1er juin**, pas
   « ce jeudi 28 ».
2. **3×/sem. figé Lun/Mer/Ven** (`[0,2,4]`, RPC `00181:98-106`) → Mer & Ven
   tombent **la veille** des gros bassins Jeu/Sam (anti 48-72 h). Et le moteur
   assigne **un cycle par semaine entière** (`buildWeek`, `mesocycleEngine.ts:643`)
   → impossible aujourd'hui de rendre *le lundi précisément* une amorce.

**Le moteur a déjà le bon vocabulaire** : le cycle `pic`
(`periodizationCycles.ts:152-165`) = 1-2×2-4 @ 40-60 %, *« activation SNC, se
sentir explosif »* — exactement un profil d'amorce, mais appliqué à des semaines
entières, jamais à une séance isolée.

## 1. Décisions validées (Q&A coach)

| # | Décision | Choix |
|---|---|---|
| Q1 | Arc 7 sem. | **7 sem. `inter_competition` + jour lourd = force** (combler l'absence de `force_max`) |
| Q2 | Jours muscu | **Le nageur coche les jours** (remplace le nombre séances/sem.) |
| Q3 | Dimensionnement amorce | **PAP** (lourd court + explosif) |
| Q4 | Date de départ | **Ce jeudi, 1re semaine partielle** (sélecteur de date) |

## 2. Idée directrice

**Découpler le dimensionnement *par séance* du cycle de périodisation *par
semaine*.** Le cycle de la semaine (maintien→puissance→affutage→pic) reste le
*thème* qui s'affûte vers la compète ; mais chaque **jour coché reçoit un rôle**
qui décide *comment* ce thème est délivré ce jour-là.

Deux pistes parallèles dans la semaine :
- **Piste Amorce (Lun/Jeu)** : PAP constant — lourd court + explosif, volume
  minimal, SNC activé **sans fatigue** → potentialise le sprint bassin 100 % qui
  suit. Ne périodise quasiment pas.
- **Piste Développement (jour off bassin)** : porte la périodisation réelle.
  Pour elle : **`force_max` aux semaines `maintien`** (W1-3 → build, pas
  maintenir) → puissance (W4-5) → affutage (W6) → pic (W7). Donne force → puissance
  → pic via une seule piste.

> **Principe transverse (toutes distances)** : plafonner le volume muscu pour
> qu'il **soutienne** la nage (fraîcheur / transfert), pas qu'il la dégrade. Le
> transfert de force est au centre de **tous** les programmes, pas seulement des
> sprinteurs 50/100.

## 3. Architecture

### 3.A — Modèle d'entrée : sélecteur de jours (remplace `sessionsPerWeek`)
- `MesocycleGeneration.tsx` : remplacer le nombre `sessionsPerWeek` par une
  **rangée de cases Lun…Dim**. Nb de séances = nb de jours cochés.
- **Samedi désactivé** (« pas de muscu le samedi »).
- Convention de jour **0=Lun … 6=Dim** (alignée sur la RPC `00181`).
- Le payload sessionStorage (`MesocycleGeneration.tsx:345-353`) porte désormais
  `weekdays:number[]` + `startDate:string` au lieu de `sessionsPerWeek` +
  `startWeekMonday` implicite. `sessionsPerWeek` interne dérivé = `weekdays.length`
  (pour la math de volume `allocateVolume`).
- *UI → passe par `/frontend-design` (règle projet).*

### 3.B — Rôles de séance (le cœur)
Classification automatique de chaque jour coché :

| Jour coché | Rôle | Chargement |
|---|---|---|
| **Lun, Jeu** (gros bassins) | **`amorce_pap`** | warmup + 1 exo lourd court + 1 exo explosif, volume minimal. Override le cycle de la semaine. |
| **Sam** | — | bloqué (non cochable) |
| Autre (Mar/Mer/Ven/Dim) | **`developpement`** | porte le stimulus de la semaine, **biaisé force** (cf. 3.C). |

- Set d'amorce par défaut = `{Lun(0), Jeu(3)}` ∩ jours cochés (matérialise la
  règle « gros bassins Lun/Jeu/Sam » du coach). **Visible et override-able** dans
  le preview.
- Le moteur devient *jour-aware* : `MesocycleInput` gagne `weekdays:number[]` +
  `primerWeekdays:Set<number>`. `buildWeek`/`buildSession`
  (`mesocycleEngine.ts:643,755`) émettent un **`role` par séance + chargement
  spécifique au rôle** (nouvelles branches dans `toMesocycleExercise:836`).

### 3.C — PAP & biais force (chargement par rôle)
- **`amorce_pap`** : ne réutilise pas le cycle. Schéma fixe type PAP :
  - 1 exo **lourd court** (≈ 1-3 reps @ 80-90 % 1RM, 2 séries) issu du seau focus
    force (ex. tirage lesté / squat) ;
  - 1 exo **explosif** (pliométrie / lancer médecine-ball, 0 % charge, vitesse max) ;
  - warmup mobilité réduit. **Repos longs** entre lourd et explosif (potentiation).
  - Intention : *« Amorce SNC : potentialiser le sprint qui suit — explosivité,
    pas de fatigue. »*
- **`developpement`** : suit le cycle de la semaine, **mais** substitue
  `force_max` quand le cycle est `maintien` (un athlète désentraîné *construit*,
  ne *maintient* pas). Condition de déclenchement du biais force : épreuve sprint
  **ou** force sous-développée (KPI `imtp`/`weighted_pullup` bas, ou flag
  désentraîné). Détail des seuils → plan.

> ⚠️ **Choix de périodisation à valider coach** : substituer `force_max` aux
> semaines `maintien` de la piste développement. C'est une décision métier, pas
> un simple paramètre.

### 3.D — Date de départ + 1re semaine partielle
- Ajouter un **sélecteur de date de départ** (défaut : prochain jour
  d'entraînement coché ≥ aujourd'hui). Elle démarre **Jeu 28**.
- La semaine reste ancrée lundi (`week_start`). **Semaine 1 ne matérialise que les
  jours cochés ≥ date de départ** → 1re semaine partielle (ici : juste le jeudi),
  puis semaines pleines. **Compte comme semaine 1** de l'arc.
- RPC apply : nouveau param `p_start_date date` ; boucle `if (week==1 && weekday <
  start_weekday) skip`.

### 3.E — Plafond fraîcheur / transfert (toutes distances)
- Amorces très légères (~3 items). Jour développement plafonné.
- Feu vert explicite pour **réduire le volume validé de 5 items** sur les jours
  d'amorce. Le jour développement peut garder un volume plus complet mais borné.
- S'applique **indépendamment de la distance**.

### 3.F — Où atterrissent les changements de code
| Fichier | Changement |
|---|---|
| `src/lib/strength/mesocycleEngine.ts` | jour-aware ; `role` par séance ; chargement `amorce_pap` + `developpement` force-biaisé ; bump `ENGINE_VERSION` |
| `src/lib/strength/mesocycleEngine.types.ts` | `MesocycleInput.weekdays`, `primerWeekdays` ; `MesocycleSession.role`, `.weekday` |
| `supabase/migrations/00XXX_…sql` | redéfinit `apply_strength_mesocycle` : param `p_weekdays int[]` + `p_start_date date` ; remplace l'array `[0,2,4]` ; 1re semaine partielle ; nommage rôle-aware |
| `src/lib/api/strength-mesocycles.ts` | signatures preview/apply (weekdays, startDate) |
| `src/pages/MesocycleGeneration.tsx` | sélecteur de jours + sélecteur de date (`/frontend-design`) |
| `src/pages/MesocyclePreview.tsx` | afficher rôle/jour par séance ; override set amorce (`/frontend-design`) |
| `src/components/strength/MyPlanTab.tsx` | rendu jour réel + badge rôle (amorce/développement) |

## 4. Cas limites & points à vérifier (à l'implémentation)
- **Aucun jour off-bassin coché** (que Lun/Jeu) → 0 jour développement → elle ne
  développe jamais la force. Garde-fou : avertir dans le preview, ou imposer ≥ 1
  jour développement quand le biais force est requis.
- **> 1 jour développement** (ex. Mar+Mer) → répartir le stimulus (les deux suivent
  le cycle force-biaisé ; pas deux jours « max » consécutifs).
- **1re semaine partielle = 0 séance** (date de départ après le dernier jour coché
  de la semaine) → semaine 1 vide, l'arc démarre semaine 2. Décider : décaler ou
  accepter.
- Lire à l'implémentation : `mesocycleEngine.types.ts` (forme exacte
  `MesocycleInput`/`MesocycleSession`) ; **corps complet de la RPC `00181`**
  (insert `strength_planning_slot_overrides`, nommage, ON CONFLICT) ; structure
  `MesocyclePreview.tsx` ; rendu jours dans `MyPlanTab.tsx`
  (`buildWeekStarts`, slot overrides).
- `assessment.sessions_per_week` (`MesocycleGeneration.tsx:288-292`) : décider si
  on persiste les `weekdays` sur l'assessment ou seulement dans le payload.

## 5. Tests
- **`node:test` unitaires moteur** (`*.test.ts`) : classification rôle par jour ;
  chargement `amorce_pap` (PAP) ; substitution `force_max`↔`maintien` sur la piste
  développement ; distribution weekday→séance ; 1re semaine partielle ;
  garde-fous cas limites §4. Déterminisme conservé.
- **RPC** : changement de **corps de fonction** (pas de policy / pas de table
  RLS), donc `npm run test:rls` **non requis** par les règles CLAUDE.md ; sanity
  d'intégration recommandée (apply → slot overrides aux bons jours + 1re semaine
  partielle).
- `npx tsc --noEmit`, `npm test`, `npm run build` verts avant livraison.

## 6. Cohérence vs élite — ce que ça corrige
- Conserve l'emphasis 50-free déjà ✅ validée.
- Ajoute la logique **SNC/fraîcheur sprint-spécifique** absente aujourd'hui
  (amorce Lun/Jeu, pas de muscu la veille d'un gros bassin, pas de muscu samedi).
- **Comble le trou `force_max`** de l'arc 7 sem. via la piste développement (Q1).
- Rend le **transfert de force** central pour toutes distances (3.E).

## 7. Séquencement pour la séance réelle
Changement multi-fichiers (moteur + migration + 2 écrans, tests, UI via
`/frontend-design`) — **non livrable de façon sûre demain matin**. Plan retenu :

1. **Demain = mesure seule** (KPIs + mobilité — chemin déjà fonctionnel).
2. Construire la nuance Mar/Mer.
3. **Générer Mer**, cycle démarre **Jeu 28** (1re semaine partielle).

→ Rien n'est perdu : le cycle démarre bien jeudi comme prévu.

## 8. Doc workflow (à l'implémentation, règle projet)
Entrée `docs/implementation-log.md` (§ nouveau) + maj `docs/ROADMAP.md`,
`docs/FEATURES_STATUS.md`, `docs/claude/files-map.md` (tailles `wc -l`),
ligne « Dernier § livré » de `CLAUDE.md`. Migration créée dans
`supabase/migrations/` **et** appliquée via MCP Supabase dans la même session.
