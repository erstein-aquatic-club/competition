# Plan UI/UX vers 10/10 — Roadmap pass 4 → 7

*Date* : 2026-05-10 (post-§236 audit pass 3)
*Score actuel* : ~8.5/10 (tous drapeaux racines NEUTRALISÉS au niveau structurel)
*Source* : audit pass 3 `docs/audits/2026-05-10-ui-ux-audit-ios-pass3.md`
*Statut* : plan figé, prêt pour exécution séquentielle

---

## État de départ

| Drapeau racine | Verdict pass 3 |
|---|---|
| #1 typo | ✅ FERMÉ — 0 régression P0/P1, 2 borderline whitelistées |
| #2 tap targets | ✅ FERMÉ au niveau primitives ui (Button/Input/Tabs/Sheet/Select/Dialog/Sheet Close) |
| #3 hardcodes | 🟢 RÉDUIT MAJEUR — caves coach résolues, top 5 cumul -34% |

**Items NEW** : Surface 8.5 (3 call-sites), EmptyState 9.5 (5/5), systemBanners 9.5 (4/4).

**Score moyens** : Nageur 7.99 / Coach 7.36 / Partagés 8.4.

---

## Pass 4 — Closing P1 résiduels (~1 demi-journée, ~15 lignes) → 9.0/10

8 fixes ciblés identifiés par audit pass 3, tous documentés file:line.

### Fixes P1 (par priorité ROI)

| # | Spot | Fix | LOC |
|---|---|---|---|
| 1 | `src/components/shared/OfflineDetector.tsx:58-59` | `bg-emerald-500/90` / `bg-red-500/90` → `bg-status-success/90` / `bg-status-error/90` | 2 |
| 2 | `src/components/shared/InfoBubble.tsx:82-84` | `AcwrInfoContent` 3 hardcodes → `bg-status-success` / `bg-status-warning` / `bg-status-error` (zones ACWR sémantiquement = statuts) | 3 |
| 3 | `src/pages/CompetitionDetail.tsx:72,95` | back buttons h-9 ×2 → h-11 (cohérence §227) | 2 |
| 4 | `src/components/strength/WorkoutRunner.tsx:1028-1034` | difficulté hardcodée (`bg-emerald-500/amber-400/orange-500/red-500`) → `bg-intensity-{1..5}` (tokens existants) | 5 |
| 5 | `src/components/wellness/WellnessForm.tsx:196` | succès "Enregistré" `text-emerald-600 dark:text-emerald-400` → `text-status-success` | 1 |
| 6 | `src/pages/Profile.tsx:122` | ToggleGroupItem theme `h-9` → `min-h-11` ou `h-11` | 1 |
| 7 | `src/pages/SwimSessionView.tsx:468,479,486` | inputs/Ajouter mode libre `h-9` → `h-11` | 3 |
| 8 | `src/pages/coach/CoachCommentsScreen.tsx:25-27` | `indicatorColor()` 3 ternaires emerald/amber/red → `bg-status-*-bg text-status-*` | 3 |

**Total : ~20 lignes de code, 8 fichiers.**

**Vérifications** : `npx tsc --noEmit` clean, `npm test` 684+/685 (1 fail pré-existant non-lié).

**Bundle commit** : `feat(§N): pass 4 closing P1 — régressions hardcodes + tap targets ponctuels`.

---

## Pass 5 — Top 5 caves catégoriels (~1 jour) → 9.3/10

67 hits cumulés sur 5 fichiers, sémantiquement migrables vers tokens existants ou nouveaux.

### Cibles

| Fichier | Hits | Approche |
|---|---|---|
| `src/pages/SuiviSemaine.tsx` | 14 | KPIs sémantiques → `status-*` ou `intensity-*` selon contexte |
| `src/components/profile/AthleteInterviewsSection.tsx` | 14 | Statuts entretiens (à signer/à compléter/signé) → `status-*` |
| `src/pages/coach/SwimmerInterviewsTab.tsx` | 13 | Idem statuts entretiens |
| `src/components/competition/RacesTab.tsx` | 13 | Thèmes compétitions — peut nécessiter étendre tokens (cat-competition + variantes ou rank-* étendus) |
| `src/components/coach/pace/Pace4NSegmentMatrix.tsx` | 13 | Visualisation allures par zone — `intensity-{1..5}` ou créer `pace-zone-{1..5}` tokens |

### Méthode

Sub-agent sonnet par fichier (5 sub-agents parallèles), critères stricts :
- Status sémantique (success/warning/error) → `status-*` tokens
- Échelle 1→5 (intensité, niveau) → `intensity-*` tokens
- Catégoriel pur sans sémantique sur échelle/statut → décision : créer un nouveau token ou laisser hardcode documenté

