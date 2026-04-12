# État de l'art — Applications de suivi d'athlètes

*Date : 2026-03-29*

Ce document compare les meilleures fonctionnalités du marché avec l'application EAC Suivi Natation V2, et identifie les axes d'amélioration potentiels.

---

## 1. Panorama des références du marché

### 1.1 Natation — Gestion d'équipe & entraînement

| Application | Focus | Points forts |
|-------------|-------|-------------|
| **Commit Swimming** | Gestion équipe natation (#1 mondial) | Parser séance intelligent, analytics volume/intensité/nage auto, attendance deck-side, progression individuelle interactive, saison planning |
| **SwimShare (ClubAssistant)** | Planification & partage séances | Intervalles prédits + intensités auto par IA adaptative, variations automatiques par groupe de niveau |
| **Phlex Swim** | Analyse technique & physiologie | IA analyse technique/physiologie/performance, partenariat Polar (HR temps réel), modèles scientifiques d'amélioration |
| **TeamUnify** | Administration club USA Swimming | Intégration Hy-Tek, résultats temps réel, entries automatisées, gestion admin complète |

### 1.2 Musculation & Préparation physique

| Application | Focus | Points forts |
|-------------|-------|-------------|
| **Hevy** | Tracker muscu #1 iOS/Android | UX exemplaire, RPE par série, rest timer auto, détection PR live, social feed + leaderboard, monthly reports, progress photos, HevyGPT |
| **TeamBuildr** | S&C coaches (équipes) | 50+ programmes, TV Whiteboard timing, questionnaires wellness custom, vidéo feedback athlète, opt-out exercice + substitution, AMS intégré |
| **BridgeAthletic** | Performance departments | Compliance/load/readiness temps réel, gain 3h40/sem pour les coachs, département complet |
| **TrainHeroic** | Marketplace & remote coaching | Marketplace programmes, readiness questionnaire, communauté, business tools coach |
| **Fitbod** | Auto-régulation individuelle | Progressive overload auto-régulé, periodization IA, adaptation par performance logged |
| **JuggernautAI** | Powerlifting avancé | Periodization blocks structurée (accumulation/intensification/peaking), IA ajuste volume/intensité sur data collectée |

### 1.3 Athlete Management Systems (AMS)

| Application | Focus | Points forts |
|-------------|-------|-------------|
| **Smartabase (Fusion Sport)** | Équipes nationales & JO | Dashboards custom, data pipelines, workflows, injury risk management |
| **CoachMePlus** | Wellness & load monitoring | Wellness questionnaires quotidiens, alerts automatiques, load monitoring, vidéo feedback |
| **Teamworks** | Centralisation performance | Fusion data load/testing/nutrition/surveys, identification risque blessure, collaboration médical/coach |
| **AthleteMonitoring** | ACWR & charge d'entraînement | Acute:Chronic Workload Ratio, RPE × durée, Z-scores quotidiens, pain/stiffness evolution |
| **TeamBuildr AMS** | Sport science add-on | Body Heat Map, KPI Tracker, Volume Tracker, Wearables Dashboard, Load Monitoring, Habit Tracker, Force Plate |
| **CoachRx** | Periodization individuelle | Macrocycles/mesocycles/microcycles visuels, phases (accumulation/intensification/compétition/deload) |

---

## 2. Fonctionnalités "best-in-class" par domaine

### 2.1 Suivi de charge d'entraînement (Training Load)

**Ce qui se fait de mieux :**
- **sRPE (session RPE)** : RPE × durée session = charge interne. Collecté post-session.
- **ACWR (Acute:Chronic Workload Ratio)** : ratio charge 7j / charge 28j. Zone optimale 0.8–1.3. Alertes automatiques si >1.5 (risque blessure) ou <0.8 (désentraînement).
- **Monotonie & Strain** : variation de la charge (monotonie = moyenne/écart-type), contrainte cumulée.
- **Dashboards coach** : graphiques charge par athlète avec zones de danger, tendances sur 4-8 semaines.
- **Intégration wearables** : Polar, Garmin, Apple Watch → HR, HRV, sommeil auto-importés.

**EAC aujourd'hui :** Ressenti post-session (difficulté, fatigue, perf, engagement, distance, commentaire). Pas de calcul ACWR, pas de sRPE formalisé, pas de dashboard charge.

### 2.2 Wellness & Readiness

**Ce qui se fait de mieux :**
- **Questionnaire wellness quotidien** (5-6 items) : sommeil, fatigue, humeur, douleurs musculaires, stress non-sportif, cycle menstruel.
- **Score de readiness** composite (0-100) dérivé du questionnaire.
- **Body Heat Map** : athlète touche les zones douloureuses sur un schéma corporel, avec intensité 1-5.
- **Alertes coach** : notification automatique si un athlète score sous un seuil ou si tendance baissière sur 3+ jours.
- **Habit Tracker** : suivi hydratation, nutrition, sommeil, routines.

**EAC aujourd'hui :** Ressenti limité à la session (post-entraînement). Pas de wellness matinal, pas de body heat map, pas de readiness score, pas d'alertes coach automatisées.

### 2.3 Periodization & Planification

**Ce qui se fait de mieux :**
- **3 niveaux explicites** : Macrocycle (saison/semestre) → Mesocycle (3-6 semaines, avec phase : accumulation, intensification, compétition, transition/deload) → Microcycle (semaine).
- **Vue Gantt/timeline** : visualisation horizontale des blocs avec couleurs par phase et objectifs.
- **Charge prescrite vs réalisée** : overlay graphique montrant l'écart entre le plan et l'exécution.
- **Templates de périodisation** : linéaire, ondulée, par blocs, conjuguée.
- **Héritage groupe → individuel** : plan groupe customisable par athlète.

**EAC aujourd'hui :** Macro-cycles entre compétitions avec semaines typées (texte libre + couleur auto). Timeline verticale. Héritage groupe → individuel. Bon niveau, mais pas de charge prescrite vs réalisée, pas de templates de périodisation, pas de vue Gantt horizontale.

### 2.4 Analytics & Visualisation (natation)

**Ce qui se fait de mieux :**
- **Breakdown automatique** : chaque set auto-classifié par nage, distance, type (technique/endurance/vitesse), intensité → analytics zéro-effort.
- **Volume par nage/type/intensité** : graphiques empilés sur le temps (semaine, mois, saison).
- **Progression par épreuve** : courbes interactives avec tous les temps compétition et entraînement.
- **Attendance analytics** : taux de présence par groupe, tendances, corrélation présence/performance.
- **Comparaison inter-athlètes** : benchmarking au sein du groupe.

**EAC aujourd'hui :** Parser séance structuré, timeline colorée avec intensité, FFN sync auto, records personnels et club, Hall of Fame. Manque : analytics volume auto (nage/type/intensité), graphiques tendance charge natation, corrélation présence/performance.

### 2.5 Musculation — UX & Features

**Ce qui se fait de mieux :**
- **Détection PR en live** : notification instantanée pendant la séance quand un record est battu.
- **Rest timer intelligent** : auto-ajusté selon le type d'exercice (plus long pour composés lourds).
- **Substitution d'exercice** : l'athlète peut remplacer un exercice (blessure/équipement manquant) avec suggestions intelligentes par muscle group.
- **Vidéo form-check** : l'athlète filme sa série, le coach review et annote.
- **Progress photos** : timeline visuelle de transformation physique.
- **Graphiques par exercice** : évolution 1RM estimé, volume total, tonnage par muscle.
- **Social/Leaderboard** : classement entre athlètes sur les lifts principaux.
- **RPE par série** : saisie rapide 1-10 sur chaque série.
- **Monthly reports** : rapport auto avec KPIs, volumes par muscle, PRs.

**EAC aujourd'hui :** Mode focus avec saisie charge/reps, 1RM, historique, GIF exercice, dossiers hiérarchiques, plans d'équipe, templates coach. Substitution d'exercice (§89). Manque : détection PR live, rest timer intelligent, vidéo form-check athlete, progress photos, graphiques détaillés par exercice, social/leaderboard muscu, RPE par série, rapports mensuels auto.

### 2.6 Communication & Engagement

**Ce qui se fait de mieux :**
- **In-app messaging** temps réel (chat coach-athlète).
- **Notifications contextuelles** : rappels séance, félicitations PR, alertes compétition.
- **Feed social** : partage de workouts, likes, commentaires entre athlètes.
- **Gamification** : badges, streaks, challenges d'équipe, niveaux.
- **Reports automatiques aux parents** : résumé hebdomadaire de l'assiduité et de la progression.

**EAC aujourd'hui :** SMS groupé, notifications push, bannières compétition. Pas de messaging in-app, pas de feed social, pas de gamification, pas de reporting automatique parents.

### 2.7 Préparation compétition

**Ce qui se fait de mieux :**
- **Race planning** avec pacing strategy (split times cibles).
- **Warm-up protocols** personnalisés et chronométrés.
- **Mental prep** : routines de visualisation, checklist mentale.
- **Nutrition planning** : plan alimentaire J-3 à J+1.
- **Post-race analysis** : comparaison splits réels vs objectifs, vidéo review.

**EAC aujourd'hui :** Courses, routines pré-course, timeline Jour J, checklist — très bon niveau. Manque : pacing strategy avec splits, nutrition planning, post-race analysis comparatif.

---

## 3. Matrice comparative synthétique

| Domaine | Maturité EAC | Best-in-class | Écart | Priorité suggérée |
|---------|:------------:|:-------------:|:-----:|:-----------------:|
| **Auth & Rôles** | ★★★★★ | ★★★★★ | = | — |
| **Planification séances nage** | ★★★★★ | ★★★★★ | = | — |
| **Parser texte → séance** | ★★★★★ | ★★★★☆ | EAC > | — |
| **Timeline séance (consultation)** | ★★★★★ | ★★★★☆ | EAC > | — |
| **Partage public séances** | ★★★★★ | ★★★☆☆ | EAC >> | — |
| **FFN Sync & Records** | ★★★★★ | ★★★★☆ | EAC > | — |
| **Compétitions (prep nageur)** | ★★★★☆ | ★★★★★ | Léger | Moyenne |
| **Musculation (saisie)** | ★★★★☆ | ★★★★★ | Léger | Moyenne |
| **Periodization (macro-cycles)** | ★★★★☆ | ★★★★★ | Léger | Moyenne |
| **Entretiens individuels** | ★★★★★ | ★★★☆☆ | EAC >> | — |
| **Quiz neurotype** | ★★★★☆ | — | Unique | — |
| **Créneaux récurrents** | ★★★★★ | ★★★★☆ | EAC > | — |
| **Groupes/stages** | ★★★★★ | ★★★★☆ | EAC > | — |
| **Pointage heures** | ★★★★★ | ★★★★☆ | EAC > | — |
| **Objectifs (chrono + texte)** | ★★★★☆ | ★★★★★ | Léger | Basse |
| **Training Load (sRPE, ACWR)** | ★☆☆☆☆ | ★★★★★ | **Fort** | **Haute** |
| **Wellness quotidien** | ★☆☆☆☆ | ★★★★★ | **Fort** | **Haute** |
| **Analytics volume natation** | ★★☆☆☆ | ★★★★★ | **Fort** | **Haute** |
| **Graphiques muscu détaillés** | ★★☆☆☆ | ★★★★★ | **Fort** | Haute |
| **Social / Gamification** | ☆☆☆☆☆ | ★★★★★ | **Fort** | Moyenne |
| **Messaging in-app** | ☆☆☆☆☆ | ★★★★☆ | Fort | Basse |
| **Intégration wearables** | ☆☆☆☆☆ | ★★★★★ | Fort | Basse |
| **Rapports auto (parents/coach)** | ☆☆☆☆☆ | ★★★★☆ | Fort | Moyenne |

---

## 4. Points forts distinctifs de l'app EAC

L'application EAC possède plusieurs atouts **rares ou uniques** par rapport au marché :

1. **Intégration natation + musculation dans une seule app** — La majorité des solutions sont soit natation (Commit, TeamUnify) soit musculation (Hevy, TeamBuildr). EAC couvre les deux, ce qui est idéal pour un club de natation.

2. **Entretiens individuels structurés multi-phases** — Workflow draft_athlete → draft_coach → sent → signed avec cloisonnement RLS. Aucune app grand public ne propose ce niveau de structuration.

3. **Quiz neurotype** — Profilage d'entraînement par préférences cognitives. Approche innovante absente des concurrents.

4. **Parser texte → séance** — Le coach tape en texte libre et obtient une séance structurée. Plus flexible que les builders visuels de la concurrence.

5. **Partage public séances** — Lien UUID partageable sans auth, avec CTA inscription. Marketing viral intégré.

6. **Calendrier créneaux slot-centric** — Vue centrée sur les créneaux avec assignation/visibilité, pas juste un calendrier d'événements.

7. **Pointage heures coach** — Fonctionnalité métier spécifique très aboutie (donut, bar chart, comparaison période).

8. **Coût** — Solution gratuite et self-hosted (GitHub Pages + Supabase) vs abonnements de 50-200$/mois pour les solutions du marché.

---

## 5. Axes d'amélioration prioritaires

### 5.1 HAUTE PRIORITE — Training Load & Wellness

**Objectif** : Passer d'une app de gestion à une app d'optimisation de la performance.

#### A. Questionnaire Wellness quotidien
- **Quoi** : 5-6 questions au réveil (sommeil qualité/durée, fatigue, douleurs, humeur, stress) + score composite 0-100.
- **Pourquoi** : C'est le socle de TOUTES les apps AMS sérieuses. Sans ça, le coach pilote à l'aveugle.
- **Benchmark** : CoachMePlus, AthleteMonitoring, TeamBuildr AMS.
- **Complexité** : Moyenne (nouvelle table, formulaire mobile, dashboard coach).

#### B. sRPE & Charge d'entraînement
- **Quoi** : Ajouter le RPE (1-10) au ressenti post-session existant. Calculer sRPE = RPE × durée. Tracker la charge aiguë (7j) vs chronique (28j).
- **Pourquoi** : L'ACWR est le gold standard pour la prévention des blessures. Un ratio >1.5 multiplie le risque par 2-4x.
- **Benchmark** : AthleteMonitoring, CoachMePlus, Firstbeat.
- **Complexité** : Moyenne (enrichir le feedback existant, ajouter calculs, dashboard).

#### C. Dashboard charge coach (Training Load Dashboard)
- **Quoi** : Vue synthétique par athlète : graphique charge 4 semaines, ACWR actuel, zone (vert/orange/rouge), wellness trend.
- **Pourquoi** : Donne au coach une vision actionnable en 10 secondes sur l'état de chaque nageur.
- **Benchmark** : TeamBuildr Load Monitoring, AthleteMonitoring.
- **Complexité** : Moyenne-Haute (agrégation data, graphiques, alertes).

### 5.2 HAUTE PRIORITE — Analytics natation

#### D. Analytics volume automatiques
- **Quoi** : À partir des séances structurées (parser), calculer automatiquement volume par nage, par type (technique/endurance/vitesse/mixte), par intensité. Graphiques empilés par semaine/mois.
- **Pourquoi** : Commit Swimming le fait avec zéro effort coach. C'est le benchmark #1 pour le suivi de l'entraînement natation.
- **Benchmark** : Commit Swimming Performance Suite.
- **Complexité** : Moyenne (data déjà structurée dans les blocs, il faut l'agréger et visualiser).

#### E. Corrélation présence → performance
- **Quoi** : Croiser taux d'assiduité avec progression des temps (FFN/records). Graphique "Les nageurs qui s'entraînent X fois/semaine progressent Y%".
- **Pourquoi** : Outil de motivation (pour le nageur) et d'argumentation (pour le coach/parents).
- **Benchmark** : Commit Swimming Analytics.
- **Complexité** : Faible (les données existent déjà).

### 5.3 MOYENNE PRIORITE — Musculation avancée

#### F. RPE par série + détection PR live
- **Quoi** : Champ RPE (6-10 ou @RPE) par série dans le WorkoutRunner. Toast/confetti quand l'athlète bat un PR (1RM estimé ou charge × reps).
- **Pourquoi** : Le RPE par série est standard dans toutes les apps sérieuses (Hevy, Strong, JuggernautAI). La détection PR est le meilleur outil de motivation instantanée.
- **Benchmark** : Hevy, Strong, JuggernautAI.
- **Complexité** : Faible (données déjà présentes, ajout UI + logique comparaison).

#### G. Graphiques détaillés par exercice
- **Quoi** : Pour chaque exercice : courbe 1RM estimé dans le temps, volume total (séries × reps × charge), tonnage par semaine.
- **Pourquoi** : Visualiser la progression motive l'athlète et aide le coach à ajuster la programmation.
- **Benchmark** : Hevy, Strong.
- **Complexité** : Faible-Moyenne (calculs simples, graphiques Recharts).

#### H. Rapports mensuels auto
- **Quoi** : Rapport généré automatiquement chaque mois : résumé assiduité, PRs battus, volume natation, volume muscu, wellness trend, objectifs atteints.
- **Pourquoi** : Fidélisation, engagement, outil de communication parents/comité.
- **Benchmark** : Hevy Monthly Report, Commit Swimming.
- **Complexité** : Moyenne (agrégation multi-sources, template PDF ou page dédiée).

### 5.4 MOYENNE PRIORITE — Engagement & Social

#### I. Gamification légère
- **Quoi** : Streaks d'assiduité, badges (10 séances consécutives, PR battu, 100% wellness rempli), challenges d'équipe mensuels.
- **Pourquoi** : L'engagement des 14-18 ans passe par le jeu. Les apps comme Hevy et Strava l'ont prouvé.
- **Benchmark** : Hevy, Strava, Nike Training Club.
- **Complexité** : Moyenne (système de badges, logique triggers, UI trophées).

#### J. Leaderboard muscu inter-nageurs
- **Quoi** : Classement sur les lifts principaux (squat, bench, deadlift, pull-ups) relatif au poids de corps.
- **Pourquoi** : Émulation entre nageurs, motivation collective. Le Hall of Fame existe déjà pour la natation.
- **Benchmark** : Hevy, TeamBuildr.
- **Complexité** : Faible (données existantes, nouvelle vue).

### 5.5 BASSE PRIORITE — Nice to have

#### K. Body Heat Map douleurs
- **Quoi** : Schéma corporel interactif pour signaler les zones douloureuses avec intensité.
- **Benchmark** : TeamBuildr AMS.
- **Complexité** : Haute (SVG interactif, nouvelle table).

#### L. Intégration wearables (Garmin/Apple Watch)
- **Quoi** : Import auto de HR, HRV, sommeil depuis les montres connectées.
- **Benchmark** : Phlex, CoachMePlus, Firstbeat.
- **Complexité** : Haute (APIs tierces, OAuth, sync).

#### M. Post-race analysis
- **Quoi** : Saisie splits réels vs objectifs, comparaison visuelle, notes coach.
- **Benchmark** : Commit Swimming.
- **Complexité** : Moyenne.

#### N. Vidéo form-check (muscu)
- **Quoi** : L'athlète filme une série, le coach review et commente.
- **Benchmark** : TeamBuildr, BridgeAthletic.
- **Complexité** : Haute (stockage vidéo, streaming, annotations).

---

## 6. Roadmap suggérée (prochaines itérations)

| Phase | Items | Impact | Effort |
|-------|-------|--------|--------|
| **Phase 1 — Pilotage par la data** | A (Wellness quotidien) + B (sRPE/ACWR) + C (Dashboard charge) | Transformateur | 3-4 sprints |
| **Phase 2 — Analytics natation** | D (Volume auto) + E (Corrélation présence/perf) | Élevé | 2 sprints |
| **Phase 3 — Muscu avancée** | F (RPE série + PR live) + G (Graphiques exercice) | Modéré | 1-2 sprints |
| **Phase 4 — Engagement** | I (Gamification) + J (Leaderboard muscu) + H (Rapports mensuels) | Modéré | 2-3 sprints |
| **Phase 5 — Premium** | K (Heat map) + L (Wearables) + M (Post-race) + N (Vidéo) | Différenciant | 4+ sprints |

---

## 7. Conclusion

L'application EAC est **remarquablement complète** pour une solution développée sur mesure. Elle surpasse les solutions du marché sur plusieurs axes (entretiens structurés, parser texte, partage public, créneaux slot-centric).

Le principal gap se situe sur le **pilotage scientifique de la charge d'entraînement** (wellness, sRPE, ACWR) et les **analytics automatiques**. Combler ce gap transformerait l'app d'un outil de gestion en un véritable **outil d'optimisation de la performance**, au niveau des AMS professionnels mais accessible à un club amateur.

Les fonctionnalités de la Phase 1 (Wellness + Training Load) sont les plus impactantes et relativement accessibles puisque l'infrastructure (feedback post-session, dashboard coach) existe déjà.

---

## Sources

- [Commit Swimming](https://www.commitswimming.com) — #1 swim team management
- [Commit Swimming Performance Suite](https://commitswimming.com/performance-suite) — Analytics natation
- [SwimShare by ClubAssistant](https://swimshare.clubassistant.com/) — IA adaptative natation
- [Phlex Swim](https://www.phlexswim.com/coach) — Analyse technique IA
- [Hevy](https://www.hevyapp.com/features/) — #1 workout tracker iOS/Android
- [TeamBuildr](https://www.teambuildr.com/) — S&C platform + AMS
- [TeamBuildr AMS](https://www.teambuildr.com/platform-ams) — Sport science module
- [BridgeAthletic](https://info.bridgeathletic.com/bridgeathletic-vs-teambuildr) — Performance departments
- [TrainHeroic](https://www.teambuildr.com/trainheroic-vs-teambuildr) — Marketplace coaching
- [Fitbod](https://fitbod.me/blog/the-best-personalized-workout-apps-for-strength-training-ranked-by-real-results-2025/) — IA periodization
- [JuggernautAI](https://www.findyouredge.app/news/best-strength-training-apps-2026) — Powerlifting periodization
- [CoachMePlus](https://coachmeplus.com/choosing-athlete-management-system/) — AMS wellness & load
- [AthleteMonitoring](https://www.athletemonitoring.com/workload-management/) — ACWR & charge
- [Teamworks](https://teamworks.com/ams/) — AMS centralisation
- [Vitruve Hub](https://vitruve.fit/blog/best-ams-guide-for-top-athlete-management-system/) — VBT & load management
- [CoachRx](https://www.coachrx.app/articles/planning-amp-periodization-tools-to-design-better-programs) — Periodization planning
- [SimpliFaster — AMS Buyer's Guide](https://simplifaster.com/articles/buyers-guide-athlete-management-system-software/)
- [Best Strength Training Apps 2026](https://www.findyouredge.app/news/best-strength-training-apps-2026) — Hevy vs Strong vs Fitbod
- [Garage Gym Reviews — Best Workout Apps](https://www.garagegymreviews.com/best-workout-apps)
