# Design §352 — Échauffement intelligent : Bloc 3 (activation) + correctif unilatéral + Raise/dynamique

*Date : 2026-05-31 · Suite de §351 (Blocs 1+2). Statut : design validé (brainstorming), prêt pour `writing-plans`.*

## Contexte

§351 a livré les Blocs 1 (échauffement articulaire commun seedé) et 2 (mobilité corrective pilotée par les déficits G/D). §352 complète la vision coach (4 blocs : articulaire → mobilité → activation musculaire → séance principale) en ajoutant le **Bloc 3** (activation musculaire spécifique à la séance), et intègre deux **raffinements fondés sur une recherche documentaire** (voir § Recherche) qui dépassent l'intuition initiale.

## Recherche documentaire (deep-research, 2026-05-31)

23 sources fetchées, 97 affirmations extraites, 25 vérifiées en adversarial (24 confirmées, 1 réfutée). Conclusions actionnables :

- **Cadre RAMP** (Raise → Activate → Mobilise → Potentiate) valide notre ordre : générique → mobilité → activation spécifique en dernier ([PMC12234454](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12234454/)).
- **Dynamique > statique** sur le sprint (RAMP 4,16 s vs statique 4,22 s, p=0,000) → proscrire les tenues statiques pré-séance.
- **Le composant spécifique à la séance (Bloc 3) est le principal levier de performance** : +0,94 % sprint, p=0,0013 ([PMC3737866](https://pmc.ncbi.nlm.nih.gov/articles/PMC3737866/)).
- **Correctif UNILATÉRAL réduit l'asymétrie ; le bilatéral non** (méta 2025, 8 RCT, SMD=0,71, p<0,01 — [fphys 2025](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2025.1551523/full)).
- **Mobilité/correctif = levier PRÉVENTION/ROM, pas chrono** : −44 % blessures épaule, aucun effet sur le temps de nage (p>.386 — [BMC 2025](https://link.springer.com/article/10.1186/s13102-025-01200-8)). Cohérent avec « mobilité non scorée ».
- **Activation légère = pas de fatigue** (4 exos élastique 3×20 avant bassin, aucun effet aigu significatif — [PMC7052717](https://pmc.ncbi.nlm.nih.gov/articles/PMC7052717/)) ; mais **PAP dose/timing-dépendante**, surchargée elle dégrade ([fphys 2018](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.01464/full)) → Bloc 3 = activation légère, jamais lourde.
- **Personnalisation par nage** : 79 % des coachs adaptent au couple nage-muscle, 92 % mobilité dynamique pré-séance ([fspor 2023](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1338856/full)).
- **Correction d'asymétrie = 12-16 semaines** (8 sem. insuffisant — [PMC10679734](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10679734/)) → cadence « matérialisé par méso, rafraîchi à chaque bilan » adaptée.
- Menu scapulaire/épaule per-côté fondé ([PMC12567897](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12567897/)) : 4-point shoulder taps 2×5-8/côté, banded Cuban press 2×8-12, prone V-raise isohold 2×30-40 s, push-up plus 2×4-6, DB external rotation 2×8-12, 3-way band pull-apart 2×3-5/côté.
- **Réfuté** (0-3) : « les protocoles à sec n'améliorent le sprint que séquencés après l'échauffement piscine » → pas de contrainte de séquençage piscine pour le travail à sec.

Caveat : transfert population (beaucoup d'études non-natation ou race-day) — consensus de direction, tailles analogiques. Dosage exact d'une activation légère **avant séance de force** = question ouverte → on reste conservateur (léger, plafond bas).

## Décisions verrouillées (brainstorming)

| # | Décision |
|---|----------|
| Bloc 3 mapping | Par **seau** (bucket → exos d'activation), pas de tag muscle |
| Bloc 3 stockage | Table **`warmup_activation_routine (bucket, ordre, exercise_id)`** seedée (parallèle `warmup_common_routine`) |
| Bloc 3 scope | Seaux **primaire + complément**, 1 exo/seau, **plafond 2**, dédup vs Blocs 1+2 |
| Bloc 3 séances | **Développement uniquement** (l'amorce PAP est déjà une activation) |
| Ordre | warmup = [Bloc 1 articulaire → Bloc 2 correctif → **Bloc 3 activation** → principal] |
| Timing | Matérialisé à la génération (moteur pur), persisté `raw_payload` |
| Bloc 2 unilatéral | `dim_exercices.supports_unilateral` ; axe asymétrique (`correctiveSide`∈{left,right}) → exo unilatéral côté faible ; repli bilatéral |
| Bloc 1 Raise | item de mise en route seedé en tête de `warmup_common_routine` (ordre 0) |
| Seeds dynamiques | privilégier la mobilité dynamique, écarter les tenues statiques pré-séance |
| Contrôle coach | indirect (tables seedées) ; écran d'édition + sous-labels vue exécution nageur = **hors scope** |

## A. Data model — migration unique `00215_warmup_bloc3.sql` (MCP)

1. **`CREATE TABLE warmup_activation_routine (id serial PK, bucket text NOT NULL, ordre int NOT NULL, exercise_id int NOT NULL REFERENCES dim_exercices(id))`** + RLS (lecture `app_user_role() IS NOT NULL` / écriture coach-admin), parallèle exact de `warmup_common_routine`.
2. **`ALTER TABLE dim_exercices ADD COLUMN supports_unilateral boolean NOT NULL DEFAULT false`** + seed `true` sur les exos faisables par côté (Hip Airplane 59, 90/90 85, rowing élastique unilatéral 73, etc. — liste exacte validée coach au seed).
3. **Seed item Raise** : INSERT d'un exo de mise en route léger dans `dim_exercices` (bucket `mobility`, chargement activation), placé `ordre 0` dans `warmup_common_routine`.
4. **Seeds Bloc 3** : `warmup_activation_routine` par seau (exos légers, fondés recherche) — haut : rowing élastique / face pull / activation scapulaire ; bas : glute activation. Exacts à valider coach.
5. **Ajustements seeds §351** (data-only) : `warmup_common_routine` + `corrective_axes` revus pour favoriser le dynamique.

> RLS touchée (nouvelle table) → **`npm run test:rls`** + réplique `warmup_activation_routine` dans `supabase/tests/schema.sql`.

## B. Couche API

- Nouveau `getActivationRoutine(): Promise<Partial<Record<StrengthBucket, number[]>>>` dans `strength-warmup.ts` (regroupe par bucket, ordonné).
- `strength-catalog.ts` lit `supports_unilateral` → `CatalogExercise.supportsUnilateral`.
- `MesocyclePreview` : query → injecte `activationRoutine` dans le `MesocycleInput`.

## C. Moteur (fonctions pures, TDD)

- `MesocycleInput` gagne `activationRoutine?: Partial<Record<StrengthBucket, number[]>>`.
- **`selectActivation(workBuckets, activationRoutine, catalog, painZones, level, usedIds)`** : 1 exo/seau de travail (primaire+complément), plafond 2, dédup vs Blocs 1+2 (`usedIds`), fits-level + contre-indication, tag `warmupKind='activation'`. Déterministe (pas de rotation).
- **`selectCorrectiveWarmup`** étendu : si `d.side !== 'both'`, préférer un candidat `supportsUnilateral` (repli bilatéral si aucun).
- **`buildSession`** (branche développement) : warmup = `[...common, ...corrective, ...activation]`. Amorce PAP + override mobilité : pas de Bloc 3. `usedIds` cumulé (common → corrective → activation) pour la dédup.
- Type `warmupKind` étendu : `'common' | 'corrective' | 'activation'`.

## D. Persistance + UI

- `serializeExercise`/`getMesocycleSessionsContent` : `warmup_kind='activation'` ajouté au garde de désérialisation (round-trip `raw_payload` déjà en place §351).
- `warmupLabels.warmupSectionLabel` étendu : `'activation'` → « Activation musculaire ».
- `SessionCard` (aperçu) : 3ᵉ sous-section « Activation musculaire » (logique de transition `warmupKind` déjà en place §351).

## E. Tests

- **Pur (node:test)** : `selectActivation` (1/seau, plafond 2, dédup vs blocs 1+2, contre-indication, fits-level) ; `selectCorrectiveWarmup` unilatéral (axe asymétrique → préfère `supportsUnilateral`, repli bilatéral) ; `warmupLabels` +1 (activation).
- **Intégration `generateMesocycle`** : séance dév porte le Bloc 3 sur ses seaux de travail ; PAP + override = aucun Bloc 3 ; dédup vérifié (un exo pris en Bloc 1/2 ne réapparaît pas en Bloc 3).
- **RLS** : policy `warmup_activation_routine` (lecture authentifié / écriture coach-admin) + schéma hand-crafted.
- **Régressions** : node:test, vitest, tsc 0, lint 0, build OK.

## F. Frontières (hors scope §352)

- Sous-labels articulaire/correctif/activation dans la vue **exécution nageur** (`MyPlanSessionSheet`/`SessionDetailPreview` via `StrengthSessionItem` — `warmupKind` déjà persisté `raw_payload`, pas threadé dans le mapper).
- Écran coach d'édition des tables (`warmup_common_routine`, `warmup_activation_routine`).
- Édition per-séance des warmups.

## G. Documentation obligatoire

`implementation-log.md` §352 ; `ROADMAP.md` (ligne + date) ; `FEATURES_STATUS.md` ; `CLAUDE.md` (« Dernier § livré ») ; `files-map.md` (table `warmup_activation_routine`, colonne `supports_unilateral`, `getActivationRoutine`) ; mémoire `muscu-bilan-warmup-roadmap` (Bloc 3 livré, reste édition + sous-labels nageur).
