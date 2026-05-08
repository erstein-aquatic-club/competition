# Audit UI/UX EAC — Pass 2 (post-§213)

*Date* : 2026-05-08
*Méthode* : 3 forks parallèles (sonnet) sur surfaces nageur, coach, composants partagés + 3 NEW (Surface, EmptyState, systemBanners). Greps systématiques pour les 3 drapeaux racines. Comparaison file:line vs `2026-05-08-ui-ux-audit-ios.md` (passe 1).
*Scope* : audit lecture seule, post-livraison de §197 → §213 (17 chantiers, 12 commits).

---

## Verdict global

**~7.8/10** (vs **6/10** passe 1, **+1.8**).

L'app a basculé d'une perception "agence 2018 / club sportif rétro" à un standard cohérent iOS-aligned, sans toucher la logique métier. Les **trois drapeaux rouges racines** ont pris des trajectoires différentes :

| Drapeau racine | Passe 1 | Pass 2 | Verdict |
|---|---|---|---|
| #1 typo `h1-h6 = font-display uppercase italic` global | règle `@apply` qui faisait crier toute l'app | règle convertie en opt-in (`index.css:271-279`), 5-6 occurrences ciblées résiduelles | **NEUTRALISÉ** au niveau racine, dette ponctuelle restante |
| #2 tap targets sub-44 endémiques | ~25 spots, primitives ui à h-9 | primitives `Button/Input/Tabs` conformes (`min-h-11`), `SelectTrigger` reste h-9 (P0), cluster `AthletePlansTab.tsx:807,815,913,922,935,943` h-7 critique | **PARTIEL** — primitives OK, dette UI résiduelle ciblée |
| #3 hardcodes color (94 fichiers) | InlineBanner = 25 hits, top 5 = 148 hits | InlineBanner = **0 hits**, top 5 désormais 102 hits (-31%), 93 fichiers concernés (vs 94) | **RÉDUIT en surface, stocks coach intacts** |

Les fondations modernes ajoutées (Surface §199, EmptyState §203, systemBanners §210) sont bien designées et adoptées sur leurs cibles principales — mais leur adoption complète (BottomActionBar, UpdateNotification → Surface ; tous les empty states ad hoc → EmptyState) n'est pas encore généralisée.

---

## Tableau scores par surface (passe 1 → pass 2)

### Nageur (moyenne 6.0 → 7.94)

| Surface | Initial | Pass 2 | Δ | Commentaire |
|---|---|---|---|---|
| **SwimmerHome** | 7.0 | 9.0 | +2.0 | Avatar h-11, motion guardé, gradient violet supprimé → InlineBanner |
| **Dashboard** | 5.5 | 7.5 | +2.0 | "ACCUEIL" sentence-case, header buttons min-h-11, stepper h-7 résiduel |
| **Strength** | 5.5 | 7.5 | +2.0 | "Muscu" titre normalisé, gradients supprimés |
| **WorkoutRunner** | 5.5 | 7.0 | +1.5 | Cards focus assainies, `Replace/Exit` h-11, `border-2` input sheet résiduel |
| **Profile** | 6.0 | 7.5 | +1.5 | h1 normalisé, push toggle Switch, theme segmented (§212) |
| **SwimSessionView** | 5.0 | 7.5 | +2.5 | `window.confirm` → AlertDialog, sticky CTA safe-area, "DÉTAILS" corrigé |
| **CompetitionDetail** | 7.0 | 8.0 | +1.0 | EmptyState branché, sticky CTA safe-area conforme |
| **SwimmerMessagesView** | 7.5 | 8.5 | +1.0 | Dismiss h-7 → h-9 |
| **WellnessForm** | 6.5 | 8.5 | +2.0 | Pills h-11, motion guardé (§211), stepper h-11 |

### Coach (moyenne 6.0 → 7.15)

