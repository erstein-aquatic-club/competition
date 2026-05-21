# Design — Flag `is_bodyweight` + estimation 1RM inline (ramp-up)

**Date** : 2026-05-21
**Auteur** : François
**Statut** : Design validé, prêt pour writing-plans

## Contexte

Aujourd'hui, le `OneRmGate` (`src/components/strength/OneRmGate.tsx`) se déclenche au lancement de toute séance dès qu'au moins un exo a `percent_1rm > 0` sans 1RM enregistré. L'utilisateur doit alors soit saisir ses 1RM, soit cliquer "Poids libre" (qui set `skipPercent1rm=true` et fait disparaître la cible).

Deux problèmes :

1. **Exos au poids de corps (pompes, tractions, dips, gainage…)** : ils n'ont aucun besoin de 1RM, mais sont actuellement traités comme n'importe quel exo chargé. Aucun flag catalogue ne les distingue.
2. **Saisie 1RM à l'aveugle** : l'utilisateur qui ne connaît pas son 1RM doit le deviner. Le bouton "Poids libre" l'évite mais lui fait perdre la prescription en %.

## Objectifs

- Marquer explicitement les exos PDC pour qu'ils n'entrent jamais dans le gate.
- Permettre à l'utilisateur d'**estimer son 1RM pendant la séance** via un ramp-up (séries de chauffe progressives → série de référence → calcul Epley + RIR), à la place de la série 1.
- Étendre ce flow à un **recalcul manuel** : sur série 1 de tout exo chargé, un bouton "Recalculer ma 1RM" ouvre le même ramp-up.

## Non-objectifs

- Pas de persistance des séries de chauffe en BD (le coach ne verra pas le ramp-up). Si besoin plus tard → table `strength_warmup_sets`.
- Pas de protocole guidé avec paliers fixes (50/70/85%). L'utilisateur reste libre du nombre et de la charge de ses chauffes.
- Pas de mode "test 1RM séparé" avant séance.

## Décisions de design

| Question | Choix retenu |
|---|---|
| Comment identifier les exos PDC ? | Flag `is_bodyweight BOOLEAN` sur la table `exercises` |
| Quand déclencher le ramp-up ? | Inline pendant la séance, via choix "Estimer pendant la séance" dans OneRmGate |
| Quel protocole de ramp-up ? | Libre — l'utilisateur ajoute autant de chauffes qu'il veut, marque sa série de référence |
| Après calcul du 1RM ? | Les chauffes remplacent la série 1, on enchaine sur série 2 au poids cible recalculé |
| UI exo PDC pendant séance | Masquer entièrement le champ "Charge", n'afficher que Reps |
| "Poids libre" du gate actuel | Supprimé, remplacé par "Estimer pendant la séance" |
| Bouton "Recalculer ma 1RM" | Affiché sur série 1 de tout exo non-PDC (même avec 1RM existant) |

## Architecture

### 1. Data layer

**Migration** (à appliquer via MCP Supabase) :
```sql
ALTER TABLE exercises 
ADD COLUMN is_bodyweight BOOLEAN NOT NULL DEFAULT FALSE;
```

**Type TS** (`src/lib/api/types.ts`, interface `Exercise`) :
```ts
is_bodyweight?: boolean;
```

**Backfill** : script SQL séparé après merge pour cocher rétroactivement les classiques (pompes, tractions, dips, gainage, squats sautés sans charge, etc.).

**UI catalogue coach** : checkbox **"Exercice au poids de corps (PDC)"** sur le formulaire d'édition d'exercice. Quand cochée, désactive les champs `pct_1rm_*` (grisés, valeur 0 forcée à la sauvegarde).

**Pas de nouvelle table.** Les chauffes ramp-up sont éphémères en mémoire React. Seule la série de référence est loggée (set_index=1 standard). Le 1RM final est persisté via `update1RM` (API existante).

### 2. OneRmGate (avant séance)

**Filtrage `missing1RmExercises`** dans `src/pages/Strength.tsx` : exclure les exos `is_bodyweight=true` (defense in depth — même si `pct_1rm` > 0 par erreur).

