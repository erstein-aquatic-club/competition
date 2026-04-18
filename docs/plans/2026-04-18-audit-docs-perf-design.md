# Audit projet : réduction tokens docs + optimisation performance

*Date : 2026-04-18*
*Statut : design validé, prêt pour implémentation*

## Contexte

Deux objectifs :
1. **Réduire les tokens consommés au démarrage de chaque conversation Claude Code** (seul `CLAUDE.md` est auto-chargé, 506 lignes / ~42 Ko ≈ 10-12k tokens).
2. **Améliorer la performance globale de l'application** (utilisateur signale des temps de chargement importants).

## Mesures actuelles

### Docs
- `CLAUDE.md` : 506 lignes / 42 Ko
  - Tableau "Fichiers clés" : 213 lignes (43%)
  - Tableau "Chantiers futurs" (99 entrées "Fait") : 101 lignes (20%)
  - Sections critiques (workflow, déploiement, migrations, tests RLS, agents) : 185 lignes (37%)

### Backend (via Supabase MCP `pg_stat_statements` + advisors)
- **Cron "Séance terminée ?"** : 406s cumulés sur 3922 appels (104 ms/call)
- **Fetch `swim_sessions_catalog` + items nested** : 107s cumulés sur 1592 appels (67 ms/call)
- **224 warnings `multiple_permissive_policies`** (top : `groups`, `swim_exercise_logs` 24 chacun ; `push_subscriptions` 18 ; `interviews` 12)
- **57 `unused_index`** (coût d'écriture sans retour)
- **Security** : `leaked_password_protection` désactivé

### Frontend (audit statique)
- `queryClient.ts` : `staleTime: Infinity` global → zéro refetch auto
- `Dashboard.tsx` : queryKey `[..., user]` mute null→id → double refetch au boot
- `CoachTrainingSlotsScreen.tsx` : 2839 LOC, 64 hooks → re-render complet à chaque interaction
- 12 charts Recharts sans `React.memo`, `chartData` non memoïsé
- 24 requêtes `.select('*')` sur tables larges

## Design — 3 chantiers indépendants

### Chantier A — Restructuration docs

**Objectif** : réduire CLAUDE.md de 506 → ~200 lignes (-67% tokens).

**Actions** :
1. Créer `docs/claude/files-map.md` — tableau détaillé des fichiers clés (hubs, pages, modules, hooks, tests), déplacé depuis CLAUDE.md.
2. Dans CLAUDE.md, garder un tableau très compact (~20-30 lignes) des **seuls** hubs/orchestrateurs critiques : façade API, pages principales (Dashboard, Coach, Strength, SwimmerHome), modules API orchestrateurs (strength, records, users, assignments), hooks orchestrateurs (useDashboardState, useCoachCalendarState), infrastructure tests RLS.
3. Supprimer le tableau "Chantiers futurs" de CLAUDE.md. L'historique complet vit déjà dans `docs/ROADMAP.md` et `docs/implementation-log.md`. Remplacer par une phrase pointeur : "Historique détaillé dans `docs/ROADMAP.md` et `docs/implementation-log.md`".
4. Ajouter dans CLAUDE.md des pointeurs explicites "Pour X, lire Y" pour guider Claude vers les fichiers à charger à la demande.
5. Mettre à jour la section "Règles de mise à jour de CLAUDE.md" pour ajouter la règle : **les ajouts au tableau détaillé se font dans `docs/claude/files-map.md`, pas dans CLAUDE.md**.

**Contraintes à préserver** :
- Règle non-négociable "Ne jamais déployer localement" (§ Déploiement).
- Règle Supabase MCP pour migrations (§ Migrations Supabase).
- Section "Tests RLS intégration" complète (48 lignes) — règles critiques d'économie de tokens.
- Section "Agents & coût" — règles anti-hallucination.
- Section "Cache bust" — piège iOS Safari.

**Gain mesuré** : ~506 → ~200 lignes = -60 à -67% tokens (≈ 7-8k tokens économisés par conversation).

**Risque** : faible. Réversible à 100%. Piège à éviter : ne pas trop alléger (garder les hubs essentiels pour que Claude puisse naviguer le code sans Glob systématique).

---

### Chantier B — Quick wins performance frontend

**Objectif** : -400ms navigation perçue, -20% JSON réseau, -50% re-renders charts.

**Actions** (dans cet ordre) :
1. **`src/lib/queryClient.ts`** : remplacer `staleTime: Infinity` par `staleTime: 5 * 60 * 1000` (5 min), activer `refetchOnWindowFocus: true` par défaut. Ne conserver `Infinity` qu'explicitement pour data statique (ex: catalogue exercices). Vérifier qu'aucune query critique ne casse (revenir en arrière si besoin).
2. **`src/pages/Dashboard.tsx:165-214`** : stabiliser queryKey via `enabled: !!userId` strict avant exécution OU fallback `user || "anon"` dans la clé pour éviter la mutation null→id.
3. **`src/components/strength/ExerciseProgressChart.tsx:109`** : `useMemo` sur `chartData`, `React.memo` sur le composant wrapper. Répliquer sur 3 autres charts Recharts les plus visités (Progress, Records, Coach dashboards).
4. **Audit `.select('*')`** : remplacer sur les 5 queries les plus fréquentes (cible : `swim-logs.ts`, `coach-comments.ts`, `wellness.ts`, `swimmer_performances`, `session_assignments`). Lister colonnes consommées côté UI, puis `.select('col1, col2, ...')`.

**Hors scope pour B (trop lourd, gain secondaire)** :
- Split `CoachTrainingSlotsScreen.tsx` en sous-composants memo (gros refactor, chantier séparé si besoin)
- Migration Lucide subpath imports (gain marginal, touche 100+ fichiers)

**Risque** : moyen. `refetchOnWindowFocus: true` peut causer des refetch inattendus si des mutations in-flight. Tester sur Dashboard, Coach, Strength avant merge.

---

### Chantier C — Optimisation backend

**Objectif** : -80% temps cron "Séance terminée ?", -30 à -50% latence sur tables RLS-lourdes, DB plus saine.

**Actions** :

1. **Optimiser cron "Séance terminée ?"** :
   - Ajouter index partiel : `CREATE INDEX CONCURRENTLY idx_session_assignments_notif_pending ON session_assignments(training_slot_id, scheduled_date) WHERE notified_at IS NULL;`
   - Vérifier via EXPLAIN avant/après.
   - Migration : `supabase/migrations/00118_session_assignments_notif_index.sql`.

2. **Consolider RLS `multiple_permissive_policies`** sur 4 tables prioritaires :
   - `groups` (24 warnings), `swim_exercise_logs` (24), `push_subscriptions` (18), `interviews` (12).
   - Fusionner les policies SELECT/INSERT/UPDATE/DELETE en une seule par action, combinant les conditions avec `OR`.
   - **Obligation** : lancer `npm run test:rls` après consolidation (règle CLAUDE.md § Tests RLS).
   - Migration : `supabase/migrations/00119_consolidate_rls_policies.sql`.

3. **Drop 57 unused indexes** — migration unique listant tous les `DROP INDEX IF EXISTS` des advisors.
   - Migration : `supabase/migrations/00120_drop_unused_indexes.sql`.
   - Précaution : vérifier avec l'utilisateur que rien ne s'appuie sur ces indexes "théoriquement utiles mais pas encore sollicités" (ex: une feature récente pas encore en prod).

4. **Activer `leaked_password_protection`** — via Supabase Dashboard Auth settings (pas de migration SQL). Action utilisateur, on ne peut pas la faire depuis ici.

**Risque** : élevé si RLS mal consolidé. Tests RLS obligatoires avant merge.

## Documentation attendue

Après implémentation, mise à jour :
- `docs/implementation-log.md` — une entrée §N pour chaque chantier exécuté
- `docs/ROADMAP.md` — 3 nouvelles lignes (Chantiers A, B, C) marquées "Fait (§N)"
- `CLAUDE.md` (Chantier A) — restructuration elle-même + mise à jour "Fichiers clés" allégé
- `docs/claude/files-map.md` (Chantier A) — nouveau fichier

## Ordre d'exécution validé

**A → B → C** : docs d'abord (gain immédiat sur toutes conversations futures), puis quick wins frontend (perçu utilisateur), puis backend (le plus complexe, bénéficie de l'écosystème docs allégé pour travailler plus vite).

## Critères de succès

- **A** : `wc -l CLAUDE.md` ≤ 220 lignes. Aucune info critique perdue (test : lancer une nouvelle conversation, poser une question sur le workflow — Claude doit savoir répondre sans Glob supplémentaire).
- **B** : Dashboard re-mount → pas de refetch si < 5 min depuis dernière fetch (vérifier Network tab). Toggle période sur ExerciseProgressChart → pas de flicker.
- **C** : `pg_stat_statements` après déploiement : cron "Séance terminée ?" `mean_exec_time` ≤ 20ms. `supabase--get_advisors performance` : 0 warning `multiple_permissive_policies` sur les 4 tables ciblées. `npm run test:rls` : tout passe.
