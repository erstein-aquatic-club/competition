# §189-ext — Objective Detail Sheet Design

## Goal

Remplacer l'affichage inline de `PaceMatrixInline` sous chaque `ObjectiveCard` par un drawer unifié (toggle Allures | Progression) qui s'ouvre au clic sur l'objectif.

## Approche retenue : A — Nouveau `ObjectiveDetailSheet` + extraction `EventProgressionContent`

### Architecture des composants

**`EventProgressionSheet.tsx` (modifié — backwards-compatible)**
- Extraire le JSX/logique interne en `export function EventProgressionContent(props)` (sans wrapper Sheet)
- `EventProgressionSheet` devient un simple wrapper : `<Sheet><EventProgressionContent /></Sheet>`
- Aucun changement d'API externe

**`ObjectiveDetailSheet.tsx` (nouveau — `src/components/shared/`)**
- Props : `open`, `onOpenChange`, `objective: Objective`, `matchingTarget: PaceTarget | null`, `iuf: string | null`
- State : `tab: "allures" | "progression"`, reset à `"allures"` à chaque ouverture (`useEffect` sur `open`)
- Sheet bottom, `max-h-[90dvh] overflow-y-auto rounded-t-3xl`
- Header : `eventLabel(objective.event_code)` comme titre
- Toggle `ToggleGroup` [Allures | Progression] affiché **uniquement si `matchingTarget != null`**
- Tab "allures" → `<PaceMatrixInline ... />`
- Tab "progression" → `<EventProgressionContent ... />`
- Edge case (matchingTarget null) : affiche `EventProgressionContent` directement, sans toggle

**`SwimmerObjectivesView.tsx` (modifié)**
- Supprimer `PaceMatrixInline` inline sous les cartes
- Supprimer `progressionObj` state → remplacer par `detailObj: Objective | null`
- `onClick` objectif avec `event_code` → `setDetailObj(obj)` (coach et perso)
- Supprimer export `shouldRenderInlineMatrix` (après vérification aucun test ne l'importe)
- Render `<ObjectiveDetailSheet open={!!detailObj} onOpenChange={...} objective={detailObj} matchingTarget={...} iuf={iuf} />`
- `matchingTarget` calculé au moment du clic via `findMatchingTarget(paceTargets, swimmerAccountId, parsed)`

### Comportement UX

| Objectif | Clic | Résultat |
|----------|------|----------|
| Avec `event_code` (coach ou perso) | `setDetailObj(obj)` | Ouvre `ObjectiveDetailSheet` |
| Perso sans `event_code` | `openEdit(obj)` | Formulaire d'édition (inchangé) |
| Coach sans `event_code` | — | Rien (inchangé) |

- Onglet par défaut : **Allures**
- Reset à `"allures"` à chaque ouverture (pas de mémoire inter-objectifs)
- Toggle masqué si pas de cible allure (edge case — auto-sync §188-ext le couvre normalement)

### Tests

- Vérifier avant suppression que `shouldRenderInlineMatrix` n'est pas importé dans un fichier de test
- `ObjectiveDetailSheet` : 1 test renderToString — toggle présent si `matchingTarget` non-null, absent sinon
- `EventProgressionContent` : aucun nouveau test nécessaire (les tests existants de `EventProgressionSheet` couvrent la logique)

### Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src/components/shared/EventProgressionSheet.tsx` | Extraire `EventProgressionContent` |
| `src/components/shared/ObjectiveDetailSheet.tsx` | Créer |
| `src/components/profile/SwimmerObjectivesView.tsx` | Supprimer inline, brancher nouveau drawer |
| `src/components/shared/__tests__/ObjectiveDetailSheet.test.tsx` | Créer (1 test) |
