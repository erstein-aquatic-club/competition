# §215 — Découpage Dashboard.tsx (Refacto B)

*Date : 2026-05-08 — Suite §214 (quick wins post-audit).*

## Contexte

`src/pages/Dashboard.tsx` fait 1114 LOC et orchestre :
- 9 `useQuery` + 5 `useMutation`
- 11 `useState` (drawer/dialog/draft/save/alternative/auth)
- ~10 composants enfants lourds (CalendarGrid, FeedbackDrawer, ChallengeProgressBar, InlineBanner, Settings Dialog…)

**Symptôme perf** identifié par l'audit du §214 :

> État trop haut placé : `saveState`, `alternativeOverride`, `authUuid`, `drawerOpen`, etc. forcent re-render de la page entière. Quand on saisit un feedback, le calendrier re-render à chaque keystroke (`saveState` change idle → saving, `draftState` change à chaque caractère).

Estimation gain : **-50 à -80% renders calendrier** pendant la saisie d'une séance.

## Décisions de design

### Découpage

```
src/pages/Dashboard.tsx                          ≈ 250 LOC (vs 1114)
└── orchestre : auth, queries, useDashboardState
    ├── header mobile/desktop (DashboardHeaderContent existant)
    ├── banners (compétition, challenges, error)
    ├── <DashboardCalendar>                       ≈ 30 LOC, React.memo
    │     wrapper CalendarHeader + CalendarGrid
    ├── settings dialog inline (laissé en place — décision validée)
    └── <DashboardFeedbackContainer>              ≈ 350 LOC, React.memo
          state interne: saveState, alternativeOverride, draftState
          mutations: save / update / delete / absence / removeAbsence
```

### Frontière de state

| State | Localisation actuelle | Localisation §215 | Pourquoi |
|---|---|---|---|
| `saveState` | Dashboard | **DashboardFeedbackContainer** | Couplé au cycle save → ne re-render que le drawer |
| `alternativeOverride` | Dashboard | **DashboardFeedbackContainer** | Reset après mutation success → couplé au drawer |
| `draftState` | Dashboard | **DashboardFeedbackContainer** | Change à chaque keystroke → must isolate |
| `authUuid` | Dashboard | Dashboard | Utilisé par mutations (qui descendent), passé en prop stable |
| `drawerOpen` / `activeSessionId` / `detailsOpen` | useDashboardState | useDashboardState | Pilotent l'ouverture du drawer depuis le calendrier — restent up |
| Mutations save/update/delete/absence | Dashboard | **DashboardFeedbackContainer** | 100% couplées au drawer (invalident, ferment, reset) |

### Ce qui ne change PAS

- `useDashboardState` hook (262 LOC, exemplaire selon l'audit) — intact.
- `CalendarHeader`, `CalendarGrid`, `DayCell`, `FeedbackDrawer` — intacts.
- API publique → 0 call-site externe touché.
- Le settings dialog reste inline (décision validée).

### Pourquoi ce découpage et pas d'autres approches

**Approche A (retenue) — component split + React.memo**
- Cible directement la recommandation audit.
- Réduit Dashboard.tsx LOC.
- Sealing naturel des re-renders via `React.memo` sur composants extraits.

**Approche B (rejetée) — context + selectors**
- Maximally fine-grained mais nécessite zustand ou use-context-selector.
- Ne réduit pas le LOC bloat de Dashboard.tsx.
- Plus de machinery pour gain équivalent.

**Approche C (rejetée) — juste memo sur composants existants**
- Risque élevé : FeedbackDrawer prend ~25 props avec plusieurs handlers inline.
- Toute prop instable casse silencieusement le memo.
- Ne traite pas le LOC bloat.

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| Refresh `authUuid` reste dans Dashboard mais utilisé par mutations qui descendent | Passer `authUuid` en prop stable au container |
| Auto-close drawer quand journée terminée (effect dépendant de `selectedDayStatus`) | Reste dans Dashboard (state calendrier) |
| Auto-open today via `?open=today` | Reste dans Dashboard (navigation/effect) |
| Keyboard navigation `handleCalendarKeyDown` | Reste dans Dashboard (passé au calendrier) |
| Test du flow save/update casse | Couvert par tests existants + smoke test manuel |

## Validation

- `npx tsc --noEmit` clean.
- `npm test` : 684 pass (1 fail pré-existant `transformers.test.ts:18` non lié, reste).
- Test manuel : ouvrir un feedback, taper dans les champs, vérifier en DevTools React Profiler que `<DashboardCalendar>` n'apparaît plus dans le commit tree.

## Out of scope §215

- Settings dialog extraction (validé non extrait pour ce §).
- Refacto C — RPC `get_coach_kpis` (chantier dédié).
- Refacto D — Trio Records (chantier dédié).
- Refacto A — Façade morte `api.ts:432-1039` (chantier dédié, 439 call-sites en codemod).
