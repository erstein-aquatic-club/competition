# Audit UI/UX EAC — Cohérence iOS HIG / modernité / ergonomie

*Date* : 2026-05-08
*Méthode* : 3 audits parallèles (forks general-purpose) sur surfaces nageur, coach, composants partagés. Grille iOS HIG : sentence-case, tap targets ≥ 44px, radius 12-22px, blur translucide, segmented controls, safe-area, tokens sémantiques.

---

## Verdict global

**6/10** — Les fondations sont là (z-index unifié, safe-area injectée par endroits, Toast Dynamic Island-like, animations spring framer-motion, AlertDialog Radix après §181, skeletons fidèles dans Dashboard/Profile). **Mais trois dettes structurelles plombent l'identité "moderne iOS-like"** et créent une perception "agence 2018 / club sportif rétro" alors que le contenu produit est bon.

| Surface | /10 | Top défaut |
|---|---|---|
| **Coach hub** (`Coach.tsx`) | 7.5 | trop de teintes concurrentes quickAccess, section labels 9px |
| **SwimmerHome** | 7 | Section E carte violette baroque hors design system |
| **CompetitionDetail** (nageur) | 7 | sticky CTA sans safe-area |
| **SwimmerMessagesView** | 7.5 | bouton dismiss h-7 (28px) |
| **CoachComments / CoachMessages** | 6.5 | back button h-8, h2 uppercase italic primary |
| **Dashboard (calendrier nageur)** | 5.5 | h1 ACCUEIL en Oswald rouge, headers boutons h-8 |
| **Strength / WorkoutRunner** | 5-6 | mix h-10/h-11 dans le même écran, gradient cards baroques |
| **Profile** | 6 | hero "FRANÇOIS WAGNER" crié, push toggle "Off/On" cryptique |
| **SwimSessionView** | 5 | window.confirm natif, sticky CTA sans safe-area, inputs h-9 |
| **SwimCatalog / StrengthCatalog** | 5-5.5 | header "Coach / Création" admin-tool, tap targets sub-44 partout |
| **CoachPaceCalculatorScreen** | 6 | header 4 boutons h-7 (28px), Switch scaled à 0.7 |

---

## Trois drapeaux rouges racines (P0 transverses)

### 1. `index.css:278-285` — la règle qui fait crier toute l'app

```css
@layer base {
  h1, h2, h3, h4, h5, h6 { @apply font-display tracking-tight uppercase italic; }
  button { @apply tracking-wide font-bold uppercase; }
}
```

**Conséquence** : chaque titre devient `OSWALD ITALIC UPPERCASE ROUGE`, chaque bouton devient `EN MAJUSCULES BOLD ESPACÉ`. Vu sur :
- `Dashboard.tsx:109` "ACCUEIL"
- `Strength.tsx:1019` "MUSCU"
- `SwimSessionView.tsx:334` "DÉTAILS"
- `Profile.tsx:633` nom utilisateur "FRANÇOIS WAGNER"
- `CoachMessagesScreen.tsx:154` h2 uppercase italic primary
- `WorkoutRunner.tsx:828` bouton "ENREGISTRER & FERMER"
- Tous les `<Button>` shadcn de l'app — y compris "Annuler" qui devient "ANNULER"

**Plusieurs surfaces tentent de s'échapper** avec des overrides ad hoc (`text-2xl font-semibold tracking-tight`, `!normal-case !tracking-normal`) → bataille CSS, code verbeux, et la règle `@apply` global s'applique **silencieusement quand même** dans des composants tiers (Sheet titles, Dialog titles, CardTitle).

**iOS HIG attend** : sentence-case, hiérarchie claire (Large Title 34pt → Title 22pt → Headline 17pt → Body 17pt → Caption 12pt), Inter ou SF Pro régulier/semibold, **rouge primary réservé à l'action**, pas au texte d'écran.

### 2. Tap targets sub-44px endémiques

Apple HIG strict : 44×44px minimum. ≥ 25 occurrences identifiées avec `h-7` (28px), `h-8` (32px), `h-9` (36px), `h-10` (40px) sur des éléments interactifs critiques :