| Surface | Initial | Pass 2 | Δ | Commentaire |
|---|---|---|---|---|
| **Coach hub** | 7.5 | 8.0 | +0.5 | `formatRelativeTime` éliminé, EmptyState branché, 34 → 15 hardcodes |
| **CoachMessagesScreen** | 6.5 | 7.5 | +1.0 | h2 sentence-case, SelectGroup §206 fixé |
| **CoachCommentsScreen** | 6.5 | 7.5 | +1.0 | Back `size="icon"` h-11, `formatRelativeDate` partagé |
| **SlotSessionSheet** | n/a | 6.5 | — | Items `min-h-11`, CTA rounded-full ; `h-8` preview header résiduel |
| **SwimCatalog** | 5.25 | 6.5 | +1.25 | Search clear (§213), header "Coach/Création" inline persistant |
| **StrengthCatalog** | 5.25 | 7.0 | +1.75 | Search clear (§213), EmptyState branché |
| **AthletePlansTab** | n/a | 5.5 | — | Search clear, action bar h-11 ; cluster h-7/w-7 actions critiques (P0) |
| **ChronoSetup** | n/a | 8.0 | — | +/- pickers h-11, sticky CTA safe-area |
| **SwimmerObjectivesTab** | n/a | 6.5 | — | Pool toggle Select Radix, ToggleGroup h-9 résiduel |
| **CoachPaceCalculatorScreen** | 6.0 | 8.5 | +2.5 | 4 boutons header h-11, Switch scale-1 |

### Partagés (moyenne 5.7 → 7.6)

| Composant | Initial | Pass 2 | Δ | Commentaire |
|---|---|---|---|---|
| **AppLayout** | 6.0 | 8.0 | +2.0 | OfflineBanner statique retiré, queue intégrée |
| **PageHeader** | 4.5 | 8.5 | +4.0 | Titre `text-lg font-semibold tracking-tight` (plus uppercase italic) |
| **InlineBanner** | 5.0 | 9.0 | +4.0 | 5 variants sémantiques + 6 alias back-compat, **0 hardcode** |
| **BottomActionBar** | 7.0 | 8.5 | +1.5 | saved/error sur tokens |
| **ScaleSelector5** | 3.5 | 9.0 | +5.5 | Tokens intensity 1→5 (§198 QW5) |
| **SafeArea** | 5.0 | 4.0 | -1.0 | Zombie : 1 call-site, Tailwind 4 `pb-safe` non adopté |
| **CoachBreadcrumb** | 7.0 | 7.5 | +0.5 | Pas de hardcode, rendering correct |
| **PageSkeleton** | 5.0 | 5.0 | 0 | Non touché, pas varianté |
| **SessionRow** | 5.5 | 8.5 | +3.0 | `min-h-11` items-center |
| **ObjectiveCard** | 6.0 | 7.0 | +1.0 | Surface adoptée, `STROKE_BORDER_TOP` map hardcodée résiduelle |
| **ObjectiveDetailSheet** | 6.0 | 7.5 | +1.5 | ToggleGroupItem h-11 |
| **InfoBubble** | 5.0 | 8.0 | +3.0 | `min-h-11 min-w-11` |
| **UpdateNotification** | 6.5 | 9.0 | +2.5 | systemBanners (§210), spring animation |
| **PushPermissionBanner** | 5.0 | 9.0 | +4.0 | Surface glass, queue, tap targets ≥44 |
| **OfflineDetector** | 6.0 | 8.5 | +2.5 | systemBanners prio 1 |
| **InstallPrompt** | 5.5 | 8.5 | +3.0 | systemBanners prio 4 |
| **AchievementToast** | 7.0 | 8.0 | +1.0 | Tokens seulement |
| **ui/button** | 6.5 | 9.0 | +2.5 | `min-h-11` default, mobile, icon h-11 |
| **ui/input** | 6.5 | 9.0 | +2.5 | `h-11 md:h-10` |
| **ui/tabs** | 5.0 | 8.5 | +3.5 | TabsList `min-h-11`, TabsTrigger `min-h-[44px]` |
| **ui/sheet** | 7.0 | 9.0 | +2.0 | `rounded-t-[22px]`, safe-area, drag handle |
| **ui/select** | 5.0 | 5.5 | +0.5 | `SelectTrigger h-9` — **P0 non corrigé** |
| **ui/dialog** | 7.0 | 7.5 | +0.5 | DialogClose tap target ~16px |
| **ui/badge** | 7.0 | 7.0 | 0 | Acceptable |
| **ui/toast** | 7.5 | 7.0 | -0.5 | Régression mineure : `dotColors` hardcodés |
| **OfflineBanner** | 2.0 | 2.0 | 0 | Dead code (non importé), candidat suppression |

