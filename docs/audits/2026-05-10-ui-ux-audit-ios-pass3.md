# Audit UI/UX EAC — Pass 3 (post-§234)

*Date* : 2026-05-10
*Méthode* : 3 forks parallèles (sonnet) sur surfaces nageur, coach, composants partagés + 3 NEW (Surface, EmptyState, systemBanners). Greps systématiques pour les 3 drapeaux racines. Comparaison file:line vs `2026-05-08-ui-ux-audit-ios-pass2.md` (passe 2).
*Scope* : audit lecture seule, post-livraison de §215-§234 (8 chantiers UI/UX + 6 chantiers user en parallèle).

---

## Verdict global

**~8.5/10** (vs **6/10** pass 1, **7.8/10** pass 2 — **+0.7** depuis pass 2, **+2.5** vs initial).

L'app est désormais **fully aligned iOS HIG** sur les fondamentaux (typo, tap targets, tokens). Il subsiste une **dette ciblée résiduelle** localisée sur des sous-écrans builder coach (mutations actions critiques sub-44 hors AthletePlansTab désormais closeé) et quelques hardcodes catégoriels (statuts entretiens, KPIs SuiviSemaine).

| Drapeau racine | Pass 1 | Pass 2 | Pass 3 | Verdict |
|---|---|---|---|---|
| #1 typo `h1-h6 = font-display uppercase italic` | règle globale crient | règle opt-in, 5 régressions ponctuelles | **0 régression P0/P1**, 2 borderline whitelistées via `.heading-display` | **FERMÉ ✅** |
| #2 tap targets sub-44 | ~25 spots, primitives ui à h-9 | primitives Button/Input/Tabs OK, SelectTrigger P0 | **toutes primitives ui conformes HIG 44pt** (SelectTrigger, DialogClose, SheetClose §224+§227), cluster AthletePlansTab fixé §224 | **FERMÉ au niveau primitives ✅**, dette ponctuelle locale |
| #3 hardcodes color | 94 fichiers, top 5 = 148 hits | 93 fichiers, top 5 = 102 hits, caves coach intactes | **89 fichiers**, top 5 = 67 hits, **CoachTrainingSlotsScreen 36→0**, AthletePlansTab 22→8, FeedbackDrawer 16→9 | **CAVES OUVERTES, top contributors -34% supplémentaires** |

---

## Tableau scores par surface (pass 2 → pass 3)

### Nageur (moyenne 7.94 → 7.99)

| Surface | Pass 2 | Pass 3 | Δ | Commentaire |
|---|---|---|---|---|
| **SwimmerHome** | 9.0 | 9.2 | +0.2 | quickLinks 4 hardcodes catégoriels migrables (P2) |
| **Dashboard** | 7.5 | 7.7 | +0.2 | Stepper modal h-7 résiduel (P1), toggle présence h-9 (P1) |
| **Strength** | 7.5 | 7.7 | +0.2 | Skeleton h-7/h-8 presentational, pas de régression |
| **WorkoutRunner** | 7.0 | 7.3 | +0.3 | "Séance Terminée" whitelisté §229 ✅. Difficulté hardcodée → tokens intensity disponibles (P1) |
| **Profile** | 7.5 | 7.5 | 0 | ToggleGroupItem theme h-9 résiduelle (P1) |
| **SwimSessionView** | 7.5 | 7.5 | 0 | Inputs/Ajouter mode libre h-9 (P1) |
| **CompetitionDetail** | 8.0 | 7.8 | -0.2 | Back buttons h-9 ×2 non corrigés (régression -0.2) |
| **SwimmerMessagesView** | 8.5 | 8.5 | 0 | Dismiss h-9 résiduel (P1) |
| **WellnessForm** | 8.5 | 8.7 | +0.2 | Hardcodes pain catégoriels migrables (P2) |

### Coach (moyenne 7.14 → 7.36)