| Spot | Taille | Fix |
|---|---|---|
| `Dashboard.tsx:118,128` Records/Hebdo header | h-8 | h-11 |
| `Dashboard.tsx:1021,1031` durée stepper | h-7 | h-9 minimum |
| `SwimmerHome.tsx:533` avatar | h-9 (36) | h-11 |
| `SwimSessionView.tsx:452,463,500` inputs/trash | h-9 / p-1 | h-11 |
| `SwimmerMessagesView.tsx:319` dismiss | h-7 | h-9-11 |
| `CoachMessagesScreen.tsx:149` back | h-8 | h-11 |
| `CoachCommentsScreen.tsx:150` back | h-8 | h-11 |
| `CoachPaceCalculatorScreen.tsx:251-307` 4 boutons header | h-7 | h-11 ou menu "..." |
| `CoachPaceCalculatorScreen.tsx:296-300` Switch scale-[0.7] | ~28 | scale-1 |
| `ChronoSetup.tsx:280,288,384,396` +/- pickers | h-10 | h-11 |
| `WorkoutRunner.tsx:902,913` Replace/Exit | h-10 | h-11 (incohérent avec difficulty 44 dans même composant) |
| `AthletePlansTab.tsx:418-457` action bar size="sm" | h-9 | h-11 |
| `WellnessForm.tsx:216` pills 1-5 | h-10 | h-11 |
| `SlotSessionSheet.tsx:1147` library item | h-? | min-h-11 |
| `InfoBubble.tsx:30` trigger | p-0.5 (~16px) | min-h-11 wrapper |
| `ui/tabs.tsx:14` TabsTrigger | h-9 | h-11 mobile |
| `ObjectiveDetailSheet.tsx:69,72` ToggleGroup | h-8 | h-11 |
| `SessionRow.tsx:30` py-2 (~36) | py-3 / min-h-11 |

Pattern : §172/§181 ont fixé localement (difficulty buttons, WorkoutRunner Replace/Exit), mais **la cohabitation des deux normes** (44 ergonomique récent vs 28-40 historique) crée des écrans schizophréniques où certains contrôles sont confortables et d'autres non.

### 3. Hardcoded colors vs tokens sémantiques

**94 fichiers .tsx** utilisent des classes `bg-amber-500`, `text-emerald-600`, `border-rose-200`, etc., **alors que `index.css` expose tous les tokens nécessaires** : `--color-status-{success,warning,error}`, `--color-intensity-{1..5}`, `--color-tag-{swim,educ}`, `--color-rank-{gold,silver,bronze}`.

Top 5 contributeurs aux hardcodes :
1. `pages/coach/CoachTrainingSlotsScreen.tsx` : 55 hits
2. `pages/Coach.tsx` : 34 hits
3. **`components/shared/InlineBanner.tsx` : 25 hits** ← ironique, c'est le composant censé être l'exemple
4. `components/coach/strength/AthletePlansTab.tsx` : 22 hits
5. `pages/coach/CoachSwimmersOverview.tsx` : 21 hits

Cas exemplaires :
- `OfflineBanner.tsx:15` : `bg-amber-500 text-white` au lieu de `bg-status-warning`.
- `ScaleSelector5.tsx:38-43` : utilise mono-rouge primary au lieu de la palette intensity 1→5 emerald→red qui existe pour ça.
- `ObjectiveCard.tsx:30-36` : `border-t-blue-500` au lieu de tokens `swim-{nl,dos,br,pap}`.

**Conséquence** : tweak dark mode ou rebrand = N modifications non triviales. Et l'incohérence visuelle est mathématiquement garantie (variantes amber-50/-100/-200/-500 différentes selon les fichiers).

---

## Cohérence entre interfaces nageur ↔ coach

### Points de divergence

1. **Headers de page** : 4 styles coexistent
   - `Coach.tsx:486` h1 sentence-case (le bon modèle)
   - `PageHeader.tsx` partagé : `h1 text-lg font-display uppercase italic primary` (anti-iOS)
   - `SwimCatalog.tsx:674-691` div + bouton inline minimaliste
   - `CoachMessagesScreen.tsx:154` h2 uppercase italic primary
   → Le **même back button** existe en 3 implémentations distinctes (`Button ghost`, `h-9 w-9 rounded-xl border bg-card`, `PageHeader backHref`).

