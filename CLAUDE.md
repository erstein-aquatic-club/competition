# Claude Code Context — Suivi Natation V2

## Projet

Application web de suivi d'entraînement (natation + musculation) pour l'Erstein Aquatic Club.
4 rôles : nageur (athlete), coach, comité, admin.

## Stack

- **Frontend** : React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI/Shadcn (55 composants), Zustand 5, React Query 5, Wouter (hash routing)
- **Backend** : Supabase (PostgreSQL, Auth, Edge Functions Deno)
- **Déploiement** : GitHub Pages (frontend), Supabase Cloud (backend)
- **Tests** : Vitest, 31 fichiers de tests

## Architecture

- SPA avec hash-based routing (`/#/path`) pour GitHub Pages
- Persistance hybride : Supabase primary, localStorage fallback offline
- Code splitting via React.lazy + Suspense
- Feature flags dans `src/lib/features.ts` (tous activés)

## Fichiers clés

Annuaire détaillé (140+ fichiers) : **`docs/claude/files-map.md`** — à lire quand tu cherches un fichier précis.

### Hubs & orchestrateurs critiques

| Fichier | Rôle |
|---------|------|
| `src/lib/api.ts` | Façade API (stubs → 14 modules) |
| `src/lib/api/index.ts` | Re-exports centralisés |
| `src/lib/api/client.ts` | Supabase client, utilitaires |
| `src/lib/api/types.ts` | Interfaces TypeScript |
| `src/lib/auth.ts` | Gestion auth, session, rôles |
| `src/lib/schema.ts` | Schéma Drizzle (tables) |
| `src/lib/features.ts` | Feature flags |
| `src/pages/Dashboard.tsx` | Calendrier natation nageur |
| `src/pages/SwimmerHome.tsx` | Home nageur |
| `src/pages/Strength.tsx` | Module musculation nageur |
| `src/pages/Coach.tsx` | Hub coach |
| `src/pages/Admin.tsx` | Hub admin |
| `src/hooks/useDashboardState.ts` | Façade dashboard nageur |
| `src/hooks/useCoachCalendarState.ts` | État calendrier coach |
| `src/hooks/useStrengthState.ts` | État muscu |
| `supabase/tests/rls/` | Tests RLS intégration (voir `docs/rls-testing.md`) |

**Pour tout autre fichier**, lire `docs/claude/files-map.md` (annuaire complet).

## Edge Functions Supabase

| Fonction | Statut | Chemin |
|----------|--------|--------|
| `admin-user` | Fonctionnelle (ACTIVE, v97) | `supabase/functions/admin-user/` |
| `ffn-sync` | Fonctionnelle (ACTIVE, v53) — cron sync FFN | `supabase/functions/ffn-sync/` |
| `ffn-performances` | Fonctionnelle (ACTIVE, v64) — capte `club_name` depuis cellule club FFN | `supabase/functions/ffn-performances/` |
| `import-club-records` | Fonctionnelle (ACTIVE, v74) — recalc filtré sur `app_settings.home_club_name` | `supabase/functions/import-club-records/` |
| `push-send` | Fonctionnelle (ACTIVE, v33) | `supabase/functions/push-send/` |

## Documentation

Lire ces fichiers dans cet ordre pour reprendre le contexte :

1. **Ce fichier** (`CLAUDE.md`) — Vue d'ensemble rapide
2. **`docs/FEATURES_STATUS.md`** — Matrice complète des fonctionnalités (ce qui marche, ce qui manque)
3. **`docs/ROADMAP.md`** — Plan de développement futur (4 chantiers détaillés)
4. **`docs/implementation-log.md`** — Historique des implémentations
5. **`docs/patch-report.md`** — Audit UI/UX (items restants)
6. **`README.md`** — Stack, déploiement, structure

## Chantiers

**Historique complet** : `docs/implementation-log.md` — à lire pour retrouver le contexte d'un composant ou d'une décision passée. Ne pas dupliquer ici.

