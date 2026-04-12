# Design — Restructuration vue "Mon suivi" nageur

**Date :** 2026-04-12
**Statut :** Validé

## Contexte

La page "Mon suivi" (`/#/suivi`) est actuellement un composant `AthletePerformanceHub` avec 3 onglets (Semaine, Saison, Progression) en toggle. Ce design est insuffisant pour la richesse des données à présenter, particulièrement la vue Saison qui doit unifier planification natation et musculation.

## Architecture de navigation

Passage d'un système de tabs à un **hub avec drill-down vers des routes dédiées** :

| Route | Vue | Contenu |
|-------|-----|---------|
| `/#/suivi` | Hub | 3 cartes d'aperçu riches |
| `/#/suivi/semaine` | Ma semaine | Ressentis + séances manquées + absences |
| `/#/suivi/saison` | Ma saison | Timeline unifiée natation/muscu/objectifs/entretiens |
| `/#/suivi/progression` | Ma progression | Page Progress existante (inchangée) |

Chaque vue drill-down a un header sticky avec bouton retour vers le hub. Deep linking fonctionnel.

---

## Section 1 — Hub "Mon suivi" (`/#/suivi`)

3 cartes empilées verticalement. Chaque carte est un mini-dashboard avec KPIs immédiats. Tap → navigation vers la sous-route.

### Carte "Ma semaine"
- **Header :** icône calendrier + titre + compteur `X/Y séances`
- **Corps :**
  - 2-3 dernières séances avec indicateurs colorés (Diff, Fat, Perf, Eng)
  - Séances manquées en style muted/dashed
  - Warning amber si séances sans ressenti : "⚠ X séances sans ressenti"
- **Tap :** → `/#/suivi/semaine`

### Carte "Ma saison"
- **Header :** icône carte + titre + badge `J-X` prochaine compétition
- **Corps :**
  - Barre de progression du cycle en cours (Sem X/Y · Type)
  - Fréquence planifiée : `🏊 Xséances · 🏋️ Yséances`
  - Prochain entretien à préparer (si applicable)
  - Compteur objectifs : `X objectifs · Y atteints`
- **Tap :** → `/#/suivi/saison`

### Carte "Ma progression"
- **Header :** icône tendance + titre
- **Corps :**
  - Mini sparkline readiness 30 jours
  - Readiness moyenne + trend (↑/↓ pts)
  - Volumes macro : mètres nagés + tonnage soulevé
- **Tap :** → `/#/suivi/progression`

---

## Section 2 — Vue "Ma saison" (`/#/suivi/saison`)

### Header sticky
- Bouton retour ← Mon suivi
- Titre "Ma saison"
- Badge J-X prochaine compétition

### Objectifs (section fixe en haut)
- Scroll horizontal de `ObjectiveCard` compacts (existants)
- Bouton "+ Ajouter" en fin de liste
- Objectifs chrono : événement + temps cible + % progression
- Objectifs texte : intitulé

### Timeline unifiée

Timeline verticale chronologique. Trois types d'éléments, ordonnés par date :

#### Semaines (maille par défaut)
- Rail latéral coloré par type de semaine (via `weekTypeColor()`)
  - Foncier → bleu, Charge → rouge/orange, Spécifique → violet, Affûtage → jaune, Récupération → vert
- Contenu compact :
  - Numéro de semaine + dates + badge type
  - Résumé : `🏊 X séances · 🏋️ Y séances`
  - Distance natation estimée + intitulé muscu
  - Notes coach (si présentes, tronquées)
- Chevron pour déplier au jour

#### Semaines dépliées (maille jour)
Chaque jour du lundi au dimanche, montrant :
- Créneaux natation : horaire + lieu + séance assignée (titre, distance)
- Créneaux muscu : horaire + lieu + séance assignée (titre, nb exercices)
- Jours sans créneau : "(repos)" en grisé

Données sources pour la résolution jour :
- `api.getSwimmerSlots(athleteId)` → créneaux récurrents du nageur
- Croisement avec assignments actifs sur ce créneau + cette date
- Séances muscu assignées via plans du nageur

#### Événements ponctuels (intercalés chronologiquement)
- **Compétition** : card avec gradient primary, nom, date, J-X, lien `/#/competition/:id`
- **Entretien** : card avec bordure bleue, statut (à préparer/terminé), badge "À compléter" si section nageur non remplie

### Regroupement par cycle
Les semaines sont groupées sous le nom de leur cycle avec un header :
```
── Cycle: Prépa Régionaux (Sem 4/8) ──
[semaine 4] [semaine 5] ...
── 🏆 Régionaux · 26/04 ──
── Cycle: Prépa Départementaux (Sem 1/6) ──
[semaine 1] ...
```