2. **Cards / Surfaces** : 8 variantes recensées
   - shadcn `Card` (rounded-xl border shadow)
   - `InlineBanner` (rounded-xl border backdrop-blur-sm + 7 color variants hardcoded)
   - `ObjectiveCard` full (rounded-xl border-t-[3px])
   - `ObjectiveCard` compact (rounded-lg border-l-4)
   - `LoginInstallBanner` (rounded-xl bg-primary/5)
   - `PushPermissionBanner` (rounded-xl shadow-lg backdrop-blur)
   - `BottomActionBar` (rounded-t-2xl shadow huge)
   - `UpdateNotification` (rounded-full backdrop-blur-xl)
   → Pas de primitive `<Surface>` partagée. Radius mix : `rounded-lg / xl / 2xl / 3xl / full` sans règle.

3. **Sheets bottom** : aucun standard
   - `Profile.tsx:741` : pas de drag handle, radius non spécifié
   - `SwimmerHome.tsx:557` : `rounded-t-2xl` (16px = mince visuellement)
   - `ObjectiveDetailSheet.tsx:53` : `rounded-t-3xl` (24px, le bon)
   - `SlotSessionSheet.tsx` : densité builder pro
   - `ui/sheet.tsx:38-44` : **n'a pas de `rounded-t-*` par défaut** sur la variante `bottom`
   → Chaque call-site improvise. Aucun drag handle iOS visible (la grabber barre 36×4).

4. **Empty states** : 4 implémentations
   - `<p>` simple (`Coach.tsx:856`)
   - shadcn `<Empty>` (`StrengthCatalog.tsx:1457`)
   - inline div centered (`AthletePlansTab.tsx:460`)
   - `Trophy + 2 lignes texte + CTA optionnel` (`CompetitionDetail.tsx:76-81`)
   → Pas d'API unifiée `<EmptyState icon title description cta />`.

5. **Empilement de bandeaux** : 5 systèmes sans coordination
   - `OfflineBanner` (statique flow amber, hardcoded)
   - `OfflineSyncBanner` (autre)
   - `OfflineDetector` (pill flottant top-12 rouge)
   - `UpdateNotification` (pill flottant top-3)
   - `InstallPrompt` (pill flottant top-3 — **conflit avec UpdateNotification**)
   - `PushPermissionBanner` (full card bottom-20 — **colle la nav 64px+safe-area**)
   → Si offline + update + push tombent ensemble : **3-4 bandeaux empilés / superposés**. Pas de queue.

6. **CTA primary border-radius** : `rounded-full` (`SlotSessionSheet:1092`) vs `rounded-md` (Button shadcn) vs `rounded-2xl` (Coach quick access) → 3 standards.

7. **Section labels iOS Group Header** : 3 variantes
   - `text-xs uppercase tracking-wide font-semibold` (SwimmerHome:582)
   - `CardTitle uppercase tracking-[0.08em]` (Profile:646)
   - `text-[9px] tracking-[0.28em]` (Coach:91-93) ← 9px = sous le seuil de lisibilité

### Asymétries fonctionnelles ergonomiques nageur ↔ coach

- **`SwimCatalog` (coach)** vs **`StrengthCatalog` (coach)** : 2 UX différentes pour "déplacer vers dossier" (Dialog d'un côté, MoveToFolderPopover de l'autre).
- **Search bars** dans bibliothèques : 3 implémentations distinctes (`SwimCatalog:737`, `StrengthCatalog:1380`, `AthletePlansTab:159`), **aucune** avec clear button iOS-style.
- **Form sheets nageur** = bottom (Profile, SwimmerHome wellness). **Form sheets coach** = right side (`SwimmerObjectivesTab:288`, `CoachPaceCalculatorScreen`). Convention non documentée → développeurs improvisent.

---

## Plan d'action priorisé

### Quick wins (< 1h chacun, ~5h total)