**Vérifications** : grep total hits avant/après par fichier, tsc clean, dark mode visuelle (les tokens sont dark-aware).

**Bundle commit** : `feat(§N): pass 5 caves catégoriels (5 fichiers, -67 hits)` ou commits séparés par fichier si conflicts.

---

## Pass 6 — Audit accessibilité WCAG AA (~1 jour) → 9.5/10

Audit complémentaire que les pass 1-3 n'ont pas couvert. Hors scope strict UI/UX HIG mais critique pour accessibility.

### Sub-§ A — Audit (read-only, sub-agent sonnet)

Outils :
- Axe DevTools (extension navigateur) — scan automatique
- Lighthouse Accessibility audit (Chrome DevTools)
- Revue manuelle par checklist WCAG AA

Vérifications systématiques :
- **Contrast ratios** : tous les `text-muted-foreground/X` (où X < 100) — vérifier ratio ≥ 4.5:1 sur backgrounds usuels
- **Focus-visible** : tous boutons custom (pas que primitives Button) ont `focus-visible:ring-2`
- **ARIA labels** : tous boutons icon-only ont `aria-label` (audit grep `<Button.*size="icon"` sans `aria-label`)
- **Sémantique HTML** : pas de `<div onClick>` sans rôle/keyboard, headings cohérents (`<h1>` unique par page, `<h2>` sections)
- **Screen reader nav order** : focus trap dans Sheet/Dialog, sortie clavier `Escape`, pas de `tabindex` arbitraire
- **Keyboard navigation** : toutes actions atteignables clavier (calendrier nav, sliders, picker dates)
- **Form labels** : tous `<input>` ont `<label>` ou `aria-label`/`aria-labelledby`
- **Color-only signaling** : pas d'info véhiculée uniquement par couleur (statuts ont aussi icônes/texte)

### Sub-§ B — Fixes (commit séparé)

Selon le rapport audit, fixer file:line. Estimation 10-30 fixes.

**Bundle commit** : 2 commits — `docs(§N): audit accessibility pass 1` puis `feat(§N+1): pass 6 fixes accessibility WCAG AA`.

---

## Pass 7 — iOS premium polish (~2-3 jours, optionnel pour 10/10)

Items audit pass 1 listés en "bonus polish" + nouveaux identifiés.

### Sub-§ A — Animations & transitions

- **Page transitions slide-from-right** : Wouter + framer-motion `motion.div` `initial={{ x: 100% }}` → `animate={{ x: 0 }}` sur changement de route. Pattern UIKit native iOS push/pop.
- **Animation timing tokens** : exposer `--duration-fast/normal/slow` dans `index.css` `@theme`, harmoniser tous `transition-*` ad-hoc.
- **Spring presets** : centraliser configs framer-motion (`spring-soft`, `spring-stiff`) dans `lib/animations.ts`.

### Sub-§ B — Skeleton perceived perf

§238 prévu : refondre `PageSkeleton` générique en variantes :
- `<DashboardSkeleton />` — calendrier 6×7 + header
- `<ListSkeleton rows={N} />` — listes (Records, Coach swimmers)
- `<HomeSkeleton />` — SwimmerHome / Coach hub
- `<CalendarSkeleton />` — semaine coach

ROI : perceived performance dramatically improves avec skeletons fidèles vs blocks génériques.

### Sub-§ C — Haptic feedback

- `navigator.vibrate(10)` sur button press (iOS Safari supporte uniquement via Web Vibration API limitée)
- Pattern WCAG-respectful : `prefers-reduced-motion` should also disable haptics
- Helper `lib/haptic.ts` : `haptic.light()`, `haptic.success()`, `haptic.error()`

### Sub-§ D — Typography rhythm

Audit current state :
- line-heights ad-hoc (`leading-tight`, `leading-snug`, etc.) — cohérence à valider
- letter-spacing `tracking-*` parfois forcé sur des paragraphes (anti-pattern)
- Définir scale typographique cohérente : Display / Title / Headline / Body / Caption (alignée iOS HIG type sizes)

### Sub-§ E — Badge counts bottom nav

§240 prévu : pattern Apple `Tab.badge(count)` sur bottom nav.
- `AppLayout.tsx` bottom nav : ajouter pastille rouge avec compteur sur Messages/Notifs
- Query `useUnreadNotifications()` (probablement déjà existe via §235)
- Badge component custom (`<NavBadge count={N} />`) avec `aria-label`

### Sub-§ F — Surface adoption massive (Card → Surface)

§241 prévu : migrer la primitive shadcn `<Card>` (140+ fichiers) vers `<Surface variant="solid" radius="md">`.

**Risque élevé** — régressions visuelles potentielles. **ROI** : cohérence radius/variants, tokens consolidés.

