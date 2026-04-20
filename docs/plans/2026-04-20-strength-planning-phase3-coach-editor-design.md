# Strength Planning — Phase 3 : Éditeur coach (Design Doc)

**Date :** 2026-04-20
**Statut :** Prêt à implémenter (**après** Phase 2)
**Périmètre :** Page coach `/coach/strength-planning` — miroir structurel de `SwimPlanningDemo.tsx` (1046 l.)
**Exécution :** agent Sonnet — ce document est auto-suffisant
**Dépendance stricte :** Phase 2 livrée (§157) — tables + API + merge en place

---

## 1. Contexte

Phase 2 a livré le modèle de données muscu miroir du swim (`strength_planning_slots` + overrides + week meta). Les slots sont lus côté nageur (`MyPlanTab.tsx`) mais il **n'existe pas encore d'UI coach** pour les écrire : l'éditeur de plan reste le couple `StrengthCatalog.tsx` (bibliothèque de templates) + `strength_folders` (cycles par nageur).

Phase 3 livre le pendant de `SwimPlanningDemo.tsx` pour la muscu :

- Sélecteur de groupe.
- Timeline verticale de semaines avec micro-grille jour × (morning/evening).
- Tap case vide → picker de `strength_session_templates`.
- Tap case pleine → sheet détail session + actions (changer template, ajouter notes, supprimer).
- Toggle Groupe / Nageur (mode override) comme swim.
- Sélecteur nageur actif pour voir / éditer les overrides.
- Preview compétitions (réutilisation du pattern swim).
- Week meta editor (type + notes).

---

## 2. Architecture — miroir swim

Le coach swim planning est structuré en :

| Fichier | Taille | Rôle |
|---|---|---|
| `src/pages/coach/SwimPlanningDemo.tsx` | 1046 l. | Page coach (route `/coach/swim-planning`) |
| `src/pages/coach/SwimPlanningAthleteView.tsx` | 1007 l. | Preview nageur (lecture seule) |
| `src/components/coach/swim/SwimPlanningTimeline.tsx` | 780 l. | Timeline + micro-grille partagée |
| `src/components/coach/swim/swimPlanningShared.ts` | 75 l. | Helpers date (WeekInfo, getMonday, etc.) |
| `src/hooks/coach/useSwimPlanningAthleteMode.ts` | 449 l. | Hook sélection nageur + overrides + merge + mutations |
| `src/lib/swimPlanningMerge.ts` | 112 l. | Pure merge helpers |
| `src/lib/api/swim-planning.ts` | 169 l. | API wrapper |

**Phase 3 produit le pendant muscu** :

| Fichier | Rôle | Target size |
|---|---|---|
| `src/pages/coach/StrengthPlanningScreen.tsx` | Page coach (route `/coach/strength-planning`) | ~700 l. (plus simple que swim : pas de filière) |
| `src/components/coach/strength/StrengthPlanningTimeline.tsx` | Timeline + micro-grille partagée (utilisable aussi nageur side) | ~500 l. |
| `src/hooks/coach/useStrengthPlanningAthleteMode.ts` | Hook sélection + merge + mutations | ~350 l. |

Helpers déjà livrés en Phase 2 : `strengthPlanningMerge.ts`, `src/lib/api/strength-planning.ts`.
Helpers date : **réutiliser** `swimPlanningShared.ts` (ne pas dupliquer).

---

## 3. Décisions de design

