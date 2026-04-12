# Design — Refonte UX Coach

**Date** : 2026-03-28
**Scope** : Refonte complète du parcours coach (navigation, home, fiche nageur, fusions d'écrans)
**Approche** : Par couches (4 phases déployables séparément)
**Public cible** : Coach traditionnel (peu tech-savvy, besoin de guidage par la clarté)

---

## Contexte & Diagnostic

L'interface coach actuelle comporte 13 sections accessibles via une bottom nav à 5 items + une grille Arsenal de 8 icônes. Problèmes identifiés :

- **Navigation incohérente** : 2 items bottom nav font doublon avec l'Arsenal
- **Écrans redondants** : 6 paires d'écrans qui se cannibalisent (calendrier semaine/mois, messages/SMS, objectifs global/fiche, feedback/entretiens, catalogue nage standalone/via créneaux, bibliothèque nage/muscu séparées)
- **Home non actionnable** : hub de liens plutôt qu'outil de travail
- **Fiche nageur incomplète** : objectifs, créneaux perso et communications accessibles ailleurs
- **Parcours fragmenté** : préparer une semaine nécessite 3+ écrans

## Décisions validées

| Question | Réponse |
|----------|---------|
| Niveau d'ambition | C — Refonte complète |
| Profil coach | B — Coach traditionnel, besoin de simplicité |
| Écrans obsolètes | `CoachObjectivesScreen` supprimé |
| Dashboard home | C — Vue "Ma semaine" |
| Bottom nav | 4 piliers : Semaine / Nageurs / Biblio / Home |
| Onboarding | C — Pas d'onboarding formel, miser sur la clarté |
| Fiche nageur | 4 onglets consolidés : Résumé / Planning / Échanges / Comms |

---

## Phase 1 — Nouvelle navigation

### Bottom nav (4 items)

| Position | Label | Icône | Route | Contenu |
|----------|-------|-------|-------|---------|
| 1 | Semaine | `CalendarDays` | `/coach?section=week` | Calendrier unifié (semaine défaut, toggle mois) |
| 2 | Nageurs | `Users` | `/coach?section=swimmers` | Liste nageurs → fiche détail |
| 3 | Biblio | `Library` | `/coach?section=library` | Catalogue nage + muscu (tabs) |
| 4 | Home | `Home` | `/coach` | Dashboard "Ma semaine" |

### Header coach (toutes pages)

- Gauche : titre section courante
- Droite : avatar coach (tap → `/profile`) + icône notification (tap → messages)

### Changements techniques

- `navItems.ts` : remplacer les 5 items coach par 4 nouveaux
- `AppLayout.tsx` : ajouter avatar + notification dans le header coach
- `Coach.tsx` : supprimer sections obsolètes (`"swim"`, `"swim-library"`, `"strength"`, `"calendar"`, `"training-slots"`, `"objectives"`), ajouter `"week"`, `"library"`, `"comms"`
- Sections conservées telles quelles : `"home"`, `"swimmers"`, `"athlete"`, `"groups"`, `"competitions"`, `"messaging"`, `"sms"`

### Accès écrans secondaires

- Groupes → bouton dans header Nageurs
- Compétitions → card "Échéances" dans Home
- SMS / Messages → card "Communications" dans Home + onglet Comms fiche nageur

---

## Phase 2 — Dashboard Home "Ma semaine"

### Structure verticale (scroll)

#### A. Header
- "Bonjour [Prénom]"
- Sous-titre : "Semaine du [date]"

#### B. Ma semaine (résumé compact)
- Mini-grille 7 jours : ✓ séance assignée, ○ créneau vide, · pas de créneau
- Label "X/Y créneaux planifiés"
- CTA "Z créneaux sans séance" → navigation vers Semaine filtrée
- Tap sur un jour → navigation vers Semaine à ce jour

#### C. Alertes (conditionnel)
- Max 3 alertes triées par sévérité (fatigue max, forme basse)
- Tap → fiche nageur
- Section masquée si aucune alerte

#### D. Accès rapides (grille 2×2)
- Échéances, Groupes, Communications, Records
- Uniquement les écrans non accessibles via bottom nav

#### E. Nageurs récents (3 max)
- 3 derniers nageurs consultés (state localStorage)
- Tap → fiche nageur

### Supprimé vs actuel
- ❌ "Le Quotidien" + CTA "Créer une séance"
- ❌ Arsenal 8 icônes → réduit à 4 accès rapides
- ❌ Top 5 nageurs forme → remplacé par nageurs récents + alertes séparées

### Données nécessaires
- Créneaux semaine + assignations → `useSlotCalendar` (existant)
- Alertes fatigue/forme → KPIs existants dans `CoachHome`
- Nageurs récents → nouveau state localStorage (liste d'IDs)

---

## Phase 3 — Fiche nageur consolidée

### Header fiche
- Bouton retour + avatar + nom + groupe + âge + neurotype

### Onglet 1 — Résumé (inchangé)
KPIs forme/fatigue, dernière séance, stats globales.

### Onglet 2 — Planning (fusion de 3 sources)
3 sections accordéon ouvertes par défaut :
- **Objectifs** : temps cibles (ex `SwimmerObjectivesTab` + `CoachObjectivesScreen`) + CRUD inline
- **Créneaux perso** : jours/heures (ex `SwimmerSlotsTab`) + édition
- **Macro-cycles** : phases, semaines types (ex `SwimmerPlanningTab`)

### Onglet 3 — Échanges (fusion feedback + entretiens)
- Timeline chronologique inversée mélangeant entretiens formels et feedback séances
- Badge de type pour distinguer (entretien vs feedback)
- Tap → détail

### Onglet 4 — Comms (nouveau)
- Toggle Notification in-app / SMS
- Historique des communications pour CE nageur
- Formulaire d'envoi en bas

### Suppressions
- ❌ `CoachObjectivesScreen` → supprimé
- ❌ `SwimmerSlotsTab` comme onglet séparé → intégré dans Planning
- ❌ `SwimmerFeedbackTab` et `SwimmerInterviewsTab` séparés → fusionnés dans Échanges

---

## Phase 4 — Fusions d'écrans

### 4A — Calendrier unifié "Semaine"

Nouveau wrapper `CoachWeekView.tsx` :
- Toggle Semaine ↔ Mois (bouton en haut à droite)
- **Semaine** (défaut) : `CoachTrainingSlotsScreen` existant
- **Mois** : `CoachCalendar` existant
- Dernier mode persisté en localStorage

### 4B — Bibliothèque unifiée "Biblio"

Nouveau wrapper `CoachLibrary.tsx` :
- 2 tabs : Natation / Musculation
- Tab Natation → `SwimCatalog` existant
- Tab Musculation → `StrengthCatalog` existant
- Dernier tab persisté en localStorage

### 4C — Communications unifiées

Nouveau wrapper `CoachComms.tsx` :
- 2 tabs : Notifications / SMS
- Tab Notifications → `CoachMessagesScreen` existant
- Tab SMS → `CoachSmsScreen` existant
- Section `"comms"` remplace `"messaging"` et `"sms"` dans Coach.tsx

### Nouveaux fichiers

| Fichier | Rôle |
|---------|------|
| `src/pages/coach/CoachWeekView.tsx` | Wrapper toggle semaine/mois |
| `src/pages/coach/CoachLibrary.tsx` | Wrapper tabs nage/muscu |
| `src/pages/coach/CoachComms.tsx` | Wrapper tabs notifications/SMS |

**Principe : aucune réécriture d'écran existant.** Les 3 wrappers composent les composants actuels.

---

## Résumé de l'impact

| Métrique | Avant | Après |
|----------|-------|-------|
| Items bottom nav | 5 | 4 |
| Sections Coach.tsx | 13 | 7 (`home`, `week`, `swimmers`, `athlete`, `library`, `groups`, `competitions`, `comms`) |
| Accès Arsenal | 8 icônes | 4 accès rapides |
| Onglets fiche nageur | 4 + écrans séparés | 4 consolidés |
| Écrans supprimés | 0 | 1 (`CoachObjectivesScreen`) |
| Nouveaux fichiers | 0 | 3 wrappers |
| Écrans réécrits | — | 0 (wrappers uniquement) |
