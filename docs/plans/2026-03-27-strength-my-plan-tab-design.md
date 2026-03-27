# Design — Onglet "Mon plan" nageur (Phase 2)

**Date :** 2026-03-27
**Chantier :** §90 phase 2 — Vue nageur des séances planifiées par le coach

## Contexte

Le coach peut maintenant organiser des séances de muscu par nageur dans des dossiers hiérarchiques (nageur → cycles → séances). Le nageur doit pouvoir voir et lancer ses séances depuis un onglet dédié.

## Design

### Nouvel onglet "Mon plan"

- 3 onglets dans la page Strength : **S'entraîner | Mon plan | Historique**
- `grid-cols-2` → `grid-cols-3`

### Composant MyPlanTab

Nouveau fichier `src/components/strength/MyPlanTab.tsx`.

**Props :**
```typescript
interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}
```

**Comportement :**
- Fetch `api.getStrengthFolders("session", { athleteId })` → arborescence du nageur
- Fetch `api.getStrengthSessions()` → catalogue, filtré par folder_id des dossiers du nageur
- Affiche les cycles en accordéons pliables (réutilise le pattern FolderSection, mais en lecture seule — pas de rename/delete)
- Chaque séance : nom + badge nombre d'exercices
- Tap sur une séance → `onSelectSession(session)` → Strength.tsx passe en mode preview (SessionDetailPreview existant) → Lancer le workout
- Si aucun dossier : message "Aucun plan. Ton coach peut créer un plan personnalisé depuis le catalogue."

### Intégration dans Strength.tsx

- Import MyPlanTab
- Passer de `grid-cols-2` à `grid-cols-3` (TabsList)
- Ajouter `<TabsTrigger value="planning">Mon plan</TabsTrigger>`
- Ajouter `<TabsContent value="planning"><MyPlanTab athleteId={userId} onSelectSession={handleSelectFromPlan} /></TabsContent>`
- `handleSelectFromPlan` réutilise le même flow que `onStartAssignment` (set activeSession + screenMode="reader")

### Lecture seule

Pas de modification côté nageur. Le coach gère les charges via le catalogue.
