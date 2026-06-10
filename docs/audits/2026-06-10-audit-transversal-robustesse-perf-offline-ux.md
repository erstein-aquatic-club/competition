# Audit transversal — Robustesse · Performance · Offline · UX (hors muscu) — 2026-06-10

*Audit lecture seule du reste de l'app (natation, compétitions, records, edge functions, couche offline globale) — le périmètre muscu avait été audité et durci §311-§344. Méthode : 4 agents Explore parallèles (robustesse API, perf, offline, UX) + vérification manuelle de chaque finding majeur dans le code + build de mesure. Les findings vérifiés faux sont marqués ❌.*

## Synthèse

| Axe | Verdict |
|---|---|
| Robustesse API non-muscu | 🟠 timeouts manquants (HoF, FFN), pattern §113 résiduel (swim/timesheet) |
| Performance | 🟡 staleTime manquants hub coach, over-fetch `select('*')`, precache 4,3 Mo |
| Offline | 🔴 ressenti natation non queueable (flux nageur n°1) ; aucune lecture offline |
| UX | 🟠 états loading/erreur manquants (CompetitionDetail, Progress), tap targets/a11y mineurs |

## Findings principaux

### 🔴 Offline (chantiers, ouverts)
1. **Ressenti natation non branché sur `offlineQueue`** : `syncSession`/`updateSession`/`deleteSession`/`saveSwimExerciseLogs` échouent hors-ligne avec un simple toast (`DashboardFeedbackContainer.tsx:161-217`). Le brouillon local (`unsavedDraftStore`) limite la perte, mais pas de replay. **`syncSession` est déjà idempotent serveur** (index dédup `(athlete_id, session_date, time_slot)` mig 00116, 23505→UPDATE) → file offline sans risque de doublon. Symétrique du chantier bilan §314-315.
2. **Aucune persistance React Query** : app ouverte sans réseau = aucune donnée (séance du jour invisible). Le SW précache les assets, pas les données.
3. Mineurs : pas de badge persistant « saisies en attente » après reload ; mutations coach (assignments, competitions) non queueables ; INSERT assignments sans clé de dédup (lost-ACK → doublon).

### 🟠 Robustesse (✅ corrigés en §374)
4. ✅ Hall of Fame : 2 RPC sans `withTimeout` (`records.ts:25`).
5. ✅ Fetch FFN edge functions sans timeout (`_shared/ffn-parser.ts`) ; erreurs d'upsert par chunk invisibles côté client (`ffn-performances`).
6. ✅ Pattern §113 : DELETE/UPDATE sans `.select('id')` de vérification — `swim.ts` (delete/archive/move catalogue), `timesheet.ts` (lieux/créneaux/étiquettes).
7. Ouverts : notification orpheline possible (`notifications.ts:47` — notif insérée puis cibles, non transactionnel) ; parseurs FFN/liveffn positionnels qui dégradent silencieusement si le markup change ; `admin-user` attente trigger 500 ms (rare).

### 🟡 Performance (✅ partiellement corrigés en §374)
8. ✅ `staleTime` manquants sur 6 queries stables du hub coach (`Coach.tsx`).
9. ❌ *(invalidé)* « exclure exceljs/jspdf/html2canvas du precache » : **déjà exclus** (`vite.config.ts` globIgnores + règle runtime) — le precache 4,3 Mo est le reste.
10. Ouverts : `select('*')` over-fetch (`strength.ts:87,192`) ; N requêtes compteurs `TrainingPlansBrowser.tsx:192` ; rafale ~23 `invalidateQueries` post-sync offline (`OfflineMutationSync.tsx:432`) — impact modéré (seules les queries actives refetchent).

### 🟠 UX (✅ partiellement corrigés en §374)
11. ✅ `CompetitionDetail.tsx` : flash « Compétition introuvable » pendant le chargement (pas d'`isLoading`) ; pas d'état d'erreur.
12. ✅ `Progress.tsx` : échec réseau silencieux (écran partiellement vide, sans message ni retry).
13. Ouverts (mineurs) : tap targets 28 px (+/− durée Dashboard), `aria-label` manquants (chevron notes techniques, recherche Admin), `inputMode="numeric"` manquant (distance FeedbackDrawer), bannière chrono sans dismiss.
14. ❌ *(invalidé)* « Login/signup sans gestion d'erreur » : faux — catch + `setError` présents (`Login.tsx:145-216`).

## Traitement

- **§374 (ce jour, équipe eac-quick-wins)** : findings 4, 5, 6, 8, 11, 12 corrigés — voir `implementation-log.md` §374. ⚠️ Edge functions modifiées **non déployées**.
- **Recommandés ensuite** (par impact) : (1) file offline ressenti natation ; (2) persistance React Query lecture offline ; (3) badge mutations en attente + dédup assignments ; (4) lot a11y/tap targets.
