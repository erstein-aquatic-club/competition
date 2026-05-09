# Neurotype Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Supprimer toute trace frontend du NeurotypQuiz — fichiers, composants, types, références API — sans toucher aux migrations SQL déjà appliquées en prod.

**Architecture:** Suppression en 4 tâches séquentielles : (1) delete des fichiers source, (2) nettoyage de Profile.tsx, (3) nettoyage de types.ts + users.ts, (4) mise à jour docs + commit. TypeScript propre visé après Task 3.

**Tech Stack:** React 19, TypeScript, React Hook Form, Zod, TanStack Query.

---

### Task 1 : Supprimer les fichiers source neurotype

**Files:**
- Delete: `src/components/neurotype/NeurotypQuiz.tsx`
- Delete: `src/components/neurotype/NeurotypResult.tsx`
- Delete: `src/lib/neurotype-quiz-data.ts`
- Delete: `src/lib/neurotype-scoring.ts`
- Delete: `src/components/neurotype/` (dossier vide)

**Step 1 : Supprimer les 4 fichiers**

```bash
rm /Users/francoiswagner/Antigravity/Project-EAC/competition/src/components/neurotype/NeurotypQuiz.tsx
rm /Users/francoiswagner/Antigravity/Project-EAC/competition/src/components/neurotype/NeurotypResult.tsx
rm /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/neurotype-quiz-data.ts
rm /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/neurotype-scoring.ts
rmdir /Users/francoiswagner/Antigravity/Project-EAC/competition/src/components/neurotype
```

**Step 2 : Vérifier**

```bash
ls /Users/francoiswagner/Antigravity/Project-EAC/competition/src/components/neurotype 2>&1
```
Attendu : `No such file or directory`

---

### Task 2 : Nettoyer Profile.tsx

**Files:**
- Modify: `src/pages/Profile.tsx`

Supprimer dans l'ordre (lire le fichier avant chaque edit pour avoir les lignes exactes) :

**Step 1 : Supprimer les 3 imports neurotype (lignes 39-41)**

Retirer ces 3 lignes :
```tsx
import { NeurotypQuiz } from "@/components/neurotype/NeurotypQuiz";
import NeurotypResultView from "@/components/neurotype/NeurotypResult";
import type { NeurotypResult as NeurotypResultType } from "@/lib/api/types";
```

**Step 2 : Retirer `"neurotype-quiz"` et `"neurotype-result"` du type ProfileSection**

Le type doit devenir :
```ts
type ProfileSection =
  | "home"
  | "messages"
  | "edit"
  | "password";
```

**Step 3 : Mettre à jour le switch dans `readProfileSectionFromHash`**

Le switch ressemble à :
```ts
switch (requested) {
  case "messages":
  case "neurotype-quiz":
  case "neurotype-result":
    return requested;
  default:
    return "home";
}
```

Le remplacer par :
```ts
switch (requested) {
  case "messages":
    return requested;
  default:
    return "home";
}
```

**Step 4 : Supprimer le state `pendingNeurotypResult` (ligne ~238)**

Retirer :
```ts
const [pendingNeurotypResult, setPendingNeurotypResult] = useState<NeurotypResultType | null>(null);
```

**Step 5 : Retirer `setPendingNeurotypResult(null)` du reset handler (ligne ~260)**

Dans le `useEffect` écoutant `"nav:reset"`, retirer uniquement la ligne `setPendingNeurotypResult(null);`.

**Step 6 : Supprimer la mutation `saveNeurotyp` (lignes 507-526)**

Supprimer entièrement :
```ts
const saveNeurotyp = useMutation({
  mutationFn: (result: NeurotypResultType) =>
    updateProfileApi({
      userId,
      profile: { neurotype_result: result },
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    setPendingNeurotypResult(null);
    setActiveSection("home");
    toast({ title: "Neurotype enregistré" });
  },
  onError: (error: unknown) => {
    toast({
      title: "Erreur",
      description: String((error as Error)?.message || error),
      variant: "destructive",
    });
  },
});
```

**Step 7 : Supprimer les deux guards neurotype (lignes 587-612)**

Supprimer entièrement les deux blocs :
```tsx
if (activeSection === "neurotype-quiz") {
  return (
    <NeurotypQuiz
      onComplete={(result) => {
        setPendingNeurotypResult(result);
        setActiveSection("neurotype-result");
      }}
      onCancel={() => setActiveSection("home")}
    />
  );
}

if (activeSection === "neurotype-result" && pendingNeurotypResult) {
  return (
    <NeurotypResultView
      result={pendingNeurotypResult}
      onSave={(result) => saveNeurotyp.mutate(result)}
      onRetry={() => {
        setPendingNeurotypResult(null);
        setActiveSection("neurotype-quiz");
      }}
      onBack={() => setActiveSection("home")}
      isSaving={saveNeurotyp.isPending}
    />
  );
}
```

**Step 8 : Vérifier le type check**

```bash
cd /Users/francoiswagner/Antigravity/Project-EAC/competition && npx tsc --noEmit 2>&1 | grep -v "stories.tsx" | grep -v "planning.ts" | head -30
```
Attendu : erreurs sur `NeurotypResult` dans `types.ts`/`users.ts` — normal, Task 3 s'en occupe.

---