| Question | Choix | Raison |
|---|---|---|
| Route | `/coach/strength-planning` | Parité swim `/coach/swim-planning` |
| Entrée | Bouton dans `CoachLibrary.tsx` ou nouvelle tile dans `Coach.tsx` | À trancher à l'implé — proposer **bouton dans la page Coach** à côté de "Planification natation" |
| Sélecteur picker | **Modal Sheet** avec liste `strength_session_templates` searchable + preview items | Aligne `StrengthCatalog` mais simplifié |
| Affichage case pleine | **Titre template** (strip day prefix) + badge `N ex.` + phase dot | Économie d'espace, cohérent nageur side |
| Case vide | `+` discret, tap → picker | Parité swim |
| Mode Nageur (override) | Toggle segmenté haut de page (Groupe / Nageur) + dropdown nageur | Identique swim |
| Badge "Perso" | Affiché quand slot vient de `strength_planning_slot_overrides` | Parité swim (outlined primary) |
| Week meta | Sheet dédié (clic icône ⚙️ sur header week) | Identique swim |
| Copie semaine | **V1** : pas implémenté. | YAGNI, ajouter si demandé |
| Drag & drop slots | **Non V1** | Complexité, l'UX tap suffit |
| Intégration compétitions | Oui — réutiliser `useCompetitionsByWeek` livré Phase 1 | Bonus parité |
| Infinite scroll | Oui (IntersectionObserver pattern swim) | Parité swim |
| Temp groups support | **Non V1** — uniquement `permanentGroups` | Cohérent swim |
| Deep link athlete | Query param `?athlete=<id>` synchronisé URL hash | Parité swim |
| Editor filières muscu équivalent | **Non** — il n'y a pas de filières muscu | N/A |

---

## 4. Composant `StrengthPlanningTimeline` (partagé)

### 4.1 Rôle
Composant présentationnel pur — reçoit `weeks`, `effectiveSlotsByWeek`, `getEffectiveWeekMeta`, handlers `onSlotTap`, `onWeekMetaTap`, `onChipLongPress` (optionnel), `readOnly` (bool).
Rend la timeline + expand micro-grid. Utilisé par **StrengthPlanningScreen** (coach) et pourrait à terme remplacer le rendu custom de `MyPlanTab.tsx` (refacto optionnel).

### 4.2 API
```ts
interface StrengthPlanningTimelineProps {
  weeks: WeekInfo[];
  effectiveSlotsByWeek: Map<string, EffectiveStrengthSlot[]>;
  getEffectiveWeekMeta: (weekKey: string) => EffectiveStrengthWeekMeta;
  sessionTemplatesById: Map<number, StrengthSessionTemplate>;
  competitionsByWeek: Map<string, Competition[]>;
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  currentWeekKey: string;
  expandedWeekKey: string | null;
  onToggleExpand: (weekKey: string) => void;
  onSlotTap: (weekKey: string, dayIndex: number, timeSlot: "morning" | "evening", slot: EffectiveStrengthSlot | null) => void;
  onWeekMetaTap: (weekKey: string) => void;
  onCompetitionTap: (c: Competition) => void;
  readOnly?: boolean;
}
```

### 4.3 Structure UI
Identique `SwimPlanningTimeline.tsx` **avec ces différences** :
- Pas de chips filières colorées — les chips affichent **nom séance** (max 16 car. truncate) + badge phase (couleur via `strengthPhaseStyles.ts`).
- Case vide en mode edit → bordure dashed + `+` icon.
- Badge overridden "Perso" identique swim.

**Pattern cellule** (miroir `ReadOnlySlotCell` + `SwimPlanningTimeline` edit cell) :
```
┌─ h-9 w-full rounded-lg ──────────────┐
│ [dot phase]  Force bas  8ex    [Link]│   → rempli
└──────────────────────────────────────┘
┌─ h-9 w-full dashed border ───────────┐
│              + ajouter               │   → vide en edit mode
└──────────────────────────────────────┘
┌─ h-9 w-full rounded-lg ──────────────┐
│              —                       │   → vide readOnly
└──────────────────────────────────────┘
```

---

## 5. Hook `useStrengthPlanningAthleteMode`

### 5.1 API
Miroir strict `useSwimPlanningAthleteMode.ts` (449 l.) avec renommage. Signature :

```ts
interface UseStrengthPlanningAthleteModeOptions {
  selectedGroupId: number | null;
  visibleWeekKeys: string[];
  groupSlotsByWeek: Map<string, StrengthPlanningSlot[]>;
  syncUrl?: boolean;
}

interface StrengthPlanningSlotWriteInput {
  weekKey: string;
  dayIndex: number;
  timeSlot: "morning" | "evening";
  session_template_id: number | null;
  notes: string | null;
  existingSlot?: EffectiveStrengthSlot;
}

interface StrengthPlanningAthleteModeApi {
  selectedAthleteId: number | null;
  setSelectedAthleteId: (id: number | null) => void;
  selectedAthlete: AthleteSummary | null;
  groupAthletes: AthleteSummary[];

  effectiveSlotsByWeek: Map<string, EffectiveStrengthSlot[]>;
  getEffectiveWeekMeta: (weekKey: string) => EffectiveStrengthWeekMeta;

  writeSlot: (input: StrengthPlanningSlotWriteInput, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
  deleteSlot: (slot: EffectiveStrengthSlot, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
  writeWeekMeta: (weekKey: string, week_type: string | null, notes: string | null, opts?: ...) => void;

  isPending: boolean;
}
```

