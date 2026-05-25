# Design — Dé-jeunification du moteur de mésocycle muscu (G1 + G3)

*Date : 2026-05-24. Statut : design validé, prêt pour plan d'implémentation.*

## Contexte

Issu de l'audit [`docs/audits/2026-05-24-audit-muscu-200nl-femmes-elite-vs-generateur.md`](../audits/2026-05-24-audit-muscu-200nl-femmes-elite-vs-generateur.md),
qui compare les méthodes de musculation des nageuses élite du 200 m NL au
générateur de mésocycle de l'app. Deux écarts « tête de gondole » *swim-independent*
sont traités ici :

- **G1 — calibration jeunesse.** `ageBandFor` (`src/lib/strength/kpiBaremes.ts:251`)
  rabat **tout âge ≥ 17 sur la bande `'17-18'`**, sur une **population de référence
  scolaire** (4 KPI sur 5 « transposés/placeholder »). Pire, `kpiScore`
  (`kpiBaremes.ts:33`) **plafonne le score à 90** (ancre haute p90 → score 90).
  Conséquence : une nageuse adulte / forte score ~90 partout → la priorisation
  `emphasis × (100 − score)` (`mesocycleEngine.ts:223`) se réduit à l'emphasis du
  template ; **le bilan perd son pouvoir discriminant**.
- **G3 — niveau figé.** `MesocyclePreview.tsx:304` code en dur `level: "intermediate"` ;
  les exercices `advanced` du catalogue (~14, `dim_exercices.level`, mig `00164`)
  ne sont **jamais** servis, et `selectExercises` (`mesocycleEngine.ts:373`) exclut
  déjà tout exercice au-dessus du niveau passé.

### Contrainte de périmètre

Décision produit du 2026-05-24 : **le module muscu reste indépendant de la
planification et des séances de natation.** Tout le design ci-dessous est
*swim-independent* (aucune lecture du calendrier/charge/résultats natation).

## Décisions de cadrage (brainstorming)

1. **Population cible** : modèle flexible — découpler **âge** ET **niveau de
   performance**, plutôt que cibler seulement le club 15-22 ou seulement l'élite.
2. **Modèle d'axes** : **deux axes distincts** —
   - *niveau de pratique muscu* (`beginner|intermediate|advanced`) → filtre les
     exercices (G3) ;
   - *niveau de performance / tier* (`club|regional|national|elite`) → cale la
     courbe de normes KPI (G1).
3. **Source** : **coach-set, par athlète, persistant**, avec défauts sûrs
   (= comportement actuel). 100 % swim-independent.
4. **Approche scoring G1** : **A — transformation paramétrique** des courbes
   existantes (vs tables complètes par tier, écartées faute de données ; vs
   scoring relatif cohorte, écarté car refonte conceptuelle + démarrage à froid).

## Critères de succès

- Une nageuse **adulte** n'est plus rabattue silencieusement sur les normes
  17-18 ; une nageuse **forte** n'est plus plafonnée à un score ~90 indistinct →
  le bilan **retrouve son pouvoir discriminant**.
- Le **niveau de pratique muscu** débloque les exercices `advanced` quand c'est
  justifié, sans jamais les imposer à un débutant.
- **Défauts = comportement actuel** : aucune régression pour les profils déjà
  bien servis (hors effet plafond, documenté et voulu).
- **Honnêteté normative** : pas de fausses normes « élite mondiale » ; les flags
  de confiance (`solid`/`transposed`/`placeholder`) restent crédibles.

## Design

### 1. Stockage des deux niveaux

Nouvelle table dédiée (séparation propre, RLS claire) :

```
strength_athlete_settings
  athlete_id        int   PK / FK users
  practice_level    text  NULL  CHECK (beginner|intermediate|advanced)   -- G3
  performance_tier  text  NULL  CHECK (club|regional|national|elite)      -- G1
  updated_by        int   FK users
  updated_at        timestamptz default now()
```

- **Défauts = comportement actuel** : `practice_level` absent → `intermediate` ;
  `performance_tier` absent → `club` (transformation neutre, Δ = 0).
- **RLS** : athlète lit le sien ; coach/admin lecture + écriture club-wide, via
  les helpers `app_user_role()` / `app_user_id()` (mêmes patterns que
  `strength_assessments`). Migration appliquée **via MCP Supabase**
  (`apply_migration`), fichier dans `supabase/migrations/00XXX_...` (cf. CLAUDE.md).
- *Alternative écartée* : colonnes sur `user_profiles` (plus léger mais mêle des
  concepts muscu à une table partagée).

### 2. Barèmes : bande adulte + tier + plafond (Approche A)

Dans `src/lib/strength/kpiBaremes.ts` :

**(a) Bande adulte.** `AgeBand` gagne `'adulte'`.
`ageBandFor` : `<13 → null, ≤14 → '13-14', ≤16 → '15-16', ≤18 → '17-18', ≥19 → 'adulte'`.
Les entrées `'adulte'` de `KPI_BAREMES` sont **initialisées sur les ancres 17-18**
(plateau de maturité physique), documentées comme telles, confiance affichée.

**(b) Tier = décalage horizontal des ancres, unit-agnostique.** Une seule
constante `k` par tier. Au scoring :
`score = kpiScore(shiftAnchors(base, tier), value)`
avec `shiftAnchors` qui décale chaque ancre en x de `Δ = k(tier) × (val_p90 − val_p10)`
(l'étendue propre de la courbe → robuste aux unités kg/cm/W·kg⁻¹ et aux ancres
négatives, ex. `weighted_pullup` assisté < 0).