### Task 3 : Nettoyer types.ts et users.ts

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/users.ts`

**Step 1 : Supprimer le champ `neurotype_result` de l'interface `UserProfile` dans types.ts (ligne ~186)**

Retirer :
```ts
neurotype_result?: NeurotypResult | null;
```

**Step 2 : Supprimer les 3 interfaces/types neurotype dans types.ts (lignes 639-653)**

Supprimer entièrement ce bloc (et la ligne vide qui précède) :
```ts
export interface NeurotypScores {
  "1A": number;
  "1B": number;
  "2A": number;
  "2B": number;
  "3": number;
}

export type NeurotypCode = "1A" | "1B" | "2A" | "2B" | "3";

export interface NeurotypResult {
  dominant: NeurotypCode;
  scores: NeurotypScores;
  takenAt: string;
}
```

**Step 3 : Retirer l'import `NeurotypResult` dans users.ts (ligne 19)**

La liste d'imports ressemble à :
```ts
import {
  UserProfile,
  AthleteSummary,
  GroupSummary,
  UpcomingBirthday,
  UserSummary,
  NeurotypResult,
} from './types';
```

Retirer uniquement la ligne `NeurotypResult,`.

**Step 4 : Retirer `neurotype_result` du mapping dans users.ts (ligne ~48)**

Dans la fonction `getProfile`, retirer :
```ts
neurotype_result: data.neurotype_result ?? null,
```

**Step 5 : Retirer `neurotype_result` du type de payload dans `updateProfile` (ligne ~65)**

Dans la définition du payload de `updateProfile`, retirer :
```ts
neurotype_result?: NeurotypResult | null;
```

**Step 6 : Vérifier TypeScript propre**

```bash
cd /Users/francoiswagner/Antigravity/Project-EAC/competition && npx tsc --noEmit 2>&1 | grep -v "stories.tsx" | grep -v "planning.ts" | head -30
```
Attendu : 0 erreur.

---

### Task 4 : Mettre à jour la doc et committer

**Files:**
- Modify: `docs/claude/files-map.md`
- Modify: `docs/FEATURES_STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/implementation-log.md`
- Modify: `CLAUDE.md`

**Step 1 : Mettre à jour `docs/claude/files-map.md`**

Supprimer les entrées des 4 fichiers supprimés :
```bash
grep -n "neurotyp\|NeurotypQuiz\|NeurotypResult" /Users/francoiswagner/Antigravity/Project-EAC/competition/docs/claude/files-map.md
```
Retirer toutes les lignes trouvées.

**Step 2 : Mettre à jour `docs/FEATURES_STATUS.md`**

```bash
grep -n "neurotyp\|Neurotyp" /Users/francoiswagner/Antigravity/Project-EAC/competition/docs/FEATURES_STATUS.md
```
Retirer toutes les lignes trouvées.

**Step 3 : Mettre à jour `docs/ROADMAP.md`**

```bash
grep -n "neurotyp\|Neurotyp" /Users/francoiswagner/Antigravity/Project-EAC/competition/docs/ROADMAP.md
```
Retirer toutes les lignes trouvées (ou remplacer les statuts par "Supprimé").

**Step 4 : Ajouter §231 dans `docs/implementation-log.md`**

Insérer en tête (après l'en-tête du fichier, avant `## §228`) :

```markdown
## §231 — Suppression complète du NeurotypQuiz (2026-05-09)

**Contexte :** Le NeurotypQuiz n'était plus utilisé. Suppression de toute trace frontend.

**Changements :**
- Supprimés : `src/components/neurotype/NeurotypQuiz.tsx`, `NeurotypResult.tsx`, `src/lib/neurotype-quiz-data.ts`, `src/lib/neurotype-scoring.ts`
- `Profile.tsx` : imports, type ProfileSection (`neurotype-quiz`/`neurotype-result`), state `pendingNeurotypResult`, mutation `saveNeurotyp`, 2 guards inline supprimés
- `src/lib/api/types.ts` : interfaces `NeurotypScores`, `NeurotypCode`, `NeurotypResult` + champ `neurotype_result` sur `UserProfile` supprimés
- `src/lib/api/users.ts` : import + champ mapping + type payload `neurotype_result` supprimés
- Docs : `files-map.md`, `FEATURES_STATUS.md`, `ROADMAP.md` nettoyés

**Tests :**
- `npx tsc --noEmit` : 0 erreur. ✅
- Tests RLS : non lancés — patch purement frontend, aucune policy touchée.

**Non touché (intentionnel) :**
- Migrations `00033_neurotype_result.sql` et `00081_pagination_rpcs.sql` — déjà appliquées en prod, colonne DB conservée.
```

**Step 5 : Mettre à jour CLAUDE.md**

Ligne "Dernier § livré" → :
```
Dernier § livré : **§231** — Suppression complète NeurotypQuiz (fichiers, types, Profile.tsx).
```

**Step 6 : Commit**

```bash
cd /Users/francoiswagner/Antigravity/Project-EAC/competition
git add src/pages/Profile.tsx src/lib/api/types.ts src/lib/api/users.ts
git add docs/implementation-log.md CLAUDE.md docs/claude/files-map.md docs/FEATURES_STATUS.md docs/ROADMAP.md
git add docs/plans/2026-05-09-neurotype-removal-design.md docs/plans/2026-05-09-neurotype-removal.md
git commit -m "feat(§231): remove NeurotypQuiz — fichiers, types, références Profile.tsx"
```

Note : les fichiers supprimés (`src/components/neurotype/`, `src/lib/neurotype-*.ts`) seront automatiquement inclus via `git add` des dossiers parents si nécessaire — vérifier avec `git status` avant de committer.
