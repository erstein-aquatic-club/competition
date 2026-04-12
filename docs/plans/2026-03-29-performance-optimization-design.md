# Design — De la gestion à l'optimisation de la performance

*Date : 2026-03-29*
*Statut : Validé*

---

## Contexte

L'application EAC couvre déjà très bien la gestion (séances, créneaux, compétitions, entretiens, objectifs). Le principal gap identifié par le benchmarking (`docs/etat-de-l-art-benchmarking.md`) est le **pilotage scientifique de la charge d'entraînement** et les **analytics automatiques**.

Ce design décrit 5 vagues d'amélioration qui transforment l'app d'un outil de gestion en un outil d'optimisation de la performance.

## Principes

- **Échelle unique 1-5** partout (difficulté existante = proxy RPE). Pas de nouvelle échelle.
- **Calculs côté client** (React Query + agrégation). Les volumes de données d'un club sont faibles.
- **Difficulté muscu optionnelle** — avec valeur ajoutée visible (graphiques, historique).
- **Gamification hybride** — sobre côté coach (KPIs, data), fun côté nageur (badges, streaks, célébrations).
- **Pas de contrainte temporelle** — plan ordonné par dépendances et impact, déroulé au rythme du développement.

---

## Modèle de données

### Nouvelles tables

```
wellness_checks
├── id (uuid PK)
├── user_id (FK users)
├── date (date, UNIQUE avec user_id)
├── sleep_quality (int 1-5)
├── sleep_hours (numeric 0-12)
├── fatigue (int 1-5)
├── soreness (int 1-5)
├── mood (int 1-5)
├── stress (int 1-5)
├── readiness_score (int 0-100, calculé client-side)
├── notes (text, optionnel)
└── created_at (timestamptz)

achievements
├── id (uuid PK)
├── user_id (FK users)
├── type (text: 'streak', 'pr', 'wellness', 'attendance', 'challenge')
├── key (text: identifiant unique, ex: 'streak_10', 'pr_squat')
├── unlocked_at (timestamptz)
├── metadata (jsonb: détails contextuels)

challenges
├── id (uuid PK)
├── coach_id (FK users)
├── group_id (FK groups, nullable pour tout le club)
├── title (text)
├── type (text: 'attendance', 'wellness', 'custom')
├── target (numeric)
├── start_date (date)
├── end_date (date)
├── created_at (timestamptz)

pain_reports
├── id (uuid PK)
├── user_id (FK users)
├── date (date)
├── body_zone (text: ex 'left_shoulder', 'lower_back')
├── intensity (int 1-3: gêne/douleur/forte douleur)
├── created_at (timestamptz)
```

### Enrichissement tables existantes

```
Table feedback existante :
+ session_duration_minutes (int, dérivé du créneau, override possible)
→ sRPE = difficulté (existant) × session_duration_minutes

Table strength_logs :
+ difficulty (int 1-5, nullable, optionnel)
```

### Données calculées (client-side)

```
Training load par nageur (pas de table, calcul React Query) :
├── acute_load = somme sRPE des 7 derniers jours
├── chronic_load = moyenne sRPE/jour sur 28 jours
├── acwr = acute_load / chronic_load
├── monotony = moyenne charge 7j / écart-type charge 7j
├── strain = charge totale 7j × monotony
```

### RLS

Même pattern que le reste : nageur voit les siens, coach voit son groupe, admin voit tout. Le wellness est privé (nageur + ses coachs).

---

## Vague 1 — Socle data

### A. Questionnaire Wellness quotidien

**Nageur :**
- Formulaire 6 items (sleep_quality, sleep_hours, fatigue, soreness, mood, stress) — boutons 1-5 avec emojis visuels
- Banner sur le Dashboard si pas rempli aujourd'hui, disparaît après soumission
- Score readiness affiché après soumission (jauge circulaire type ObjectiveCard)
- Mini-sparkline readiness 7 jours sur le dashboard

**Coach :**
- Fiche nageur : section/onglet Wellness, graphique tendance 4 semaines (6 métriques + readiness)
- Dashboard coach (CoachSwimmersOverview) : pastille couleur readiness par nageur (vert >70, orange 40-70, rouge <40)
- Alerte visuelle si readiness en baisse sur 3+ jours consécutifs

**Readiness score** = moyenne pondérée normalisée. Fatigue, soreness, stress inversés :
`((sleep_quality + (11 - fatigue×2) + (11 - soreness×2) + mood + (11 - stress×2)) / 25) × 100`

### B. sRPE natation

- Exploite le champ `difficulté` (1-5) déjà saisi dans le ressenti post-session
- `sRPE = difficulté × durée_créneau_minutes`
- Durée dérivée automatiquement du training slot. Override manuel possible.
- Zéro changement UX côté nageur

### C. Difficulté par série (musculation)

- Champ optionnel 1-5 dans le WorkoutRunner, à côté de charge/reps
- Badge discret, tap pour saisir
- Si rempli : exploité dans les graphiques exercice (Vague 3) comme overlay couleur → valeur ajoutée visible
- Si non rempli : aucune conséquence, charge muscu calculée sur volume seul

