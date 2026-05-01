# §188 — Lier objectifs nageur ↔ allures (1-clic, sync passive)

*Design validé le 2026-05-01. Numéro §188 ré-attribué (l'ancien design "Gouvernance" est dans `archived/`). Précondition : §186 stable. Indépendant de §187.*

## 1. Contexte

Aujourd'hui, le coach saisit deux fois la même information :
- Côté **objectifs nageur** (§60) : "Léo Martin, 100m NL en 1:05.50 sur la compé du 15 juin"
- Côté **allures coach** (§184) : `coach_pace_targets {swimmer: Léo, stroke: NL, distance: 100, time_ms: 65500, pool_size: 50m}`

Aucun lien explicite. Le coach refait la saisie, et le nageur ne voit pas ses allures à côté de ses objectifs.

§188 ajoute un pont **synchronisation passive** : un bouton 1-clic côté coach qui pré-remplit le calculateur d'allures à partir d'un objectif, et un affichage côté nageur de la matrice d'allures à côté de son objectif quand un match existe.

## 2. Décisions de conception

| # | Décision | Justification |
|---|---|---|
| C1 | **Pas de FK** entre `objectives` et `coach_pace_targets`. Synchronisation au moment du clic uniquement. | Évite les modes "cible orpheline / désynchronisée". Si l'objectif change, le coach refait le clic — explicite. |
| C2 | **Parser `event_code` côté client** dans un helper pur `parseEventCode("100m NL") → {distance: 100, stroke: 'NL'} \| null` | Pas de RPC, pas de migration. Couvre les codes existants ("100m NL", "200m Brasse", "4x100 4N", etc.) avec fallback gracieux si non-parsable. |
| C3 | Le bouton est désactivé si `parseEventCode` échoue OU si `target_time_seconds IS NULL`. Tooltip explique pourquoi. | Pas de prompt utilisateur intrusif, juste un état désactivé clair. |
| C4 | Côté nageur, **match passif** sur `(swimmer_id, stroke, distance, pool)` pour afficher la matrice inline. Pas de FK, juste un lookup. | Cohérent avec C1. Le coach peut ajuster sa cible indépendamment de l'objectif (ex: ajuster le temps de quelques 1/100). |
| C5 | Si plusieurs cibles matchent (rare : même nage/distance/bassin avec time différent), afficher toutes les matrices empilées. Le coach gère. | Cas marginal. Pas de logique de "cible canonique" à inventer. |

## 3. Schéma DB

**Aucune migration.** §188 est purement client-side (parsing + queries existantes).

## 4. Composants côté coach

### 4.1. Bouton "→ Calculer les allures" sur chaque `ObjectiveCard`

Sur la fiche nageur coach (`CoachMySwimmersScreen` → drill-down nageur → onglet Objectifs) ainsi que sur l'écran `SwimmerObjectivesTab.tsx` :

```tsx
const parsed = parseEventCode(objective.event_code);
const canCalculate = parsed && objective.target_time_seconds != null;

<Button
  size="sm"
  variant="outline"
  disabled={!canCalculate}
  title={
    !objective.event_code ? "Code épreuve manquant" :
    !parsed ? `Code épreuve "${objective.event_code}" non reconnu` :
    !objective.target_time_seconds ? "Temps cible manquant" :
    "Pré-remplir le calculateur d'allures"
  }
  onClick={() => navigateToPaceWithPrefill({
    swimmer_account_id: objective.athlete_app_user_id,
    stroke: parsed.stroke,
    target_distance_m: parsed.distance,
    target_time_ms: Math.round(objective.target_time_seconds * 1000),
    target_pool_size: objective.pool_length === 25 ? '25m' : '50m',
  })}
>
  <Calculator className="h-3.5 w-3.5 mr-1.5" />
  → Allures
</Button>
```

### 4.2. Helper `parseEventCode` (`src/lib/eventCode.ts`)

```ts
export type Stroke = 'NL' | 'Dos' | 'Brasse' | 'Pap' | '4N';

const STROKE_ALIASES: Record<string, Stroke> = {
  'nl': 'NL', 'crawl': 'NL', 'libre': 'NL', 'free': 'NL',
  'dos': 'Dos', 'back': 'Dos',
  'brasse': 'Brasse', 'breast': 'Brasse', 'br': 'Brasse',
  'pap': 'Pap', 'butterfly': 'Pap', 'fly': 'Pap', 'papillon': 'Pap',
  '4n': '4N', 'im': '4N', 'medley': '4N', '4nages': '4N',
};

export function parseEventCode(code: string | null): { distance: number; stroke: Stroke } | null {
  if (!code) return null;
  const cleaned = code.trim().toLowerCase();
  // Match "100m NL", "200 brasse", "4x100 4n" (relais : on prend la distance d'une longueur)
  const match = cleaned.match(/^(?:\d+x)?(\d+)\s*m?\s*(.+)$/);
  if (!match) return null;
  const distance = parseInt(match[1], 10);
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const strokeKey = match[2].trim();
  const stroke = STROKE_ALIASES[strokeKey];
  if (!stroke) return null;
  return { distance, stroke };
}
```

### 4.3. Pré-remplissage du calculateur

Le calculateur d'allures (`CoachPaceCalculatorScreen`) doit accepter des query params `?prefill=...` ou un état React Router pour pré-remplir le formulaire de cible. À examiner pendant l'implémentation : si l'écran consomme déjà un état "cible en cours", étendre la signature plutôt que d'inventer un nouveau mécanisme.

Si une cible matchant `(swimmer, stroke, distance, pool)` **existe déjà**, ne pas en créer une nouvelle : ouvrir directement la matrice de la cible existante avec un toast "Cible déjà calibrée pour cet objectif — modification possible".

## 5. Composants côté nageur

### 5.1. Inline pace matrix sur `ObjectiveCard` (vue nageur)

Sur l'écran Objectifs nageur, pour chaque objectif :

```tsx
const parsed = parseEventCode(objective.event_code);
const matchingTarget = parsed ? findTargetForObjective({
  swimmer_account_id: currentAthleteId,
  stroke: parsed.stroke,
  distance: parsed.distance,
  pool_size: objective.pool_length === 25 ? '25m' : '50m',
}) : null;

return (
  <Card>
    <CardHeader>{objective.text}</CardHeader>
    {matchingTarget && (
      <CardContent>
        <PaceMatrixInline targetId={matchingTarget.id} compact />
      </CardContent>
    )}
  </Card>
);
```

### 5.2. Hook `useTargetForObjective(objective)`

```ts
export function useTargetForObjective(args: {
  swimmer_account_id: number;
  event_code: string | null;
  pool_length: number | null;
}): { target: CoachPaceTarget | null; isLoading: boolean };
```

Internally : query `coach_pace_targets` filter par `(swimmer_account_id, stroke, target_distance_m, target_pool_size)`. Retourne le plus récent si plusieurs.

### 5.3. Composant `PaceMatrixInline` (compact)

Variante de `PaceMatrix` simplifiée :
- Pas de toggle 25m/50m (utilise le pool de l'objectif)
- Pas d'éditeur de zones
- Lecture seule
- Hauteur réduite (3-4 lignes max)
- Lien "Voir détail" qui ouvre la `SwimmerPaceCard` complète si elle existe

## 6. RLS

**Aucune nouvelle policy.** §188 utilise les policies existantes :
- `objectives` : nageur lit ses propres objectifs (déjà en place)
- `coach_pace_targets` : nageur lit ses propres cibles via la policy §184

Les hooks côté nageur consultent simplement les rows que la RLS leur autorise. Pas d'élévation de privilège.

## 7. Tests

### 7.1. Unitaires `parseEventCode`

- `"100m NL"` → `{distance: 100, stroke: 'NL'}`
- `"200 brasse"` → `{distance: 200, stroke: 'Brasse'}`
- `"4x100 4N"` → `{distance: 100, stroke: '4N'}` (longueur d'une seule branche)
- `"50 papillon"` → `{distance: 50, stroke: 'Pap'}`
- `null` ou `""` ou `"truc"` → `null`
- Casse mixte : `"100M Crawl"` → `{distance: 100, stroke: 'NL'}`

### 7.2. Composants coach

- `ObjectiveCard.test.tsx` : bouton désactivé si `event_code` invalide ou `target_time_seconds` null, tooltip approprié
- `CoachMySwimmersScreen.test.tsx` : clic → navigation vers `/coach?section=pace-calculator&prefill=...` avec payload correct

### 7.3. Composants nageur

- `useTargetForObjective.test.ts` : retourne null si pas de match, retourne le plus récent si match multiple
- `ObjectiveCard.swimmer.test.tsx` : matrice inline rendue ssi `matchingTarget` existe

### 7.4. Intégration end-to-end

Cas heureux :
1. Coach crée un objectif "100m NL en 1:05.50 / 50m" pour Léo
2. Coach clique "→ Allures" sur l'objectif
3. Le calculateur s'ouvre avec la cible pré-remplie
4. Coach valide → cible créée
5. Léo se connecte → ses objectifs affichent la matrice inline

Cas FK absente :
1. Coach modifie sa cible (temps légèrement ajusté à 1:05.20)
2. L'objectif reste inchangé (1:05.50)
3. La matrice côté nageur reflète la cible (1:05.20), pas l'objectif
4. Comportement attendu : la cible est la source de vérité pour les allures

## 8. Plan de livraison

1. Helper `parseEventCode` + tests unitaires (foundation, peut être committé seul)
2. Hook `useTargetForObjective` + tests
3. Composant `PaceMatrixInline` (compact)
4. Bouton "→ Allures" sur `ObjectiveCard` coach + tests
5. Pré-remplissage `CoachPaceCalculatorScreen` (route + state)
6. Affichage matrice inline côté nageur + tests
7. Doc

## 9. Risques

| Risque | Mitigation |
|---|---|
| `event_code` non standardisé en DB ("100 m NL", "100m crawl", "100m freestyle") | `parseEventCode` tolère casse, espaces, alias FR/EN. Bouton désactivé avec tooltip clair si impossible à parser. |
| Coach modifie l'objectif après création de la cible → désync | Choix assumé (C1). UI peut afficher un disclaimer si timestamp objectif > timestamp cible : "Objectif modifié depuis le calibrage des allures — recalibrer ?" en V2. |
| Plusieurs cibles matchent un objectif | Affichage stacké côté nageur (C5). Coach gère via le calculateur s'il veut nettoyer. |
| Nageur sans compte (manual) → pas d'objectif possible | Manuals n'ont pas d'objectifs (table `objectives` requiert `auth.users.id`). §188 est nageur-avec-compte uniquement, c'est cohérent. |
| Pool mismatch (objectif en bassin 25m, cible créée en 50m) | Le bouton pré-remplit le pool depuis `objective.pool_length`. Si null, défaut 50m + toast "pool_length non précisé sur l'objectif, pré-rempli en 50m". |

## 10. Hors scope

- FK `coach_pace_targets.objective_id` + sync continue → V2 si l'usage le demande
- Suggérer de mettre à jour l'objectif quand le coach modifie la cible → V2
- Statistiques cross-objectifs (ex: "70% des objectifs ont leurs allures calibrées") → §190+
- Création automatique de cibles à la création d'un objectif → rejeté (préserve l'agentivité du coach)

## 11. Forward references

- **§187 révisé** : aucun couplage. Le multiplicateur s'applique sur la cible, peu importe sa provenance (manuelle ou pré-remplie depuis un objectif).
