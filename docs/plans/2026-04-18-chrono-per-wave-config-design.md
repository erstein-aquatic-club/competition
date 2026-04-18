# Chrono coach — exercices différents par vague

*Design doc — 2026-04-18*

## Contexte

Le chrono coach (`CoachChronoScreen` → `ChronoSetup` / `ChronoRace` / `ChronoResults`) permet aujourd'hui de lancer une série avec une **configuration globale partagée** par toutes les vagues :

- `totalDistanceM` — distance totale par série
- `splitDistanceM` — distance de split
- `seriesCount` — nombre de séries (0 = illimité)

Seule la **récupération entre départs** (`departureIntervalSec`) est déjà par vague.

Sur le terrain, le coach a régulièrement besoin que deux vagues fassent **des choses différentes** dans la même piscine (ex. V1 : `4×200m splits 50m`, V2 : `6×100m splits 25m`). Aujourd'hui il doit lancer deux chronos successifs, ce qui casse la cadence d'entraînement.

## Objectif

Permettre au coach de **personnaliser** `seriesCount`, `totalDistanceM`, `splitDistanceM` **par vague**, tout en gardant le mode "globale pour tout le monde" par défaut.

## Décisions produit

1. **Mode global par défaut, override par vague** — la config globale reste la source de vérité ; une vague peut être "personnalisée" (override). Toutes les séances existantes continuent de fonctionner pareil.
2. **Le temps de récupération reste toujours affiché par vague** — c'est une différenciation quasi-systématique, pas cachée derrière un toggle.
3. **Seuls `seriesCount`, `totalDistanceM`, `splitDistanceM` sont overridables** — pas de libellé texte libre, pas de type de nage structuré, pas d'effort.

## Modèle de données

### Types étendus (`src/lib/chrono-types.ts`)

```ts
export interface WaveConfigOverrides {
  seriesCount?: number;      // absent = hérite global
  totalDistanceM?: number;
  splitDistanceM?: number;
}

export interface WaveState {
  wave: number;
  startedAt: number | null;
  stopped: boolean;
  currentRep: number;
  departureIntervalSec: number;
  lastFinishedAt: number | null;
  overrides: WaveConfigOverrides | null;  // ← NEW, null = hérite
}

export function resolveWaveConfig(
  state: Pick<ChronoState, "seriesCount" | "totalDistanceM" | "splitDistanceM" | "waves">,
  wave: number,
) {
  const w = state.waves.find(w => w.wave === wave);
  return {
    seriesCount:    w?.overrides?.seriesCount    ?? state.seriesCount,
    totalDistanceM: w?.overrides?.totalDistanceM ?? state.totalDistanceM,
    splitDistanceM: w?.overrides?.splitDistanceM ?? state.splitDistanceM,
  };
}
```

### Rationale : pourquoi un sous-objet `overrides` et pas des champs à plat ?

- **Flag "Personnalisée" direct** : `wave.overrides !== null` suffit pour le badge UI et le bouton Personnaliser/Réinitialiser.
- **Groupement logique** : les 3 champs évoluent ensemble et doivent être lisibles d'un bloc.
- **Rétrocompatibilité triviale** : un ancien backup sans `overrides` → `undefined` → helper fallback sur global → comportement inchangé.

## Actions reducer (`src/lib/chrono-reducer.ts`)

Deux nouvelles actions :

```ts
| { type: "SET_WAVE_OVERRIDES"; wave: number; overrides: WaveConfigOverrides | null }
| { type: "SET_WAVE_OVERRIDE_FIELD"; wave: number; field: keyof WaveConfigOverrides; value: number }
```

- `SET_WAVE_OVERRIDES` : active/désactive entièrement l'override (null = reset).
- `SET_WAVE_OVERRIDE_FIELD` : édition unitaire des inputs contrôlés.

`computeWaves()` initialise `overrides: null` pour toute nouvelle vague et **préserve** l'override existant quand une vague est recalculée.

`RESET_FOR_NEW_SERIES` **préserve** les overrides (le coach veut probablement relancer la même config par vague). Reset uniquement `startedAt`, `stopped`, `currentRep`, `lastFinishedAt`.

## UI Setup (`ChronoSetup.tsx`)

La ligne actuelle "Départ toutes les :" devient une **liste de cartes par vague** :

**Carte compacte (vague non personnalisée)**
```
┌──────────────────────────────────────────────────┐
│ [V1] cyan                    [• Personnaliser]   │
│ Départ toutes les [3]min [00]sec                 │
└──────────────────────────────────────────────────┘
```