### 5.2 Logique mutations routées

Comme le hook swim, les writes sont routés selon le mode :
- `selectedAthleteId == null` → écrit dans `strength_planning_slots` / `strength_planning_week_meta`.
- `selectedAthleteId != null` → écrit dans `strength_planning_slot_overrides` / `strength_planning_week_overrides`.

`deleteSlot` :
- Si slot overridden → supprime l'override uniquement (le slot groupe reste).
- Si slot groupe + pas d'override → supprime le slot groupe (s'applique à tout le groupe).

Invalidation queries après chaque mutation : `queryClient.invalidateQueries({ queryKey: ["strength-planning-slots"] })` etc.

---

## 6. Page `StrengthPlanningScreen.tsx`

### 6.1 Structure

```
┌─────────────────────────────────────┐
│  ← Planification musculation   [⚙️] │ Header sticky
│  Groupe : [Elite ▾]  |  [Groupe/Nageur] [Marie ▾]
├─────────────────────────────────────┤
│                                     │
│  Timeline verticale (réutilise      │
│  StrengthPlanningTimeline)          │
│                                     │
└─────────────────────────────────────┘

[Sheet picker session] ← tap case vide
[Sheet détail session] ← tap case pleine
[Sheet week meta]      ← tap ⚙ sur header semaine
[Sheet compétition]    ← tap chip trophée
```

### 6.2 États locaux
- `selectedGroupId: number | null`
- `expandedWeekKey: string | null`
- `picker: { weekKey, dayIndex, timeSlot, existing: EffectiveStrengthSlot | null } | null`
- `editingWeekMeta: string | null`
- `selectedCompetition: Competition | null`

### 6.3 Queries
- `api.getGroups()` → filtre `is_temporary === false`.
- `api.getStrengthPlanningSlots({ groupId, weekStarts })`.
- `api.getStrengthSessions()` → catalog templates (déjà utilisé dans `MyPlanTab`).
- Via hook `useStrengthPlanningAthleteMode` : athlètes + overrides + weekMeta + writes.
- `useCompetitionsByWeek(null)` (variante "tous les nageurs" à créer — ou skip si trop complexe V1).

### 6.4 Picker session template

Sheet bottom plein écran mobile :
```
┌─────────────────────────────────────┐
│  Choisir une séance           [✕]   │
│  [🔍 Rechercher...]                 │
├─────────────────────────────────────┤
│  📁 Cycle "S13 — Force"             │
│    🏋️ Lun — Force haut      8 ex.  │
│    🏋️ Mer — Force bas       6 ex.  │
│  📁 Cycle "S14 — Puissance"         │
│    🏋️ Lun — Pliométrie      5 ex.  │
└─────────────────────────────────────┘
```
- Liste plate des `strength_session_templates` **filtrée** : ne pas proposer les sessions avec `items.length === 0`.
- Regroupement optionnel par folder (cycle parent) pour la visibilité.
- Recherche fuzzy sur `title` et `name`.
- Tap item → `writeSlot({ weekKey, dayIndex, timeSlot, session_template_id })` + close.
- Bouton "Détacher" si déjà rempli.

### 6.5 Sheet détail session
Au tap case pleine :
- Nom session + badge phase + `N ex.`.
- Liste items (max 10 visibles).
- Actions :
  - **Changer de séance** → réouvre picker.
  - **Ajouter / éditer notes** → textarea inline.
  - **Détacher** → `writeSlot({ session_template_id: null, notes: null })` (garde le slot mais vide).
  - **Supprimer le slot** → `deleteSlot(slot)`.