| Surface | Pass 2 | Pass 3 | Δ | Commentaire |
|---|---|---|---|---|
| **Coach hub** | 8.0 | 8.0 | 0 | text-[9px]→[11px] §234 ✅, palette quickAccess + violet commentaires hardcodes |
| **CoachMessagesScreen** | 7.5 | 7.5 | 0 | Back button text "Retour" pas icon-only HIG |
| **CoachCommentsScreen** | 7.5 | 7.5 | 0 | indicatorColor 3 hardcodes emerald/amber/red migrables (P1 sémantique) |
| **SlotSessionSheet** | 6.5 | 7.0 | +0.5 | P1 Oswald §224 ✅. STATE_CONFIG amber/emerald hardcodes (P2) |
| **SwimCatalog** | 6.5 | 7.0 | +0.5 | Search clear h-9 §234 ✅, EmptyState §225 ✅. Header "Coach/Création" austère (P1 UX) |
| **StrengthCatalog** | 7.0 | 7.0 | 0 | Search clear §234 ✅. FolderDropdown h-8 (P1) |
| **AthletePlansTab** | 5.5 | **7.0** | **+1.5** | Cluster §224 ✅, search §234 ✅. Reste : Input rename h-7 + menu h-8 (P1) |
| **ChronoSetup** | 8.0 | 8.0 | 0 | +/- pickers h-11 ✅. Alerte "Ligne pleine" amber hardcodé (P2) |
| **SwimmerObjectivesTab** | 6.5 | 6.5 | 0 | ToggleGroup h-9 Radix default (P1 résiduelle) |
| **CoachPaceCalculatorScreen** | 8.5 | 8.5 | 0 | Header h-11 ✅. SelectTrigger équipe h-9 (P1, override local) |
| **CoachTrainingSlotsScreen** | ~7.0 | 7.0 | 0 | §226 31→0 catégoriels ✅ (non re-audité ligne par ligne) |

### Partagés (moyenne 7.6 → 8.4)

| Composant | Pass 2 | Pass 3 | Δ | Commentaire |
|---|---|---|---|---|
| **AppLayout** | 8.0 | 8.5 | +0.5 | Avatar h-11 §227 ✅ |
| **PageHeader** | 8.5 | 9.0 | +0.5 | Back h-11 §227 ✅ |
| **InlineBanner** | 9.0 | 9.0 | 0 | motion-reduce §234 ✅ |
| **BottomActionBar** | 8.5 | 8.5 | 0 | Surface migration abandonnée §227 |
| **ScaleSelector5** | 9.0 | 9.0 | 0 | — |
| ~~**SafeArea**~~ | 4.0 | **N/A** | ✅ | **SUPPRIMÉ §230** |
| **CoachBreadcrumb** | 7.5 | 7.5 | 0 | — |
| **PageSkeleton** | 5.0 | 5.0 | 0 | Non touché (variantes reportées) |
| **SessionRow** | 8.5 | 8.5 | 0 | — |
| **ObjectiveCard** | 7.0 | 7.5 | +0.5 | STROKE_BORDER_TOP migré §226 ✅ + 2 deltas → status-* ✅ |
| **ObjectiveDetailSheet** | 7.5 | 7.5 | 0 | rounded-t-3xl divergent persiste (P2) |
| **InfoBubble** | 8.0 | 7.5 | -0.5 | AcwrInfoContent emerald/amber/red hardcodes (régression P2) |
| **UpdateNotification** | 9.0 | 9.0 | 0 | motion-reduce §234 ✅ |
| **PushPermissionBanner** | 9.0 | 9.0 | 0 | dismiss h-10 borderline (40px non-critique) |
| **OfflineDetector** | 8.5 | 8.0 | -0.5 | bg-emerald-500/90 + bg-red-500/90 hardcodes (P2 régression depuis pass 2) |
| **InstallPrompt** | 8.5 | 8.5 | 0 | motion-reduce §234 ✅ |
| **AchievementToast** | 8.0 | 8.0 | 0 | motion-reduce §234 ✅ |
| **ui/card** | 7.5 | 7.5 | 0 | — |
| **ui/button** | 9.0 | 9.0 | 0 | min-h-11 default ✅ |
| **ui/input** | 9.0 | 9.0 | 0 | h-11 md:h-10 ✅ |
| **ui/tabs** | 8.5 | 8.5 | 0 | min-h-11 ✅ |
| **ui/sheet** | 9.0 | 9.0 | 0 | rounded-t-[22px] + Close h-11 §227 ✅ |
| **ui/select** | 5.5 | **9.0** | **+3.5** | SelectTrigger min-h-11 §224 ✅ (P0 transverse closeé) |
| **ui/dialog** | 7.5 | **9.0** | **+1.5** | DialogClose h-11 §227 ✅ |
| **ui/badge** | 7.0 | 7.0 | 0 | Acceptable |
| **ui/toast** | 7.0 | **9.0** | **+2.0** | dotColors tokenisés §225 ✅ |