### NEW composants (§199, §203, §210)

| Composant | Score /10 | Adoption | Commentaire |
|---|---|---|---|
| **Surface** (§199) | 8.5 | 3 call-sites (LoginInstallBanner, PushPermissionBanner, ObjectiveCard) | API propre (4 variants × 3 radius). BottomActionBar / UpdateNotification non migrés → architecture non consolidée |
| **EmptyState** (§203) | 9.0 | 4 call-sites (AthletePlansTab, Coach, CompetitionDetail, StrengthCatalog) — **les 4 cibles initiales migrées** | API compact/full cohérente, `role="status"` |
| **systemBanners** (§210) | 9.5 | 4 consumers (Offline, Update, Push, Install) — **couverture totale** | `useSyncExternalStore` idiomatique React 18, test helpers exposés |

---

## Validation des 3 drapeaux racines

### Drapeau #1 — typo uppercase italic crié

**Source globale neutralisée.** `index.css:271-279` est désormais documenté comme opt-in :

```css
/* Brand-moment opt-in: Oswald uppercase italic. */
.heading-display { @apply font-display tracking-tight uppercase italic; }
.btn-eac-display { @apply tracking-wide font-bold uppercase; }
```

**Régressions / brand-moments résiduels** (grep `font-display.*uppercase|uppercase italic` → 11 hits) :

| Fichier:ligne | Statut | Justification |
|---|---|---|
| `src/components/strength/SessionSummary.tsx:58` "Séance terminée" | ⚠️ borderline | Écran célébration fin de séance — argumentable brand-moment, mais hors whitelist explicite |
| `src/components/strength/WorkoutRunner.tsx:751` "Séance Terminée !" | ⚠️ borderline | Idem (CardTitle text-3xl) |
| `src/pages/AwaitingApproval.tsx:22` h1 onboarding | ❌ **régression P1** | Page utilitaire, pas brand-moment |
| `src/pages/ComingSoon.tsx:21` placeholder | ❌ **régression P1** | Triple anti-pattern (uppercase + italic + primary) |
| `src/pages/Coach.tsx:1151` CardTitle fallback "Accès Coach" | ❌ **régression P0** | Fallback accès refusé, hors brand-moment |
| `src/components/coach/SlotSessionSheet.tsx:376` h3 preview Oswald inline style | ❌ **régression P1** | Sheet interne, devrait être sentence-case |
| `src/pages/SharedSwimSession.tsx:69,89` h1 partage | ✅ justifié | Page externe partageable, brand exposure |
| `src/pages/RecordsClub.tsx:415` h2 leaderboard | ✅ justifié | Hall of Fame, brand-moment whitelisté |
| `src/components/swim/SwimSessionTimeline.tsx:306` | ✅ justifié | `font-display` sans italic, eyebrow label |
| `src/pages/coach/CoachTrainingSlotsScreen.tsx:140,160,1407` | ✅ justifié | Eyebrow tags `font-display` sans italic |

**Verdict** : 5 régressions ponctuelles (1 P0, 4 P1). Vs passe 1 où **chaque h1/h2 et chaque `<Button>` de l'app** héritait de la règle. Réduction structurelle massive.

---

### Drapeau #2 — tap targets sub-44px

**Primitives UI** (defaults conformes WCAG 2.5.5 AAA / Apple HIG 44pt) :

| Primitive | Default | Statut |
|---|---|---|
| `Button` default | `min-h-11 md:min-h-10` | ✅ |
| `Button` icon | `h-11 w-11 md:h-9 md:w-9` | ✅ |
| `Button` mobile | `min-h-11 px-4 py-2` | ✅ |
| `Input` | `h-11 md:h-10` | ✅ |
| `TabsList` / `TabsTrigger` | `min-h-11` / `min-h-[44px]` | ✅ |
| `Sheet` | `rounded-t-[22px]` + safe-area | ✅ |
| **`SelectTrigger`** | **`h-9`** | ❌ **P0** |
| `DialogClose` | wrapper ~16px | ❌ P1 |
| `SheetClose` | wrapper ~16px | ❌ P1 |

