# Design — Refonte interface nageur (Home + Dock + esquisse Suivi)

**Date :** 2026-04-12
**Statut :** Validé

---

## Contexte

L'interface nageur actuelle a un dock 5 onglets (Accueil/Analyse/Muscu/Suivi/Profil) où le Profil sert de fourre-tout pour des features éparpillées (Records, Messages, Hall of Fame, Rapport mensuel, Neurotype, Badges). Il n'y a pas de "Home" dédiée comme côté coach. Le wellness est enfoui dans le calendrier. L'accès aux différentes vues nécessite souvent 2-3 taps.

**Objectif :** Créer une Home nageur comme point d'entrée quotidien, réorganiser le dock pour un accès intuitif à toutes les vues, et poser les bases d'un Suivi en 3 horizons temporels.

---

## 1. Architecture du Dock (5 onglets)

| Position | Icône | Label | Route | Contenu |
|----------|-------|-------|-------|---------|
| 1 | `Waves` | **Natation** | `/natation` | Calendrier mensuel (ex-Accueil, sans wellness) |
| 2 | `Dumbbell` | **Muscu** | `/strength` | Module musculation (inchangé) |
| 3 (centre) | `Home` | **Home** | `/` | Nouvelle page d'accueil |
| 4 | `Target` | **Suivi** | `/suivi` | Hub 3 horizons temporels |
| 5 | `User` | **Profil** | `/profile` | Identité + compte + paramètres |

### Changements vs. actuel

- **Home** est nouvelle, position centrale (route `/` par défaut)
- **Natation** = ex-"Accueil" sans le WellnessBanner (migré vers Home)
- **Analyse** (ex-"Progress") disparaît du dock → intégrée dans Suivi tab "Progression"
- **Profil** conserve badges + neurotype (identité) + paramètres
- Route `/progress` redirige vers `/suivi?tab=progression`

---

## 2. Page Home nageur

Page scrollable verticale, mobile-first, sections empilées par priorité quotidienne.

### Section A — Header

- "Bonjour {prénom}" + date du jour (français)
- Avatar miniature (32px) en haut à droite → tap = navigation Profil
- Pas de titre "Home" (le greeting suffit)

### Section B — Wellness du jour (hero)

Toujours visible. 2 états :

**Non rempli :**
- Card prominente avec fond dégradé doux
- Texte "Comment te sens-tu ce matin ?"
- Bouton "Remplir" → ouvre WellnessForm (même bottom sheet)
- CTA principal du matin

**Rempli :**
- Card compacte : ReadinessGauge arc (score %)
- 6 métriques en mini-pills (sommeil, fatigue, courbatures, humeur, stress, heures)
- Bouton "Modifier" discret
- Badge rouge "Douleurs signalées" si applicable

> **Migration :** WellnessBanner retiré de Dashboard.tsx → déplacé ici. Deep link `?wellness=open` redirige vers Home.

### Section C — Aujourd'hui (séances du jour)

Cards horizontales (1-2 selon créneaux AM/PM).

Chaque card :
- Horaire (Matin / Soir) + type (Nage / Muscu)
- Titre de la séance assignée (ou "Entraînement libre")
- Distance prévue (si nage)
- État : vert+check (logé), orange+horloge (à faire), gris (pas prévu)
- **Tap → ouvre FeedbackDrawer** directement (même composant)

Cas particuliers :
- Jour off → message "Jour de repos" discret
- Séance muscu → card avec bouton "Démarrer" → navigation `/strength` avec session pré-sélectionnée

### Section D — Prochaine compétition (conditionnel)

Affiché si compétition assignée dans les 30 prochains jours.

- Nom + lieu + badge "J-X"
- Mini progress : "Checklist X/Y" + "N courses"
- Tap → `/competition/:id`
- Masqué si aucune compétition à venir

### Section E — Messages coach (conditionnel)

Affiché si messages non lus > 0.

- Card violette/indigo avec badge count
- Aperçu dernier message (1 ligne truncated)
- Tap → vue Messages
- Masqué si 0 messages non lus

### Section F — Accès rapides

Grille 4 colonnes, 1 ligne :

