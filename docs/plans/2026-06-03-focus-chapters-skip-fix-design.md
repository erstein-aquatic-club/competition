# Design — Chapitres mode focus + fix skip iOS

**Date :** 2026-06-03  
**Fichier cible :** `src/components/strength/WorkoutRunner.tsx`

---

## Contexte

Le mode focus musculation (`WorkoutRunner`) affiche les exercices un par un. Il n'y a pas de transition entre les blocs (warmup → main). Le bouton "Passer cet exercice" est dans la `BottomActionBar` à `bottom-0`, ce qui le fait atterrir dans la zone du home indicator iOS et déclenche des faux positifs de geste multitâche.

---

## Feature 1 — Chapitres inline

### État ajouté

```ts
const [chapterBlock, setChapterBlock] = useState<'warmup' | 'main' | null>(null);
```

Quand `chapterBlock` est non-null, la vue affiche une carte d'intro au lieu de l'exercice courant.

### Déclenchement

1. **Au lancement** (`useEffect` sur mount) : si `items[0].block === 'warmup'` → `chapterBlock = 'warmup'` ; si `items[0].block === 'main'` → `chapterBlock = 'main'`.
2. **Dans `advanceExercise()`** : après calcul de `nextStep`, si `items[nextStep-1].block !== items[currentStep-1].block` → `setChapterBlock(items[nextStep-1].block ?? 'main')` et ne pas avancer encore. L'utilisateur tape "Commencer" → `chapterBlock = null` et `advanceExercise()` reprend.

### Carte Échauffement

```
🔥 Échauffement
[N] exercices · intensité légère
Prépare le corps avant le bloc principal

[ Commencer l'échauffement ]
[ Passer l'échauffement →  ]   ← ghost, text-sm
```

Le "Passer l'échauffement" avance `currentStep` jusqu'au premier item `main` (boucle sur `items` à partir de `currentStep`).

### Carte Bloc principal

```
💪 Bloc principal
[N] exercices

[ On y va ! ]
```

Pas de bouton "Passer" sur le bloc principal.

### Chrono

Le chrono séance tourne pendant l'affichage d'un chapitre (pas de pause).

---

## Feature 2 — Fix bouton Skip iOS

### Problème

`"Passer cet exercice"` est un `text-xs py-1` en bas du `BottomActionBar bottom-0`. Sur iPhone avec home indicator, il atterrit dans la zone de geste multitâche (~34px depuis le bas).

### Solution

Déplacer le bouton dans le contenu scrollable, **juste au-dessus du bouton "Voir les séries"**.

**Avant** (dans BottomActionBar) :
```
[ ✓ Valider série          ]
  Passer cet exercice          ← text-xs py-1, zone danger iOS
```

**Après** :
```
  [ Passer cet exercice ]      ← dans le scroll, h-10, variant ghost
  [ Voir les séries     ]
──────────────────────────────
[ ✓ Valider série          ]   ← BottomActionBar seul
```

Style : `variant="ghost" className="w-full h-10 rounded-2xl text-sm text-muted-foreground"`.

La logique conditionnelle (confirm si logs existants sur cet exercice) reste identique.

---

## Fichiers touchés

- `src/components/strength/WorkoutRunner.tsx` — seul fichier modifié

## Tests

- Vérifier à la main : session avec warmup + main → carte warmup apparaît au départ → "Commencer" → exercices warmup → carte main apparaît → "On y va" → exercices main
- Vérifier "Passer l'échauffement" → saute directement au 1er item main
- Vérifier "Passer cet exercice" ne déclenche plus le geste iOS (bouton en zone sûre)
- Vérifier session sans warmup (items[0].block === 'main') → carte main dès le départ
- `npm test` — pas de régression (WorkoutRunner n'a pas de test sur l'UI, les tests unitaires resolveNextStep/resolveSetNumber non impactés)
