# Conception §304 — Couplage niveau ↔ tier + cohérence traction lestée (fix GA)

*Date : 2026-05-25. Auteur : conception validée en brainstorming.*
*Suite de §303 (`docs/plans/2026-05-24-muscu-dejeunification-g1-g3-design.md`).*
*Corrige l'écart **GA** de l'audit `docs/audits/2026-05-25-audit-muscu-100nl-hommes-elite-vs-generateur.md`.*

## 1. Problème (écart GA)

§303 a « dé-jeunifié » le moteur muscu en introduisant deux réglages coach-set,
**volontairement indépendants**, dans `strength_athlete_settings` :

- `practice_level` (`beginner|intermediate|advanced`) → **filtre les exercices**
  (`selectExercises`, `mesocycleEngine.ts:385-386` : `LEVEL_ORDER[ex.level] <= athleteLevelNum`) ;
- `performance_tier` (`club|regional|national|elite`) → **cale les barèmes KPI**
  (`shiftAnchors`, `kpiBaremes.ts:89-95`).

Cette indépendance crée deux défauts pour un profil de haut niveau :

1. **Désynchronisation tier ↔ niveau.** Un nageur noté « Élite » au barème mais
   resté « Intermédiaire » en pratique (défauts : `intermediate`/`club`,
   `StrengthAthleteProfileCard.tsx:50-51`, `MesocyclePreview.tsx:318-319`) ne
   reçoit **jamais** les exos taggés `advanced` — or ce sont précisément les
   piliers du sprinteur élite : **Tractions lestées** (`dim_exercices` id 13),
   **Power Clean / Hang Clean**, **Drop Jump to Stick**, pompes claquées. Rien
   dans l'UI ne signale ce « Élite au barème, Intermédiaire aux exos ».

2. **Incohérence KPI ↔ prescription.** Le KPI `weighted_pullup` est **mesuré pour
   tous** (`scoreBuckets`, `mesocycleEngine.ts`), mais l'unique exercice de
   traction lestée (`Tractions lestées`, `level='advanced'`) n'est **prescrit
   qu'au niveau confirmé**. Hors `advanced`, on mesure une qualité (charge
   additionnelle en traction) qu'on ne fait jamais travailler — l'athlète reçoit
   des tractions au poids du corps.

> **Décision de périmètre (2026-05-24)** : muscu indépendante de la natation. §304
> est entièrement *swim-independent*.

## 2. Objectifs / Non-objectifs

**Objectifs (GA seul) :**
- Rendre la désynchronisation **visible et corrigeable en 1 clic** côté coach.
- Rendre la **traction lestée prescriptible dès l'intermédiaire** (cohérence
  KPI ↔ prescription).

**Non-objectifs (→ §305 / autres §) :**
- Taxonomie **nage × distance**, template `sprint_100`, papillon manquant.
- *Préférer* la traction lestée aux tiers élevés (logique de sélection plus fine).
- Bump emphasis `upper_power` (GB), autorégulation / VBT (GC).
- Couplage au macrocycle natation / transfert eau (hors périmètre produit).

## 3. Conception

### Partie 1 — Couplage tier ↔ niveau (UI, **aucune** migration)

**Règle de mismatch** — helper pur, testé, sans état :

```
hasUnderLeveledProfile(level, tier) :=
  tier ∈ {national, elite}  ET  level ≠ advanced
```

Sens unique : on signale uniquement « ambition de perf > niveau d'exos ». Le cas
inverse (Confirmé + Club) n'est pas un problème (l'athlète score juste haut au
barème club) → **pas d'alerte** (YAGNI).

**Nouveau fichier** `src/lib/strength/strengthProfileMismatch.ts` :
- `hasUnderLeveledProfile(level: PracticeLevel, tier: PerformanceTier): boolean`
- `RECOMMENDED_LEVEL_FOR_TIER` (national/elite → `advanced`) pour le libellé du bouton.
- Types réutilisés depuis `@/lib/api/types`.

**UI 1 — `StrengthAthleteProfileCard.tsx`** (réglage coach) : quand mismatch, un
encart **non bloquant** sous les deux sélecteurs :

> ⚠ Niveau « Élite » mais exercices « Intermédiaire » — les tractions lestées,
> l'haltérophilie et la pliométrie avancée ne seront pas proposées.
> **[ Aligner sur Confirmé ]**

Le bouton appelle la **mutation upsert existante** avec
`practice_level='advanced'` (et le `performance_tier` courant). Pas de nouvel
appel API.

**UI 2 — `MesocyclePreview.tsx`** (aperçu du plan) : un **bandeau compact en
lecture seule** au même mismatch (« Profil : Élite / Intermédiaire — pool avancé
non débloqué »), car c'est là que le défaut se matérialise. Pas de bouton ici
(le réglage se fait dans la carte) ; renvoie visuellement vers le profil.