### Données sources
| Donnée | API |
|--------|-----|
| Cycles + semaines | `getTrainingCycles()` + `getTrainingWeeks()` |
| Créneaux nageur | `getSwimmerSlots()` |
| Assignments natation | résolution slots + assignments |
| Sessions muscu | plans assignés nageur |
| Compétitions | `getCompetitions()` + `getMyCompetitionIds()` |
| Entretiens | `getMyInterviews()` |
| Objectifs | `getObjectives()` |

---

## Section 3 — Vue "Ma semaine" (`/#/suivi/semaine`)

### Header sticky
- Bouton retour ← Mon suivi
- Titre "Ma semaine"
- Navigation semaine : ◀ ▶ (semaine courante par défaut, navigation dans le passé possible)
- Sous-titre : dates de la semaine (ex: "07/04 – 13/04")

### Wellness du jour
Si le wellness du jour n'est pas saisi, un banner CTA en haut :
- "Comment te sens-tu ce matin ?" → ouvre le WellnessForm

### Timeline de la semaine
Items groupés par jour, triés par date + créneau horaire. Séparateurs légers entre les jours.

#### 3 types de cartes :

**1. Ressenti saisi** (carte pleine)
- Date + slot (AM/PM) + lieu
- Titre séance + distance
- 4 pastilles colorées : Diff, Fat, Perf, Eng
- Commentaire tronqué (expandable au tap)
- Note coach si présente (encart bleu)

**2. Séance manquée** (carte dashed/muted)
- Bordure en pointillés + opacité réduite
- Date + slot + lieu + titre séance
- Texte "Pas de ressenti"
- **Tap sur la carte** → ouvre le FeedbackDrawer avec la séance pré-remplie (slot, date, assignment)
- **Bouton discret "✗ Absent"** → marque l'absence en un tap, confirmation via toast

**3. Séance marquée absente** (carte compacte, état final)
- Très compact, texte muted
- Badge "Absent" gris
- Petit bouton ↩ pour annuler le signalement

### Résolution des séances attendues
Pour chaque jour de la semaine :
1. Récupérer les `swimmerSlots` du nageur pour ce `day_of_week`
2. Croiser avec les `assignments` actifs sur ce créneau pour cette date
3. Si un `session` (ressenti) existe pour ce slot + date → carte ressenti
4. Si une absence est enregistrée → carte absence
5. Sinon → carte séance manquée

### Interaction FeedbackDrawer
Le FeedbackDrawer existant (`src/components/dashboard/FeedbackDrawer.tsx`) est ouvert avec un objet `PlannedSession` pré-rempli :
```ts
{
  slot: "AM" | "PM",
  date: string,
  km: number,       // distance prévue si connue
  title: string,    // nom de la séance assignée
  assignmentId: number,
  swimmerSlotId: number,
  source: "slot",
}
```

---

## Section 4 — Vue "Ma progression" (`/#/suivi/progression`)

Inchangée. Embarque le composant `ProgressContent` existant (lazy-loaded).

Seul ajout : header sticky avec bouton retour ← Mon suivi.

---

## Composants à créer/modifier

| Composant | Action | Description |
|-----------|--------|-------------|
| `src/pages/Suivi.tsx` | Modifier | Transformer en hub avec 3 cartes |
| `src/pages/SuiviSemaine.tsx` | Créer | Vue semaine avec timeline mixte |
| `src/pages/SuiviSaison.tsx` | Créer | Vue saison avec timeline unifiée |
| `src/pages/SuiviProgression.tsx` | Créer | Wrapper Progress avec header retour |
| `src/components/suivi/SuiviHubCard.tsx` | Créer | Carte générique du hub |
| `src/components/suivi/SeasonTimeline.tsx` | Créer | Timeline unifiée semaine/jour |
| `src/components/suivi/WeekTimelineItem.tsx` | Créer | Carte semaine (compacte + dépliable) |
| `src/components/suivi/EventCard.tsx` | Créer | Carte événement (compétition/entretien) |
| `src/components/suivi/WeekdayView.tsx` | Créer | Vue jour dépliée (créneaux + séances) |
| `src/components/suivi/SessionCard.tsx` | Créer | Carte ressenti/manquée/absente |
| `src/components/suivi/WeekNavigator.tsx` | Créer | Navigation ◀ semaine ▶ |
| `src/components/profile/AthletePerformanceHub.tsx` | Modifier | Supprimer mode standalone (conservé pour coach) |
| `src/App.tsx` (routes) | Modifier | Ajouter les 3 sous-routes |

## Design system
- Respect du système existant : Tailwind 4, Shadcn/Radix, rounded-3xl, gradients subtils
- Rail latéral coloré pour les semaines → `weekTypeColor()` existant
- Cartes dashed pour séances manquées : `border-dashed border-border opacity-70`
- Pastilles indicateurs → `indicatorColor()` existant dans SwimmerFeedbackTab
- Transitions : Framer Motion `slideUp` pour les cartes, `AnimatePresence` pour expand/collapse