Dernier § livré : **§275.6** — Timeline Planif muscu dérivée des `training_plan_applications` (solide + badge "P", tap=override). Bugfix DST.

Pour ajouter un nouveau chantier, suivre le workflow § "Workflow de documentation obligatoire" ci-dessous.


## Workflow de documentation obligatoire

Chaque session de développement doit suivre ce protocole (détail complet dans `docs/ROADMAP.md` § "Règles de documentation") :

1. **Avant** : Lire `CLAUDE.md` → `docs/ROADMAP.md` (chantier ciblé) → `docs/FEATURES_STATUS.md`
2. **Pendant** : Ajouter une entrée dans `docs/implementation-log.md` pour chaque patch (contexte, changements, fichiers modifiés, tests, décisions, limites)
3. **Après** : Mettre à jour les 4 fichiers de suivi :
   - `docs/ROADMAP.md` — statut du chantier (A faire → En cours → Fait) **+ ligne `*Dernière mise à jour*` en tête du fichier**
   - `docs/FEATURES_STATUS.md` — statut des features impactées (❌ → ⚠️ → ✅)
   - `docs/implementation-log.md` — entrée déjà ajoutée au §2
   - `CLAUDE.md` — voir règles ci-dessous

### Règles de mise à jour de CLAUDE.md (obligatoires)

L'annuaire `docs/claude/files-map.md` et la section "Chantiers" dérivent rapidement si on ne les met pas à jour à chaque patch. À la fin de chaque § :

1. **Annuaire de fichiers** — pour CHAQUE fichier touché par le patch :
   - **Nouveau fichier** créé ≥ 150 lignes OU jouant un rôle architectural → **ajouter une ligne** dans `docs/claude/files-map.md`, avec : chemin exact, rôle en 1 phrase, taille mesurée via `wc -l`.
   - **Fichier existant** dont la taille a varié de **> 30 %** → **mettre à jour la taille** dans `docs/claude/files-map.md`.
   - **Fichier supprimé/renommé** → **mettre à jour** `docs/claude/files-map.md`.
   - **Hubs/orchestrateurs critiques** (nouveau module API majeur, nouvelle page principale) → aussi mettre à jour le petit tableau de `CLAUDE.md` § "Hubs & orchestrateurs critiques".
   - **Ne jamais inventer de taille.** Si pas mesurée, ne pas écrire de chiffre.

2. **Pour chaque § ajouté à `implementation-log.md`** : ajouter une ligne dans `docs/ROADMAP.md`. Mettre à jour **uniquement** la ligne "Dernier § livré" dans CLAUDE.md (1 ligne, résumé ≤ 15 mots). **Ne jamais** ajouter de bloc "Précédent" dans CLAUDE.md — l'historique complet est dans `implementation-log.md`.

3. **Edge Functions** — si une Edge Function est ajoutée/supprimée/renommée dans `supabase/functions/`, mettre à jour la table "Edge Functions Supabase".

> **Règle d'or : aucun patch sans entrée dans `implementation-log.md` ET sans mise à jour correspondante de CLAUDE.md (fichiers clés + chantier).**

## Migrations Supabase

