# Design — Assiduité muscu + mésocycles dans « Planif Muscu »

*Date : 2026-06-01 · Statut : validé (brainstorming), à planifier*

## Problème

1. La liste des mésocycles muscu actifs occupe l'écran d'accueil coach (`CoachActiveMesocyclesSection` dans `Coach.tsx`). Le coach veut la sortir du home.
2. Il veut retrouver ces mésocycles **dans la vue « Planif Muscu »**, avec la même section que lorsqu'il clique un méso depuis le home (le `CoachMesocyclePanel`, « uniquement la section correspondante »).
3. Il manque un **contrôle d'assiduité** facilement visible : sur une fenêtre récente, combien de séances étaient **prévues** vs réellement **terminées**, avec un état intermédiaire **« débutée »**.
4. Objectif métier : **volume de la semaine toujours 100% réalisé**, même si l'emploi du temps impose un **décalage** (séance prévue lundi faite mardi). Le coach doit pouvoir dire « tu n'as pas fait ta séance de lundi, tu la fais mardi pour compenser ? ».

## Décisions de cadrage (validées)

| Sujet | Décision |
|---|---|
| Structure de la vue | **Assiduité + Mésocycles**, on **retire** l'aperçu hebdo read-only actuel (le composant timeline reste dispo si besoin futur). |
| Calcul du 100% | **À la semaine ISO** : lundi raté + mardi fait = semaine 100% (tolérant au décalage). |
| Périmètre | **Nageurs à mésocycle actif uniquement** (le « prévu » vient du plan méso). |
| « Débutée » dans le % | **Non** : seul « terminé » remplit le %. « Débutée » = état intermédiaire orange, visible mais ne compte pas. |
| Interactions v1 | **Lecture seule** (le coach parle au nageur en direct). |
| Fenêtre | **Navigable** : toggle **1 / 2 / 4 semaines**, flèches précédent/suivant (décalage d'un bloc), défaut = **période courante** (contenant aujourd'hui). |

## Modèle de données (existant, aucune migration de schéma)

- **Prévu** = `strength_planning_slot_overrides` (`athlete_id`, `week_start`, `day_of_week`, `session_template_id`) → date calendaire = `week_start` (lundi) + `day_of_week`.
- **Réalisé / débuté** = `strength_session_runs` (`athlete_id`, `session_id`, `status` ∈ `in_progress`/`completed`/`abandoned`, `started_at`, `completed_at`). Les runs lancés depuis un slot méso ont `assignment_id = null` et `session_id = session_template_id`.
- **Appariement** : par athlète + appartenance du `session_id` aux templates du méso + **fenêtre semaine** (pas jour strict). Le step « débutée » existe déjà (`run.status = "in_progress"`) — rien à créer côté données.

## Approche retenue : C (hybride)

Agrégateur **TS pur** testé + helper **API batché**. Pas de RPC, pas de migration de schéma.

- **A** (tout client dans le composant) : rejeté — logique de matching non testable, noyée dans le rendu.
- **B** (RPC SQL `get_strength_attendance`) : rejeté pour la v1 — migration + RLS + tests RLS trop lourd pour une vue lecture seule.

## Composants

### 1. `StrengthPlanningScreen` (rebâti)
- **Section A — Assiduité** (en tête, défaut).
- **Section B — Mésocycles actifs** : accordéon, un nageur par ligne ; déplie le `CoachMesocyclePanel({ athleteId })` existant, **chargé à l'ouverture** (lazy).
- L'aperçu hebdo read-only actuel (dérivé de `training_plan_applications`) est retiré.

### 2. `StrengthAttendanceBoard` (nouveau)
- En-tête : **toggle 1/2/4 sem** + **flèches ◀ ▶** + libellé de période. Défaut = période courante.
- Une ligne par nageur à méso actif :
  - **Jauge semaine** `terminées / prévues` par semaine ISO de la période, couleur selon % (objectif 100%).
  - **Bande de jours** : pastille par jour — `prévu·non fait` ⚪ / `débuté` 🟠 / `terminé` 🟢 / vide.
  - Marquage décalage : un jour passé prévu-mais-vide est **« déplacée »** si la semaine est complète, **« à faire »** sinon.

### 3. `src/lib/strength/attendance.ts` (nouveau, pur, testé `node:test`)
`computeAttendance(plannedSlots, runs, periodStart, periodEnd, today)` →
par nageur `{ weeks: [{ weekStart, planned, completed, pct }], days: [{ date, status }] }`.
- completed = runs `completed` (session_id ∈ templates méso), plafonné au nb prévu de la semaine.
- started = runs `in_progress` (n'incrémente pas le %).

### 4. `getStrengthAttendanceData(athleteIds, periodStart, periodEnd)` (helper API)
`select` groupés `.in('athlete_id', [...])` sur slot_overrides + runs sur la fenêtre.

### 5. `Coach.tsx`
Suppression de `<CoachActiveMesocyclesSection />` du home. (Composant supprimé ou laissé orphelin — à trancher au plan.)

## Données / erreurs / tests

- React Query, skeletons, état vide (« aucun mésocycle actif »), fallback offline existant.
- **`node:test`** sur `attendance.ts` (matching, décalage, plafonnement, bords de période). Vitest si un hook le justifie.

## ⚠️ Risque à lever en étape 0 (avant tout code UI)

Le coach doit pouvoir **SELECT** `strength_session_runs` **et** `strength_planning_slot_overrides` **de ses nageurs**. Si la RLS bloque la lecture cross-athlète, le tableau sera vide → policy à ajouter (et **tests RLS** requis dans ce cas, cf. `CLAUDE.md`). Vérifier l'état RLS réel avant d'implémenter le board.

## Hors-scope v1

Relance push, marquage « excusée », RPC serveur, édition de plan depuis cette vue, nageurs sans méso actif.