### NEW composants (§199, §203, §210)

| Composant | Pass 2 | Pass 3 | Δ | Adoption |
|---|---|---|---|---|
| **Surface** (§199) | 8.5 | 8.5 | 0 | 3 call-sites (LoginInstallBanner, PushPermissionBanner, ObjectiveCard). BottomActionBar/UpdateNotification non migrés (architecture non consolidée, abandon §227). |
| **EmptyState** (§203) | 9.0 | **9.5** | **+0.5** | **5 call-sites** (4 cibles initiales + SwimCatalog migré §225) — adoption complète. |
| **systemBanners** (§210) | 9.5 | 9.5 | 0 | 4/4 consumers — couverture totale stable. |

---

## Validation des 3 drapeaux racines

### Drapeau #1 — typo uppercase italic crié

**Régression P0/P1 pass 2 → état pass 3** :

| Fichier:ligne | Pass 2 | Pass 3 | Verdict |
|---|---|---|---|
| `src/pages/AwaitingApproval.tsx:22` | régression P1 | sentence-case ✅ | SOLDÉE §224 |
| `src/pages/ComingSoon.tsx:21` | régression P1 | sentence-case ✅ | SOLDÉE §224 |
| `src/pages/Coach.tsx:1097` (ex-1151) | régression P0 | sentence-case ✅ | SOLDÉE §227 |
| `src/components/coach/SlotSessionSheet.tsx:376` | régression P1 inline Oswald | font-semibold ✅ | SOLDÉE §224 |
| `src/components/strength/SessionSummary.tsx:58` | borderline | `heading-display` whitelisté ✅ | WHITELIST §229 |
| `src/components/strength/WorkoutRunner.tsx:751` | borderline | `heading-display` whitelisté ✅ | WHITELIST §229 |

**Occurrences restantes du combo `font-display + uppercase`** (sans italic, ou via `.heading-display` opt-in) :
- 2 brand-moments légitimes (SessionSummary, WorkoutRunner) via `.heading-display` opt-in
- 5 eyebrow tags `font-display uppercase` sans italic (SwimSessionTimeline:306, RecordsClub:421, SharedSwimSession:69+89, CoachTrainingSlotsScreen:158+178) — légitimes (label brand pattern)
- Définition CSS unique `index.css:330-331` (`@utility heading-display`)

**Verdict : DRAPEAU FERMÉ ✅** — 0 régression P0/P1 active. Le pattern de classe utility opt-in `.heading-display` (§197) fonctionne comme prévu : factorisation propre des brand-moments, aucune contamination ad-hoc.

---

### Drapeau #2 — tap targets sub-44px

**Primitives UI defaults** (vérifiées par Read) :