**Spots interactifs critiques résiduels** (top 12, P0/P1) :

1. `src/components/ui/select.tsx:22` — SelectTrigger h-9 (36px). **P0 transverse** : tout select de l'app sub-44.
2. `src/components/coach/strength/AthletePlansTab.tsx:807,815,913,922,935,943` — **6 boutons h-7 w-7** sur mutations critiques (assign/edit/delete/copy). **P0 cluster.**
3. `src/components/ui/dialog.tsx:45` + `src/components/ui/sheet.tsx:92` — close buttons sans wrapper dimensionné.
4. `src/pages/Dashboard.tsx:1018,1029` — stepper +/- h-7 w-7 dans modal config séance.
5. `src/components/coach/SlotSessionSheet.tsx:370,391` — back / share preview h-8 w-8.
6. `src/components/shared/PageHeader.tsx:60` — back button h-9 w-9.
7. `src/components/layout/AppLayout.tsx:172` — avatar/settings h-9 w-9.
8. `src/components/coach/strength/AthletePlansTab.tsx:717` — input rename cycle h-7.
9. `src/pages/coach/SwimCatalog.tsx:750` + `StrengthCatalog.tsx:1393` — clear button search h-7 w-7 (acceptable car field-internal).
10. `src/pages/SwimSessionView.tsx:459,470,477` — inputs/Ajouter h-9.
11. `src/components/shared/SwimmerMessagesView.tsx:319` — dismiss h-9.
12. `src/components/coach/SwimmerObjectivesTab.tsx:308-326` — ToggleGroup h-9 (formulaire création objectif).

**Verdict** : 60% résolu. Primitives Button/Input/Tabs conformes, mais `SelectTrigger` P0 et le cluster `AthletePlansTab` P0 restent prioritaires. La cohabitation des deux normes (44 ergonomique récent vs 28-40 historique) signalée passe 1 a fortement reculé mais persiste sur les sous-écrans coach builder.

---

### Drapeau #3 — hardcodes color vs tokens sémantiques

**Métriques globales** :

| Métrique | Passe 1 | Pass 2 | Δ |
|---|---|---|---|
| Fichiers concernés | 94 | 93 | -1 |
| Hits totaux | non mesuré | 540 | — |
| Top 5 contributeurs (cumul) | 157 | 102 | **-35%** |
| InlineBanner (composant pivot) | 25 | **0** | **-100%** |

**Top 5 contributeurs — comparaison 1:1** :

| Rang | Passe 1 | Hits 1 | Hits 2 | Δ | Verdict |
|---|---|---|---|---|---|
| 1 | `pages/coach/CoachTrainingSlotsScreen.tsx` | 55 | 36 | -35% | DETTE résiduelle (statuts slots mixtes) |
| 2 | `pages/Coach.tsx` | 34 | 15 | -56% | Migré sur status-* tokens, palette quickAccess restante |
| 3 | `components/shared/InlineBanner.tsx` | 25 | **0** | **-100%** | Refondu §199 (5 variants sémantiques) |
| 4 | `components/coach/strength/AthletePlansTab.tsx` | 22 | 22 | 0 | **NON TRAITÉ** |
| 5 | `pages/coach/CoachSwimmersOverview.tsx` | 21 | <14 | ~-30%+ | Réduit (sort top 5) |

**Top 5 actuel** :

1. `src/pages/coach/CoachTrainingSlotsScreen.tsx` — 36 hits (mixte légitime/dette)
2. `src/components/coach/strength/AthletePlansTab.tsx` — 22 hits (dette migrable)
3. `src/components/dashboard/FeedbackDrawer.tsx` — 16 hits (échelle bien-être, candidat tokens intensity)
4. `src/pages/SuiviSemaine.tsx` — 14 hits (KPIs sémantiques)
5. `src/components/profile/AthleteInterviewsSection.tsx` — 14 hits (statuts entretiens migrables)

**Cas légitimes catégoriels confirmés** (pas une dette) :

- `src/components/wellness/BodyHeatMap.tsx` (6 hits) — gradient anatomique zones douleur
- `src/components/shared/SwimmerWeekMatrixCard.tsx` (11 hits) — emerald/amber/rose pour absent/incomplet/complet (sémantique, mais token `status-*` utilisable)
- `src/components/shared/ChallengeProgressBar.tsx` (5 hits) — progression 0-100%