**Carte étendue (vague personnalisée)**
```
┌──────────────────────────────────────────────────┐
│ [V2] orange  [✓ Personnalisée]   [Réinitialiser] │
│ Départ toutes les [2]min [30]sec                 │
│ ──────────────────────────────────────────────   │
│ [4]× [200]m   splits à [50]m                     │
└──────────────────────────────────────────────────┘
```

### Règles d'interaction

- **Clic "Personnaliser"** → `SET_WAVE_OVERRIDES` avec les 3 valeurs globales pré-remplies (rend l'effet explicite avant modification) → la carte s'étend.
- **Badge "✓ Personnalisée"** remplace le bouton "Personnaliser", accompagné d'un lien "Réinitialiser" (→ `SET_WAVE_OVERRIDES { overrides: null }`).
- **Input unitaire** (minus/plus/input) → `SET_WAVE_OVERRIDE_FIELD`.
- **Bloc globale** en header : reste inchangé, mais affiche un sous-titre discret dès qu'au moins une vague est personnalisée :
  > *↳ 2 vagues utilisent ces valeurs (V2 est personnalisée)*

### Mobile

Les cartes s'empilent verticalement (déjà `flex-wrap`). Sur mobile, les 3 champs d'override s'affichent sur 2 lignes (series × distance puis splits) pour respecter la contrainte de largeur.

## UI Race (`ChronoRace.tsx`)

### `SwimmerCard` — résolution par parent

Aujourd'hui le composant reçoit `splitDistanceM` et `totalDistanceM` globaux. Après : le parent (`LaneRow`) résout **une fois par vague** via `resolveWaveConfig(state, s.wave)` puis passe les valeurs résolues à chaque `SwimmerCard` de cette vague.

### `WaveHeaderCell`

Reçoit désormais `seriesCount` résolu pour **sa** vague — affichage `S2/4` pour V1 et `S3/6` pour V2 si personnalisées différemment.

### Affichage de la config effective

Dans le header de la colonne vague, sous le bouton GO et persistant quand la vague court, afficher en mini-texte la config résolue :
```
[V1] GO
  4×200m · splits 50m
```
→ permet au coach de vérifier d'un coup d'œil ce que fait chaque vague pendant la course.

Style : `text-[10px]`, opacité réduite (`text-white/70`), pas de wrap.

### Actions inchangées

`RECORD_SPLIT`, `STOP_SWIMMER`, `STOP_RACE` ne dépendent pas de la distance — aucun changement.

## Results (`ChronoResults.tsx`)

### `buildChronoRecordInput`

Deux changements :

1. **Splits calculés avec le `splitDistanceM` résolu** pour la vague du nageur :
   ```ts
   const { splitDistanceM } = resolveWaveConfig(state, rs.swimmer.wave);
   splitsByRep: rs.splitsByRep.map(rep =>
     rep.map((s, i) => ({
       distanceM: splitDistanceM > 0 ? (i + 1) * splitDistanceM : 0,
       cumulativeMs: s.cumulativeMs,
       lapMs: s.lapMs,
     })),
   ),
   ```

2. **Payload enrichi** — on ajoute un champ optionnel `waveOverrides` dans `config` (colonne `jsonb` en DB, pas de migration requise) :
   ```ts
   config: {
     totalDistanceM, splitDistanceM, seriesCount, laneCount,
     waveOverrides: { 2: { totalDistanceM: 100, splitDistanceM: 25 } }, // seulement les vagues personnalisées
   }
   ```

### Affichage

Dans chaque carte résultat, si la vague du nageur est personnalisée, afficher un sous-titre :
```
Félix  [V2] ✓ Personnalisée : 6×100m splits 25m
```

### Export XLSX

`exportChronoToXlsx` reçoit `swimmers[].splitsByRep[].distanceM` déjà résolu par `buildChronoRecordInput`. Vérifier dans `chronoXlsxExport.ts` que la sortie utilise `split.distanceM` stocké (et pas une recomputation globale).

Ajout éventuel futur : colonne/footer "Config vague" — hors scope de ce patch.

## Edge cases

| # | Cas | Comportement |
|---|-----|--------------|
| E1 | Dernier nageur d'une vague retiré en Setup | `computeWaves` supprime la `WaveState` + son override. Ré-ajout ultérieur → `overrides: null` (hérité). Acceptable (déjà le cas pour `departureIntervalSec`). |
| E2 | Personnalisation puis changement de la globale | Vagues non-personnalisées suivent la globale, personnalisées restent figées. Comportement voulu. |
| E3 | Restore localStorage ancien (pas d'`overrides`) | `overrides: undefined` → `resolveWaveConfig` fallback global → comportement pré-patch. |
| E4 | Restore chrono record DB sans `waveOverrides` | Même fallback. |
| E5 | Swimmer déplacé entre vagues pendant course | Déjà interdit (`SET_WAVE` exposé en `setup` uniquement). Aucun impact. |
| E6 | Export XLSX avec vagues divergentes | Chaque split embarque `distanceM` résolu au build → feuille cohérente. |
| E7 | Une seule vague, override activé | Fonctionne (override écrase global). Pas dégénéré. |
| E8 | Nouvelle vague ajoutée après personnalisation d'une autre | Nouvelle vague démarre `overrides: null` → hérite globale. Cohérent. |

## Tests

### Unitaires Vitest

**`src/lib/__tests__/chrono-reducer.test.ts`** (enrichi ou nouveau)
- `SET_WAVE_OVERRIDES` avec objet → stocke l'override sur la bonne `WaveState`.
- `SET_WAVE_OVERRIDES` avec `null` → réinitialise.
- `SET_WAVE_OVERRIDE_FIELD` partiel → update unitaire sans toucher les autres champs.
- `computeWaves` préserve `overrides` existant.
- `computeWaves` initialise `overrides: null` pour nouvelle vague.
- `RESET_FOR_NEW_SERIES` préserve les overrides.
- `ADD_SWIMMER` dans vague déjà personnalisée → override conservé.

**`src/lib/__tests__/chrono-types.test.ts`** (nouveau)
- `resolveWaveConfig` wave inexistante → fallback global.
- `resolveWaveConfig` wave sans overrides → fallback global.
- `resolveWaveConfig` override partiel (`{ seriesCount: 4 }`) → mix override + global.
- `resolveWaveConfig` override complet → tout vient de l'override.

### Vérification manuelle

1. Setup 2 vagues, personnaliser V2 → cartes distinctes.
2. Race : `S{n}/{total}` + progress bar respectent la config par vague.
3. Results : ligne "Personnalisée : …" pour V2.
4. Export XLSX : `distanceM` par split côté V2 cohérent.
5. Reload backup en cours → overrides restaurés.
6. Reload vieux backup (sans `overrides`) → fallback global OK.

### Tests RLS

**Non applicable** : pas de changement de policy, helper auth, ou schéma DB (sous-champ JSON de `chrono_records.config` déjà en place).

### Vérifications build

- `npx tsc --noEmit` → types propres.
- `npm test` → suite existante passe.

## Fichiers impactés

| Fichier | Type de changement |
|---------|---------------------|
| `src/lib/chrono-types.ts` | + `WaveConfigOverrides`, + `resolveWaveConfig`, `WaveState.overrides` |
| `src/lib/chrono-reducer.ts` | + actions `SET_WAVE_OVERRIDES`, `SET_WAVE_OVERRIDE_FIELD`, update `computeWaves`, update `RESET_FOR_NEW_SERIES` |
| `src/components/chrono/ChronoSetup.tsx` | Refonte ligne "Départ" → cartes vagues + toggle Personnaliser |
| `src/components/chrono/ChronoRace.tsx` | Résolution config par vague dans `LaneRow` → props résolus pour `SwimmerCard` et `WaveHeaderCell` |
| `src/components/chrono/ChronoResults.tsx` | `buildChronoRecordInput` utilise `resolveWaveConfig` + `waveOverrides` dans `config` + affichage carte résultat |
| `src/lib/chronoXlsxExport.ts` | Audit pour s'assurer qu'on utilise `split.distanceM` stocké (sans recomputation globale) |
| `src/lib/api/types.ts` | + `ChronoRecordInput.config.waveOverrides?: Record<number, WaveConfigOverrides>` |
| `src/lib/__tests__/chrono-reducer.test.ts` | + cas overrides |
| `src/lib/__tests__/chrono-types.test.ts` | + tests `resolveWaveConfig` |

## Hors scope

- Libellé texte libre par vague.
- Type de nage structuré par vague.
- Migration DB sur `chrono_records` (on utilise le champ `jsonb` existant).
- Colonne "Config vague" dans l'export XLSX.
- Override sur chrono déjà en cours (`racing`) — le Personnaliser est fermé dès `START_RACE`.