**IMPORTANT : Toujours appliquer les migrations via le MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`), jamais via `supabase db push` ou le dashboard.**

- Le projet ID est `fscnobivsgornxdwqwlk` (EAC Databases, région eu-west-1)
- Les policies RLS utilisent les helpers `app_user_role()` et `app_user_id()` — ne PAS utiliser `auth.uid()` directement dans les subqueries
- Toujours créer le fichier SQL dans `supabase/migrations/` ET l'appliquer via MCP dans la même session
- Convention de nommage : `00XXX_<nom_descriptif>.sql` (incrémenter le numéro)

## Déploiement

**IMPORTANT : Ne JAMAIS déployer localement avec `npx gh-pages -d dist`.**

Le déploiement se fait exclusivement via **GitHub Actions** (`.github/workflows/pages.yml`). Les credentials Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) sont stockées dans les **GitHub Secrets** et injectées au build par le workflow CI/CD. Un build local n'a pas ces variables → l'app affiche "Supabase not configured".

**Comment déployer :**
1. Pousser sur `main` → le workflow se lance automatiquement
2. Ou déclencher manuellement : `gh workflow run "Deploy to GitHub Pages"`

**Ne PAS faire :**
- `npx gh-pages -d dist` (écrase le déploiement avec un build sans credentials)
- `npm run build && deploy` localement (même problème)

## Cache bust

L'application est servie sur GitHub Pages avec les meta tags `apple-mobile-web-app-capable`. Les navigateurs (surtout Safari iOS) cachent agressivement `index.html`.

**Mécanisme en place :**
- `index.html` contient les meta tags `Cache-Control: no-cache, no-store, must-revalidate`
- `vite.config.ts` injecte `__BUILD_TIMESTAMP__` automatiquement à chaque build (visible dans la console navigateur)
- Les assets JS/CSS ont des content hashes automatiques (Vite default)

**Règle obligatoire** : À chaque patch/déploiement, vérifier que :
1. Le build timestamp est bien injecté (vérifier dans la console : `[EAC] Build: <date>`)
2. Si un changement ne se reflète pas après déploiement, demander aux utilisateurs de vider le cache ou faire un hard refresh (Ctrl+Shift+R)
3. Ne jamais ajouter de service worker sans mécanisme de mise à jour automatique (risque de cache permanent)

## Points d'attention

- `api.ts` a été refactoré de ~2277 à ~426 lignes — 7 modules extraits dans `src/lib/api/` (strength, records, users, assignments, notifications, timesheet, swim)
- Le routing est hash-based (`useHashLocation` de Wouter) — les URLs sont `/#/path`
- L'inscription utilise `supabase.auth.signUp()` avec metadata (name, birthdate, group_id)
- Un trigger PostgreSQL (`handle_new_auth_user`) crée automatiquement les entrées `users`, `user_profiles`, `group_members` à l'inscription
- Les migrations sont dans `supabase/migrations/`
- Le fallback localStorage est activé quand Supabase n'est pas disponible

## Agents & coût — règles anti-hallucination

Un agent spawné coûte **~20x plus** qu'un Grep/Glob direct (contexte dupliqué + appels internes cumulés). Règles :

- **Grep/Glob/Read directs** pour toute recherche simple (fichier, symbole, signature). Agents = recherches multi-étapes uniquement.
- **Prompts d'agents** : donner des **chemins précis**, demander **fichier + ligne** en retour, **scope étroit**.
- **Vérifier avant d'agir** : avant d'éditer ou de rapporter un fait précis à l'utilisateur, confirmer avec un Read/Grep que le fichier/symbole existe réellement. Ne pas re-vérifier ce qui est déjà connu (tableau "Fichiers clés", info non actionnable).
- **Résultats contradictoires** entre agents → trancher dans le code source directement.

## Commandes

```bash
npm install          # Installation
npm run dev          # Dev server (localhost:8080)
npm run build        # Build production
npm test             # Tests Vitest
npm run test:rls     # Tests RLS intégration (nécessite Docker + supabase start — voir docs/rls-testing.md)
npx tsc --noEmit     # Type check
```

## Tests RLS intégration (§121)

Tests contre un Postgres local pour attraper les régressions de policies silencieuses (type §113 : DELETE no-op pris pour un succès). Harness complet dans `supabase/tests/rls/` avec schéma hand-crafted minimal (pas de replay des 108 migrations prod — schema drift trop important).

**Setup** (une fois) : Docker Desktop + `brew install supabase/tap/supabase libpq`, puis `supabase start`.