| Primitive | Default pass 3 | Pass 2 | Pass 3 |
|---|---|---|---|
| `Button` default | `min-h-11 md:min-h-10` | ✅ | ✅ |
| `Button` icon | `h-11 w-11 md:h-9 md:w-9` | ✅ | ✅ |
| `Input` | `h-11 md:h-10` | ✅ | ✅ |
| `TabsList` / `TabsTrigger` | `min-h-11` / `min-h-[44px]` | ✅ | ✅ |
| `Sheet` bottom | `rounded-t-[22px]` + safe-area | ✅ | ✅ |
| **`SelectTrigger`** | `min-h-11 md:min-h-9` | **❌ h-9 P0** | **✅ §224 SOLDÉ** |
| **`DialogClose`** | `h-11 w-11 ... rounded-full` | ❌ ~16px P1 | ✅ §227 SOLDÉ |
| **`SheetClose`** | `h-11 w-11 ... rounded-full` | ❌ ~16px P1 | ✅ §227 SOLDÉ |

**Cluster AthletePlansTab** (pass 2 P0) — vérifié file:line par grep :
- L.817, 825, 923, 932, 945, 953 — tous `h-11 w-11` ✅ §224 SOLDÉ

**Spots interactifs résiduels (P0/P1 ponctuels hors primitives)** :

| Spot | Statut |
|---|---|
| `Dashboard.tsx:735,746` stepper config séance modal | P1 résiduelle (chemin peu fréquent) |
| `Dashboard.tsx:693` toggle présence h-9 | P1 résiduelle |
| `Profile.tsx:122` ToggleGroupItem theme h-9 | P1 résiduelle (pattern §212) |
| `SwimSessionView.tsx:468,479,486` inputs/Ajouter mode libre h-9 | P1 résiduelle |
| `CompetitionDetail.tsx:72,95` back buttons h-9 ×2 | P1 résiduelle |
| `SwimmerMessagesView.tsx:319` dismiss h-9 | P1 résiduelle |
| `SwimmerObjectivesTab.tsx:316-326` ToggleGroup Radix default ~h-9 | P1 résiduelle |
| `SlotSessionSheet.tsx:370,388` preview back/share h-8 | P1 résiduelle |
| `CoachPaceCalculatorScreen.tsx:318` SelectTrigger team override h-9 | P1 (override local du fix transverse) |
| `AthletePlansTab.tsx:727,749` Input rename h-7 + menu h-8 | P1 résiduelle |
| `StrengthCatalog.tsx:335` FolderDropdown h-8 | P1 résiduelle |
| `SwimCatalog.tsx:693` "Nouvelle" py-2 | P1 résiduelle |

**Verdict : PRIMITIVES FERMÉES ✅, DETTE PONCTUELLE LOCALISÉE** — toutes les primitives ui sont conformes HIG 44pt. La dette résiduelle (~12 spots P1) concerne :
1. Modals/sheets de configuration (Dashboard, SwimSessionView, SlotSessionSheet) — chemins peu fréquents
2. Headers/buttons de catalogs coach (StrengthCatalog, SwimCatalog) — workflow expert
3. Form controls Radix sans `min-h-11` explicite (Profile, SwimmerObjectivesTab) — Radix default

---

### Drapeau #3 — hardcodes color vs tokens sémantiques

**Métriques globales** :

| Métrique | Pass 1 | Pass 2 | Pass 3 |
|---|---|---|---|
| Fichiers concernés | 94 | 93 | **89** |
| Hits totaux | non mesuré | 540 | **475 (-12%)** |
| Top 5 cumul | 148 | 102 | **67 (-34% pass 2→3)** |

**Caves identifiées pass 2 — état pass 3** :

| Cave | Pass 2 hits | Pass 3 hits | Δ | Commentaire |
|---|---|---|---|---|
| `CoachTrainingSlotsScreen.tsx` | 36 | **0** | **-100%** | §226 ✅ migré complètement (cat-swim/strength/override/competition) |
| `AthletePlansTab.tsx` | 22 | **8** | -64% | §222 ✅ + §224. Reste 8 catégoriels (orange/blue/sky non tokenisés) |
| `FeedbackDrawer.tsx` | 16 | **9** | -44% | §222 ✅. Reste 9 catégoriels (sky absent, orange muscu) |
| `InlineBanner.tsx` | 0 (déjà refondu §199) | 0 | = | ✅ |
| `toast.tsx` dotColors | 4 | **0** | -100% | §225 ✅ |