| # | Action | Fichiers | Impact |
|---|---|---|---|
| QW1 | Supprimer doublon `OfflineBanner` (statique) au profit de `OfflineDetector` (pill flottant) | `AppLayout.tsx:119-121` | -1 bandeau redondant |
| QW2 | Remplacer `window.confirm` par `AlertDialog` (pattern §181) | `SwimSessionView.tsx:394` | UX cohérente |
| QW3 | Ajouter `pb-[env(safe-area-inset-bottom)]` aux sticky CTA | `SwimSessionView.tsx:529`, `CompetitionDetail.tsx:142`, `ChronoSetup.tsx:695` | Notch/home indicator OK |
| QW4 | Bumper tous les `h-7/h-8/h-9` boutons header → `h-11` | `CoachMessagesScreen:149`, `CoachCommentsScreen:150`, `CoachPaceCalculatorScreen:251-307`, `Dashboard:118,128`, `SwimmerHome:533` | HIG immédiat |
| QW5 | `ScaleSelector5` → mapper value 1→5 sur tokens `--color-intensity-{1..5}` | `ScaleSelector5.tsx:38-43` | Restaure le canal visuel d'intensité |
| QW6 | Unifier `formatRelativeTime` dupliqué → `formatRelativeDate` (§196 `lib/date.ts`) | `Coach.tsx:207-216`, `CoachCommentsScreen.tsx:29-38` | DRY |
| QW7 | Replacer Settings dialog Dashboard par Sheet bottom (déborde sur iPhone SE) | `Dashboard.tsx:926` | Pas de débordement viewport |
| QW8 | `<Switch>` push à la place de "Off/On" boutons | `Profile.tsx:723` | Sentence-case + iOS standard |

### Chantiers structurels (1-3 jours)

#### **Chantier A — `index.css` détoxification typo** (~2 jours, IMPACT MAXIMAL)

Le single point of fix qui rebascule toute l'app vers iOS HIG. Plan :

1. Retirer `h1-h6 { @apply font-display tracking-tight uppercase italic }` du `@layer base`.
2. Retirer `button { @apply tracking-wide font-bold uppercase }` du `@layer base`.
3. Créer 2 classes utility opt-in :
   ```css
   .heading-display { @apply font-display tracking-tight uppercase italic; }
   .btn-eac-display { @apply tracking-wide font-bold uppercase; }
   ```
4. Auditer chaque page et appliquer `.heading-display` UNIQUEMENT sur les "brand moments" (Login hero, Hall of Fame, RecordsClub leaderboard, banner cover compétition). **Tout le reste passe sentence-case.**
5. Refactorer `PageHeader.tsx:72-79` : titre `text-lg font-semibold tracking-tight text-foreground` (pas primary), subtitle `text-xs` (pas 10px).

**Test rapide possible** : commenter la règle 5 minutes → vérifier sur 5 surfaces (SwimmerHome, Coach, Profile, Strength, Dashboard) que les `h1`/`h2` sentence-case s'affichent. Si oui, lancer le chantier.

#### **Chantier B — Primitive `<Surface>` + harmonisation cards/sheets** (~1.5 jour)

1. Créer `<Surface variant="solid|glass|tinted|outline" radius="sm|md|lg" />` :
   - sm = 12px (rows, badges)
   - md = 16px (cards standard)
   - lg = 22px (sheets bottom, modal hero)
2. Migrer `Card`, `InlineBanner`, `ObjectiveCard`, `BottomActionBar`, `UpdateNotification` vers cette primitive.
3. Forcer le default `rounded-t-[22px]` + drag handle (barre 36×4 muted) sur `ui/sheet.tsx:38-44` variant `bottom`.
4. Supprimer le gradient violet de `SwimmerHome.tsx:611-635` (Section Messages) → utiliser `<InlineBanner variant="muted" />`.
5. Supprimer le gradient + border-2 des cards focus `WorkoutRunner.tsx:989,1008`.

#### **Chantier C — Tokens sémantiques + dégommage hardcodes** (~2 jours)

