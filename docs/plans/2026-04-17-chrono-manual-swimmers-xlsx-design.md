# Design — Chrono Coach : Nageurs manuels, titre de séance, export XLSX

**Date** : 2026-04-17
**Chantier** : §126 (prévisionnel)
**Scope** : `CoachChronoScreen` et écrans associés (`ChronoSetup`, `ChronoResults`, `CoachChronoHistoryScreen`)

## Contexte

Le coach utilise l'écran Chrono (poolside tablette) pour chronométrer des séances. Aujourd'hui :
- Il ne peut ajouter que des nageurs ayant un compte (`public.users`).
- La séance n'a pas de titre : un label auto est généré (`"3×100m"`).
- Le seul "export" est l'envoi des splits dans le compte de chaque nageur. Impossible de garder un historique papier / hors ligne.

Trois manques identifiés :
1. **Nageurs sans compte** (invités d'un autre club, stagiaires non inscrits, etc.) ne peuvent pas être chronométrés.
2. **Titre libre** manquant pour reconnaître une séance dans l'historique.
3. **Export XLSX** manquant pour archivage hors-application.

## Décisions produit (validées)

- **Manuels et inscrits mixables** dans la même séance (ex: 2 nageurs du club + 1 invité sur la même ligne).
- **Saisie express + liste récurrente** : le coach peut taper un nom à la volée, ou mémoriser des manuels dans une liste persistée côté serveur (par coach).
- **Titre optionnel en setup**, éditable dans Résultats et Historique. Si vide → fallback sur le label auto existant.
- **Export XLSX par séance** depuis Résultats ET depuis Historique (pas d'export multi-séances pour l'instant — YAGNI).

## Architecture

### 1. Modèle de données

**`ChronoSwimmer` devient discriminé** (`src/lib/chrono-types.ts`) :

```ts
type ChronoSwimmerKind = "registered" | "manual";

interface ChronoSwimmer {
  key: string;                  // "a:123" ou "m:<uuid>"
  kind: ChronoSwimmerKind;
  athleteId: number | null;     // null si manual
  manualId: string | null;      // UUID local côté chrono si manual
  displayName: string;
  avatarUrl: string | null;
  wave: number;
  lane: number;
}

interface ChronoState {
  // ...existant
  title: string;                // "" par défaut
}
```

**Clé Map** : `raceData: Map<string, SwimmerRaceState>` (au lieu de `Map<number, ...>`). Toutes les actions reducer passent de `athleteId: number` à `key: string`.

**Helper** : `export function swimmerKey(s: ChronoSwimmer): string` (dans `chrono-types.ts`), utilisable aussi pour reconstruire la clé depuis un record historique.

### 2. Reducer — actions modifiées

Toutes les actions dont la signature utilisait `athleteId: number` basculent sur `key: string` :

- `REMOVE_SWIMMER`
- `MOVE_SWIMMER`
- `SET_WAVE`
- `RECORD_SPLIT`
- `UNDO_SPLIT`
- `STOP_SWIMMER`

**Nouvelles actions** :

- `SET_TITLE`: `{ type: "SET_TITLE"; title: string }`

**`ADD_SWIMMER`** : reçoit le `ChronoSwimmer` complet (déjà formé avec `key` + `kind`). La construction se fait dans `ChronoSetup` (helpers `buildRegisteredSwimmer(athlete)` et `buildManualSwimmer(name, manualId)`).

### 3. Base de données

**Nouvelle table** `public.coach_manual_swimmers` :

```sql
create table public.coach_manual_swimmers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);

create index on public.coach_manual_swimmers(coach_id, created_at desc);

alter table public.coach_manual_swimmers enable row level security;

-- Policies (wrapped auth call pattern pour éviter initplan, cf. §117/§124)
create policy "coach_manual_swimmers_select_own"
  on public.coach_manual_swimmers for select
  using (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_insert_own"
  on public.coach_manual_swimmers for insert
  with check (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_delete_own"
  on public.coach_manual_swimmers for delete
  using (coach_id = (select auth.uid()));
```

**`chrono_records.swimmers`** (JSONB) — schema d'item étendu (retro-compatible) :
```ts
interface ChronoRecordSwimmer {
  kind?: "registered" | "manual"; // défaut "registered" pour legacy
  athleteId: number | null;       // passe de `number` à `number | null`
  manualId?: string | null;
  displayName: string;
  lane: number;
  wave: number;
  splitsByRep: ChronoRecordSplit[][];
}
```

Pas de migration SQL nécessaire (JSONB tolère les nouveaux champs). Helper TypeScript `normalizeRecordSwimmer()` applique les défauts à la lecture.

### 4. API

**Nouveau module** `src/lib/api/coach-manual-swimmers.ts` (~50 LOC) :

```ts
export interface CoachManualSwimmer {
  id: string;
  display_name: string;
  created_at: string;
}

export async function listManualSwimmers(): Promise<CoachManualSwimmer[]>;
export async function createManualSwimmer(display_name: string): Promise<CoachManualSwimmer>;
export async function deleteManualSwimmer(id: string): Promise<void>;
```

Query key React Query : `["coach_manual_swimmers"]`. Invalidation sur create/delete.

### 5. UX ajout de nageur (ChronoSetup sheet)

Tabs dans le sheet existant :

```
[Club] [Mes manuels] [Nouveau]
```

- **Club** — comportement actuel (liste groupée, switch "Tout le club" si applicable).
- **Mes manuels** — liste fetchée via `listManualSwimmers()`. Tap → `dispatch(ADD_SWIMMER, buildManualSwimmer(entry.display_name, newUuid))`. Trash icon → `deleteManualSwimmer` + invalidate.
- **Nouveau** — champ texte `displayName` + checkbox "Mémoriser pour plus tard". Submit :
  - Si mémoriser : `createManualSwimmer(name)` (fire-and-forget, on n'attend pas) puis ADD_SWIMMER.
  - Sinon : ADD_SWIMMER direct, pas d'INSERT DB.

**Affichage dans les lignes** : même chip que les inscrits + petit badge `M` discret à côté du nom (gris neutre).

### 6. Titre de séance

**Setup** : champ `<Input>` tout en haut (avant "Lignes"), placeholder `"Titre de la séance (optionnel)"`. Actualise `state.title` via `SET_TITLE`.

**Results** : titre éditable inline (click to edit) en haut, même mécanique. Fallback muted italic `"Sans titre — cliquer pour nommer"` si vide.

**Historique (détail)** : bouton ✏️ à côté du titre → input inline. Sauvegarde via `updateChronoRecord({ label })`.

**Persistance** : `chrono_records.label = state.title || buildLabel(state)`. Colonne inchangée.

### 7. Export XLSX

**Librairie** : `xlsx` (SheetJS Community Edition, MIT, ~300KB min). Ajoutée en dépendance **mais lazy-importée** via `await import("xlsx")` dans `chronoXlsxExport.ts` pour ne pas gonfler le bundle principal.

**Nouveau module** `src/lib/chronoXlsxExport.ts` :

```ts
export async function exportChronoToXlsx(
  input: ChronoRecord | { state: ChronoState; title: string }
): Promise<void>;

// Helper pur, testable unitairement
export function buildSheetData(
  record: Pick<ChronoRecord, "label" | "config" | "swimmers" | "created_at">
): (string | number)[][];
```

**Structure du fichier** (1 feuille, "Chrono") :

```
Ligne 1: Titre de la séance
Ligne 2: Date ISO + heure locale
Ligne 3: Config — "3×100m · splits 50m · 3 lignes"
Ligne 4: (vide)
Ligne 5: Headers — Nageur | Ligne | Vague | Type | S1 total | S1 50m | S1 100m | S2 total | S2 50m | ...
Ligne 6+: 1 ligne par nageur, valeurs temps formatées "m:ss.cc"
```

- **Nombre de colonnes splits** = max sur tous les nageurs (certains peuvent avoir moins de splits).
- **Type** : `C` (compte) ou `M` (manuel).
- **Filename** : `sanitizeFilename(record.label || "Chrono") + ".xlsx"` — enlève slashes, accents convertis.

**Points d'intégration** :

1. `ChronoResults` — bouton **"Exporter xlsx"** dans le header (à côté de Brouillon / Envoyer). Fonctionne hors connexion, sans inscrits.
2. `CoachChronoHistoryScreen` liste — icône ⬇️ `Download` à droite de chaque ligne (stopPropagation sur click).
3. `CoachChronoHistoryScreen` détail — bouton **"Exporter xlsx"** dans le header éditeur.

**Brouillons** : l'export xlsx ne change pas `status`. Seul "Envoyer à tous" passe à `sent`.

### 8. UI/UX — `/frontend-design`

Invocation du skill `/frontend-design:frontend-design` pour le polish visuel sur :
- Tabs du sheet (variants, états, badges M).
- Input titre + édition inline.
- Bouton "Exporter xlsx" (icône Download, loading state pendant import dynamique).
- Icône download par ligne dans l'historique (touch target 44px).
- Toast de confirmation post-téléchargement.

Pas de design UI dans le présent document — délégué au skill.

## Flux de données

```
[Coach tap Ajouter ligne X]
      ↓
[Sheet ouvert : tabs Club / Mes manuels / Nouveau]
      ↓
Club      → dispatch(ADD_SWIMMER, buildRegisteredSwimmer(a))
Mes manuels → dispatch(ADD_SWIMMER, buildManualSwimmer(entry.display_name))
Nouveau   → (optionnel) createManualSwimmer(name) puis dispatch(ADD_SWIMMER, buildManualSwimmer(name))
      ↓
state.swimmers étendu, raceData Map<string> à START_RACE
      ↓
Course normale (actions key-based)
      ↓
ChronoResults
  - Envoyer à tous : skip manuels, push inscrits via createStandaloneSwimLog
  - Exporter xlsx : exportChronoToXlsx({ state, title })
  - Brouillon : createChronoRecord({ label: title || buildLabel(state), swimmers: [...] })
      ↓
Historique
  - Liste : bouton ⬇️ → exportChronoToXlsx(record)
  - Détail : édition titre + bouton ⬇️ + éditeur splits existant
```

## Gestion d'erreurs

- **Import dynamique xlsx échoue** (offline, CSP) → `toast.error("Impossible de charger le module d'export")`. Pas de crash.
- **createManualSwimmer échoue** (réseau) → on ajoute quand même au chrono, toast warning "Non mémorisé (hors-ligne), ajouté à la séance uniquement".
- **Record legacy sans `kind`** → helper `normalizeRecordSwimmer()` → `kind = "registered"` par défaut.
- **Manuel dans "Envoyer à tous"** → skip silencieux avec info log + toast récap `"X envois réussis, Y manuels ignorés"`.

## Tests

**Reducer** (`chrono-reducer.test.ts` — 27 tests existants à étendre, +~10) :
- ADD_SWIMMER manuel : clé `m:uuid`, `athleteId: null`.
- ADD_SWIMMER mixte (inscrit + manuel même ligne/vague).
- REMOVE_SWIMMER par key string (registered + manual).
- RECORD_SPLIT sur manuel (Map<string>).
- SET_TITLE update propre.
- RESTORE_STATE round-trip avec manuels + title.

**XLSX export** (`chronoXlsxExport.test.ts` — nouveau) :
- `buildSheetData()` : headers + lignes correctes pour 2 nageurs (1 reg + 1 manuel), splits 50m, 2 séries.
- `formatTime(ms)` cohérent avec `CHRONO_PRECISION` (centièmes).
- `sanitizeFilename()` : accents, slashes, longueur max.

**RLS intégration** (`supabase/tests/rls/coach_manual_swimmers.test.ts` — nouveau) :
- Coach A voit ses manuels, pas ceux de coach B.
- Coach A peut INSERT avec son coach_id.
- Coach A ne peut pas INSERT avec coach_id = coach B.
- Coach A peut DELETE ses entrées, pas celles de B.
- Nageur (role athlete) : aucun accès (SELECT vide, INSERT refusé).

Ajout au `supabase/tests/schema.sql` de la table hand-crafted + seed minimal (2 coaches, 1 nageur).

## Plan de migration / ordre d'implé

1. **Types + reducer** (chrono-types.ts, chrono-reducer.ts) — refacto clé string + `title`. Tests reducer étendus.
2. **DB** : migration `00XXX_coach_manual_swimmers.sql` via MCP Supabase. Test RLS ajouté.
3. **API** : `src/lib/api/coach-manual-swimmers.ts`.
4. **Helper xlsx** : `src/lib/chronoXlsxExport.ts` + tests. Ajout `xlsx` à `package.json`.
5. **ChronoSetup** : tabs sheet + champ titre. Invocation `/frontend-design`.
6. **ChronoResults** : titre éditable + bouton xlsx. Invocation `/frontend-design`.
7. **ChronoHistory** : bouton ⬇️ liste + édition titre détail + bouton ⬇️ détail.
8. **Backward-compat** : helper `normalizeRecordSwimmer()` + tests legacy.
9. **Docs** : `docs/implementation-log.md` §126, ROADMAP, FEATURES_STATUS, CLAUDE.md (fichiers clés + chantier).

## YAGNI — ce qu'on NE fait PAS

- Export multi-séances (cocher plusieurs chronos → 1 xlsx avec onglets).
- PDF export (xlsx couvre le besoin).
- Partage par email / lien public du xlsx.
- Import xlsx (réinjection de chronos externes).
- Gestion d'un "club invité" persistant (liste de noms groupée).
- Groupes/filtres sur les manuels récurrents.
- Renommage d'un manuel récurrent (delete + recréer suffit).
- Synchro des manuels entre coaches d'un même club (1 coach = 1 liste, KISS).

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| Refacto reducer casse `ChronoRace.tsx` / `ChronoResults.tsx` | Grep systématique sur `athleteId:` dans les dispatch — remplacer 1 à 1. Tests reducer attrapent les régressions. |
| Bundle xlsx ~300KB sur main bundle | Lazy import strict (`await import("xlsx")`) — jamais importé statiquement. Vérifier via rollup-visualizer après build. |
| Legacy chrono_records en DB sans `kind` | Helper `normalizeRecordSwimmer()` à la lecture. Test dédié. |
| localStorage backup cassé après refacto clé | `serializeState` déjà `Array.from(raceData.entries())` — fonctionne pour Map<string, _>. Tester restore avec state manuel. |
| RLS manual_swimmers oubliée → fuite inter-coach | Test RLS obligatoire avant merge (voir §121). |