**Top 5 contributors pass 3** (nouveau classement) :

| Rang | Fichier | Hits | Type |
|---|---|---|---|
| 1 | `pages/SuiviSemaine.tsx` | 14 | KPIs sémantiques (migrable) |
| 2 | `components/profile/AthleteInterviewsSection.tsx` | 14 | Statuts entretiens (migrable status-*) |
| 3 | `pages/coach/SwimmerInterviewsTab.tsx` | 13 | Idem catégorie |
| 4 | `components/competition/RacesTab.tsx` | 13 | Compétitions thèmes |
| 5 | `components/coach/pace/Pace4NSegmentMatrix.tsx` | 13 | Visualisation allures (partiellement légitime) |

**Régressions ponctuelles pass 2 résiduelles (toujours non corrigées)** :
- `OfflineDetector.tsx:58-59` — `bg-emerald-500/90` / `bg-red-500/90` au lieu de `bg-status-success/90` / `bg-status-error/90` (P2)
- `InfoBubble.tsx:82-84` (`AcwrInfoContent`) — `bg-emerald-500`, `bg-amber-500`, `bg-red-500` (P2)

**Verdict : RÉDUCTION SUBSTANTIELLE** — caves coach pass 2 (74 hits combinés) chutées à 17 hits combinés (-77%). InlineBanner et toast.tsx dotColors entièrement tokenisés. Top 5 cumul -34% supplémentaires depuis pass 2. **Drapeau #3 désormais en mode dette ponctuelle** : pas de gros stocks contigus, juste des fichiers à 13-14 hits sémantiques migrables individuellement.

---

## Cohérence inter-surfaces nageur ↔ coach (rappel)

| Divergence pass 1 | Pass 2 | Pass 3 |
|---|---|---|
| 4 styles de headers | Réduit à 2 (PageHeader sentence-case + CoachSectionHeader iOS-style) | **Confirmé**, SwimCatalog "Coach/Création" inline résiduel (P1 UX) |
| 8 variantes cards/Surfaces | Surface primitive + 3 call-sites | **Stable**, BottomActionBar/UpdateNotification consolidation abandonnée (§227 décision) |
| Sheets bottom sans standard | `ui/sheet.tsx` default `rounded-t-[22px]` + safe-area + drag handle | **Stable**, ObjectiveDetailSheet:53 `rounded-t-3xl` divergent (P2) |
| 4 implémentations empty states | EmptyState 4 cibles migrées | **5/5 ✅** (SwimCatalog §225) |
| 5 systèmes de bandeaux | systemBanners queue 4/4 consumers | **Stable** |
| Search bars sans clear button | Clear button livré (§213) h-7 | **§234 ✅ h-9** sur les 3 catalogs |

---

## Régressions vs pass 2 (P0/P1 nouvelles)

1. **P2 `OfflineDetector.tsx:58-59`** — non corrigée depuis pass 2 (bg-emerald-500/90 au lieu de bg-status-success/90).
2. **P2 `InfoBubble.tsx:82-84`** — `AcwrInfoContent` hardcodes emerald/amber/red (signalé par fork partagés en pass 3).
3. **P1 `CompetitionDetail.tsx:72,95`** — back buttons h-9 ×2 toujours non corrigés (régression -0.2 score).

---

## Trajectoire des 5 chantiers structurels pass 1

