# Design — Éditeur filières de travail (coach)

**Date :** 2026-04-18
**Contexte :** Refonte de l'interface coach pour paramétrer les 8 filières de travail natation, afin que tous les éléments visibles par les nageurs deviennent configurables.

## 1. Problème

L'éditeur actuel (`FiliereEditorOverlay` dans `src/pages/coach/SwimPlanningDemo.tsx`) ne permet d'éditer que 2 champs : `description` et `examples`. Tous les autres éléments visibles par les nageurs (FC, lactate, effort, durée, distance, reps, intensité, récupération, type de travail, et 4 jauges 1-5) sont codés en dur dans `src/lib/swimFilieres.ts`. Le coach ne peut donc pas adapter le contenu à son vocabulaire ou à ses choix pédagogiques.

## 2. Portée

- **Inclus** : rendre éditable l'ensemble des champs techniques + jauges + textes, avec pattern Liste → Détail plein écran, sauvegarde explicite, reset par filière vers les défauts.
- **Exclu** : ajout/suppression/réordonnancement de filières ; customisation de la couleur ou du nom court ; versioning ; i18n.

## 3. Data model

### 3.1 Migration SQL

Extension de `swim_filieres` avec 13 nouvelles colonnes nullable :

```sql
ALTER TABLE swim_filieres
  ADD COLUMN heart_rate      text,
  ADD COLUMN lactate         text,
  ADD COLUMN effort          text,
  ADD COLUMN duration        text,
  ADD COLUMN distance        text,
  ADD COLUMN reps            text,
  ADD COLUMN intensity       text,
  ADD COLUMN recovery        text,
  ADD COLUMN work_type       text,
  ADD COLUMN level_intensity smallint CHECK (level_intensity BETWEEN 1 AND 5),
  ADD COLUMN level_duration  smallint CHECK (level_duration  BETWEEN 1 AND 5),
  ADD COLUMN level_recovery  smallint CHECK (level_recovery  BETWEEN 1 AND 5),
  ADD COLUMN level_lactate   smallint CHECK (level_lactate   BETWEEN 1 AND 5);
```

**Backfill** : la migration pré-remplit les 8 lignes existantes avec les valeurs actuelles des constantes `swimFilieres.ts`. Les filières verront les champs remplis d'entrée (pas d'écrans vides). `NULL` ne survient qu'après un reset explicite ou pour les jauges "Variable" (cas `technique`).

**RLS** : les policies existantes (`swim_filieres_select` pour tous authentifiés, `swim_filieres_write` pour coach/admin) couvrent déjà les nouvelles colonnes. Pas de nouvelle policy.

### 3.2 Types TypeScript

```ts
// src/lib/api/types.ts
export interface SwimFiliere {
  id: string;
  name: string;
  short_name: string;
  color: string;
  description?: string | null;
  examples?: string | null;
  // Nouveau
  heart_rate?: string | null;
  lactate?: string | null;
  effort?: string | null;
  duration?: string | null;
  distance?: string | null;
  reps?: string | null;
  intensity?: string | null;
  recovery?: string | null;
  work_type?: string | null;
  level_intensity?: number | null;
  level_duration?: number | null;
  level_recovery?: number | null;
  level_lactate?: number | null;
  sort_order: number;
}

export interface SwimFiliereInput
  extends Partial<Omit<SwimFiliere, "id" | "name" | "short_name" | "color" | "sort_order">> {
  id: string;
}
```

### 3.3 API

```ts
// src/lib/api/swim-filieres.ts
export async function updateSwimFiliere(input: SwimFiliereInput): Promise<SwimFiliere>;
export async function resetSwimFiliere(id: string): Promise<SwimFiliere>;
```

- `updateSwimFiliere` n'envoie que les clés présentes dans `input` → permet un diff ciblé côté client.
- `resetSwimFiliere` fait `UPDATE swim_filieres SET <15 colonnes éditables> = NULL WHERE id = $1`. Le backfill initial de la migration n'est **pas** rejoué — la vue nageur retombe sur `FILIERE_MAP` (constantes) via fallback.

## 4. Lecture côté nageur

Dans `SwimPlanningAthleteView.tsx`, chaque champ affiché applique la règle :

```ts
const heartRate = dbFiliere?.heart_rate ?? constFiliere.technicals.heartRate;
const levelIntensity = dbFiliere?.level_intensity ?? constFiliere.levels.intensity;
// etc.
```

Les constantes `FILIERE_MAP` restent donc les "défauts physiologiques". Elles ne sont plus la vérité absolue — juste le fallback quand le coach n'a rien personnalisé (ou après un reset).

## 5. Architecture UI

### 5.1 Extraction

Nouveau fichier `src/pages/coach/FilieresEditor.tsx` qui exporte `<FilieresEditorOverlay open onClose />`. Remplace l'implémentation inline actuelle dans `SwimPlanningDemo.tsx`. Import via `lazyWithRetry` pour rester aligné sur §119/§120.

### 5.2 State machine local