### 6.6 Sheet week meta
Au tap ⚙️ (icône à côté du header semaine) :
- Select week_type : reprise / force / puissance / taper / compétition / custom.
- Textarea notes.
- Bouton "Enregistrer" → `writeWeekMeta(weekKey, week_type, notes)`.

### 6.7 Infinite scroll
- Pattern identique swim : `sentinelRef`, `IntersectionObserver`, `loadingMoreRef` guard (cf. swim:228-247).

### 6.8 URL hash
- `?athlete=<id>` sync via hook `useStrengthPlanningAthleteMode`.

---

## 7. Routing — `src/App.tsx`

Ajouter la route :
```tsx
<Route path="/coach/strength-planning">
  {(() => {
    const Lazy = lazyWithRetry(() => import("./pages/coach/StrengthPlanningScreen"));
    return (
      <Suspense fallback={<LoadingView />}>
        <Lazy />
      </Suspense>
    );
  })()}
</Route>
```

Protection d'accès : `requireRole('coach' | 'admin')` (vérifier le pattern utilisé pour `/coach/swim-planning`).

---

## 8. Entrée UI — page Coach

Dans `src/pages/Coach.tsx`, ajouter une tile à côté de la tile existante "Planification natation" (chercher le rendu des tiles coach — grep `swim-planning` dans `Coach.tsx`).

```tsx
<QuickActionTile
  href="/coach/strength-planning"
  icon={<Dumbbell />}
  title="Planification muscu"
  description="Programmer les séances de musculation"
/>
```

