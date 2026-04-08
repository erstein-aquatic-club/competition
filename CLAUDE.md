# Claude Code Context — Suivi Natation V2

## Projet

Application web de suivi d'entraînement (natation + musculation) pour l'Erstein Aquatic Club.
4 rôles : nageur (athlete), coach, comité, admin.

## Stack

- **Frontend** : React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI/Shadcn (55 composants), Zustand 5, React Query 5, Wouter (hash routing)
- **Backend** : Supabase (PostgreSQL, Auth, Edge Functions Deno)
- **Déploiement** : GitHub Pages (frontend), Supabase Cloud (backend)
- **Tests** : Vitest, 27 fichiers de tests

## Architecture

- SPA avec hash-based routing (`/#/path`) pour GitHub Pages
- Persistance hybride : Supabase primary, localStorage fallback offline
- Code splitting via React.lazy + Suspense
- Feature flags dans `src/lib/features.ts` (tous activés)

## Fichiers clés

| Fichier | Rôle | Taille |
|---------|------|--------|
| `src/lib/api.ts` | Façade API (stubs → modules) | ~426 lignes |
| `src/lib/api/types.ts` | Interfaces TypeScript | 281 lignes |
| `src/lib/api/client.ts` | Supabase client, utilitaires | 252 lignes |
| `src/lib/api/transformers.ts` | Fonctions de transformation strength | 187 lignes |
| `src/lib/api/helpers.ts` | Fonctions de mapping | 151 lignes |
| `src/lib/api/localStorage.ts` | Stockage local fallback | 85 lignes |
| `src/lib/api/index.ts` | Re-exports centralisés | ~174 lignes |
| `src/lib/api/strength.ts` | Exercices, sessions, runs, logs, 1RM | ~850 lignes |
| `src/lib/api/records.ts` | Hall of fame, records club, perfs | ~350 lignes |
| `src/lib/api/users.ts` | Profil, athlètes, approbation | ~250 lignes |
| `src/lib/api/assignments.ts` | Assignments CRUD | ~230 lignes |
| `src/lib/api/notifications.ts` | Notifications CRUD | ~210 lignes |
| `src/lib/api/timesheet.ts` | Pointage heures CRUD | ~180 lignes |
| `src/lib/api/swim.ts` | Catalogue nage, sessions, partage public | ~220 lignes |
| `src/components/swim/ExerciseLogInline.tsx` | Formulaire inline saisie technique par exercice (§58) | ~160 lignes |
| `src/pages/SharedSwimSession.tsx` | Page publique séance partagée (token UUID) | ~130 lignes |
| `src/lib/api/swim-logs.ts` | Notes techniques exercices natation | ~90 lignes |
| `src/lib/api/temporary-groups.ts` | CRUD groupes temporaires (stages) | ~300 lignes |
| `src/lib/api/competitions.ts` | CRUD compétitions + assignations nageurs | ~105 lignes |
| `src/lib/api/absences.ts` | CRUD absences planifiées nageur | ~90 lignes |
| `src/lib/api/objectives.ts` | CRUD objectifs par nageur | ~90 lignes |
| `src/lib/api/training-slots.ts` | CRUD créneaux d'entraînement récurrents | ~200 lignes |
| `src/lib/swimTextParser.ts` | Parser texte → SwimBlock[], normaliseurs partagés | ~400 lignes |
| `src/lib/swimConsultationUtils.ts` | Helpers partagés consultation séance (BlockGroup, groupItemsByBlock) | ~197 lignes |
| `src/components/swim/SwimSessionTimeline.tsx` | Timeline verticale colorée, rail intensité, toggle 3 niveaux | ~555 lignes |
| `src/lib/auth.ts` | Gestion auth, session, rôles | ~240 lignes |
| `src/lib/supabase.ts` | Client Supabase | ~70 lignes |
| `src/lib/features.ts` | Feature flags | 5 lignes |
| `src/lib/schema.ts` | Schéma Drizzle (tables) | |
| `src/pages/Dashboard.tsx` | Dashboard nageur (calendrier, ressenti) | ~1680 lignes |
| `src/pages/Strength.tsx` | Module musculation nageur | ~1340 lignes |
| `src/pages/coach/SwimCatalog.tsx` | Catalogue séances nage (coach) | ~1300 lignes |
| `src/pages/coach/StrengthCatalog.tsx` | Builder muscu (coach) | ~1150 lignes |
| `src/pages/Records.tsx` | Records personnels + FFN sync | ~920 lignes |
| `src/pages/RecordsClub.tsx` | Records club (sections nage, drill-down progressif) | ~840 lignes |
| `src/pages/RecordsAdmin.tsx` | Admin records + gestion nageurs | ~300 lignes |
| `src/pages/Login.tsx` | Login + inscription | ~340 lignes |
| `src/pages/coach/CoachCalendar.tsx` | Calendrier coach (vue mensuelle assignations) | ~266 lignes |
| `src/hooks/useCoachCalendarState.ts` | Hook état calendrier coach (grille, query, slots) | ~187 lignes |
| `src/pages/coach/CoachSwimmersOverview.tsx` | Dashboard synthétique nageurs (grille cards, KPIs) | ~310 lignes |
| `src/pages/coach/CoachSwimmerDetail.tsx` | Page fiche nageur (4 onglets consolidés: Résumé/Planning/Échanges/Comms) (§92) | ~120 lignes |
| `src/pages/coach/SwimmerFeedbackTab.tsx` | Onglet ressentis (liste chronologique sessions) | ~120 lignes |
| `src/pages/coach/SwimmerObjectivesTab.tsx` | Onglet objectifs CRUD (chrono + texte) | ~390 lignes |
| `src/pages/coach/CoachGroupsScreen.tsx` | UI gestion groupes temporaires (stages) | ~580 lignes |
| `src/pages/coach/CoachCompetitionsScreen.tsx` | UI compétitions coach + assignations + SMS | ~470 lignes |
| `src/pages/coach/CoachWeekView.tsx` | Wrapper toggle semaine/mois (calendrier unifié) (§92) | ~80 lignes |
| `src/pages/coach/CoachLibrary.tsx` | Wrapper tabs bibliothèque nage/muscu (§92) | ~60 lignes |
| `src/pages/coach/CoachComms.tsx` | Wrapper tabs notifications/SMS (§92) | ~60 lignes |
| `src/lib/api/planning.ts` | CRUD macro-cycles + semaines | ~200 lignes |
| `src/lib/api/interviews.ts` | CRUD entretiens + transitions multi-phases | ~200 lignes |
| `src/pages/coach/SwimmerPlanningTab.tsx` | Onglet planification fiche nageur (timeline cycles) | ~440 lignes |
| `src/pages/coach/SwimmerInterviewsTab.tsx` | Onglet entretiens fiche nageur (workflow multi-phases) | ~440 lignes |
| `src/components/profile/AthleteInterviewsSection.tsx` | Entretiens côté nageur (formulaire, signature, historique) | ~320 lignes |
| `src/components/shared/ObjectiveCard.tsx` | Composant partagé objectifs (ring SVG, grid 2x2, compact) | ~260 lignes |
| `src/lib/objectiveHelpers.ts` | Helpers partagés objectifs (FFN_EVENTS, formatTime) | ~40 lignes |
| `src/lib/imageUtils.ts` | Compression image Canvas (avatar upload, WebP/JPEG ≤200KB) | ~95 lignes |
| `src/components/profile/SwimmerObjectivesView.tsx` | Vue objectifs nageur (lecture coach + CRUD perso) | ~530 lignes |
| `src/pages/coach/CoachSmsScreen.tsx` | Écran SMS généraliste coach (groupe/nageur) | ~190 lignes |
| `src/pages/coach/CoachTrainingSlotsScreen.tsx` | Écran gestion créneaux d'entraînement (coach) | ~560 lignes |
| `src/pages/coach/CoachSlotCalendar.tsx` | Calendrier semaine créneaux + séances (§85) | ~440 lignes |
| `src/pages/coach/SlotSessionSheet.tsx` | Bottom sheet actions créneau (créer/modifier/visibilité/supprimer) (§85) | ~375 lignes |
| `src/pages/coach/SlotTemplatePicker.tsx` | Picker templates bibliothèque séances (§85) | ~150 lignes |
| `src/hooks/useSlotCalendar.ts` | Hook matérialisation créneaux récurrents → instances semaine (§85) | ~230 lignes |
| `src/lib/neurotype-quiz-data.ts` | 30 questions quiz + 5 profils neurotype + couleurs | ~450 lignes |
| `src/lib/neurotype-scoring.ts` | Calcul scores neurotype (points/maxPoints) + niveaux | ~40 lignes |
| `src/components/neurotype/NeurotypQuiz.tsx` | Quiz 30 questions avec carousel + progress bar | ~250 lignes |
| `src/components/neurotype/NeurotypResult.tsx` | Affichage résultat neurotype (barres, profil, accordéons) | ~250 lignes |
| `src/lib/weekTypeColor.ts` | Helper partage couleur type semaine (hash-based) | ~15 lignes |
| `src/lib/api/swimmer-slots.ts` | CRUD créneaux personnalisés par nageur | ~160 lignes |
| `src/components/coach/SwimmerSlotsTab.tsx` | Onglet Créneaux dans fiche nageur coach | ~374 lignes |
| `src/lib/pwaHelpers.ts` | Détection plateforme, gate PWA | ~30 lignes |
| `src/lib/push.ts` | Subscription push, helpers VAPID | ~77 lignes |
| `src/lib/pushHelpers.ts` | Fonctions pures push (urlBase64ToUint8Array) | ~37 lignes |
| `src/lib/pushConfig.ts` | VAPID public key config | ~1 ligne |
| `src/components/shared/PWAInstallGate.tsx` | Gate installation PWA mobile | ~130 lignes |
| `src/components/shared/PushPermissionBanner.tsx` | Banner permission push post-login | ~70 lignes |
| `public/push-handler.js` | Service Worker push event handler | ~40 lignes |
| `src/pages/Suivi.tsx` | Page standalone suivi nageur (4 onglets via AthletePerformanceHub) | ~55 lignes |
| `src/hooks/useSwipeNavigation.ts` | Hook swipe horizontal framer-motion (calendrier) | ~30 lignes |
| `src/components/shared/PullToRefresh.tsx` | Composant pull-to-refresh générique framer-motion | ~60 lignes |
| `src/hooks/useCoachEventsTimeline.ts` | Hook timeline échéances coach (fetch + normalisation) | ~130 lignes |
| `src/components/coach/CoachEventsTimeline.tsx` | Timeline verticale échéances coach (compétitions, entretiens, cycles) | ~260 lignes |
| `src/lib/api/competition-prep.ts` | API compétition nageur (races, routines, checklists) | ~325 lignes |
| `src/pages/CompetitionDetail.tsx` | Page détail compétition nageur (header + 4 onglets) | ~210 lignes |
| `src/components/competition/RacesTab.tsx` | Onglet courses (CRUD épreuves, Sheet, couleur nage) | ~380 lignes |
| `src/components/competition/RoutinesTab.tsx` | Onglet routines (templates, steps, assignation par course) | ~530 lignes |
| `src/components/competition/TimelineTab.tsx` | Onglet Jour J (fusion chronologique courses + routines) | ~235 lignes |
| `src/components/competition/ChecklistTab.tsx` | Onglet checklist (templates, progress bar, toggle) | ~415 lignes |
| `src/components/strength/ExercisePicker.tsx` | Picker substitution/ajout exercices en mode focus (§89) | |
| `src/components/strength/MyPlanTab.tsx` | Onglet Mon plan nageur (lecture cycles + lancement séance) | ~158 lignes |
| `src/components/coach/strength/CopyToAthleteDialog.tsx` | Dialog copie séance/dossier vers autre nageur (§90) | |
| `src/components/coach/strength/FolderSection.tsx` | Dossiers hiérarchiques 2 niveaux bibliothèque muscu (§90) | |
| `src/components/strength/SessionBrowser.tsx` | Orchestrateur bibliothèque muscu nageur (§93) | |
| `src/components/strength/CommonFolderList.tsx` | Accordéons dossiers globaux muscu (§93) | |
| `src/components/strength/TeamPlansSection.tsx` | Plans d'équipe visibles entre nageurs (§93) | |
| `src/lib/strengthHistoryUtils.ts` | Helpers calcul historique muscu (tonnage, sRPE, groupByExercise) | ~80 lignes |
| `src/components/strength/RunDetailSheet.tsx` | Bottom sheet détail séance musculation (KPIs, exercices, ressenti) | ~170 lignes |
| `src/lib/gifEncoder.ts` | Conversion vidéo → GIF (Canvas + gifenc, 240px, ≤200KB) (§91) | ~90 lignes |
| `src/components/coach/strength/VideoTrimmer.tsx` | Trimmer vidéo dual-slider (max 5s) (§91) | ~130 lignes |
| `src/components/coach/strength/MediaSourceSheet.tsx` | Bottom sheet filmer/importer illustration (§91) | ~100 lignes |
| `src/components/strength/RestScreen.tsx` | Container repos enrichi (timer + 3 tabs swipables) (§94) | ~200 lignes |
| `src/components/strength/RestExerciseTab.tsx` | Tab exercice (GIF, prescription, muscles, notes) (§94) | ~95 lignes |
| `src/components/strength/RestSessionTab.tsx` | Tab progression séance (barre, volume, liste) (§94) | ~130 lignes |
| `src/components/strength/RestPerfsTab.tsx` | Tab performances (1RM, cible, intensité) (§94) | ~140 lignes |