---

## Vague 2 — Exploitation data

### D. Dashboard charge coach

**Vue grille (CoachSwimmersOverview enrichi) :**
- Card nageur avec 3 indicateurs : readiness (pastille), ACWR (badge coloré), charge 7j (mini bar chart vs 4 sem)
- Tri/filtre : readiness basse, ACWR hors zone, groupe

**Vue détaillée (fiche nageur) :**
- Graphique 4-8 semaines : barres empilées charge quotidienne (nage bleu, muscu violet) + ligne ACWR + zone optimale grisée (0.8-1.3)
- Wellness sparklines 4 semaines
- Tableau semaine en cours : jour par jour (charge, difficulté, wellness, présence)
- Alertes textuelles : "ACWR à 1.6 — risque de surcharge", "ACWR à 0.5 — sous-entraînement"

**Calculs :**
- Charge nage = difficulté × durée créneau
- Charge muscu = volume (séries × reps × charge) normalisé, ou difficulté × durée si remplie
- ACWR = charge 7j / charge 28j rolling

### E. Analytics volume natation

**Vue globale (onglet Analytics coach) :**
- Graphique empilé par semaine : volume (m) par nage (papillon, dos, brasse, crawl, 4 nages, éducatif)
- Graphique empilé par semaine : volume par type (endurance, technique, vitesse, mixte)
- Graphique empilé par semaine : répartition par zone d'intensité
- Filtre : groupe, période (4 sem / 8 sem / saison)

**Vue individuelle (fiche nageur) :**
- Mêmes graphiques filtrés sur l'assignation + présence du nageur
- Comparaison individuel vs moyenne du groupe (ligne pointillée)

**Source :** Blocs structurés (SwimBlock[]) croisés avec assignments + présence.

---

## Vague 3 — Analytics & engagement

### F. Détection PR live

- Dans le WorkoutRunner, comparaison instantanée à chaque série validée
- 3 types de PR : 1RM estimé (Epley), charge max pour N reps, volume max séance
- Toast animé + icône trophée sur la série
- Badge PR dans la liste historique des séances

### G. Graphiques détaillés par exercice

- Accessible depuis la fiche exercice (tap dans historique ou WorkoutRunner)
- Courbe 1RM estimé dans le temps (LineChart)
- Volume par séance (BarChart)
- Meilleure série par séance
- Overlay couleur difficulté si renseignée
- Style Apple Health (hero KPI + delta + graphique)

### H. Corrélation présence → performance

- Scatter plot : présence (%) vs progression temps (%)
- Ligne de tendance, stat résumée ("Les nageurs >80% présence progressent de X% vs Y%")
- Filtre : période, groupe, épreuve
- Source : présence (feedback/créneaux) × performances (swimmer_performances FFN)

---

## Vague 4 — Engagement

### I. Gamification

**Badges nageur :**

| Badge | Condition | Paliers |
|-------|-----------|---------|
| Flamme (streak) | Jours consécutifs de présence | 5, 10, 20, 50 |
| PR Hunter | Records muscu battus | 5, 15, 50 |
| Wellness régulier | Jours consécutifs wellness rempli | 7, 14, 30 |
| Iron Will | Séances muscu complétées | 10, 25, 50, 100 |
| Compétiteur | Compétitions participées | 3, 5, 10 |
| Challenge | Objectif d'équipe atteint | — |

- Section "Mes badges" dans le Profil (grille, verrouillés grisés)
- Toast + animation au déverrouillage
- Streak actuel sur le dashboard nageur

**Challenges mensuels :**
- Coach crée un challenge (titre, type, target, période, groupe)
- Barre de progression collective visible par les nageurs
- Côté coach : stats d'engagement (% wellness rempli, streak moyen)

### J. Leaderboard musculation

- Classement par exercice principal, relatif au poids de corps (charge / poids)
- Poids corporel : champ optionnel dans user_profiles
- Top 5 + rang du nageur, style Hall of Fame
- Filtre groupe/club, opt-in (nageur peut se masquer)

### K. Rapports mensuels

- Page web responsive imprimable (pas de PDF)
- Contenu : assiduité, volumes natation, muscu (PRs, tonnage), wellness (readiness moyenne, tendance), charge (ACWR moyen, zone), objectifs (rings %), badges débloqués
- Vue nageur (son rapport) + vue coach (rapport groupe + individuel)

---

## Vague 5 — Premium

### L. Body Heat Map douleurs

- SVG interactif (face + dos), tap zone + intensité 1-3
- Intégré au wellness quotidien (étape optionnelle)
- Coach : historique par nageur, patterns récurrents, alerte si zone signalée 3+ fois en 2 semaines
- Table `pain_reports`

### P. Messaging in-app (éventuel)

- Chat 1:1 coach ↔ nageur
- Messages stockés Supabase + notification push
- À évaluer si SMS/push ne suffit plus

---

## Items retirés

- ~~M. Post-race analysis~~ — hors scope
- ~~N. Intégration wearables~~ — hors scope
- ~~O. Vidéo form-check~~ — hors scope