Méthode :
1. Étendre Surface API si besoin (`radius="full"`, `radius="top-only"` pour BottomActionBar/UpdateNotification)
2. Codemod `<Card>` → `<Surface>` (script automatisé)
3. Visuel diff systématique surface par surface
4. Sub-agents sonnet par batch de 20 fichiers

### Sub-§ G — Dark mode vérification visuelle

Manuel — naviguer toute l'app en dark mode, screenshot diff vs light, identifier régressions ou contrastes faibles. Outil : Chrome DevTools `prefers-color-scheme: dark` simulation.

---

## Séquençage recommandé

| Pass | Effort | Score visé | Dépendances |
|---|---|---|---|
| **Pass 4** P1 closing | 0.5 j | 9.0 | aucune |
| **Pass 5** caves catégoriels | 1 j | 9.3 | aucune (peut tourner en parallèle de pass 4) |
| **Pass 6** WCAG AA | 1 j (audit + fix) | 9.5 | pass 4 + 5 idéalement (moins de churn) |
| **Pass 7** iOS premium | 2-3 j | **10.0** | pass 6 (focus management acquired) |

**Total chemin critique** : ~5-6 jours.

**Parallélisation possible** :
- Pass 4 + Pass 5 = jour 1 (sub-agents indépendants)
- Pass 6 audit = jour 2 matin (sub-agent), fixes = jour 2 après-midi
- Pass 7 sub-sections A-G en parallèle où possible (jour 3-5)

---

## Considérations transverses

### Numérotation §

À chaque § ajouté :
1. Vérifier `git log --oneline -3` pour le dernier numéro committé
2. Choisir le suivant dispo (peut sauter si user en a livré entre temps)
3. Mettre à jour `docs/implementation-log.md`, `CLAUDE.md` "Dernier § livré", `docs/ROADMAP.md` "Dernière mise à jour"

### Tests & CI

- `npx tsc --noEmit` après chaque chantier (jamais skipper)
- `npm test -- --run` (635-685 tests, 1 fail pré-existant `buildRunUpdatePayload` à ignorer)
- Si test failures > 1 (pré-existant) : root cause avant commit

### Push & déploiement

- `git push origin main` déclenche workflow `Deploy to GitHub Pages` (~1m30-3min)
- Demander confirmation user avant chaque push (action shared-state)
- Vérifier `gh run list --limit 1` post-push

### Mémoire / contexte

Si la session approche les ~80% de contexte, signaler et proposer `/clear` + reprise depuis ce plan + `docs/audits/2026-05-10-ui-ux-audit-ios-pass3.md`.

---

## Kickoff après /clear

Pour reprendre depuis une session fraîche :

1. Lire ce plan : `docs/plans/2026-05-10-ui-ux-roadmap-to-10.md`
2. Lire l'audit pass 3 : `docs/audits/2026-05-10-ui-ux-audit-ios-pass3.md` (résultat de référence)
3. Vérifier `git log --oneline -5` pour le dernier numéro § committé
4. Démarrer Pass 4 (P1 closing) en suivant le tableau de fixes ci-dessus

Prompt kickoff suggéré (à coller dans la nouvelle session) :

```
Lis docs/plans/2026-05-10-ui-ux-roadmap-to-10.md (plan figé) et
docs/audits/2026-05-10-ui-ux-audit-ios-pass3.md (audit de référence).

Vérifie git log pour le dernier § committé. Démarre Pass 4 (P1 closing,
8 fixes file:line ~20 lignes, vers 9.0/10) puis enchaîne Pass 5 (caves
catégoriels, ~1 jour, vers 9.3/10) puis Pass 6 (WCAG AA, ~1 jour, vers 9.5/10).

Pass 7 (iOS premium polish vers 10/10) : me proposer le détail avant
d'attaquer car contient des décisions UX (page transitions, haptic feedback,
Surface adoption massive 140+ fichiers).

Contraintes :
- tsc clean obligatoire après chaque chantier
- demander confirmation avant chaque git push (déploiement auto GitHub Pages)
- numérotation § = vérifier git log avant de choisir
- tests : 1 fail pré-existant `buildRunUpdatePayload` à ignorer (hérité §214)
- pas de fichier doc additionnel hors implementation-log + ROADMAP + CLAUDE.md
```

---

*Sources* :
- Audit pass 3 : `docs/audits/2026-05-10-ui-ux-audit-ios-pass3.md`
- Audit pass 2 : `docs/audits/2026-05-08-ui-ux-audit-ios-pass2.md`
- Audit pass 1 : `docs/audits/2026-05-08-ui-ux-audit-ios.md`
- Implementation log : `docs/implementation-log.md` §197-§236
