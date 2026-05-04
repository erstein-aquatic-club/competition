# Ajout objectif inline sur la vue info compétition — Design

**Date** : 2026-05-04
**Statut** : Validé, en cours d'implémentation
**Chantier** : §192 (suite §191 vue info compétition)

## Problème

Sur la nouvelle vue info compétition (§191, `/competition/:id`), la section "Mes objectifs" affiche un empty state "Aucun objectif défini" avec une CTA "En définir un" qui navigue vers `/profile?section=objectives`. L'utilisateur quitte la page info, doit revenir manuellement, et le formulaire profil ne lie pas l'objectif à la compétition courante.

L'utilisateur veut pouvoir, sans quitter la page :
- créer un nouvel objectif déjà lié à cette compétition,
- OU lier un objectif existant (qu'il a déjà créé sans compétition associée) à cette compétition.

## Décisions

### UX
Sheet bottom (cohérent avec `SwimmerObjectivesView` et le reste de l'app) avec deux onglets :
- **Créer un nouveau** (défaut) — formulaire identique à celui du profil avec `competition_id` pré-rempli.
- **Lier un existant** — liste les objectifs du nageur dont `competition_id` est null. Tap → set `competition_id`.

### Visibilité
- Le bouton ouvre le Sheet remplace la CTA "En définir un" dans l'empty state.
- Quand la table contient déjà des objectifs : ajouter un bouton "+ Objectif" dans le header de la section.

### Onglet "Lier"
- Filtre : `objective.competition_id == null` (objectifs libres, créés depuis le profil sans lien comp).
- Si la liste candidate est vide → onglet caché ou disabled, défaut sur "Créer".

### Mutations
- Créer : `api.createObjective({ ...input, competition_id })`.
- Lier : `api.updateObjective(id, { competition_id })`. (Le helper `updateObjective` accepte déjà `Partial<ObjectiveInput>`, aucune modif API nécessaire.)

### Cache
- À la sauvegarde, invalider `["athlete-objectives"]` — la query partagée avec `InfoMyObjectives`, `SwimmerObjectivesView`, etc., se rafraîchit automatiquement.

## Fichiers

### Nouveaux

| Fichier | Rôle |
|---|---|
| `src/components/competition/AddObjectiveSheet.tsx` | Sheet bottom avec onglets Créer/Lier, mutations, états de form. ~200 LOC. |
| `src/components/competition/__tests__/info-helpers.test.ts` (append) | Tests TDD pour `selectLinkableObjectives`. |

### Modifiés

| Fichier | Changement |
|---|---|
| `src/components/competition/info-helpers.ts` | Ajout helper pur `selectLinkableObjectives(objectives)`. ~10 LOC. |
| `src/components/competition/InfoMyObjectives.tsx` | Remplace `navigate("/profile?section=objectives")` par `setSheetOpen(true)`. Ajoute bouton "+ Objectif" en header de section quand `rows.length > 0`. |

### Inchangés
- `src/components/profile/SwimmerObjectivesView.tsx` : la création depuis le profil reste agnostique de compétition.
- `src/lib/api/objectives.ts` : pas de nouvelle fonction nécessaire.

## Architecture du Sheet

```tsx
<Sheet open onOpenChange>
  <SheetContent side="bottom" max-h-85dvh>
    <SheetHeader>
      <SheetTitle>Ajouter un objectif</SheetTitle>
      <SheetDescription>Compétition : {competitionName}</SheetDescription>
    </SheetHeader>

    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="create">Créer un nouveau</TabsTrigger>
        <TabsTrigger value="link" disabled={linkable.length === 0}>
          Lier un existant ({linkable.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="create">
        {/* Form identique à SwimmerObjectivesView : Type / Épreuve / Bassin / Cible / Texte */}
        <Button onClick={handleCreate}>Créer</Button>
      </TabsContent>

      <TabsContent value="link">
        {/* Liste radio des objectifs sans comp */}
        <RadioGroup>
          {linkable.map(o => (
            <Label key={o.id}>
              <RadioGroupItem value={o.id} />
              <ObjectiveRow obj={o} />
            </Label>
          ))}
        </RadioGroup>
        <Button onClick={handleLink} disabled={!selected}>Lier</Button>
      </TabsContent>
    </Tabs>
  </SheetContent>
</Sheet>
```

## Tests

### Helpers purs (TDD)

`selectLinkableObjectives(objectives: Objective[]): Objective[]` :
- Retourne ceux avec `competition_id == null`.
- Cas `competition_id == undefined` traité comme null.
- Cas tableau vide → tableau vide.
- Préserve l'ordre.

### Composants
- Smoke test : Sheet ouvre, onglet Créer affiche le form, onglet Lier affiche la liste filtrée.
- Pas de tests d'intégration React Query (overkill pour un Sheet).

## Non-goals

- Pas de réattribution multi-comp (déplacer un objectif d'une comp A à une comp B). Cas rare.
- Pas de création depuis le coach (cette section est nageur-only).
- Pas de bulk linking (1 objectif à la fois).
- Pas de modification de l'objectif depuis le Sheet (juste create OU link). L'édition reste dans le profil.

## Risques

| Risque | Mitigation |
|---|---|
| Form dupliqué entre `SwimmerObjectivesView` et `AddObjectiveSheet` | Acceptable pour la première itération — DRY plus tard si on en ajoute un 3e. |
| Confusion UX : l'utilisateur peut créer un objectif un peu différent ailleurs | Le titre du Sheet précise "Compétition : X", pas d'ambiguïté. |
| Cache stale après update | `invalidateQueries(["athlete-objectives"])` couvre toutes les vues. |