1. Refondre `InlineBanner.tsx:8-56` : 7 variants color hardcoded → 5 variants sémantiques (`info`, `success`, `warning`, `error`, `muted`) qui consomment `--color-status-*`.
2. Migrer top 5 contributeurs hardcodes (`CoachTrainingSlotsScreen`, `Coach.tsx`, `AthletePlansTab`, `CoachSwimmersOverview`, `SwimmerInterviewsTab`) — **148 hits** vers tokens en cibles successives.
3. `OfflineBanner.tsx:15`, `OfflineDetector.tsx:42` → `bg-status-warning` / `bg-status-error`.
4. `ObjectiveCard.tsx:30-36` border-t couleurs → tokens `--color-tag-swim` (4 nages distinctes via tokens à créer).

#### **Chantier D — `<CoachPageHeader/>` + `<EmptyState/>` + `<SystemBannerStack/>`** (~1.5 jour)

1. **`<CoachPageHeader title subtitle onBack actions />`** : un seul header partagé pour les 9 surfaces coach. Migration progressive.
2. **`<EmptyState icon title description cta />`** : 1 API. Remplace les 4 implémentations.
3. **`<SystemBannerStack />`** + hook `useBannerQueue()` : 1 banner visible à la fois, priorité `Offline > Update > Push > Install`, animation crossfade, position safe-area-top, pas de chevauchement avec la nav.

#### **Chantier E — Sheets bottom standard iOS** (~1 jour)

1. Wrapper `<IosSheet>` avec : drag handle visible, `rounded-t-[22px]`, `pb-[env(safe-area-inset-bottom)]`, sticky footer pour CTA, header avec close `<X>` à droite ET drag handle au centre.
2. Remplacer toutes les Sheet bottom de l'app (`Profile.tsx:741`, `SwimmerHome.tsx:557`, `SlotSessionSheet`, etc.).
3. `ObjectiveDetailSheet.tsx:69-72` ToggleGroup `h-8` → `h-11` (segmented control iOS).

### Bonus polish (à faire au fil de l'eau)

- Dialog Dashboard `max-w-[340px]` → `max-w-[calc(100vw-32px)]` ou Sheet bottom mobile (déborde iPhone SE).
- Search bars iOS-style avec clear button + magnifier + focus ring sur les 3 catalogs (`SwimCatalog`, `StrengthCatalog`, `AthletePlansTab`).
- Picker temps custom (m:s:cc) pour `SwimmerObjectivesTab.tsx:363` au lieu de string libre.
- Pool toggle `<ToggleGroup>` 50m/25m au lieu de `<Select>` (`SwimmerObjectivesTab.tsx:350-358`).
- Theme selector segmented control 3 segments [Clair|Sombre|Système] (`Profile.tsx:105-130`).
- `prefers-reduced-motion` guard sur `motion.div` stagger (`SwimmerHome.tsx:542-666`, `WellnessForm.tsx:190`).
- Badge counts sur bottom nav (notifications/messages non lus) — pattern Apple `Tab.badge(count)`.
- Supprimer `SafeArea.tsx` (Tailwind 4 a `pb-safe` natif).
- Refondre `PageSkeleton.tsx` générique en variantes `<DashboardSkeleton />`, `<ListSkeleton rows={N} />`, `<HomeSkeleton />`.

---

## Recommandation de démarrage

**Si l'objectif est "iOS-like épuré moderne" sans tout casser** :
1. Commencer par **Chantier A** (détox typo `index.css`). C'est le déclencheur visuel — sans lui, tous les autres chantiers sont cosmétiques. Risque faible (zéro logique touchée), impact massif. ~2 jours.
2. Enchaîner les **Quick Wins QW1-QW8** dans la foulée (~1 demi-journée groupée).
3. Lancer le **Chantier B** (Surface primitive) en parallèle d'audit. ~1.5 jour.
4. Chantier C (tokens) et Chantier D (composants partagés) peuvent se faire en parallèle après.
5. Chantier E (sheets) en finition.

**Total estimé chemin critique** : ~8-10 jours pour basculer 80% de l'app vers une esthétique iOS HIG cohérente, sans toucher la logique métier.

**Hors scope de cet audit** (à challenger plus tard) : usage du rouge primary EAC sur action vs branding (faut-il un "tint" alternatif neutre comme iOS le fait avec un blue/red selon UIKit), dark mode polish (les tokens existent mais peu de surfaces ont été testées en dark), motion polish (page transitions slide-from-right iOS-like via Wouter).