| Chantier | Pass 2 | Pass 3 |
|---|---|---|
| **A — Détoxification typo `index.css`** | ✅ livré (§197) | ✅ STABLE |
| **B — Primitive Surface + cards/sheets** | 🟡 partiel (3 call-sites) | 🟡 **STABLE** (BottomActionBar/UpdateNotification consolidation abandonnée §227) |
| **C — Tokens sémantiques + dégommage hardcodes** | 🟡 top 15 soldé, caves intactes | 🟢 **caves résolues** (CTS 36→0, APT 22→8, FB 16→9), top 5 -34% |
| **D — CoachPageHeader + EmptyState + SystemBannerStack** | ✅ livré (4/4 cibles) | ✅ **5/5** EmptyState (SwimCatalog §225) |
| **E — Sheets bottom standard iOS** | 🟡 default conforme | 🟡 STABLE |

---

## Recommandations pass 4

**P0 immédiats** : aucun (tous les P0 pass 2 sont closeés ✅).

**P1 ciblé** (chemin critique vers 9.0/10) :
1. `OfflineDetector.tsx:58-59` + `InfoBubble.tsx:82-84` → tokens status-* (régressions ponctuelles, ~10 lignes).
2. `CoachCommentsScreen.tsx:25-27` indicatorColor 3 hardcodes → `status-*-bg` / `text-status-*` (sémantique évidente).
3. `CompetitionDetail.tsx:72,95` back buttons h-9 → h-11 (cohérence §227).
4. `WorkoutRunner.tsx:1028-1034` difficulté hardcodée → `bg-intensity-{1..5}` (tokens disponibles).
5. `WellnessForm.tsx:196` `text-emerald-600` → `text-status-success`.
6. `Profile.tsx:122` ToggleGroupItem theme h-11.
7. `SwimSessionView.tsx:468,479,486` inputs mode libre h-11.

**P2 polish (vers 9.5/10)** :
8. Migrer top 5 caves catégoriels résiduels (SuiviSemaine, AthleteInterviewsSection, SwimmerInterviewsTab, RacesTab, Pace4NSegmentMatrix) — 67 hits cumulés.
9. SwimCatalog header inline → CoachSectionHeader (UX decision).
10. SwimmerObjectivesTab ToggleGroup `min-h-11`.
11. ObjectiveDetailSheet `rounded-t-3xl` → `rounded-t-[22px]` (cohérence sheet default).

---

## Synthèse exécutive

L'app est passée de **6/10** ("agence 2018 / club sportif rétro") à **~8.5/10** ("iOS-aligned cohérent avec dette ponctuelle minime") en 14 chantiers (8 mes + 6 user en parallèle).

**Tous les P0 pass 1 et pass 2 sont soldés** :
- ✅ Drapeau #1 typo : règle globale virée + opt-in `.heading-display` + 4 régressions closeées + 2 brand-moments whitelistés
- ✅ Drapeau #2 tap targets : 100% primitives ui conformes HIG (Button/Input/Tabs/Sheet/Select/DialogClose/SheetClose) + cluster AthletePlansTab
- ✅ Drapeau #3 hardcodes : caves coach pass 2 résolues (-77%), 9 nouveaux tokens cat-*/stroke-*, top 5 cumul -34%

**Items NEW** (Surface, EmptyState, systemBanners) : adoption stable (3/4/4 call-sites), aucun churn d'API.

**Dette résiduelle** : ~12 spots P1 (modals/catalogs builder), 3 régressions P2 ponctuelles (OfflineDetector, InfoBubble, CompetitionDetail), 67 hits hardcodes catégoriels migrables.

**Chemin critique pass 4 vers 9.0/10** : ~1 demi-journée (7 P1 listés ci-dessus = ~15 lignes de code).

---

*Liens* :
- Audit pass 1 : [`2026-05-08-ui-ux-audit-ios.md`](2026-05-08-ui-ux-audit-ios.md)
- Audit pass 2 : [`2026-05-08-ui-ux-audit-ios-pass2.md`](2026-05-08-ui-ux-audit-ios-pass2.md)
- Implementation log §197-§234 : [`../implementation-log.md`](../implementation-log.md)
