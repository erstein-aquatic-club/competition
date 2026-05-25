# §306 — Préhab ciblée par nage (zone aine/adducteurs + affinité préhab event-aware) — Design

*Date : 2026-05-25. Origine : reco **R2** de l'audit `docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md` (seul écart 🔴) + vision §306 « préhab ciblée par nage » du log. Décision produit : muscu **indépendante de la natation en eau** (inchangée).*

## Problème

L'audit matrice a révélé un trou de sécurité 🔴 et un manque de cohérence élite :

1. **Défensif (🔴)** — La douleur **adducteurs/aine** (blessure-signature de la brasse, avec le « breaststroker's knee » : 86 % de prévalence genou, RR 5,1×, + élongations adducteurs/aine) **n'est pas déclarable** : le body-map (`BodySvg.tsx:18-37`) n'a que `left/right_hip`, `left/right_knee`. Or la brasse porte l'emphasis jambes **max** de la matrice (`lower_strength`/`lower_power` clampés à 1.0). Conséquence : la modulation peut **charger une aine blessée** sans frein — un brasseur ne peut signaler que « hanche » ou « genou ».

2. **Préhab proactif absent (cohérence élite)** — Les programmes JO/championnats du monde (Peaty, King, USMS) construisent la capacité **adducteurs toute l'année** (Copenhagen, sumo RDL, VMO) pour *prévenir* la blessure. Or `selectExercises` **n'est pas event-aware** (`mesocycleEngine.ts:373-429`) : dans un seau, il prend `isCore` puis niveau décroissant, sans savoir que le nageur fait de la brasse → aucun ciblage préhab par nage.

## Objectif

Fermer le trou défensif **et** ajouter la couche préhab proactive event-aware, sans coupler à la natation en eau et sans réécrire le cœur du moteur.

## Périmètre & non-périmètre

- **Dans le périmètre** : zone aine déclarable + contre-indication ; préhab proactif ciblé par nage (adducteurs brasse en priorité, extensible coiffe/épaule crawl/fly/dos).
- **Hors périmètre** : couplage macrocycle/charge bassin ; transfert eau ; nouveau seau tronc/core (= R5, chantier distinct) ; recalibration d'emphasis (R3/R4/R6).

## Architecture & blast radius

Deux phases, **aucune réécriture du cœur** :

- **Phase 1 (Défensif)** — **données + UI uniquement, zéro changement de logique moteur**. L'override douleur (`prioritizeBuckets`, `mesocycleEngine.ts:235-245`) et le filtre contre-indication de `selectExercises` (`mesocycleEngine.ts:382-396`) sont déjà **génériques** sur des chaînes de zones : une nouvelle zone fonctionne automatiquement dès qu'elle est déclarable et que des exos la portent.
- **Phase 2 (Préhab proactif)** — une **colonne** sur `dim_exercices` + une **passe de préférence** dans `selectExercises` (seule vraie modif moteur, additive).

Pas de RLS touchée (tagging = `UPDATE`/`ALTER` de données, pas de policy) → **pas de `test:rls`**.

---

## Phase 1 — Défensif (zone aine + contre-indication)

### Modélisation de la zone — décision : bilatéral (A1)
`left_groin` / `right_groin`, side `front`. Respecte la convention latéralisée du body-map (épaule/coude/poignet/hanche/genou/cheville) et la réalité clinique (une élongation adducteur est unilatérale ; le coach voit le côté dans `PainHistoryMap`). *(Rejeté : A2 zone axiale unique `groin` — casse la convention, ne distingue pas les côtés.)*

### Changements
1. **`src/components/wellness/BodySvg.tsx`** : +2 entrées `BODY_ZONES` (`left_groin`/`right_groin`, `side:'front'`) + positions `FRONT_POSITIONS` — intérieur de cuisse, entre hanches (cy 230) et genoux (cy 310) → ~`left_groin {cx 90, cy 268}`, `right_groin {cx 110, cy 268}` (placement final via `/frontend-design`, **obligatoire** pour le SVG).
2. **`src/lib/strength/zones.ts`** : `ZONE_LABEL_FR += { left_groin:'aine G', right_groin:'aine D' }`.
3. **Migration `00197`** (MCP) : append `left_groin,right_groin` à `contraindication_zones` des exos qui chargent franchement les adducteurs — **liste focalisée (à valider coach)** :

| id | exo | bucket | zones actuelles |
|---|---|---|---|
| 58 | Planche Copenhague | lower_strength | `{left_hip,right_hip}` |
| 37 | Fente latérale | lower_strength | `{l/r_knee, l/r_hip}` |
| 33 | Squat bulgare | lower_strength | `{l/r_knee, l/r_hip}` |
| 36 | Soulevé de terre roumain unilat. | lower_strength | `{lower_back, l/r_hip}` |
| 76 | Fente sautée alternée | lower_power | `{l/r_knee, l/r_ankle}` |
| 92 | départ avec ceinture | lower_power | `{l/r_knee, l/r_ankle}` |

Volontairement **pas** tous les exos « hanche » (sinon sur-exclusion : un simple squat n'est pas un stresseur adducteur majeur).

### Propagation automatique
`BODY_ZONES` + `FRONT_POSITIONS` sont la source unique → la zone apparaît dans `BodyHeatMap` (sélecteur douleur nageur), `PainHistoryMap` (historique coach), `AssessmentContext`. Aucun autre câblage.

### Effet
Douleur aine déclarée (intensité ≥ 1) → ces exos exclus par `selectExercises` (substitution par un non-core sûr du même seau) ; si intense (≥ 3) → `mobility` forcée rang 1. Le brasseur ne reçoit plus de charge adducteurs sur une aine blessée. **Échec A×B de l'audit fermé.**

---

## Phase 2 — Préhab proactif event-aware

### Mécanisme — décision : colonne d'affinité + passe de préférence (B1)
*(Rejeté : B2 table de mapping séparée — jointures/fetch en plus pour peu de gain ; B3 via seau mobility — Copenhagen est de la force, pas de la mobilité, et ne cible pas les adducteurs.)*

### Changements
1. **Migration** : `ALTER TABLE dim_exercices ADD COLUMN stroke_prehab_affinity text[]` (défaut `NULL`/`{}`). Taguer les exos préhab par nage — V1 **brasse → adducteurs** (`{breaststroke}` sur ids 58/37/33 ; VMO/quad à compléter). Extensible : coiffe/épaule → `{freestyle,butterfly,backstroke}` (ex. Face Pull, rotation externe, Y-T-W).
2. **`src/lib/strength/mesocycleEngine.ts`** : étendre la signature `selectExercises(allocations, catalog, level, painZones, strokeKey?)`. Après le tri `isCore`/niveau (`mesocycleEngine.ts:399-405`), **bump** vers la tête de leur seau les exos dont `stroke_prehab_affinity` contient `strokeKey` (équivalent-core, sans déloger un vrai core de force). `generateMesocycle` dérive `strokeKey` de `template.event_group` (`breaststroke_100` → `breaststroke`) et le passe.
3. **Types** : `CatalogExercise.strokePrehabAffinity?: string[]` (mapping depuis `dim_exercices`).

### Effet
Un brasseur voit le travail adducteurs proactif (Copenhagen remonte dans `lower_strength`, seau focus à emphasis max) **sans polluer les autres nages** (l'affinité est ciblée). Couche « élite » proactive.

---

## Tests

- **Phase 1** (`node:test`, engine pur, mocks — pas de DB) : (a) exo tagué `left_groin` exclu de la sortie de `selectExercises` quand `left_groin ∈ painZones` ; (b) douleur aine intense → `prioritizeBuckets` met `mobility` rang 1. Migration `00197` vérifiée par `SELECT` après MCP.
- **Phase 2** (`node:test`) : exo à affinité `breaststroke` remonte en tête de son seau quand `strokeKey='breaststroke'`, ordre **inchangé** pour `strokeKey='freestyle'`.
- **Pas de `test:rls`** : données/colonne, aucune policy modifiée. `npx tsc --noEmit` exit 0.

## Décisions / limites

- **Liste d'exos = choix coach** (contre-indication Phase 1 + affinité Phase 2) : proposée, **à valider** (comme les barèmes de-novo). Réversible.
- **Latéralité côté douleur uniquement** : une douleur `left_groin` exclut les exos bilatéraux (pas de prescription unilatérale « jambe saine seulement » — hors périmètre V1).
- **Phase 2 nécessite le `strokeKey` dans le pipeline** : dérivé de `event_group` ; si un mésocycle legacy a un `event_group` non parsable, la passe de préférence est simplement inactive (dégradation gracieuse).
- **`right_calf` manquant au body-map** (asymétrie notée par l'audit) : **hors périmètre** §306 (corrigeable séparément).

## Plan d'implémentation
Phase 1 d'abord (le 🔴). Détail → plan généré via `writing-plans`.