**Régressions ponctuelles détectées** :

- `src/components/ui/toast.tsx:24-29` — `dotColors` map hardcodée (`bg-emerald-500`, `bg-red-500`...) au lieu de `bg-status-*`. Régression mineure.
- `src/components/shared/OfflineDetector.tsx:58-59` — `bg-emerald-500/90` / `bg-red-500/90` au lieu de `bg-status-success/90`.
- `src/components/shared/ObjectiveCard.tsx:31-37` — `STROKE_BORDER_TOP` map (`border-t-blue-500`...) ; tokens `--color-tag-swim` à créer pour 4 nages.

**Verdict** : surface InlineBanner nettoyée (impact visuel direct), top 5 cumul -35%, mais les **3 vraies caves de stock** (CoachTrainingSlotsScreen, AthletePlansTab, FeedbackDrawer = 74 hits combinés) n'ont pas été ouvertes. Le Chantier C a soldé son top 15 cibles via §202+§205+§209 mais s'est arrêté avant les pages coach builder denses.

---

## Cohérence inter-surfaces nageur ↔ coach (rappel passe 1)

| Divergence passe 1 | Statut pass 2 |
|---|---|
| 4 styles de headers (h1 sentence-case / PageHeader uppercase / div inline / h2 uppercase italic) | **Réduit à 2 styles** : PageHeader sentence-case (§201) + CoachSectionHeader iOS-style (§208). Inline div SwimCatalog/StrengthCatalog résiduel. |
| 8 variantes de cards/Surfaces | Surface primitive existe (§199), 3 call-sites adopté. **Architecture non consolidée** (BottomActionBar, UpdateNotification non migrés). |
| Sheets bottom sans standard (drag handle, radius variable) | `ui/sheet.tsx` default `rounded-t-[22px]` + safe-area + drag handle. Reste : `Profile.tsx:742` sans radius explicite, `ObjectiveDetailSheet.tsx:53` `rounded-t-3xl` divergent. |
| 4 implémentations d'empty states | EmptyState primitive (§203), **4/4 cibles initiales migrées**. SwimCatalog non migré (`<div Archive /><p>` ad hoc l. 825-828). |
| 5 systèmes de bandeaux empilés | systemBanners queue (§210), 4 consumers, priorité fixe. **Résolu.** |
| Search bars sans clear button (3 implémentations) | Clear button livré sur 3 catalogs (§213). Tap target h-7 sub-44 mais field-internal acceptable. |

---

## Régressions vs passe 1 (à signaler en P0/P1)

1. **P0 `src/pages/Coach.tsx:1151`** — `CardTitle uppercase italic` sur fallback "Accès Coach". Hors brand-moment. À normaliser.
2. **P1 `src/components/coach/SlotSessionSheet.tsx:376`** — h3 preview Oswald uppercase via inline `style={{fontFamily: 'var(--font-display)'}}`. Devrait être sentence-case `font-semibold`.
3. **P1 `src/pages/AwaitingApproval.tsx:22`** + **`src/pages/ComingSoon.tsx:21`** — h1 onboarding/placeholder en uppercase italic. Pas brand-moment.
4. **P0 `src/components/ui/select.tsx:22`** — `SelectTrigger h-9` non corrigé depuis passe 1. Affecte tous les selects de l'app.
5. **P0 cluster `src/components/coach/strength/AthletePlansTab.tsx:807,815,913,922,935,943`** — 6 boutons h-7 w-7 sur mutations critiques. Non touchés par les chantiers livrés.
6. **P2 `src/components/ui/toast.tsx:24-29`** — régression mineure : `dotColors` hardcodés au lieu de tokens.
7. **P2 `src/components/shared/SafeArea.tsx`** — composant zombie (1 call-site, Tailwind 4 `pb-safe` natif disponible). Candidat suppression.

---

## Trajectoire des 4 chantiers structurels passe 1