### Partie 2 — Re-tag *Tractions lestées* → `intermediate` (migration DB)

**Migration `supabase/migrations/00192_retag_tractions_lestees_intermediate.sql`**,
appliquée **via MCP Supabase** (jamais `db push`/dashboard) :

```sql
BEGIN;
-- Tractions lestées (id 13) : advanced → intermediate.
-- Cohérence KPI ↔ prescription : le KPI weighted_pullup est mesuré dès
-- l'intermédiaire ; l'exo de traction lestée doit l'être aussi.
-- Cf. docs/plans/2026-05-25-muscu-304-couplage-niveau-tier-design.md §3.
UPDATE dim_exercices
  SET level = 'intermediate'
  WHERE id = 13 AND nom_exercice = 'Tractions lestées';
COMMIT;
```

Ciblage par `id` (stable) + garde sur `nom_exercice`. Idempotent (réappliquer
ne change rien).

**Effet** : le seau `upper_strength` d'un athlète **Intermédiaire** inclut
désormais *Tractions lestées* (is_core, force 5×3 @ 85 %) → la qualité mesurée
par `weighted_pullup` devient prescriptible. Les **débutants** gardent le poids
du corps (*Tractions élastiques*, beginner). On rend l'exo **disponible** ; on ne
le force pas comme pick n°1 (plusieurs core intermédiaires en `upper_strength` :
*Bench Pull*, *Tractions prise neutre*, *Dips*) — la préférence par tier est
hors §304.

## 4. Flux de données

1. Coach règle `practice_level` / `performance_tier` dans la carte → upsert
   `strength_athlete_settings` (inchangé).
2. À l'affichage de la carte **et** de l'aperçu : `hasUnderLeveledProfile(...)`
   décide de l'encart / bandeau.
3. `[Aligner sur Confirmé]` → upsert `practice_level='advanced'` → invalidation
   de `["strength-athlete-settings", athleteId]` (clé déjà partagée carte ↔
   aperçu, `StrengthAthleteProfileCard.tsx:62`) → l'encart disparaît, l'aperçu se
   régénère avec le pool `advanced`.
4. Génération du mésocycle : `selectExercises` voit *Tractions lestées* dès
   `intermediate` (effet migration).

## 5. Cas limites

- **`settings` absent** (ligne non créée) → défauts `intermediate`/`club` →
  pas de mismatch (club). OK.
- **tier `regional`** → pas d'alerte (seuil = national/elite). Choix assumé.
- **Profil `advanced` + `club`** → pas d'alerte (sens inverse non traité).
- **Double clic / état transitoire** : le bouton réutilise la mutation existante
  (indicateur « Enregistrement… / Enregistré » déjà géré).

## 6. Tests

- `src/lib/strength/__tests__/strengthProfileMismatch.test.ts` — matrice
  `level × tier` (4×3) ; vérifie le sens unique.
- Ajout à `src/lib/strength/__tests__/mesocycleEngine.test.ts` — un athlète
  `intermediate` a *Tractions lestées* dans son pool `upper_strength` (après
  re-tag, via un catalogue de test mis à jour).
- `npm test` + `npx tsc --noEmit` verts avant commit.
- **Pas de `npm run test:rls`** : la migration est un simple `UPDATE` de données
  catalogue, aucune policy/helper/rôle touché (règles RLS de `CLAUDE.md`).

## 7. Fichiers touchés

| Fichier | Nature |
|---|---|
| `supabase/migrations/00192_retag_tractions_lestees_intermediate.sql` | nouveau (migration MCP) |
| `src/lib/strength/strengthProfileMismatch.ts` | nouveau (helper pur) |
| `src/lib/strength/__tests__/strengthProfileMismatch.test.ts` | nouveau (test) |
| `src/components/strength/assessment/StrengthAthleteProfileCard.tsx` | édition (encart + bouton) |
| `src/pages/MesocyclePreview.tsx` | édition (bandeau compact) |
| `src/lib/strength/__tests__/mesocycleEngine.test.ts` | édition (cas traction lestée intermédiaire) |
| `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md` | workflow doc obligatoire |

> `files-map.md` : `strengthProfileMismatch.ts` est < 150 lignes et non
> architectural → pas d'ajout obligatoire (à réévaluer à l'implémentation).

## 8. Workflow de documentation (obligatoire)

Entrée §304 dans `implementation-log.md` ; lignes `ROADMAP.md` /
`FEATURES_STATUS.md` ; mise à jour de la **seule** ligne « Dernier § livré » de
`CLAUDE.md`.

## 9. Références

- Audit : `docs/audits/2026-05-25-audit-muscu-100nl-hommes-elite-vs-generateur.md` (§4 GA).
- §303 : `docs/plans/2026-05-24-muscu-dejeunification-g1-g3-design.md`.
- Migration table : `supabase/migrations/00191_strength_athlete_settings.sql`.
