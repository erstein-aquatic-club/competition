# Édition coach d'une séance générée — Part 2 (atteignabilité éditeur) — Plan

> **For Claude:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal :** permettre à un coach d'**ouvrir une séance générée (`[Méso …]`) dans l'éditeur** depuis la planification du nageur, avec son `raw_payload` chargé — pour que la préservation livrée en **Part 1 (§300)** opère bout-en-bout.

**Pré-requis (déjà livré, §300 Part 1) :**
- `updateStrengthSession` préserve `raw_payload` par corrélation `ordre` (`reconcileMesocyclePayloads`) — items édités gardent leur payload complet, items **ajoutés** héritent du `mesocycle_id` de la séance. `raw_payload` est sur `StrengthSessionItem` et porté par le draft `startEditSession`.
- Fait crucial : la RPC `update_strength_session_atomic` **écrit déjà** `item->'raw_payload'` (vérifié live). Aucun changement RPC nécessaire (donc **zéro conflit avec §298**).

**Le seul trou restant :** la séance `[Méso]` n'est pas **atteignable** dans l'éditeur (exclue de la liste catalogue par mig `00180`), et le chargement liste ne renvoie pas `raw_payload`.

---

## Architecture retenue : deeplink vers le catalogue (réutilise l'éditeur mûr)

Plutôt que de dupliquer la gestion d'état du builder (`StrengthSessionBuilder` est couplé aux handlers de `StrengthCatalog` : `handleItemChange`, `handleAddExercise`, `newSession`…), on **ouvre le catalogue pré-chargé** sur la séance ciblée. La planif passe un `sessionId` ; le catalogue le lit au mount, charge la séance **par id** (avec `raw_payload`, hors logique de liste), et entre en édition.

```
Planning (coach, mode athlète) ─ tap séance [Méso] ─→ "Éditer la séance"
   → navigate /coach/library?edit=<sessionId>   (ou sessionStorage deeplink)
        → StrengthCatalog lit le param au mount
        → getStrengthSessionForEdit(sessionId)  (nouveau getter, items + raw_payload)
        → startEditSession(loaded)  → builder ouvert, raw_payload dans le draft
        → save → updateStrengthSession (Part 1 préserve raw_payload) → RPC
        → retour planif + invalidations
```

---

## Task 1 — Getter `getStrengthSessionForEdit(sessionId)` (data)

**Files:** `src/lib/api/strength.ts` (+ export `index.ts`), test `src/lib/api/__tests__/`.

- Sélectionne `strength_sessions` (name/description/folder_id) + `strength_session_items(ordre, exercise_id, block, cycle_type, sets, reps, pct_1rm, rest_series_s, rest_exercise_s, notes, raw_payload)` par `session_id`, **ordonné par ordre**. (RLS : coach a `SELECT` sur les deux tables — déjà le cas.)
- Mappe vers la forme draft `StrengthSessionTemplate` attendue par `startEditSession` : `{ id, title, description, cycle, folder_id, items: StrengthSessionItem[] }` — **inclure `raw_payload` et `order_index` (= ordre)**.
- `cycle` : déduire du 1er item (`cycle_type`) ou défaut.
- Test : mapping DB→draft inclut `raw_payload` (mock supabase comme les autres tests `strength` du repo).

## Task 2 — Catalogue : ouverture par id au mount (UI, `/frontend-design` si visuel)

**Files:** `src/pages/coach/StrengthCatalog.tsx`, `src/App.tsx` (si nouvelle route, sinon query param sur la route catalogue existante).

- Lire le deeplink au mount : query param `?edit=<id>` (via `useSearch` de wouter) **ou** `sessionStorage` key `eac_coach_edit_strength_session` (pattern §296 deeplink, consommé-une-fois).
- Au mount, si présent : `getStrengthSessionForEdit(id)` → `startEditSession(loaded)` → `setIsCreating(true)`. Nettoyer le param/clé (single-use).
- **Ne pas** dépendre de la présence de la séance dans la liste paginée (elle est exclue) — le getter charge par id directement.
- Vérifier le chemin de route exact du catalogue (`/coach/library` ? `/coach/strength-catalog` ?) avant de câbler le deeplink.

## Task 3 — Entrée « Éditer » depuis la planif (UI, `/frontend-design`)

**Files:** `src/pages/coach/StrengthPlanningScreen.tsx` (mode athlète) + `src/components/strength/MyPlanSessionSheet.tsx` (ou le popover de preview).

- Aujourd'hui le tap d'une séance ouvre un preview **read-only** (`StrengthPlanningScreen.tsx:336,455,460-465`). Ajouter, **pour le coach**, un bouton « Éditer la séance » qui :
  - n'apparaît que sur une séance de mésocycle (nom `[Méso …]` ou `raw_payload.mesocycle_id` présent) ;
  - deeplink vers le catalogue en édition (Task 2).
- Garde de rôle : coach/admin uniquement.

## Task 4 — Retour + invalidations après save

**Files:** `StrengthCatalog.tsx` (onSuccess de `updateSession`).

- Après save d'une séance ouverte via deeplink, revenir à la planif du nageur (ou proposer « Retour au plan »).
- Invalider les queries planif (`strength_planning_slot_overrides`, `getMesocycleSessionsContent`, `strength-mesocycle-active`) pour que l'édition s'affiche côté coach **et** nageur.

## Task 5 — Test RLS : édit puis revert → 0 résiduel (T14)

**Files:** `supabase/tests/rls/strength-mesocycle-rpc.test.ts` (Docker requis).

- Scénario : apply (coach) → simuler une édition (UPDATE d'un item + INSERT d'un item **avec** `raw_payload.mesocycle_id` du cycle, comme le ferait `updateStrengthSession`) → `revert_strength_mesocycle` → asserter **0** `strength_session_items` résiduel avec ce `mesocycle_id` + snapshot restauré.
- Valide l'invariant Part 1 de bout en bout au niveau DB.

## Task 6 — Clôture

- `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:rls` (Task 5).
- Docs : compléter l'entrée §300 dans `implementation-log.md` (Part 2 livré), `FEATURES_STATUS.md` (édition coach ⚠️→✅), `ROADMAP.md`, `CLAUDE.md`, guide utilisateurs (§3 étape 3 / §4 étape 3 deviennent vrais).

---

## Pièges connus
- **Liste catalogue exclut `[Méso]`** (mig `00180`) — c'est voulu (anti-pollution). Le getter Task 1 charge **par id**, hors liste → pas de conflit. Ne PAS retirer l'exclusion de liste.
- **Concurrence revert/édit** : si la séance est revert pendant l'édition, le save échoue (session supprimée par CASCADE). Surface l'erreur proprement (toast), ne pas avaler.
- **Items ajoutés** : ils héritent du `mesocycle_id` (Part 1) mais pas de `periodization_cycle`/`intention` — acceptable (ajout coach hors périodisation). Le revert les nettoie quand même (clé `mesocycle_id` présente).
- **`folder_id` NULL** des séances `[Méso]` — l'éditeur doit l'accepter (déjà le cas, nullable).
