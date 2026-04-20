# Mon plan muscu — Timeline hebdomadaire (Design Doc)

**Date :** 2026-04-20
**Statut :** Prêt à implémenter (Phase 1 uniquement — zéro migration BDD)
**Périmètre :** `src/components/strength/MyPlanTab.tsx` + helpers partagés + Sheet aperçu séance
**Exécution :** déléguée à un agent Sonnet — ce document doit être auto-suffisant

---

## 1. Contexte & motivation

Aujourd'hui la vue **Mon plan** musculation (`MyPlanTab.tsx`, 158 l., utilisée dans `Strength.tsx` onglet "Mon plan" et dans `SuiviPlanification.tsx` onglet "Musculation") affiche le plan comme un **empilement de cycles** (dossiers) :

```
[S13 — Force (03/03-09/03)]
  Lun — Force haut
  Mer — Force bas
  Ven — Force full

[S14 — Puissance (10/03-16/03)]
  Lun — Pliométrie
  ...
```

La vue **Planification natation** (`SwimPlanningAthleteView.tsx`, 1007 l., intégrée en `embedded` dans le même `SuiviPlanification.tsx`) propose une UX supérieure :

- Timeline verticale de **semaines ISO** avec infinite scroll.
- Carte semaine collapse → expand sur tap, micro-grille 7 jours × 2 créneaux.
- Badge `week_type` coloré, dots preview filières, badge "Perso", intégration compétitions.
- Semaine courante en évidence (`ring-primary`).

**Objectif Phase 1** : aligner l'UI de Mon plan muscu sur ce pattern **sans migration BDD**, en projetant les cycles existants sur une timeline hebdomadaire. Un cycle `S13-S15` génère 3 cartes semaines (S13, S14, S15) portant les mêmes séances. Zéro changement de modèle, gain UX immédiat.

> Phase 2 (table `strength_planning_slots` pour per-week slot assignment) et Phase 3 (éditeur coach) sont **hors scope** de ce design et seront traitées séparément.

---

## 2. État actuel — ce qui existe

### 2.1 Structure data

```
strength_folders (type='session')
├── Root (athlete_id = <nageur>, parent_id = null)
│   ├── Cycle "S13 — Force (03/03-09/03)"  parent_id = Root.id
│   │   └── strength_session_templates (folder_id = Cycle.id)
│   │       ├── "Lun — Force haut" (items[])
│   │       └── "Mer — Force bas" (items[])
│   ├── Cycle "S14-S15 — Puissance (10/03-23/03)"
│   │   └── ...
```

Le parsing actuel (`MyPlanTab.tsx`:264-266) :
- `shortLabel` = `/^(S\d+(?:-S\d+)?)/` (ex: `S13`, `S14-S15`)
- Date display = match `/\((.+)\)/`
- `phaseName` = nom après `— ` et avant ` (`

### 2.2 Fichiers touchés aujourd'hui