**Documentation complète** : `docs/rls-testing.md` (setup, API du harness, ajout d'un test, pièges fréquents, relation avec migrations prod).

### Règles d'usage pour Claude (obligatoire)

**Quand lancer `npm run test:rls` :** uniquement si le patch touche à **au moins un** des éléments suivants :

1. **Migration SQL** qui modifie une policy RLS (`CREATE/ALTER/DROP POLICY`) ou une table sous RLS (`ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`).
2. **Helpers auth** : `app_user_id()`, `app_user_role()`, `auth.uid()` ou équivalents (toute fonction SQL qui alimente les clauses `USING`/`WITH CHECK`).
3. **Wrapper API JS** dans `src/lib/api/*.ts` qui ajoute/modifie un appel Supabase pour une table sous RLS, **si la nouvelle logique peut dépendre du rôle appelant** (ex: nouveau CRUD coach/athlète, nouveau `.select()` qui suppose filtrage serveur).
4. **Schéma de test** lui-même : modification de `supabase/tests/schema.sql` ou `seed.sql`.
5. **Debug ciblé** : l'utilisateur soupçonne une régression RLS sur une feature existante et demande explicitement de reproduire.

**Quand NE PAS lancer :**

- Modifications purement UI/UX (composants React, Tailwind, CSS, routing, typage).
- Ajout/modif de helpers purs (`src/lib/*.ts` non-API).
- Fix de bug JS sans relation avec les permissions (mémoïsation, effet, state).
- Refactor interne d'un module API qui **ne change pas** la logique d'autorisation.
- Tests `npm test`, `npm run test:e2e`, type check — qui tournent vite et n'ont pas besoin de Docker.

**Docker n'est pas démarré par Claude automatiquement.** Avant de lancer `supabase start` ou `npm run test:rls`, Claude doit :

1. Vérifier si Docker tourne : `docker ps` (silencieux si OK, erreur sinon).
2. **Si Docker n'est pas lancé**, **demander à l'utilisateur** de lancer Docker Desktop manuellement et **attendre confirmation** avant de continuer. Ne pas tenter `open -a Docker` sans permission explicite — le user contrôle ses ressources système.
3. Si Docker tourne mais `supabase start` n'a pas été exécuté, lancer `supabase start` directement (zéro risque, juste du démarrage de containers).

**Si un test échoue :** ne pas commit, diagnostiquer via `docs/rls-testing.md § Débugger`.

### Économie de tokens (obligatoire)

Coûts mesurés — chaque token gaspillé est un token en moins pour le raisonnement :

| Action | Tokens (~) | Règle |
|---|---|---|
| `docker ps` | 690 | **1× par session max.** Si déjà vérifié et OK, ne pas re-vérifier. Retenir le résultat. |
| `npm run test:rls` output | 300 | OK si critères ci-dessus remplis. **Jamais "pour vérifier" sur un patch UI.** |
| `supabase start` | 750 | **1× par session.** Si containers déjà up (docker ps OK), ne pas relancer. |
| Lire 1 fichier test (~170 LOC) | 1 700 | **Uniquement si on le modifie.** Ne pas lire "pour comprendre" si on ne touche pas aux tests. |
| Lire TOUS les fichiers test | 23 000 | **INTERDIT** sauf demande explicite de l'utilisateur ou audit global. Lire uniquement le fichier ciblé. |
| Lire `docs/rls-testing.md` | 2 600 | **Uniquement pour debug** d'un test qui échoue ou ajout d'un nouveau test. Pas pour un simple run. |
| Lire `supabase/tests/schema.sql` | 4 800 | **Uniquement si on ajoute une table/policy au schéma de test.** Pas pour un simple run. |

**Règle générale** : le workflow normal (patch RLS → run tests → commit) coûte **~990 tokens** (docker ps + test output). Toute lecture de fichier test supplémentaire doit être justifiée par un besoin concret (modification, debug, ajout).

### Contexte & tokens

- **`.claudeignore`** en place — ignore `dist`, `node_modules`, `public`, `.git`. Ne pas supprimer. Ajouter tout dossier lourd temporaire.
- Compacter après chaque jalon majeur (`/compact` ou équivalent).
- Modèle `haiku` pour refactoring simple 1 fichier ; `sonnet`/`opus` pour tâches multi-fichiers ou architectural.