| tier | k | effet |
|---|---|---|
| `club` *(défaut)* | 0,00 | identité = aujourd'hui |
| `regional` | 0,18 | barre +18 % de l'étendue |
| `national` | 0,35 | barre +35 % |
| `elite` | 0,50 | barre +50 % |

Valeurs de **départ, ajustables** (constante unique par tier, pas par KPI).
Ex. concret : +10 kg de traction lestée (F 17-18) → score **70** en `club`,
**~35** en `national`.

**(c) Correction du plafond (saturation à 90).** Aujourd'hui `kpiScore` rabote
tout ce qui dépasse la dernière ancre à **90**. On modifie **uniquement** la
branche « ≥ dernière ancre » : **extrapolation de la pente du dernier segment**
jusqu'à 100, puis clamp [0,100]. Aucune nouvelle donnée. Ex. : +30 kg de traction
(au-dessus de p90 = 20, pente 2 pts/kg) → 90 + (30−20)×2 = 110 → **clamp 100**.

### 3. Wiring moteur (point d'entrée unique)

- `MesocycleInput.athlete` gagne `performanceTier: 'club'|'regional'|'national'|'elite'`
  (`level` existe déjà). `'adulte'` ajouté à `AgeBand`.
- **`scoreKpi` (`mesocycleEngine.ts:54-62`)** = seul site modifié pour le tier :
  il reçoit déjà `athlete` ; on remplace `kpiScore(bareme.anchors, m.value)` par
  `kpiScore(shiftAnchors(bareme.anchors, athlete.performanceTier), m.value)`.
- `kpiScore` lui-même change seulement sa branche plafond (extrapolation, cf. 2c).
- `selectExercises` consomme déjà `athleteLevel` → aucun changement de logique,
  juste le vrai niveau transmis.
- **`MesocyclePreview.tsx:301-305`** :
  `level: settings.practice_level ?? 'intermediate'`,
  `performanceTier: settings.performance_tier ?? 'club'`, alimentés par un fetch.
- **API** : `getStrengthAthleteSettings(athleteId)` + `upsertStrengthAthleteSettings(...)`
  dans `src/lib/api/strength.ts` (ou module dédié).
- **Recap confiance (`mesocycleEngine.ts:954`)** : garde les **ancres de base**
  pour l'affichage de fiabilité ; seul le score *appliqué* est tier-shifté.

### 4. UI coach (swim-independent)

- Sur l'écran coach existant **`/coach/strength-assessment/:athleteId`** (cible
  coach persistante, §302) : bloc « Profil muscu de l'athlète » avec **deux
  selects** — *Niveau de pratique muscu* (débutant/interm./confirmé) et *Niveau
  de performance* (club/régional/national/élite) — défauts pré-cochés
  (interm. / club), tooltip court (« affine la sélection d'exercices » / « cale
  les barèmes sur le bon niveau »). Sauvegarde via l'upsert.
- **Aperçu mésocycle** : afficher en lecture seule le contexte utilisé
  (« Normes : adulte · tier national ») dans le raisonnement auditable existant.
- Nageur : **lecture seule** (coach-set). Pas d'écran de saisie nageur (YAGNI).

### 5. Edge cases & no-régression

- Tier absent → `club` (Δ = 0) ; niveau absent → `intermediate` ⇒ **profils
  existants inchangés**, sauf effet plafond ci-dessous.
- Plafond extrapolé : change le score des **très forts** (> p90) même en `club`
  — amélioration voulue (restaure la discrimination), **pas** une régression
  fonctionnelle, mais impacte les snapshots de tests.
- Adulte (≥ 19) tier absent → bande `adulte` (= ancres 17-18) + `club` ⇒ scoring
  ≈ aujourd'hui mais **correctement étiqueté** et prêt pour le tier.
- KPI partiels : comportement inchangé (null → score 0 conservateur).

### 6. Tests

- **Unitaires `kpiBaremes`** : `ageBandFor` aux bornes (18 → `17-18`, 19 →
  `adulte`) ; extrapolation > p90 atteint 100 avec la bonne pente ; monotonie
  tier (tier ↑ ⇒ score ≤ à valeur égale) ; KPI à ancres négatives
  (`weighted_pullup`) correct sous décalage ; défauts (`club`) reproduisent
  l'ancien scoring **sauf** plafond documenté.
- **Moteur** : un profil « adulte fort » produit des priorités de seaux
  **différenciées** (plus le `emphasis × 10` plat).
- **RLS** : nouvelle table `strength_athlete_settings` → policies coach
  club-wide / athlète own ⇒ `npm run test:rls` requis (CLAUDE.md règle 1).
  **Docker à confirmer par l'utilisateur** avant lancement.
- **Snapshots** impactés par le plafond : régénérer/ajuster explicitement.

## Hors périmètre

- Couplage au macrocycle / charge bassin / résultats FFN (contrainte produit).
- Saisie nageur des niveaux (coach-set uniquement pour ce chantier).
- Autorégulation RPE/RIR (écart G4, autre chantier).
- Sourcing de vraies normes élite adultes par KPI (Approche B, écartée).

## Suites possibles (non engagées)

- Calibration fine des `k(tier)` sur données club réelles.
- Tier-adjusted confidence : signaler « score ajusté au tier (heuristique) »
  quand tier ≠ club.