```ts
type Mode = "list" | "detail";

const [mode, setMode] = useState<Mode>("list");
const [selectedId, setSelectedId] = useState<string | null>(null);
const [draft, setDraft] = useState<SwimFiliereInput | null>(null);

const selectedFiliere = useMemo(
  () => filieres.find((f) => f.id === selectedId) ?? null,
  [filieres, selectedId],
);

const isDirty = useMemo(
  () => (draft && selectedFiliere ? computeDiff(draft, selectedFiliere) !== null : false),
  [draft, selectedFiliere],
);
```

Une seule query React Query `["swim-filieres"]` partagée (déjà en place), invalidée post-save et post-reset.

### 5.3 Écran A — Liste

- Header : ChevronLeft + titre "Filières de travail"
- Baseline : "Configure ce que voient tes nageurs…"
- Liste des 8 filières en cards tappables :
  - Dot couleur + nom long
  - Badge discret "Personnalisé" si ≥1 champ override la valeur par défaut constante
  - Chevron droit
- Tap → `setSelectedId(id); setMode("detail"); setDraft(filiereAsInput)`

### 5.4 Écran B — Détail

- Header : ChevronLeft (back) + nom filière + dot couleur
- **Card "Aperçu nageur"** (top) : rend le draft via les mêmes composants que `SwimPlanningAthleteView` (chip + 4 jauges + description + exemples tronqués) pour feedback visuel immédiat
- **Section "Description"** : Textarea (compteur soft 500 chars)
- **Section "Exemples d'exercices"** : Textarea multi-lignes
- **Section "Type de travail"** : Input court
- **Section "Spécifications techniques"** : grid 2 col mobile, 8 inputs texte libre (placeholder = valeur constante par défaut en gris)
- **Section "Jauges nageur"** : 4 rangées (Intensité / Durée / Récup / Lactate) — chaque rangée = label + 5 dots cliquables (1-5) + switch "Variable" (force null)
- **Zone dangereuse** : lien rouge "Restaurer les valeurs par défaut" → confirm dialog
- **Footer sticky** : bouton pleine largeur "Enregistrer" (disabled si `!isDirty`, état loading)

### 5.5 Navigation & dirty guard

- Back (detail → list) : si `isDirty`, ouvrir `AlertDialog` "Abandonner les modifications ?" → cancel/confirm.
- Close overlay (escape, back X) : idem si dirty.
- Save : mutation, invalidate query, toast "Filière mise à jour", retour auto à la liste.
- Reset : `AlertDialog` "Restaurer les valeurs par défaut pour [nom] ?", puis mutation, toast, reste sur l'écran détail avec draft rechargé depuis la query.

## 6. Validation & edge cases

- Jauges : dots cliquables = impossibilité de saisir un nombre hors 1-5 ; le switch "Variable" force `null` et désactive les dots.
- Textes : trim sur save, aucun format imposé (ce sont des valeurs type `"120-150"`, `"10-30s passive"`).
- Erreur réseau : toast destructive, draft conservé, l'utilisateur peut retry.
- Mutation `updateSwimFiliere` n'envoie que les clés différentes → pas d'écrasement silencieux de champs concurremment modifiés.

## 7. Performance

- Query `["swim-filieres"]` partagée liste/détail, `staleTime: 60s` (déjà en place).
- Pas d'optimistic update (mutation ~200ms, UX d'attente simple > complexité rollback).
- Lazy-load `FilieresEditor` via `lazyWithRetry`.

## 8. Impact fichiers

| Fichier | Action |
|---------|--------|
| `supabase/migrations/00XXX_swim_filieres_full_edit.sql` | **Nouveau** — migration + backfill |
| `src/lib/api/types.ts` | Étendre `SwimFiliere` + `SwimFiliereInput` |
| `src/lib/api/swim-filieres.ts` | Étendre `updateSwimFiliere`, ajouter `resetSwimFiliere` |
| `src/lib/api.ts` | Ré-exporter `resetSwimFiliere` |
| `src/lib/api/index.ts` | Ré-exporter `resetSwimFiliere` |
| `src/pages/coach/FilieresEditor.tsx` | **Nouveau** — overlay complet (liste + détail) |
| `src/pages/coach/SwimPlanningDemo.tsx` | Remplacer `FiliereEditorOverlay` inline par import lazy du nouveau composant ; supprimer code obsolète |
| `src/pages/coach/SwimPlanningAthleteView.tsx` | Appliquer fallback DB→constantes sur tous les champs de la sheet filière détail |
| `docs/implementation-log.md` | Entrée §133 |
| `docs/ROADMAP.md` + `CLAUDE.md` | Tableaux |

## 9. Tests

- Type-check : `npx tsc --noEmit`
- Build : `npm run build`
- Tests unitaires existants : `npm test`
- Pas de test RLS supplémentaire (les policies existantes couvrent déjà les nouvelles colonnes — pas de changement de logique d'autorisation, juste extension des colonnes).

## 10. Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| Migration casse les lignes existantes | Backfill depuis constantes ; colonnes nullable ; pas de `NOT NULL` |
| Coach reset par erreur | Confirm dialog avec nom de la filière explicite |
| Dérive constantes/DB dans le temps | Les constantes restent source de vérité des défauts ; pas de duplication logique côté nageur |
| Bundle size de l'éditeur | `lazyWithRetry` — chargé uniquement à l'ouverture |