| Tuile | Icône | Navigation |
|-------|-------|------------|
| Records | `Trophy` | `/records` |
| Club | `Crown` | `/hall-of-fame` |
| Notes | `FileText` | `/swim-notes` |
| Rapport | `BarChart3` | `/report/:userId/:month` |

---

## 3. Modifications onglets existants

### Natation (ex-Accueil)

- Route change : `/` → `/natation` (ou on garde `/calendar`)
- Suppression du WellnessBanner (migré vers Home)
- Tout le reste identique : CalendarHeader, CalendarGrid, FeedbackDrawer, présence hebdo
- Le bouton Records dans le header peut rester (accès rapide contextuel)

### Profil (allégé + identité)

Conserve :
- Hero (avatar, nom, rôle, groupe)
- Badges grid
- Neurotype (quiz + résultat)
- Section "Mon compte" (profil edit, apparence, sécurité, push, mise à jour)
- Déconnexion

Supprime :
- Grille "Accès rapides" (déplacée vers Home)
- Card "Messages" (déplacée vers Home)

### Muscu

Aucun changement.

---

## 4. Esquisse Suivi — 3 horizons temporels

### Architecture : 3 tabs

| Tab | Label | Horizon | Icône |
|-----|-------|---------|-------|
| 1 | **Semaine** | Court terme | `Calendar` |
| 2 | **Saison** | Moyen terme | `Map` |
| 3 | **Progression** | Long terme | `TrendingUp` |

SwimmerObjectivesView reste au-dessus des 3 tabs.

### Tab "Semaine" (court terme)

- Liste chronologique des sessions de la semaine avec 4 indicateurs
- Mini wellness sparkline 7 jours (readiness trend)
- Résumé : km nagés, sessions complétées, tonnage muscu

### Tab "Saison" (moyen terme) — vision directrice

> Design détaillé dans un chantier futur.

Principes :
- **Barre de progression saison** : visualisation linéaire du macro-cycle, position actuelle, phases colorées (Endurance/Force/Affûtage/Compétition), compétitions comme jalons
- **Objectifs contextualisés** par la phase en cours
- **Entretiens** comme jalons/checkpoints de la timeline
- **Planif nage + muscu unifiée** : charge de travail globale visible

Pour V1 : contenu actuel de `/suivi` tabs Entretiens + Planif redistribué ici.

### Tab "Progression" (long terme)

Absorption de l'actuel `/progress` :
- Stats nage (volume, trends, répartition nages) — période 7j/30j/1an
- Stats muscu (tonnage, RPE, progression 1RM)
- Records personnels en raccourci (lien `/records`)
- Prochaine compétition banner

Route `/progress` redirige vers `/suivi?tab=progression`.

### Migration V1

| Ancien | Nouveau |
|--------|---------|
| `/suivi` tab Ressentis | → Suivi tab **Semaine** |
| `/suivi` tab Entretiens | → Suivi tab **Saison** (temporaire) |
| `/suivi` tab Planif | → Suivi tab **Saison** (temporaire) |
| `/progress` composant complet | → Suivi tab **Progression** |
| SwimmerObjectivesView | → Au-dessus des tabs (inchangé) |

---

## 5. Redirections à mettre en place

| Ancienne route | Nouvelle route |
|----------------|----------------|
| `/` (nageur) | Home (nouvelle) |
| `/progress` | `/suivi?tab=progression` |
| `?wellness=open` | Home avec auto-open wellness |
| `/profile?section=messages` | Home section messages (ou garder Profil comme fallback) |

---

## 6. Périmètre d'implémentation

### Phase 1 (ce chantier)
- Créer la page Home nageur avec les 6 sections
- Modifier le dock (navItems) : nouveau routing + icônes
- Migrer WellnessBanner de Dashboard vers Home
- Renommer/rerouter Dashboard → Natation
- Intégrer Progress dans Suivi tab Progression
- Mettre en place les redirections
- Alléger Profil (supprimer accès rapides et messages)

### Phase 2 (chantier futur)
- Redesign complet du tab Saison (barre de progression, planif unifiée)
- Enrichissement tab Semaine (sparklines wellness, résumé)
