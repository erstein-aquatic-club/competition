# Refonte UX Coach — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructurer l'interface coach autour de 4 piliers nav (Semaine / Nageurs / Biblio / Home), créer un dashboard "Ma semaine" actionnable, consolider la fiche nageur, et fusionner les écrans redondants.

**Architecture:** 4 phases séquentielles déployables indépendamment. Les phases 1-2 modifient la navigation et le home. La phase 3 consolide la fiche nageur. La phase 4 crée 3 wrappers légers autour des composants existants (aucune réécriture d'écran). Pattern wrapper : nouveau composant qui rend les composants existants dans des tabs/toggles.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Radix UI/Shadcn, Wouter (hash routing), TanStack React Query 5, Zustand, Lucide icons

**Design doc:** `docs/plans/2026-03-28-coach-ux-refonte-design.md`

---

## Phase 1 — Nouvelle navigation (4 piliers)

### Task 1: Mettre à jour navItems.ts

**Files:**
- Modify: `src/components/layout/navItems.ts:25-33`

**Step 1: Modifier les items coach**

Remplacer le bloc coach (lignes 25-33) :

```typescript
  if (normalizedRole === "coach") {
    return [
      { href: "/coach?section=week", icon: CalendarDays, label: "Semaine" },
      { href: "/coach?section=swimmers", icon: Users, label: "Nageurs" },
      { href: "/coach?section=library", icon: Library, label: "Biblio" },
      { href: "/coach", icon: Home, label: "Home" },
    ];
  }
```

Ajouter `Library` et `Home` aux imports lucide-react (supprimer `Waves`, `LayoutGrid` des imports coach — vérifier qu'ils ne sont pas utilisés ailleurs).

**Step 2: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS (aucune erreur de type)

**Step 3: Commit**

```bash
git add src/components/layout/navItems.ts
git commit -m "refactor(coach): update bottom nav to 4 pillars (Semaine/Nageurs/Biblio/Home)"
```

---

### Task 2: Ajouter avatar + notification dans le header coach

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

**Step 1: Ajouter le header coach**

Dans `AppLayout.tsx`, ajouter un header conditionnel pour le rôle coach. Au-dessus du `{children}` dans le `<main>`, quand `role === "coach"`, afficher :
- À gauche : titre de la section courante (extraire depuis le hash URL le param `section`, mapper vers un label lisible)
- À droite : avatar coach (lien vers `/profile`) + icône Bell (lien vers `/coach?section=comms`)

Utiliser les composants existants : `Button` de shadcn, `Bell` et `User` de lucide-react.

Le mapping section → label :
```typescript
const COACH_SECTION_LABELS: Record<string, string> = {
  home: "Accueil",
  week: "Semaine",
  swimmers: "Nageurs",
  library: "Bibliothèque",
  athlete: "Fiche nageur",
  groups: "Groupes",
  competitions: "Échéances",
  comms: "Communications",
};
```

Lire la section depuis `hash` (déjà disponible via `useSyncExternalStore`).

**Step 2: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Tester visuellement**

Run: `npm run dev`
Vérifier : le header s'affiche sur toutes les pages coach avec le bon titre. L'avatar redirige vers `/profile`. La cloche redirige vers comms.

**Step 4: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "feat(coach): add section title + avatar + notification bell in coach header"
```

---

### Task 3: Mettre à jour le routeur Coach.tsx — type CoachSection + sections

**Files:**
- Modify: `src/pages/Coach.tsx:43` (CoachSection type)
- Modify: `src/pages/Coach.tsx:542-937` (Coach component)

**Step 1: Mettre à jour le type CoachSection**

Remplacer :
```typescript
type CoachSection = "home" | "swim" | "swim-library" | "strength" | "swimmers" | "messaging" | "sms" | "calendar" | "groups" | "competitions" | "objectives" | "training-slots" | "athlete";
```

Par :
```typescript
type CoachSection = "home" | "week" | "swimmers" | "library" | "athlete" | "groups" | "competitions" | "comms";
```

**Step 2: Mettre à jour les rendus conditionnels**

Dans le JSX du composant `Coach` (lignes 759-937), remplacer les rendus de section :

- `activeSection === "swim"` → supprimer (remplacé par `"week"` dans Task 5)
- `activeSection === "swim-library"` → supprimer (absorbé dans `"library"`)
- `activeSection === "strength"` → supprimer (absorbé dans `"library"`)
- `activeSection === "calendar"` → supprimer (absorbé dans `"week"`)
- `activeSection === "training-slots"` → supprimer (absorbé dans `"week"`)
- `activeSection === "objectives"` → supprimer (CoachObjectivesScreen obsolète)
- `activeSection === "messaging"` → supprimer (absorbé dans `"comms"`)
- `activeSection === "sms"` → supprimer (absorbé dans `"comms"`)

Ajouter les nouvelles sections :
- `activeSection === "week"` → `<CoachWeekView>` (Task 5, Phase 4)
- `activeSection === "library"` → `<CoachLibrary>` (Task 5, Phase 4)
- `activeSection === "comms"` → `<CoachComms>` (Task 5, Phase 4)

**IMPORTANT** : Les wrappers `CoachWeekView`, `CoachLibrary`, `CoachComms` n'existent pas encore. Pour que le build passe, créer des placeholders temporaires (fichiers vides avec un export default qui affiche "En construction"). Ils seront implémentés en Phase 4.

**Step 3: Mettre à jour les variables `shouldLoad*`**

```typescript
const shouldLoadCatalogs = activeSection === "home" || activeSection === "week";
const shouldLoadAthletes =
  activeSection === "home" ||
  activeSection === "comms" ||
  activeSection === "swimmers" ||
  activeSection === "athlete" ||
  activeSection === "week" ||
  activeSection === "groups";
const shouldLoadGroups =
  activeSection === "week" ||
  activeSection === "comms" ||
  activeSection === "groups";
```

**Step 4: Nettoyer les imports et states inutiles**

- Supprimer le lazy import de `CoachObjectivesScreen`
- Supprimer les states `swimLibraryContext` et `swimLibraryReturnSection` (la bibliothèque sera accessible directement via le pilier Biblio, plus besoin de context de retour — le lien créneaux → biblio sera géré dans le wrapper `CoachWeekView`)
- Garder tous les autres lazy imports (ils seront utilisés par les wrappers)

**Step 5: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "refactor(coach): simplify CoachSection to 7 sections, remove obsolete routes"
```

---

### Task 4: Mettre à jour les liens `onNavigate` dans CoachHome

**Files:**
- Modify: `src/pages/Coach.tsx` (CoachHome component, lignes 94-526)

**Step 1: Remplacer les sections obsolètes dans CoachHome**

Le composant `CoachHome` sera entièrement refondu en Phase 2. Pour l'instant, faire un patch minimal pour qu'il compile avec le nouveau type `CoachSection` :

- `onNavigate("swim")` → `onNavigate("week")`
- `onNavigate("strength")` → `onNavigate("library")`
- `onNavigate("calendar")` → `onNavigate("week")`
- `onNavigate("training-slots")` → `onNavigate("week")`
- `onNavigate("objectives")` → supprimer le bouton Objectifs (écran supprimé)
- `onNavigate("messaging")` → `onNavigate("comms")`
- `onNavigate("sms")` → `onNavigate("comms")`

Mettre à jour le type `CoachHomeProps` pour que `onNavigate` accepte le nouveau `CoachSection`.

**Step 2: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "fix(coach): update CoachHome navigation targets to new section names"
```

---

## Phase 2 — Dashboard Home "Ma semaine"

### Task 5: Réécrire CoachHome

**Files:**
- Modify: `src/pages/Coach.tsx` (CoachHome component, lignes 68-526)

**Step 1: Mettre à jour CoachHomeProps**

Ajouter les props nécessaires pour "Ma semaine" :

```typescript
type CoachHomeProps = {
  onNavigate: (section: CoachSection) => void;
  onOpenRecordsClub: () => void;
  onOpenAthlete: (athlete: CoachAthleteOption) => void;
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null; avatar_url?: string | null }>;
  athletesLoading: boolean;
  kpiLoading: boolean;
  fatigueAlerts: Array<{ athleteName: string; rating: number }>;
  formeScores: Map<number, number | null>;
};
```

Props supprimées (plus utilisées) :
- `onOpenRecordsAdmin` (plus dans les accès rapides)
- `mostLoadedAthlete` (plus affiché)
- `swimSessionCount` / `strengthSessionCount` (plus affiché)

**Step 2: Réécrire le JSX de CoachHome**

Structure cible (du design doc) :

```
A. Header — "Bonjour [Prénom]" + "Semaine du [date]"
B. Ma semaine — mini-grille 7 jours + label créneaux
C. Alertes — max 3, conditionnel
D. Accès rapides — grille 2×2 (Échéances, Groupes, Comms, Records)
E. Nageurs récents — 3 derniers consultés
```

**Section A — Header :**
- Récupérer le prénom du coach via `useAuth` (champ `userName` ou `display_name`)
- Calculer "Semaine du [lundi]" avec `new Date()` et formater en français

**Section B — Ma semaine :**
- Utiliser le hook `useSlotCalendar` existant pour obtenir les créneaux de la semaine courante
- Mini-grille : 7 colonnes (L M M J V S D), chaque cellule affiche :
  - `✓` (check vert) si le créneau a une séance assignée
  - `○` (cercle vide gris) si créneau sans séance
  - `·` (point discret) si pas de créneau ce jour
- Compteur : "X/Y créneaux planifiés"
- CTA si créneaux vides : "Z créneaux sans séance" → `onNavigate("week")`
- Tap sur un jour → `onNavigate("week")` (le hook `useSlotCalendar` dans `CoachWeekView` pourra être initialisé au bon jour via un state partagé ou param URL)

**Section C — Alertes :**
- Reprendre le pattern actuel des `fatigueAlerts` (déjà dans les props)
- Limiter à 3 alertes max
- Tap → `onOpenAthlete`
- Section masquée si `fatigueAlerts.length === 0`

**Section D — Accès rapides :**
Grille 2×2 :
```typescript
const quickAccess = [
  { label: "Échéances", icon: CalendarDays, action: () => onNavigate("competitions"), color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/30" },
  { label: "Groupes", icon: UsersRound, action: () => onNavigate("groups"), color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  { label: "Comms", icon: BellRing, action: () => onNavigate("comms"), color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" },
  { label: "Records", icon: Trophy, action: onOpenRecordsClub, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30" },
];
```

**Section E — Nageurs récents :**
- Lire les IDs des 3 derniers nageurs consultés depuis `localStorage` (clé `eac-recent-coaches-athletes`)
- Filtrer avec le tableau `athletes` des props pour obtenir les infos
- Si aucun nageur récent, afficher "Aucun nageur consulté récemment"
- Tap → `onOpenAthlete`

**Step 3: Ajouter la persistance "nageurs récents" dans handleOpenAthlete**

Dans le composant `Coach` (fonction `handleOpenAthlete`), ajouter :

```typescript
const handleOpenAthlete = (athlete: CoachAthleteOption) => {
  // Persist to recent athletes (max 3)
  const RECENT_KEY = "eac-recent-coach-athletes";
  if (athlete.id != null) {
    const recent: number[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const updated = [athlete.id, ...recent.filter((id) => id !== athlete.id)].slice(0, 3);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  }
  // ... existing logic
};
```

**Step 4: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Tester visuellement**

Run: `npm run dev`
Vérifier :
- Le dashboard affiche la mini-grille semaine
- Les alertes apparaissent si données de fatigue
- Les accès rapides naviguent correctement
- Les nageurs récents se mettent à jour après consultation

**Step 6: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(coach): rewrite CoachHome as 'Ma semaine' dashboard with week grid and quick access"
```

---

## Phase 3 — Fiche nageur consolidée

### Task 6: Restructurer les onglets de CoachSwimmerDetail

**Files:**
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx`

**Step 1: Changer le type d'onglets**

Remplacer :
```typescript
type CoachSwimmerTab = "resume" | "suivi" | "echanges" | "planif";
```

Par :
```typescript
type CoachSwimmerTab = "resume" | "planning" | "echanges" | "comms";
```

**Step 2: Restructurer l'onglet Planning (ex "planif" + "suivi")**

Le nouvel onglet `"planning"` fusionne :
- **Objectifs** (ex `SwimmerObjectivesTab` du tab "suivi")
- **Créneaux perso** (ex `SwimmerSlotsTab` du tab "planif")
- **Macro-cycles** (ex `SwimmerPlanningTab` du tab "planif")

Chacun dans un `Collapsible` ouvert par défaut (pattern déjà utilisé dans le tab "planif" actuel).

```tsx
<TabsContent value="planning" className="mt-4 space-y-4">
  <Collapsible defaultOpen>
    <CollapsibleTrigger asChild>
      <button type="button" className="w-full flex items-center gap-2 group">
        <Target className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Objectifs</h2>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </button>
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2">
      <SwimmerObjectivesTab athleteId={athleteId} athleteName={displayName} />
    </CollapsibleContent>
  </Collapsible>

  <Collapsible defaultOpen>
    <CollapsibleTrigger asChild>
      <button type="button" className="w-full flex items-center gap-2 group">
        <CalendarClock className="h-4 w-4 text-blue-500" />
        <h2 className="text-sm font-semibold">Créneaux</h2>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </button>
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2">
      <SwimmerSlotsTab
        athleteId={athleteId}
        athleteName={displayName}
        groupId={profile?.group_id ?? 0}
      />
    </CollapsibleContent>
  </Collapsible>

  <Collapsible defaultOpen>
    <CollapsibleTrigger asChild>
      <button type="button" className="w-full flex items-center gap-2 group">
        <CalendarRange className="h-4 w-4 text-emerald-500" />
        <h2 className="text-sm font-semibold">Macro-cycles</h2>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </button>
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2">
      <SwimmerPlanningTab athleteId={athleteId} />
    </CollapsibleContent>
  </Collapsible>
</TabsContent>
```

**Step 3: Restructurer l'onglet Échanges (fusion feedback + entretiens)**

Le nouvel onglet `"echanges"` fusionne `SwimmerFeedbackTab` et `SwimmerInterviewsTab` dans une timeline chronologique inversée.

Créer un composant inline `MergedExchangesTimeline` qui :
1. Récupère les données de feedback (sessions) et entretiens (déjà queryés dans le composant parent)
2. Fusionne les deux listes en une seule, triée par date décroissante
3. Affiche chaque item avec un badge de type ("Feedback" ou "Entretien")

Pour la V1, garder le rendu simple : afficher les deux composants existants l'un sous l'autre avec des labels de section, triés par date n'est pas possible sans modifier les composants internes. Donc pour l'instant :

```tsx
<TabsContent value="echanges" className="mt-4 space-y-4">
  <section className="space-y-2">
    <div className="flex items-center gap-2">
      <MessageSquare className="h-4 w-4 text-violet-500" />
      <h2 className="text-sm font-semibold">Entretiens</h2>
    </div>
    <SwimmerInterviewsTab athleteId={athleteId} athleteName={displayName} />
  </section>

  <section className="space-y-2">
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-blue-500" />
      <h2 className="text-sm font-semibold">Ressentis séances</h2>
    </div>
    <SwimmerFeedbackTab athleteId={athleteId} athleteName={displayName} showProgressAction={false} />
  </section>
</TabsContent>
```

**Step 4: Ajouter l'onglet Comms (nouveau)**

Nouvel onglet pour contacter le nageur directement depuis sa fiche.

```tsx
<TabsContent value="comms" className="mt-4 space-y-3">
  <div className="rounded-2xl border bg-card p-4 space-y-3">
    <p className="text-sm font-semibold">Envoyer un message</p>
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => {
          // Navigate to comms section with pre-selected athlete
          // For V1: simple navigation, pre-selection can be added later
          window.location.hash = "#/coach?section=comms";
        }}
      >
        <Bell className="mr-1.5 h-3.5 w-3.5" />
        Notification
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => {
          window.location.hash = "#/coach?section=comms";
        }}
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
        SMS
      </Button>
    </div>
  </div>
</TabsContent>
```

**Step 5: Mettre à jour le TabsList**

Remplacer la grille 2×2 actuelle :
```tsx
<TabsList className="grid h-auto w-full grid-cols-4 gap-1.5 bg-transparent p-0">
  <TabsTrigger value="resume" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
    Résumé
  </TabsTrigger>
  <TabsTrigger value="planning" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
    Planning
  </TabsTrigger>
  <TabsTrigger value="echanges" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
    Échanges
  </TabsTrigger>
  <TabsTrigger value="comms" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
    Comms
  </TabsTrigger>
</TabsList>
```

**Step 6: Mettre à jour l'onglet Résumé**

Les tiles du résumé pointent vers les nouveaux onglets :
- Tile "Suivi" → `setActiveTab("echanges")`
- Tile "Échanges" → `setActiveTab("echanges")`
- Tile "Planif" → `setActiveTab("planning")`
- Tile "Objectifs" → `setActiveTab("planning")`

**Step 7: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 8: Tester visuellement**

Run: `npm run dev`
Vérifier :
- Les 4 onglets sont visibles et fonctionnels
- Planning montre objectifs + créneaux + macro-cycles en accordéon
- Échanges montre entretiens + feedback
- Comms affiche les boutons Notification et SMS

**Step 9: Commit**

```bash
git add src/pages/coach/CoachSwimmerDetail.tsx
git commit -m "feat(coach): consolidate swimmer detail — Planning/Échanges/Comms tabs"
```

---

### Task 7: Supprimer CoachObjectivesScreen

**Files:**
- Delete: `src/pages/coach/CoachObjectivesScreen.tsx`
- Modify: `src/pages/Coach.tsx` (supprimer le lazy import)

**Step 1: Supprimer le fichier**

```bash
rm src/pages/coach/CoachObjectivesScreen.tsx
```

**Step 2: Supprimer le lazy import dans Coach.tsx**

Supprimer la ligne :
```typescript
const CoachObjectivesScreen = lazy(() => import("./coach/CoachObjectivesScreen"));
```

Et s'assurer que le rendu conditionnel `activeSection === "objectives"` a bien été supprimé dans Task 3.

**Step 3: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS (aucune référence restante à CoachObjectivesScreen)

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(coach): remove obsolete CoachObjectivesScreen (objectives now in swimmer detail)"
```

---

## Phase 4 — Fusions d'écrans (3 wrappers)

### Task 8: Créer CoachWeekView (wrapper semaine/mois)

**Files:**
- Create: `src/pages/coach/CoachWeekView.tsx`
- Modify: `src/pages/Coach.tsx` (remplacer le placeholder)

**Step 1: Créer le composant**

```tsx
import { useState } from "react";
import { Suspense, lazy } from "react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Button } from "@/components/ui/button";
import { CalendarDays, CalendarRange } from "lucide-react";
import type { SwimLibraryEntryContext } from "./swimLibraryEntryContext";

const CoachTrainingSlotsScreen = lazy(() => import("./CoachTrainingSlotsScreen"));
const CoachCalendar = lazy(() => import("./CoachCalendar"));
const SwimCatalog = lazy(() => import("./SwimCatalog"));

type CoachWeekViewProps = {
  groups: Array<{ id: number; name: string }>;
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null }>;
  swimSessions?: unknown[];
  strengthSessions?: unknown[];
};

type ViewMode = "week" | "month";

export default function CoachWeekView({ groups, athletes, swimSessions, strengthSessions }: CoachWeekViewProps) {
  const [mode, setMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("eac-coach-week-mode") as ViewMode) || "week";
  });
  const [libraryContext, setLibraryContext] = useState<SwimLibraryEntryContext | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  const toggleMode = (newMode: ViewMode) => {
    setMode(newMode);
    localStorage.setItem("eac-coach-week-mode", newMode);
  };

  if (showLibrary) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <SwimCatalog
          entryContext={libraryContext}
          onEntryContextConsumed={() => setLibraryContext(null)}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toggle semaine / mois */}
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant={mode === "week" ? "default" : "ghost"}
          size="sm"
          onClick={() => toggleMode("week")}
          className="h-8 gap-1.5 text-xs"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Semaine
        </Button>
        <Button
          variant={mode === "month" ? "default" : "ghost"}
          size="sm"
          onClick={() => toggleMode("month")}
          className="h-8 gap-1.5 text-xs"
        >
          <CalendarRange className="h-3.5 w-3.5" />
          Mois
        </Button>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        {mode === "week" ? (
          <CoachTrainingSlotsScreen
            groups={groups}
            onOpenLibrary={(context) => {
              setLibraryContext(context ?? null);
              setShowLibrary(true);
            }}
          />
        ) : (
          <CoachCalendar
            athletes={athletes}
            groups={groups}
            swimSessions={swimSessions}
            strengthSessions={strengthSessions}
          />
        )}
      </Suspense>
    </div>
  );
}
```

**Note :** Vérifier les props exactes de `CoachTrainingSlotsScreen` et `CoachCalendar` en lisant leurs fichiers. Les props ci-dessus sont basées sur les appels actuels dans `Coach.tsx`. Adapter si nécessaire (notamment `onBack` qui n'est plus utile dans le wrapper).

**Step 2: Brancher dans Coach.tsx**

Remplacer le placeholder de la section `"week"` :
```tsx
{activeSection === "week" ? (
  <Suspense fallback={<PageSkeleton />}>
    <CoachWeekView
      groups={groups}
      athletes={athletes}
      swimSessions={swimSessions}
      strengthSessions={strengthSessions}
    />
  </Suspense>
) : null}
```

**Step 3: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Tester visuellement**

Run: `npm run dev`
Vérifier : le toggle semaine/mois fonctionne, les deux vues se chargent correctement, la préférence persiste en localStorage.

**Step 5: Commit**

```bash
git add src/pages/coach/CoachWeekView.tsx src/pages/Coach.tsx
git commit -m "feat(coach): create CoachWeekView wrapper (week/month toggle)"
```

---

### Task 9: Créer CoachLibrary (wrapper nage/muscu)

**Files:**
- Create: `src/pages/coach/CoachLibrary.tsx`
- Modify: `src/pages/Coach.tsx` (remplacer le placeholder)

**Step 1: Créer le composant**

```tsx
import { useState, Suspense, lazy } from "react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Waves, Dumbbell } from "lucide-react";
import { FEATURES } from "@/lib/features";

const SwimCatalog = lazy(() => import("./SwimCatalog"));
const StrengthCatalog = lazy(() => import("./StrengthCatalog"));

type LibraryTab = "swim" | "strength";

export default function CoachLibrary() {
  const [tab, setTab] = useState<LibraryTab>(() => {
    return (localStorage.getItem("eac-coach-library-tab") as LibraryTab) || "swim";
  });

  const switchTab = (newTab: LibraryTab) => {
    setTab(newTab);
    localStorage.setItem("eac-coach-library-tab", newTab);
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1.5 rounded-xl border bg-card p-1">
        <button
          type="button"
          onClick={() => switchTab("swim")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "swim"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Waves className="h-4 w-4" />
          Natation
        </button>
        <button
          type="button"
          onClick={() => switchTab("strength")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "strength"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Dumbbell className="h-4 w-4" />
          Musculation
        </button>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        {tab === "swim" ? (
          <SwimCatalog />
        ) : FEATURES.coachStrength ? (
          <StrengthCatalog />
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            Musculation coach en cours de finalisation.
          </div>
        )}
      </Suspense>
    </div>
  );
}
```

**Step 2: Brancher dans Coach.tsx**

Remplacer le placeholder de la section `"library"` :
```tsx
{activeSection === "library" ? (
  <Suspense fallback={<PageSkeleton />}>
    <CoachLibrary />
  </Suspense>
) : null}
```

**Step 3: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/pages/coach/CoachLibrary.tsx src/pages/Coach.tsx
git commit -m "feat(coach): create CoachLibrary wrapper (swim/strength tabs)"
```

---

### Task 10: Créer CoachComms (wrapper notifications/SMS)

**Files:**
- Create: `src/pages/coach/CoachComms.tsx`
- Modify: `src/pages/Coach.tsx` (remplacer le placeholder)

**Step 1: Créer le composant**

```tsx
import { useState, Suspense, lazy } from "react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Bell, MessageSquare } from "lucide-react";

const CoachMessagesScreen = lazy(() => import("./CoachMessagesScreen"));
const CoachSmsScreen = lazy(() => import("./CoachSmsScreen"));

type CommsTab = "notifications" | "sms";

type CoachCommsProps = {
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null }>;
  groups: Array<{ id: number; name: string }>;
  athletesLoading: boolean;
};

export default function CoachComms({ athletes, groups, athletesLoading }: CoachCommsProps) {
  const [tab, setTab] = useState<CommsTab>("notifications");

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1.5 rounded-xl border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "notifications"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Bell className="h-4 w-4" />
          Notifications
        </button>
        <button
          type="button"
          onClick={() => setTab("sms")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "sms"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <MessageSquare className="h-4 w-4" />
          SMS
        </button>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        {tab === "notifications" ? (
          <CoachMessagesScreen
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
          />
        ) : (
          <CoachSmsScreen
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
          />
        )}
      </Suspense>
    </div>
  );
}
```

**Note :** Les composants `CoachMessagesScreen` et `CoachSmsScreen` ont un prop `onBack`. Dans le wrapper, ne pas le passer (le bouton retour n'est plus nécessaire puisque la section est accessible directement via la bottom nav Home → Accès rapides). Vérifier que les composants gèrent `onBack` optionnel — si c'est required, le rendre optional dans leur interface.

**Step 2: Brancher dans Coach.tsx**

```tsx
{activeSection === "comms" ? (
  <Suspense fallback={<PageSkeleton />}>
    <CoachComms
      athletes={athletes}
      groups={groups}
      athletesLoading={athletesLoading}
    />
  </Suspense>
) : null}
```

**Step 3: Vérifier le build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/pages/coach/CoachComms.tsx src/pages/Coach.tsx
git commit -m "feat(coach): create CoachComms wrapper (notifications/SMS tabs)"
```

---

### Task 11: Nettoyage final et vérification

**Files:**
- Modify: `src/pages/Coach.tsx` (cleanup imports, remove dead code)
- Modify: `docs/ROADMAP.md` (ajouter chantier §92)
- Modify: `docs/implementation-log.md` (ajouter entrée)
- Modify: `CLAUDE.md` (mettre à jour fichiers clés + chantier)

**Step 1: Nettoyer Coach.tsx**

- Supprimer les lazy imports de composants qui ne sont plus utilisés directement (ils sont importés dans les wrappers) : `CoachTrainingSlotsScreen`, `CoachCalendar`, `SwimCatalog`, `StrengthCatalog`, `CoachMessagesScreen`, `CoachSmsScreen`
- Supprimer `ComingSoon` import et `FEATURES` import si plus utilisés
- Supprimer les types et states qui ne sont plus nécessaires (`SwimLibraryEntryContext`, etc.)
- Vérifier que tous les chemins d'exécution utilisent les nouveaux noms de section

**Step 2: Vérifier le build final**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS sans erreur ni warning

**Step 3: Tester le parcours complet**

Run: `npm run dev`
Vérifier :
- Bottom nav : 4 items, chacun navigue correctement
- Home : dashboard "Ma semaine" avec grille, alertes, accès rapides, nageurs récents
- Semaine : toggle semaine/mois fonctionne
- Nageurs : liste + fiche nageur avec 4 onglets consolidés
- Biblio : tabs nage/muscu
- Accès rapides : Échéances, Groupes, Comms, Records fonctionnent
- Fiche nageur → onglet Planning : objectifs + créneaux + cycles
- Fiche nageur → onglet Échanges : entretiens + feedback
- Fiche nageur → onglet Comms : boutons notification/SMS

**Step 4: Mettre à jour la documentation**

Ajouter dans `docs/ROADMAP.md` le chantier §92 :
```markdown
### §92 — Refonte UX Coach (navigation, home, fiche nageur, fusions)
```

Ajouter dans `docs/implementation-log.md` une entrée complète.

Mettre à jour `CLAUDE.md` :
- Ajouter les 3 nouveaux fichiers dans le tableau des fichiers clés
- Marquer le chantier §92 comme fait

**Step 5: Commit final**

```bash
git add -A
git commit -m "feat(coach): complete UX refonte — 4-pillar nav, Ma semaine dashboard, consolidated swimmer detail, screen wrappers (§92)"
```

---

## Résumé des tâches

| # | Task | Phase | Fichiers principaux | Estimation |
|---|------|-------|--------------------|----|
| 1 | Mettre à jour navItems.ts | 1 | `navItems.ts` | 5 min |
| 2 | Header coach (avatar + notification) | 1 | `AppLayout.tsx` | 15 min |
| 3 | Refactorer Coach.tsx sections | 1 | `Coach.tsx` | 20 min |
| 4 | Patcher CoachHome navigation | 1 | `Coach.tsx` | 10 min |
| 5 | Réécrire CoachHome "Ma semaine" | 2 | `Coach.tsx` | 45 min |
| 6 | Consolider CoachSwimmerDetail | 3 | `CoachSwimmerDetail.tsx` | 30 min |
| 7 | Supprimer CoachObjectivesScreen | 3 | `CoachObjectivesScreen.tsx` | 5 min |
| 8 | Créer CoachWeekView | 4 | `CoachWeekView.tsx` | 20 min |
| 9 | Créer CoachLibrary | 4 | `CoachLibrary.tsx` | 15 min |
| 10 | Créer CoachComms | 4 | `CoachComms.tsx` | 15 min |
| 11 | Nettoyage + docs | 4 | Multiples | 20 min |

**Total : ~11 tâches, 4 phases**