| Fichier | Rôle | Action Phase 1 |
|---|---|---|
| `src/components/strength/MyPlanTab.tsx` | Onglet Mon plan (158 l.) | **Refactor complet** |
| `src/lib/planCheckHelpers.ts` | Check localStorage par ISO week | **Réutiliser tel quel** |
| `src/components/coach/swim/swimPlanningShared.ts` | WeekInfo, getMonday, generateWeeks, DAY_ROWS, fmtDD_MM, isCurrentWeek (75 l.) | **Réutiliser tel quel** (importer depuis swim — acceptable pour Phase 1) |
| `src/pages/SuiviPlanification.tsx` | Parent de MyPlanTab embedded | **Fix bug** : le `onSelectSession` actuel navigue vers `/strength` sans contexte de séance |
| `src/pages/Strength.tsx` | Parent de MyPlanTab en mode list | **Aucun changement** (continue d'appeler `startPlanSession` directement) |

### 2.3 Contraintes connues

- Les cycles sont **nommés par le coach** — le parsing du nom est **best effort**. On doit tolérer les noms non conformes.
- Certaines séances ont `items.length === 0` (cas pool-only : exclues, cf. `MyPlanTab.tsx`:212).
- Un cycle peut porter sur plusieurs semaines (`S13-S15`) ou une seule (`S13`).
- Pas de mapping explicite session ↔ jour — uniquement le préfixe `Lun/Mar/...` dans le titre (regex dans `DAY_ORDER`).
- Pas de distinction Matin/Soir côté muscu (typiquement 1 séance/jour).

---

## 3. Décisions de design

| Question | Choix | Justification |
|---|---|---|
| Unité d'affichage | Carte par **semaine ISO** | Parité avec natation, lisibilité |
| Expansion par défaut | **Repliée**, sauf semaine courante → **ouverte** | Réduit densité visuelle, focus sur l'actif |
| Grille expand | **7 lignes jour × 1 colonne** (pas de Matin/Soir) | Muscu = 1 séance/jour par convention |
| Semaines vides | **Afficher quand même** si incluses dans la plage d'un cycle | Cohérence temporelle, visuel "repos" |
| Semaines sans cycle | **Masquées** (contrairement au swim qui montre toutes les semaines futures) | Le muscu n'a pas de notion de "groupe par défaut", une semaine sans plan = pas de carte |
| Répétition intra-cycle | Séances du cycle **dupliquées** sur chaque semaine de la plage | Phase 1 sans BDD : pas d'autre moyen |
| Check per week | **localStorage déjà en place**, clé ISO week | Déjà fonctionnel |
| Auto-check | **Runs completed filtré par weekStart de CETTE carte** (pas la semaine courante) | Correction du comportement actuel qui filtre uniquement la semaine courante |
| Tap séance | **Bottom Sheet aperçu** (nom, phase, liste items, bouton Lancer) | Parité UX Sheet natation |
| "Lancer la séance" depuis Sheet | Délègue au parent via `onSelectSession` | Ne change pas le contrat existant |
| Compétitions | **Inclure** — ambre sur la semaine + chip Trophée tappable | Parité UX, `useCompetitionsByWeek` extrait en hook réutilisable |
| Infinite scroll | **Non en Phase 1** — toutes les semaines du plan tiennent en mémoire | Nombre de cycles borné (~10-20 cycles/saison) |
| Current week ring | **Oui** `ring-2 ring-primary` | Parité UX |
| Badge "Perso" | **Non applicable** en Phase 1 (pas de override) | Réservé Phase 2 |
| week_type badge | **Mappé sur phase** (reprise/force/puissance/taper/compét) | Détecté via `detectPhase()` existant |

---

## 4. Architecture cible

### 4.1 Nouvelle structure de fichiers

```
src/components/strength/
├── MyPlanTab.tsx                     # Refactoré — devient un wrapper mince
├── MyPlanWeekCard.tsx                # NOUVEAU — carte semaine (collapse/expand)
├── MyPlanSessionRow.tsx              # NOUVEAU — ligne jour + séance (dans expand)
└── MyPlanSessionSheet.tsx            # NOUVEAU — Bottom Sheet aperçu séance

src/lib/strength/
├── strengthPlanWeeks.ts              # NOUVEAU — pur : expand cycles → WeekInstance[]
└── strengthPhaseStyles.ts            # NOUVEAU — extrait PHASE_STYLES + detectPhase

src/hooks/
└── useCompetitionsByWeek.ts          # NOUVEAU — extrait du swim view, partagé
```

### 4.2 Types

```ts
// src/lib/strength/strengthPlanWeeks.ts

import type { StrengthSessionTemplate, StrengthFolder } from "@/lib/api/types";
import type { WeekInfo } from "@/components/coach/swim/swimPlanningShared";

export type StrengthPhase =
  | "reprise" | "force" | "puissance" | "taper" | "compétition";

export interface WeekSession {
  /** dayIndex 0=Lun..6=Dim — -1 si pas de préfixe jour détecté */
  dayIndex: number;
  dayLabel: string | null; // "Lun", "Mar"... ou null
  session: StrengthSessionTemplate;
  cleanTitle: string;     // titre sans préfixe jour
}

export interface WeekInstance {
  week: WeekInfo;           // réutilise swimPlanningShared.WeekInfo
  cycleId: number;          // id du strength_folder cycle source
  cycleName: string;        // nom brut du dossier (utile pour debug)
  cycleShortLabel: string;  // "S13" ou ""
  phase: StrengthPhase;
  phaseName: string;        // "Force", "Puissance"...
  dateRangeLabel: string | null; // ex: "03/03-09/03" si présent dans nom cycle
  sessions: WeekSession[];  // triés par dayIndex
}
```

### 4.3 Pure function — explosion cycles → semaines

```ts
// src/lib/strength/strengthPlanWeeks.ts

/**
 * Given root folder + its cycle sub-folders + all sessions,
 * produce an ordered list of WeekInstance — one card per ISO week covered.
 *
 * Parsing du nom du cycle :
 *  - shortLabel: regex /^(S\d+(?:-S\d+)?)/
 *  - Si plage "S13-S15" : génère 3 WeekInstance (S13, S14, S15)
 *  - Si simple "S13"    : 1 WeekInstance
 *  - Si rien à parser   : fallback sur startWeekFromDate basé sur l'index
 *    du cycle dans rootFolders (1 semaine à partir de Monday courant + i*7)
 *
 * Tri : par weekKey ASC (chronologique). Cycles contigus aux semaines contiguës.
 *
 * Dédup : si 2 cycles couvrent la même ISO week (édition coach maladroite),
 * on garde les DEUX mais un cycle = une WeekInstance distincte (2 cartes même week).
 */
export function buildWeekInstances(
  rootFolder: StrengthFolder,
  cycles: StrengthFolder[],
  sessionsByFolder: Map<number, StrengthSessionTemplate[]>,
): WeekInstance[];

/** Détecte numéros S13-S15 ou S13 dans le nom, retourne [startSNum, endSNum] */
export function parseWeekRange(cycleName: string): [number, number] | null;

/** Construit un WeekInfo à partir d'un numéro S basé sur l'année courante */
export function weekInfoFromSNumber(sNum: number, refDate: Date): WeekInfo;
```

**Règle de mapping S# → Monday date** :
- Calculer l'année ISO en cours selon `refDate` (par défaut aujourd'hui).
- Utiliser `Date` + offset pour trouver le lundi de la semaine ISO N de l'année.
- Si `sNum < weekNumber(refDate) - 26` → assumer année suivante (wrap autour du changement d'année).

### 4.4 Hook — compétitions par semaine (extrait du swim)

```ts
// src/hooks/useCompetitionsByWeek.ts

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getMonday } from "@/components/coach/swim/swimPlanningShared";
import type { Competition } from "@/lib/api/types";

export function useCompetitionsByWeek(userId: number | null | undefined) {
  const { data: allCompetitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const { data: myCompetitionIds } = useQuery({
    queryKey: ["my-competition-ids", userId],
    queryFn: () => api.getMyCompetitionIds(userId),
    enabled: !!userId,
  });

  const visibleCompetitions = useMemo(() => {
    if (myCompetitionIds && myCompetitionIds.length > 0) {
      return allCompetitions.filter((c) => myCompetitionIds.includes(c.id));
    }
    return allCompetitions;
  }, [allCompetitions, myCompetitionIds]);

  const competitionsByWeek = useMemo(() => {
    const map = new Map<string, Competition[]>();
    for (const c of visibleCompetitions) {
      if (!c.date) continue;
      const start = new Date(c.date.slice(0, 10) + "T00:00:00");
      const end = c.end_date
        ? new Date(c.end_date.slice(0, 10) + "T00:00:00")
        : start;
      const cursor = getMonday(start);
      const endMonday = getMonday(end);
      while (cursor.getTime() <= endMonday.getTime()) {
        const key = cursor.toISOString().split("T")[0];
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
        cursor.setDate(cursor.getDate() + 7);
      }
    }
    return map;
  }, [visibleCompetitions]);

  const getDayCompetitions = useMemo(
    () => (weekMonday: Date, dayIndex: number): Competition[] => {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + dayIndex);
      d.setHours(0, 0, 0, 0);
      const t = d.getTime();
      return visibleCompetitions.filter((c) => {
        if (!c.date) return false;
        const start = new Date(c.date.slice(0, 10) + "T00:00:00").getTime();
        const end = c.end_date
          ? new Date(c.end_date.slice(0, 10) + "T00:00:00").getTime()
          : start;
        return t >= start && t <= end;
      });
    },
    [visibleCompetitions],
  );

  return { visibleCompetitions, competitionsByWeek, getDayCompetitions };
}
```

> **Refactor bonus** : remplacer également les blocs dupliqués dans `SwimPlanningAthleteView.tsx` (lignes 340-397) par ce hook. Coût : ~5 min, bénéfice cohérence.

---

## 5. Spécifications UI détaillées

### 5.1 Carte semaine — collapsée (header)

Structure identique à natation (`SwimPlanningAthleteView.tsx`:489-594) **adaptée muscu** :

```
┌─ [●] ── border, rounded-xl, card bg ─────────────────┐
│  S13 · 03/03 – 09/03  [FORCE]  ● ● ●        [⌄]      │
│  "Semaine de transition"                              │
│  🏆 Championnat régional  09/03                       │
└───────────────────────────────────────────────────────┘
```

Spécifications :

- **Rail vertical** gauche : `absolute left-[27px] top-8 bottom-8 w-px bg-border` (parité swim).
- **Timeline dot** par carte : `absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background`.
  - `bg-amber-500` si compétition,
  - sinon `bg-primary` si semaine courante,
  - sinon `bg-emerald-500` si sessions présentes,
  - sinon `bg-muted-foreground/25`.
- **Carte** : `rounded-xl border bg-card`. `ring-2 ring-primary` si semaine courante.
- **Header button** : `w-full text-left px-3 py-2.5 flex items-center gap-2 min-h-[48px] hover:bg-muted/40 active:bg-muted/60`.
- **Contenu header** :
  - `S{weekNumber}` en `text-xs font-bold tabular-nums`.
  - `{DD/MM} – {DD/MM}` en `text-[11px] text-muted-foreground`.
  - Badge phase : reprise/force/puissance/taper/compétition (styles = `PHASE_STYLES` extraits) — classes `text-[10px] px-1.5 py-0 border-0 shrink-0` + `bg-{phase}` + `text-{phase}`.
  - **Dots preview** : un dot par séance existante, couleur `style.dot` de la phase. `h-[6px] w-[6px] rounded-full`.
  - **Chevron** : `motion.span` rotate 180° si expand.
- **Ligne compétitions** : chip Trophée tappable (réutiliser pattern swim:553-582) → ouvre `selectedCompetition` Sheet.

### 5.2 Carte semaine — expanded (détail jours)

Différence vs natation : **1 colonne** (pas Matin/Soir).

```
┌─ expand (border-t, bg-muted/20) ──────────────────────┐
│  Lun    [🏋️ Force haut — 8 ex.]                   >   │
│  Mar    [—]                                           │
│  Mer    [🏋️ Force bas — 6 ex.]  ✓                  >  │
│  Jeu    [—]                                           │
│  Ven    [🏋️ Force full — 7 ex.]                   >   │
│  Sam    [🏆 Champ. régional — compétition]            │
│  Dim    [—]                                           │
└───────────────────────────────────────────────────────┘
```

Grille : `grid grid-cols-[48px_1fr] gap-1 items-center rounded-lg` (colonne jour + colonne séance pleine largeur).

Cas "jour compétition sans séance" : pleine largeur ambre (réutiliser pattern swim:650-677).

**`MyPlanSessionRow` — ligne séance non vide** :

- Bouton `w-full flex items-center gap-2 h-10 px-2.5 rounded-lg bg-card border border-border/50 active:scale-[0.99]`.
- Check pastille gauche : `SessionCheck` existant (h-5 w-5, vert si fait).
- Icône `Dumbbell` ou badge jour coloré (réutiliser `DAY_ORDER` existant).
- Titre séance : `text-[12px] font-medium truncate flex-1`.
- Compteur : `text-[10px] text-muted-foreground tabular-nums` `{N} ex.`.
- Chevron `ChevronRight h-3.5 w-3.5 text-muted-foreground/40`.
- Si `done` (checked) : `opacity-55`.

Cas vide : `<span className="text-[11px] text-muted-foreground/30">—</span>`.

### 5.3 Bottom Sheet aperçu séance (`MyPlanSessionSheet`)

Contrat :
```tsx
interface MyPlanSessionSheetProps {
  session: StrengthSessionTemplate | null;
  phase: StrengthPhase | null;
  onClose: () => void;
  onLaunch: (session: StrengthSessionTemplate) => void;
}
```

Contenu :
- `SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto"`.
- Titre : `Dumbbell` icon + `session.title ?? session.name` + badge phase coloré.
- Description courte si présente (`session.description`).
- Liste items (max 10 visibles, scroll) : `{exercise_name} · {sets}×{reps} @ {percent_1rm}%`.
- Footer sticky : bouton `size="lg"` **"Lancer la séance"** + bouton outline "Fermer".
- Clic "Lancer" → appelle `onLaunch(session)` puis close. Le parent décide quoi faire (navigate ou in-place).

### 5.4 État vide

Inchangé — reprendre l'écran actuel `MyPlanTab.tsx`:237-246 (`FolderOpen` + "Aucun plan personnalisé").

### 5.5 Loading

Skeleton reprend le pattern swim (`SwimPlanningAthleteView.tsx`:455-463) — 5 cartes `rounded-xl border p-3 animate-pulse`.

---

## 6. Intégration parents

### 6.1 `SuiviPlanification.tsx` (onglet Musculation)

**Bug actuel** : le callback passé à `MyPlanTab` est :
```tsx
const handleSelectSession = useCallback(() => {
  navigate("/strength");
}, [navigate]);
```
Il ignore la séance sélectionnée. Après refactor, remplacer par :

```tsx
const handleSelectSession = useCallback((session: StrengthSessionTemplate) => {
  // Navigate to /strength and pass session id via query param for auto-launch.
  navigate(`/strength?planSessionId=${session.id}`);
}, [navigate]);
```

Puis côté `Strength.tsx`, lire `planSessionId` depuis `useSearch()` (Wouter) au montage, et si présent + session trouvée dans le catalogue → appeler `startPlanSession(session)` automatiquement (effect one-shot, consume via cleanup).

> **Alternative plus simple** acceptable pour Phase 1 : conserver `navigate("/strength")` sans paramètre, et ouvrir juste l'onglet "Mon plan". La Sheet aperçu offre déjà la preview → pas besoin d'auto-launch. **Adopter cette alternative** pour limiter le scope.

### 6.2 `Strength.tsx` (onglet Mon plan)

Aucune modification — `startPlanSession` est déjà appelé directement depuis `MyPlanTab` via `onSelectSession`. Le nouveau `MyPlanTab` continue d'exposer exactement le même contrat :
```tsx
interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}
```

Mais désormais la Sheet aperçu est rendue en interne **avant** d'appeler `onSelectSession`. Le flux :
1. User tape séance → `setSelectedSession(s)`.
2. Sheet s'ouvre, user relit les détails.
3. User tape "Lancer" → `onSelectSession(s)` + close sheet.

### 6.3 Partage du scroll container

Dans `SuiviPlanification.tsx`, la vue est rendue dans un conteneur parent qui gère le scroll. Pas besoin de `h-full flex flex-col` (cf. commentaire ligne 426-428 du swim view). On reste dans un flow naturel.

---

## 7. Auto-check — correction

Le check auto actuel (`MyPlanTab.tsx`:152-165) ne considère que les runs **de la semaine courante** (`started_at >= weekStart`). Avec la timeline multi-semaines, on doit :

- Fetch **une seule fois** tous les runs completed des N dernières semaines couvertes (ex: 4 semaines) :
  ```ts
  const earliestWeekStart = weeks[0]?.week.monday.toISOString();
  // .gte("started_at", earliestWeekStart)
  ```
- Grouper par `getISOWeekKey(new Date(run.started_at))` côté client.
- Par carte semaine, `isChecked(sessionId, weekKey)` regarde le set correspondant.

**Règle** : auto-check ne s'applique qu'aux semaines **passées ou courante**. Une séance future cochée localStorage reste cochée ; une séance future auto-check est impossible de toute façon.

Le localStorage `plan-checks-${userId}` est déjà scopé par `weekKey` ISO — rien à changer côté store, seulement l'API de lecture côté composant.

---

## 8. Parsing des cycles — détail complet

### 8.1 Algorithme `buildWeekInstances`

```
Pour chaque cycle de cycles (tri sort_order ASC) :
  sessions = sessionsByFolder.get(cycle.id) ?? []
  sessions = sessions.filter(s => (s.items?.length ?? 0) > 0)
  sessions = sortByDay(sessions)  // réutiliser fonction existante
  Si sessions vide → skip

  Mapping WeekSession[] :
    sessions.map(s => {
      dayInfo = getDayInfo(s.title ?? s.name)
      → { dayIndex: dayInfo?.index ?? -1, dayLabel: dayInfo?.label ?? null, session: s, cleanTitle: stripDayPrefix(s.title ?? s.name) }
    })

  range = parseWeekRange(cycle.name)
  Si range = null :
    fallbackSNum = weekNumberOfMonday(todayMonday) + indexOfCycle
    weeks = [weekInfoFromSNumber(fallbackSNum, today)]
  Sinon :
    [start, end] = range
    weeks = range.map(n => weekInfoFromSNumber(n, today))

  Pour chaque week de weeks :
    push WeekInstance {
      week, cycleId: cycle.id, cycleName: cycle.name,
      cycleShortLabel: match[1] ?? "",
      phase: detectPhase(cycle.name),
      phaseName: extract après "—" avant "(",
      dateRangeLabel: extract (...) ou null,
      sessions: WeekSession[],
    }

Tri final instances par weekKey ASC.
```

### 8.2 Limite assumée

Si deux cycles produisent la même `weekKey` (recouvrement), on génère **deux cartes distinctes** pour cette semaine. Acceptable car :
- Cas rare (erreur de saisie coach).
- Le coach voit tout de suite le problème.
- Pas de logique de fusion complexe en Phase 1.

---

## 9. Tests

### 9.1 Unit tests — `strengthPlanWeeks.test.ts`

Fichier : `src/lib/strength/__tests__/strengthPlanWeeks.test.ts`

Cas à couvrir :

1. **Cycle simple** `"S13 — Force (03/03-09/03)"` avec 3 sessions → 1 WeekInstance, 3 sessions.
2. **Cycle plage** `"S13-S15 — Puissance"` → 3 WeekInstance, mêmes sessions dupliquées.
3. **Cycle non parseable** `"Cycle bonus"` → 1 WeekInstance fallback (semaine courante + offset).
4. **parseWeekRange** : `"S13"` → `[13, 13]`, `"S13-S15"` → `[13, 15]`, `"Semaine foo"` → `null`, `"S52-S02"` → `[52, 2]` (cas passage d'année, assumer wrap).
5. **Tri chronologique** : cycles dans le désordre → WeekInstances triées par weekKey.
6. **Sessions triées par jour** : sessions mélangées (Ven, Lun, Mer) → `sessions[]` trié Lun/Mer/Ven.
7. **Exclusion empty items** : session avec `items.length === 0` → filtrée.
8. **weekInfoFromSNumber** : S15 en 2026 → Monday correct.

### 9.2 Pas de test RLS

Cette phase **ne touche pas les policies RLS**. `npm run test:rls` **inutile** — cf. CLAUDE.md § "Quand NE PAS lancer".

### 9.3 Vérification manuelle

À faire par l'agent en fin de patch :
- `npx tsc --noEmit` passe.
- `npm test` passe (27 fichiers existants + nouveaux).
- Charger `/strength` → onglet "Mon plan" → voir timeline semaines.
- Charger `/suivi/planification` → onglet "Musculation" → voir timeline semaines.
- Taper une séance → Sheet s'ouvre → "Lancer" ferme sheet et lance la séance (ou navigue vers /strength).
- Semaine courante surlignée avec `ring-primary`.
- Cocher/décocher une séance → persistance localStorage OK après refresh.

---

## 10. Plan d'implémentation (étapes ordonnées)

À exécuter dans l'ordre par l'agent Sonnet. Chaque étape compile, ne casse rien.

### Étape 1 — Helpers purs (~1 h)
- [ ] Créer `src/lib/strength/strengthPhaseStyles.ts` → extraire `PHASE_STYLES`, `detectPhase` de `MyPlanTab.tsx`. Export type `StrengthPhase`.
- [ ] Créer `src/lib/strength/strengthPlanWeeks.ts` → types + `parseWeekRange`, `weekInfoFromSNumber`, `buildWeekInstances`. Importer helpers swim (`getMonday`, `generateWeeks`).
- [ ] Créer `src/lib/strength/__tests__/strengthPlanWeeks.test.ts` → cas §9.1.
- [ ] `npm test src/lib/strength` → vert.

### Étape 2 — Hook compétitions partagé (~30 min)
- [ ] Créer `src/hooks/useCompetitionsByWeek.ts` (copie du code swim, voir §4.4).
- [ ] Pas de tests unit — logique déjà éprouvée dans swim view.

### Étape 3 — Sheet aperçu (~1 h)
- [ ] Créer `src/components/strength/MyPlanSessionSheet.tsx` (voir §5.3).
- [ ] Réutiliser `Sheet` de `@/components/ui/sheet` (déjà importé dans swim view).
- [ ] Bouton "Lancer" = `<Button size="lg" className="w-full">`.

### Étape 4 — Composants lignes (~1 h)
- [ ] Créer `src/components/strength/MyPlanSessionRow.tsx` (voir §5.2).
- [ ] Extraire `SessionCheck` de `MyPlanTab.tsx` → déplacer dans `MyPlanSessionRow.tsx` (réduction h-6→h-5).

### Étape 5 — Carte semaine (~2 h)
- [ ] Créer `src/components/strength/MyPlanWeekCard.tsx` :
  - Props : `{ instance: WeekInstance, isCurrent: boolean, isExpanded: boolean, onToggleExpand: () => void, competitions: Competition[], getDayCompetitions: (monday: Date, dayIndex: number) => Competition[], isSessionChecked: (sessionId: number) => boolean, onToggleCheck: (sessionId: number) => void, onSelectSession: (session: StrengthSessionTemplate) => void, onSelectCompetition: (c: Competition) => void }`.
  - Header = voir §5.1.
  - Expand = voir §5.2 (1 colonne).
  - Animation framer-motion pour `AnimatePresence` expand (parité swim:597-691).

### Étape 6 — Refactor `MyPlanTab.tsx` (~2 h)
- [ ] Remplacer corps du composant :
  - Conserver queries `getStrengthFolders`, `getStrengthSessions`, `strength_session_runs` (adapter le `.gte("started_at")` pour couvrir toutes les semaines affichées — voir §7).
  - Calculer `weekInstances` via `buildWeekInstances`.
  - State local `expandedWeekKey` + `selectedSession` + `selectedCompetition`.
  - Auto-ouvrir la semaine courante au montage : `useEffect` sur weekInstances → `setExpandedWeekKey(current?.week.weekKey ?? null)`.
  - Rail vertical `absolute` même classes que swim view (§5.1).
  - Map `weekInstances.map(inst => <MyPlanWeekCard ... />)`.
  - Monter `<MyPlanSessionSheet />` et `<Sheet>` compétition en bas du JSX.
  - Quand Sheet séance "Lancer" → `onSelectSession(session)` + close.
- [ ] Conserver l'empty state `rootFolders.length === 0` (§5.4).

### Étape 7 — Nettoyage parents (~15 min)
- [ ] `src/pages/SuiviPlanification.tsx` :
  - Remplacer `handleSelectSession` par `useCallback((_s) => navigate("/strength"), [navigate])` (simple navigate, pas de param — cf. §6.1 alternative retenue).
  - Typer proprement le callback : `(session: StrengthSessionTemplate) => void`.
- [ ] `src/pages/Strength.tsx` : aucun changement.

### Étape 8 — Docs obligatoires (CLAUDE.md §workflow) (~20 min)
- [ ] Ajouter entrée §155 dans `docs/implementation-log.md` :
  - Titre, contexte, changements, fichiers modifiés (+ nouveaux), décisions, limites.
- [ ] Mettre à jour `docs/claude/files-map.md` :
  - **Nouveaux fichiers ≥ 150 lignes OU rôle architectural** : `MyPlanWeekCard.tsx`, `strengthPlanWeeks.ts`, `useCompetitionsByWeek.ts`. Ajouter avec `wc -l` mesuré.
  - Fichiers < 150 l. sans rôle hub (sheet, row, styles) : optionnel, préférer ne PAS ajouter.
  - `MyPlanTab.tsx` : variation taille > 30% → mettre à jour.
- [ ] Mettre à jour `docs/ROADMAP.md` :
  - Nouvelle ligne §155 avec statut **Fait**.
  - Mettre à jour ligne `*Dernière mise à jour*` en tête.
- [ ] Mettre à jour `docs/FEATURES_STATUS.md` si une feature "plan muscu" y figure (vérifier grep `plan muscu|Mon plan`).
- [ ] Mettre à jour `CLAUDE.md` :
  - Phrase "Dernière entrée en date : §155".

### Étape 9 — Vérification finale
- [ ] `npx tsc --noEmit` → 0 erreur.
- [ ] `npm test` → vert (y compris nouveau test file).
- [ ] Lancer `npm run dev` mentalement (l'agent ne touchera pas au navigateur — juste vérifier compile).
- [ ] Pas de commit sans que tout passe.

---

## 11. Risques & fallbacks

| Risque | Impact | Mitigation |
|---|---|---|
| Parsing nom cycle fragile | Cartes mal positionnées | Fallback `weekInfoFromSNumber` robuste + tests unitaires §9.1 |
| Regression tests existants | Break build | Ne pas toucher `Strength.tsx` — signature `MyPlanTabProps` identique |
| Performance avec 20+ cycles | Jank scroll | Phase 1 : pas d'infinite scroll, rendu plat. À profiler si > 50 cartes |
| Duplication sessions sur plage | Confusion utilisateur | Accepter en Phase 1. Documenter dans release note. Phase 2 résout avec vraies slots |
| Imports depuis `swim/swimPlanningShared` | Couplage strength ↔ swim | Acceptable Phase 1. Extraire dans `src/lib/dateWeeks.ts` si Phase 2 étend côté muscu |

---

## 12. Hors scope (explicite)

- ❌ Migration BDD `strength_planning_slots`.
- ❌ Éditeur coach de plan hebdo muscu.
- ❌ Override per-athlete muscu.
- ❌ Badge "Perso" côté muscu.
- ❌ Colonnes Matin/Soir muscu.
- ❌ Intégration Sheet filière côté muscu (le muscu n'a pas de filières).
- ❌ Refactor `SwimPlanningAthleteView` pour utiliser `useCompetitionsByWeek` (peut être fait en bonus, sinon laisser pour plus tard).
- ❌ Infinite scroll muscu.

Ces points sont tracés pour Phase 2 dans `docs/ROADMAP.md` (à ajouter au moment de la clôture §155).

---

## 13. Critères d'acceptation

1. **Visuel** : la timeline muscu reprend la grammaire visuelle swim (carte semaine + rail + timeline dot + ring-primary semaine courante + expand/collapse).
2. **Parité** : compétitions apparaissent dans les cartes semaine muscu avec le même traitement ambre que dans le swim view.
3. **Fonctionnel** : tap séance → Sheet aperçu. "Lancer" → séance démarre (Strength.tsx) ou navigate (SuiviPlanification).
4. **Persistance** : check séance survit au refresh (localStorage `plan-checks-${userId}`).
5. **Performance** : TTI onglet Mon plan < 500 ms sur un plan de 10 cycles × 3 séances (mesure informelle : pas de pause perceptible).
6. **Non-regression** : `Strength.tsx` onglet Mon plan continue de lancer directement, aucun click supplémentaire.
7. **Tests** : `npx tsc --noEmit` + `npm test` verts.
8. **Docs** : §155 créé dans implementation-log + ROADMAP + files-map cohérents.

---

*Fin du design doc. L'agent Sonnet dispose de tout le contexte nécessaire pour exécuter la Phase 1 sans décisions ouvertes.*