Adapter le markup aux conventions existantes de `Coach.tsx` (à observer lors de l'implé).

---

## 9. Tests

### 9.1 Tests unit
- `useStrengthPlanningAthleteMode.test.ts` : couverture merge + route writes (groupe vs athlete) + URL sync. Calquer `useSwimPlanningAthleteMode.test.ts` s'il existe (sinon écrire inspiré de son usage).
- `StrengthPlanningTimeline.test.tsx` : snapshot rendu + tap callbacks.

### 9.2 Tests RLS
**Pas nécessaires en Phase 3** — aucune nouvelle policy RLS, consommation existante (§121 CLAUDE.md : "ne PAS lancer si wrapper API sans nouvelle RLS logic").

### 9.3 Vérification manuelle
- Naviguer `/coach/strength-planning` en tant que coach.
- Sélectionner un groupe, déplier une semaine, tap case vide → picker → choisir session → case remplie.
- Toggle Nageur → sélectionner Marie → éditer un slot → badge "Perso" apparaît.
- Recharger → données persistées.
- Vérifier côté nageur (`/suivi/planification`) que le slot créé apparaît.

---

## 10. Plan d'implémentation (étapes ordonnées)

### Étape 1 — Composant timeline partagé (~4 h)
- [ ] Créer `src/components/coach/strength/StrengthPlanningTimeline.tsx` en copiant `SwimPlanningTimeline.tsx` (780 l.) et en l'adaptant :
  - Remplacer chips filière par chips session (nom + badge phase + N ex.).
  - Supprimer les prop/logic liées à `FILIERES` et `FILIERE_STYLES`.
  - Utiliser `PHASE_STYLES` depuis `src/lib/strength/strengthPhaseStyles.ts`.
  - Adapter `DAY_ROWS` = 7 jours (déjà en place swim à 6 ? vérifier — swim: 6 (Lun-Sam), muscu: 7).
- [ ] Typage strict sur props.
- [ ] `npx tsc --noEmit` passe.

### Étape 2 — Hook athlete mode (~3 h)
- [ ] Créer `src/hooks/coach/useStrengthPlanningAthleteMode.ts` en copiant swim hook.
- [ ] Adapter les queries/mutations aux endpoints strength (`api.getStrengthPlanningSlots`, `api.upsertStrengthPlanningSlot`, etc.).
- [ ] `mergeStrengthSlots` / `mergeStrengthWeekMeta` depuis Phase 2.
- [ ] `npx tsc --noEmit` passe.

### Étape 3 — Page coach (~6 h)
- [ ] Créer `src/pages/coach/StrengthPlanningScreen.tsx` en copiant `SwimPlanningDemo.tsx` et en adaptant :
  - Retirer sections filière editor.
  - Retirer sheet filière (muscu n'a pas ce concept).
  - Ajouter picker session (Sheet avec liste templates searchable).
  - Ajouter sheet détail session (actions : changer / détacher / notes / supprimer).
  - Sheet week meta (identique swim).
- [ ] Infinite scroll sentinel.

### Étape 4 — Routing + entrée UI (~1 h)
- [ ] Ajouter route `/coach/strength-planning` dans `src/App.tsx`.
- [ ] Ajouter tile dans `src/pages/Coach.tsx`.

### Étape 5 — Tests (~2 h)
- [ ] Tests unit hook + composant timeline.
- [ ] `npm test` vert.

### Étape 6 — Vérification manuelle (~1 h)
- [ ] Parcours coach complet : créer 3 slots, vérifier affichage nageur.
- [ ] Override nageur : éditer un slot, vérifier badge "Perso" et persistance.
- [ ] Week meta : éditer, vérifier affichage nageur side.

### Étape 7 — Docs (~30 min)
- [ ] `docs/implementation-log.md` §158.
- [ ] `docs/claude/files-map.md` : ajouter `StrengthPlanningScreen`, `StrengthPlanningTimeline`, `useStrengthPlanningAthleteMode`.
- [ ] `docs/ROADMAP.md` : §158 + date.
- [ ] `CLAUDE.md` :
  - "Dernière entrée en date : §158".
  - Ajouter `StrengthPlanningScreen.tsx` à la table "Hubs & orchestrateurs critiques" (nouvelle page principale).
- [ ] `docs/FEATURES_STATUS.md` : feature "Coach planification muscu" à ✅.

---

## 11. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Copier-coller swim → muscu introduit des bugs subtils | Regression swim impossible (composants différents), bugs muscu à corriger post-livraison | Tests unit sur hook + lecture attentive lors du diff swim vs muscu |
| Divergence UX vs swim source de vérité | Incohérence cognitive coach | Conserver max de visuel identique. Différences explicites = liste pt 3 |
| Picker session lourd à scroller | Frustration coach | V1 : liste plate + search. V2 : hiérarchie folders si feedback coach |
| `is_temporary` group mal filtré | Groupes stages polluent le picker | Filtre strict à l'initialisation (pattern swim déjà) |
| Performance N slots + M athletes | Requêtes lentes | Limiter weekKeys à 12 initial, indexes en place |
| URL hash `?athlete` conflit avec d'autres pages | Side effects | `syncUrl` opt-in, désactivé si embedded |

---

## 12. Hors scope

- ❌ Drag & drop.
- ❌ Copy / paste semaine entière.
- ❌ Historique modifications (audit log dédié).
- ❌ Import depuis template de saison.
- ❌ Builder session inline (coach réutilise les templates existants, ne peut pas créer une session ad-hoc ici).
- ❌ Filières muscu (pas de concept).
- ❌ Support groupes temporaires (stages).

---

## 13. Critères d'acceptation

1. Page `/coach/strength-planning` accessible depuis Coach home.
2. Timeline verticale affichée avec micro-grid 7 jours × 2 time_slots.
3. Picker session fonctionnel (tap vide → choisir → cellule remplie).
4. Mode Nageur actif → writes routés vers overrides, badge "Perso" visible.
5. Week meta éditable (sheet dédié).
6. Nageur voit immédiatement (ou au prochain refetch) les slots créés par le coach.
7. `npx tsc --noEmit` + `npm test` verts.
8. Pas de régression sur `/coach/swim-planning` (même pattern pas impacté).
9. Docs §158 à jour.

---

## 14. Enchaînement recommandé

1. **Livrer Phase 2 complètement** (migration, API, tests RLS, MyPlanTab refactoré) et valider en prod.
2. **Observer 1 à 2 semaines** : les backfills sont-ils corrects ? Des erreurs RLS remontent-elles en prod ?
3. **Si OK → attaquer Phase 3** via ce design doc.

Cette précaution limite le blast radius d'un bug de data model — Phase 3 ne fait qu'écrire dans les tables créées en Phase 2.

---

*Fin du design doc Phase 3. Les 3 phases couvrent le chantier complet "Planification muscu alignée sur natation".*