| Chantier | Statut | Détail |
|---|---|---|
| **A — Détoxification typo `index.css`** | ✅ **livré** (§197) | Règle `@apply` globale supprimée, opt-in `.heading-display`. 5-6 régressions ponctuelles résiduelles. |
| **B — Primitive Surface + cards/sheets** | 🟡 **partiel** (§199, §201, §202) | Surface créée (8.5/10), 3 call-sites adopté. BottomActionBar/UpdateNotification non migrés. Sheet `rounded-t-[22px]` + safe-area appliqué. |
| **C — Tokens sémantiques + dégommage hardcodes** | 🟡 **partiel** (§202, §205, §207, §209) | InlineBanner refondu (-25 hits → 0). Top 15 cibles soldé. Top 5 actuel reste à 102 hits (vs 157), mais cluster `AthletePlansTab/CoachTrainingSlotsScreen/FeedbackDrawer = 74 hits` non ouvert. |
| **D — CoachPageHeader + EmptyState + SystemBannerStack** | ✅ **livré** (§208, §203, §210) | CoachSectionHeader iOS-style, EmptyState (4/4 cibles), systemBanners queue (4/4 consumers). |
| **E — Sheets bottom standard iOS** | 🟡 **partiel** | `ui/sheet.tsx` default conforme. Pas de wrapper `<IosSheet>` dédié. ObjectiveDetailSheet `rounded-t-3xl` divergent. |

---

## Recommandations passe 3

**P0 immédiats** (~ 1 demi-journée) :
1. `select.tsx:22` → `min-h-11 h-auto` (impact transverse : tous les selects).
2. `Coach.tsx:1151` → CardTitle sentence-case.
3. `AthletePlansTab.tsx:807,815,913,922,935,943` → boutons d'action `size="icon"` (h-11 w-11).

**P1 ciblé** (~1 jour) :
4. Migrer `BottomActionBar`, `UpdateNotification` vers `Surface` (consolidation Chantier B).
5. Normaliser `AwaitingApproval`, `ComingSoon`, `SlotSessionSheet` h3 preview → sentence-case.
6. Ouvrir top 3 caves de hardcodes : `CoachTrainingSlotsScreen` (36), `AthletePlansTab` (22), `FeedbackDrawer` (16) = 74 hits à migrer vers `status-*` / tokens custom.

**P2 polish** :
7. Supprimer `SafeArea.tsx` zombie + migrer `Administratif.tsx:517` vers `pb-safe`.
8. `toast.tsx` `dotColors` → tokens.
9. `ObjectiveCard.tsx:31-37` `STROKE_BORDER_TOP` → tokens `--color-tag-swim/dos/br/pap`.
10. SwimCatalog header inline → CoachSectionHeader.
11. Adoption EmptyState SwimCatalog (l. 825-828).

---

## Synthèse exécutive

L'app est passée de **6/10** ("agence 2018 / club sportif rétro") à **~7.8/10** ("iOS-aligned cohérent avec dette ciblée") en 17 chantiers, sans toucher la logique métier.

**Gains structurels majeurs** (impact visuel transverse) :
- Détox typo `index.css` ✅ (règle globale → opt-in)
- Primitives `Button/Input/Tabs/Sheet` conformes HIG 44pt ✅
- InlineBanner refondu en variants sémantiques ✅
- systemBanners queue (offline/update/push/install priorisés) ✅
- EmptyState unifié (4/4 cibles migrées) ✅
- Search clear button + theme segmented + motion guards (§211-§213) ✅

**Dette ciblée résiduelle** (impact local) :
- `SelectTrigger h-9` (P0 transverse, 1 ligne à fix)
- Cluster `AthletePlansTab` h-7 (P0, 6 lignes)
- Caves de hardcodes coach builder (~75 hits sur 3 fichiers)
- Surface adoption non consolidée (BottomActionBar, UpdateNotification)
- 5 régressions typo ponctuelles (Coach:1151, ComingSoon, AwaitingApproval, SlotSessionSheet:376, SessionSummary/WorkoutRunner borderline)

**Chemin critique passe 3** : 0.5 j P0 (3 fix file:line) + 1 j P1 (Surface consolidation + caves hardcodes top 3) → score visé **8.5+/10** sans nouveau chantier structurel.

---

*Liens* :
- Audit initial : [`2026-05-08-ui-ux-audit-ios.md`](2026-05-08-ui-ux-audit-ios.md)
- Implementation log §197-§213 : [`../implementation-log.md`](../implementation-log.md)