**Refonte du gate** :
- Bouton 1 (primaire) : **"Sauvegarder et continuer"** — inchangé, persiste les valeurs saisies via `update1RM`.
- Bouton 2 (secondaire) : **"Estimer pendant la séance"** — remplace l'actuel "Poids libre". Lance la séance et popule un Set `inlineEstimationExercises` avec les `exercise_id` non saisis.

L'utilisateur peut **mixer** : saisir 2 exos sur 3, cliquer "Estimer pendant la séance" → seul le 3ème entre en mode ramp-up.

**Refacto state Strength.tsx** :
- `skipPercent1rm: boolean` → **supprimé**
- `inlineEstimationExercises: Set<number>` → **nouveau**, lifted state (sources d'ajout : gate + bouton recalc runtime)

### 3. WorkoutRunner (pendant la séance)

#### Nouvelles props
```ts
inlineEstimationExercises?: Set<number>;
onRequestRecalc?: (exerciseId: number) => void;
onUpdateOneRm?: (exerciseId: number, oneRm: number) => Promise<void>;
```

#### A. Exo `is_bodyweight=true`

- Tile "Charge" **masquée** ; layout reps-only.
- `handleValidateSet` force `weight = BODYWEIGHT_SENTINEL` (-1) dans le log.
- PR detection désactivée (déjà gardée par `isBodyweight(logWeight)` ligne 597).
- Pas de bouton "Recalculer ma 1RM" (sans sens pour PDC).

#### B. Exo en mode estimation (série 1)

Détection :
```ts
const isEstimationMode = 
  !isBodyweightExercise &&
  currentSetIndex === 1 &&
  inlineEstimationExercises?.has(currentBlock.exercise_id);
```

UI spéciale sur la carte de série :
- Bandeau "🎯 Estimation 1RM en cours" + helper "Charge légère, monte progressivement. Ta dernière série servira de référence."
- Tiles Charge + Reps + Difficulté (1-5, **obligatoire** pour Epley+RIR)
- Liste des chauffes loggées en mémoire : "12kg×10 · 25kg×6 · 35kg×4"
- **2 boutons** :
  - `[+ Chauffe suivante]` : push `(weight, reps, difficulty)` dans `warmupHistory`, reset `currentSetInputs[0]`. Aucun log DB.
  - `[✓ C'est ma série de référence → calculer]` : valide les inputs, calcule `estimateOneRM(w, r, d)` via la fonction existante de `prDetection.ts`, persiste via `onUpdateOneRm`, toast "🎯 1RM estimé : Xkg", log la série comme set_index=1 standard, retire l'exo de `inlineEstimationExercises`.

State local au runner :
```ts
const [warmupHistory, setWarmupHistory] = useState<
  Array<{ weight: number; reps: number; difficulty: number | null }>
>([]);
```

Après calcul : `targetWeight` se recalcule au render suivant (via `oneRMs.find(...)?.weight` → fraichement mis à jour par React Query après invalidation) → série 2 affiche la charge cible correcte.

#### C. Bouton "Recalculer ma 1RM"

Affiché si :
```ts
!isBodyweightExercise &&
currentSetIndex === 1 &&
!currentLoggedSet &&
!isEstimationMode
```

Placement : sous la carte de série, au-dessus du `BottomActionBar`. `variant="ghost"`, `size="sm"`, icône `RefreshCw`. Discret.

Comportement : appelle `onRequestRecalc(currentBlock.exercise_id)` → ajoute l'exo au Set parent → le rendu suivant bascule en mode estimation. Toast léger "Mode estimation activé".

### 4. State management côté Strength.tsx

```ts
const [inlineEstimationExercises, setInlineEstimationExercises] = 
  useState<Set<number>>(new Set());

const handleRequestRecalc = useCallback((exerciseId: number) => {
  setInlineEstimationExercises((prev) => {
    const next = new Set(prev);
    next.add(exerciseId);
    return next;
  });
}, []);

const handleInlineOneRmUpdate = useCallback(async (
  exerciseId: number, 
  oneRm: number
) => {
  await update1RM({
    athlete_id: userId,
    exercise_id: exerciseId,
    one_rm: oneRm,
  });
  await queryClient.invalidateQueries({ queryKey: ['oneRMs', userId] });
  setInlineEstimationExercises((prev) => {
    const next = new Set(prev);
    next.delete(exerciseId);
    return next;
  });
}, [userId, queryClient]);
```

### 5. Persistance du mode estimation (focus state recovery)

Le `inlineEstimationExercises` doit être ajouté au snapshot localStorage `strength-focus-state-<athleteKey>` pour survivre à un kill iOS PWA pendant le ramp-up. Stocké comme `Array<number>` (Set non sérialisable), reconverti en Set à la restauration.

**Trade-off** : `warmupHistory` (séries de chauffe en cours) n'est PAS persisté. Acceptable car les chauffes ne sont pas du "vrai travail" loggé — au retour, l'utilisateur recommence sa chauffe.

## Edge cases

| Cas | Comportement |
|---|---|
| Tous les exos sont `is_bodyweight=true` | `missing1RmExercises` vide → gate ne s'ouvre pas → flow normal |
| Utilisateur quitte pendant ramp-up | Au retour : exo toujours en mode estimation (persisté), chauffes perdues, recommence |
| 1RM estimé < 1RM existant | `update1RM` écrit la nouvelle valeur (volonté explicite de l'utilisateur via recalc) |
| Coach a laissé `pct_1rm=80` sur un exo PDC par erreur | Filtre `is_bodyweight` au niveau missing1RmExercises ignore le %, runner masque Charge → cohérent |
| PR detection sur série de référence | `currentBest1rm=0` au moment du detect → `detectPR` retourne null (cf. ligne 597) → pas de toast PR. La 1RM est l'initiale, pas un PR. |

## Testing

### Unit
- `prDetection.ts` (`estimateOneRM`) — déjà testé, pas de changement
- Nouveau : test du filtre `missing1RmExercises` exclut bien les exos `is_bodyweight=true`
- Nouveau : test du state `inlineEstimationExercises` (ajout via gate + recalc, retrait via validation)

### Integration / E2E
- Lancer une séance avec 3 exos dont 1 PDC et 2 sans 1RM → gate ne montre que les 2 chargés
- Cliquer "Estimer pendant la séance" sur 1 des 2 → séance lance, série 1 du 1er en mode ramp-up
- Faire 2 chauffes + 1 série de référence → 1RM persisté, série 2 affiche le bon target weight
- Sur série 1 d'un exo avec 1RM existant, cliquer "Recalculer ma 1RM" → mode ramp-up actif
- Exo PDC : vérifier que le tile "Charge" est invisible, log enregistre BODYWEIGHT_SENTINEL

### RLS
Aucun changement RLS (la migration n'ajoute qu'une colonne, pas de policy). `npm run test:rls` non requis.

## Fichiers impactés (estimation)

| Fichier | Changement |
|---|---|
| `supabase/migrations/00XXX_exercises_is_bodyweight.sql` | Nouveau — migration |
| `src/lib/api/types.ts` | Ajout `is_bodyweight?: boolean` sur `Exercise` |
| `src/components/strength/OneRmGate.tsx` | Refonte : 2 boutons, suppression "Poids libre" |
| `src/components/strength/WorkoutRunner.tsx` | Mode estimation, UI bodyweight, bouton recalc, warmupHistory |
| `src/pages/Strength.tsx` | `inlineEstimationExercises` Set, callbacks, refacto missing1RmExercises filter, persistance focus state |
| `src/hooks/useStrengthState.ts` | Si focus state persistance lifted ici, ajouter sérialisation Set |
| Catalogue coach (StrengthExerciseCard ou form admin) | Checkbox PDC |
| Tests existants | Mise à jour mocks pour inclure `is_bodyweight` |

## Suite

Invoquer `writing-plans` pour produire le plan d'implémentation étape par étape.