## Edge Functions Supabase

| Fonction | Statut | Chemin |
|----------|--------|--------|
| `admin-user` | Fonctionnelle | `supabase/functions/admin-user/` |
| `ffn-performances` | Fonctionnelle | `supabase/functions/ffn-performances/` |
| `import-club-records` | Fonctionnelle | `supabase/functions/import-club-records/` |
| `push-send` | Fonctionnelle | `supabase/functions/push-send/` |

## Documentation

Lire ces fichiers dans cet ordre pour reprendre le contexte :

1. **Ce fichier** (`CLAUDE.md`) — Vue d'ensemble rapide
2. **`docs/FEATURES_STATUS.md`** — Matrice complète des fonctionnalités (ce qui marche, ce qui manque)
3. **`docs/ROADMAP.md`** — Plan de développement futur (4 chantiers détaillés)
4. **`docs/implementation-log.md`** — Historique des implémentations
5. **`docs/patch-report.md`** — Audit UI/UX (items restants)
6. **`README.md`** — Stack, déploiement, structure

## Chantiers futurs (ROADMAP)

| # | Chantier | Priorité | Statut |
|---|----------|----------|--------|
| 1 | Refonte parcours d'inscription | Haute | Fait |
| 2 | Import toutes performances FFN | Haute | Fait |
| 3 | Gestion coach des imports | Moyenne | Fait |
| 4 | Records club alimentés | Moyenne | Fait |
| 5 | Dette technique UI/UX | Basse | Fait |
| 6 | Fix timers mode focus (PWA iOS background) | Haute | Fait (§14) |
| 10 | Notes techniques par exercice natation | Moyenne | Fait |
| 12 | Redesign dashboard coach (mobile first) | Haute | Fait (§35) |
| 13 | Redesign Profil + Hall of Fame (mobile first) | Moyenne | Fait (§38) |
| 14 | Finalisation dashboard pointage heures coach | Moyenne | Fait (§39) |
| 15 | Redesign page Progression (Apple Health style) | Moyenne | Fait (§44) |
| 16 | Audit UI/UX — header Strength + login mobile + fixes | Moyenne | Fait (§45) |
| 17 | Harmonisation headers + Login mobile thème clair | Moyenne | Fait (§46) |
| 18 | Redesign RecordsClub épuré mobile | Moyenne | Fait (§47) |
| 19 | Audit performances + optimisation PWA (Workbox) | Haute | Fait (§48) |
| 20 | Parser texte → blocs séance natation | Moyenne | Fait (§49) |
| 21 | Hall of Fame refresh temps réel + sélecteur période | Moyenne | Fait (§51) |
| 22 | Calendrier coach (vue mensuelle assignations) | Moyenne | Fait (§53) |
| 23 | Swim Session Timeline (refonte visualisation séances) | Moyenne | Fait (§55) |
| 24 | Groupes temporaires coach (stages, sous-groupes) | Moyenne | Fait (§56) |
| 25 | Partage public séances natation (token UUID) | Moyenne | Fait (§57) |
| 26 | Détails techniques inline timeline nageur | Moyenne | Fait (§58) |
| 27 | Compétitions coach (calendrier échéances) | Moyenne | Fait (§59) |
| 28 | Objectifs coach (temps cibles & texte par nageur) | Moyenne | Fait (§60) |
| 29 | Interface objectifs nageur + refonte Profil hub | Moyenne | Fait (§61) |
| 30 | Compétitions : assignations, absences, compteur, SMS | Moyenne | Fait (§62) |
| 31 | Upload photo de profil avec compression | Moyenne | Fait (§63) |
| 32 | Traduction exercices FR + option Poids du corps | Faible | Fait (§64) |
| 33 | Écran SMS dédié coach dashboard | Moyenne | Fait (§65) |
| 34 | Groupes encadrés par shift (pointage coach) | Moyenne | Fait (§66) |
| 35 | Fix désynchronisation group_members au changement de groupe | Haute | Fait (§67) |
| 37 | Planification & Entretiens (fiche nageur coach) | Haute | Fait (§74) |
| 36 | Quiz neurotype nageur (profil d'entraînement) | Moyenne | Fait (§71) |
| 37 | Dashboard synthétique nageurs (coach) | Moyenne | Fait (§72) |
| 38 | Fiche nageur coach (ressentis, objectifs, onglets) | Moyenne | Fait (§73) |
| 39 | Refonte entretiens conversationnels + planif inline | Haute | Fait (§75) |
| 40 | Créneaux d'entraînement récurrents | Moyenne | Fait (§76) |
| 41 | Créneaux personnalisés par nageur | Moyenne | Fait (§78) |
| 42 | Notifications push Web Push (VAPID) | Haute | Fait (§79) |
| 43 | Sécurité RLS + Import FFN Auto-Sync | Haute | Fait (§80) |
| 44 | Audit UX A-H (touch targets, feedback, nav coach, wizard) | Haute | Fait (§81) |
| 45 | Audit restant (CORS, migrations, RPC, pagination, deep linking) | Moyenne | Fait (§82) |
| 46 | Réorganisation Profil & Gestes mobiles (E5+E7) | Moyenne | Fait (§83) |
| 47 | Coach Events Timeline (Tableau de Bord des Échéances) | Moyenne | Fait (§84) |
| 49 | Redesign ObjectiveCard + harmonisation Planif nageur | Moyenne | Fait (§86) |
| 48 | Calendrier créneaux centré séances (Slot-Centric Sessions) | Haute | Fait (§85) |
| 50 | Préparation compétition nageur (courses, routines, timeline, checklist) | Moyenne | Fait (§87) |
| 51 | Notes techniques enrichies (épreuve, bassin, équipement) | Moyenne | Fait (§88) |
| 52 | Strength UX Overhaul — refonte parcours musculation nageur | Haute | Fait (§89) |
| 53 | Planification muscu par nageur (dossiers hiérarchiques) | Moyenne | Fait (§90) |
| 54 | Vidéo → GIF pour illustration exercices musculation | Moyenne | Fait (§91) |
| 55 | Refonte UX Coach (nav, home, fiche nageur) | Haute | Fait (§92) |
| 56 | Restructuration bibliothèque musculation nageur | Moyenne | Fait (§93) |
| 57 | Rest Timer enrichi — tabs swipables | Moyenne | Fait (§94) |
| 58 | Rest Screen Improvements (GIF, notes, dots, sparkline, swipe) | Moyenne | Fait (§95) |
| 59 | Notification matinale bien-être (push 6h00) | Moyenne | Fait (§96) |

Détail complet dans `docs/ROADMAP.md`.

## Workflow de documentation obligatoire

Chaque session de développement doit suivre ce protocole (détail complet dans `docs/ROADMAP.md` § "Règles de documentation") :

1. **Avant** : Lire `CLAUDE.md` → `docs/ROADMAP.md` (chantier ciblé) → `docs/FEATURES_STATUS.md`
2. **Pendant** : Ajouter une entrée dans `docs/implementation-log.md` pour chaque patch (contexte, changements, fichiers modifiés, tests, décisions, limites)
3. **Après** : Mettre à jour les 4 fichiers de suivi :
   - `docs/ROADMAP.md` — statut du chantier (A faire → En cours → Fait)
   - `docs/FEATURES_STATUS.md` — statut des features impactées (❌ → ⚠️ → ✅)
   - `docs/implementation-log.md` — entrée déjà ajoutée au §2
   - `CLAUDE.md` — si fichiers clés ajoutés/supprimés ou chantier terminé

> **Règle d'or : aucun patch sans entrée dans `implementation-log.md`.**

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

## Commandes

```bash
npm install          # Installation
npm run dev          # Dev server (localhost:8080)
npm run build        # Build production
npm test             # Tests Vitest
npx tsc --noEmit     # Type check
```
