# §366 — Correctif unilatéral visible · Entretien force basse garanti · Tirage signature par nage

*Design validé le 2026-06-03. Origine : retour terrain coach sur le mésocycle de Victoria SCHNEPF (athlete 8, 100 dos).*

## Contexte & diagnostic (preuves)

Le coach signale 3 défauts sur le méso **actif** de Victoria (`1e2615b0…`, généré 2026-06-03 04:15, engine 1.1.0 — donc **pas** un plan périmé) :

1. « Manque de force bas du corps, mais pas d'exercice force basse. »
2. « Problèmes de mobilité, mais pas de mobilité corrective. »
3. « Focus 100 dos mais quasi les mêmes exercices que les autres nages. »

Investigation sur la donnée matérialisée (`strength_session_items` des séances 342/343) :

| Plainte | Réalité constatée | Cause racine |
|---|---|---|
| ① force basse | **Présente** : Soulevé trap bar (lower_strength) en J1 « Force haut + Force bas », absente du J2. | Allocation maintien 0.4/sem fragile ; garantie §335 conditionnelle ; bloc non libellé → lecture « rien ». |
| ② mobilité corrective | **Présente** : « Rowing scapulaire unilatéral » ciblé sur scapula_control côté **gauche** (son axe asymétrique faible, L1/R2). | `correctiveAxis`/`correctiveSide` **perdus à la matérialisation** ; note générique → invisible comme correctif. Le bilatéral visible = échauffement commun (Bloc 1). |
| ③ spécificité dos | **Vrai trou** : `upper_strength` = 2 staples épinglés (Tractions lestées pri 100, Straight-arm pulldown « schéma pap » id 12 pri 90) pour **toutes** les nages. | `selectExercises` sélectionne par seau ; la nage n'influence que la préhab (`strokePrehabAffinity`), pas les blocs principaux. Aucun tirage dos taggé. |

`deficientAxes` (critère `min(G,D) ≤ 1` OU `|G−D| ≥ 2`) : seul **scapula_control** (effective 1, side left) qualifie chez Victoria ; shoulder_flexion 2/2 et hip_hinge 2/2 exclus (volontaire).

## Décisions

- **A** — surfacer le correctif, **sans** changer le seuil (les axes 2/2 ne déclenchent pas, volontaire).
- **B** — **1×/microcycle** suffit (« un peu » d'entretien), mais en **invariant robuste** + libellé.
- **C** — `Tirage vertical unilatéral supination assis bas` (id 11) = tirage signature **dos** ; pulldown pap (id 12) retiré du dos uniquement (zéro régression ailleurs).

## Conception

### A — Correctif unilatéral visible et ciblé
Threader l'intention corrective jusqu'à l'item matérialisé :
- `raw_payload` reçoit `corrective_axis` + `corrective_side` (déjà calculés par `selectCorrectiveWarmup`, §352).
- **Note** explicite : « Correctif <axe> — côté faible : <gauche/droite>, travail unilatéral » (ou « bilatéral » si `side === 'both'`).
- UI : badge « Correctif · gauche » sur l'item d'échauffement (passe par `/frontend-design`).
- Aucun changement de seuil ni de sélection.

### B — Entretien force basse garanti
Invariant : **≥ 1 bloc force basse par microcycle** quand le focus imposé par la nage est 100 % haut du corps — indépendant des préconditions fragiles de `ensureMaintienRepresentation` (§335), qui exige un complément redondant.
- Si le seau `lower_strength` (top maintien jambes) n'apparaît dans **aucune** séance du microcycle → injection garantie dans une séance de développement.
- Libellé clair « Entretien force basse » sur le bloc.
- Cadence : **1×/sem** (pas dans les 2 séances).

### C — Tirage signature par nage
**Schéma DB :** nouvelle colonne `dim_exercices.stroke_main_affinity text[]` (nullable, défaut NULL/`{}`).
- Sémantique : non-vide ⇒ exo « signature » conditionnel à la nage.
- `selectExercises` (tri) : priorité effective stroke-aware
  - affinité ∋ nage cible → épinglé staple (`STROKE_STAPLE = 90`, sous Tractions 100)
  - affinité non-vide mais ∌ nage cible → rétrogradé neutre (`min(selection_priority, 0)`)
  - affinité vide/NULL → `selection_priority` inchangé (rétrocompat totale)

**Contenu (migration) :**
| id | exo | `stroke_main_affinity` | effet |
|---|---|---|---|
| 11 | Tirage vert. uni. supination | `{backstroke}` | staple dos |
| 12 | Straight-arm pulldown (schéma pap) | `{freestyle,butterfly,breaststroke,medley}` | retiré du **dos** seulement, inchangé ailleurs |

Résultat dos `upper_strength` : Tractions lestées → **Tirage vert uni supi** → reste. Plus de pulldown papillon.

## Fichiers impactés (prévision)
- `supabase/migrations/00XXX_stroke_main_affinity.sql` — colonne + tags ids 11/12 (via MCP).
- `src/lib/strength/mesocycleEngine.ts` — `selectExercises` (C), invariant force basse (B).
- `src/lib/api/strength-catalog.ts` (mapper) + types `CatalogExercise` — lire `stroke_main_affinity` (C).
- Sérialiseur de matérialisation (raw_payload + note) — A.
- UI item échauffement — badge correctif (A, via `/frontend-design`).
- Tests `node:test` — sélection stroke-aware (C), invariant force basse (B), threading correctif (A).

## Tests & contraintes
- **TDD** sur les 3 changements moteur.
- Migration = **ajout de colonne** (pas de policy/table RLS) → **pas** de `test:rls`.
- Pas de redéploiement auto : effet visible seulement après **régénération** du méso (un plan figé ne se réécrit jamais — voir [[muscu-materialized-plan-stale-vs-catalog]]).
- Doctrine respectée : « l'épreuve dicte le focus, le reste en entretien » ([[muscu-training-design-principles]]) — on ne promeut pas la force basse en focus, on garantit l'entretien.

## Hors scope (différé)
- Correctif sur axes 2/2 (seuil élargi) — non demandé.
- Tirages signature brasse/4N — à définir plus tard.
- Force basse dans les 2 séances — 1× suffit.
