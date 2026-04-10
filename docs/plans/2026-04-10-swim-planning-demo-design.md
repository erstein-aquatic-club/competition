# Design — Planification Natation (Demo)

**Date :** 2026-04-10
**Statut :** Validé

## Contexte

Le coach veut une vue de planification natation inspirée de MyPlanTab (muscu) avec deux échelles :
- **Macro** : semaine par semaine (type + notes)
- **Micro** : grille jours x créneaux avec filières de travail

Cette vue est une **demo isolée** accessible depuis le dashboard coach via un bouton dédié. Si validée par le coach, elle remplacera le SwimmerPlanningTab actuel.

## Architecture

### Page unique — scroll infini avec expansion inline

- Page `SwimPlanningDemo.tsx` accessible via `/#/coach/swim-planning-demo`
- Scroll infini vertical de cards semaines (timeline verticale style MyPlanTab)
- Génération auto depuis la semaine courante + 12 semaines, ajout 4 par 4 au scroll (intersection observer)
- Numéros de semaines ISO (S15, S16...) calculés automatiquement
- Tap sur une card = expand inline pour révéler la grille micro (framer-motion)
- Bouton "Demo" sur le dashboard coach (CoachHome)

### Vue macro — card semaine collapsed

```
[dot timeline] S16  ·  07/04 – 12/04
               [Badge: Foncier]
               "Reprise volume progressif"  [Pencil icon]
```

- Rail vertical à gauche avec dot coloré par type de semaine (weekTypeColor existant)
- Numéro de semaine ISO + plage de dates lun–sam
- Badge type de semaine + notes (1 ligne tronqué)
- Semaine courante en ring-2 ring-primary
- Édition inline (type + notes) via mini-formulaire, pas de sheet

### Vue micro — grille expandue

```
           Matin          Soir
Lun    [+ filière]    [+ filière]
Mar    [Cap. aéro]    [+ filière]
Mer    [Technique]    [Puiss. aéro]
Jeu    [+ filière]    [Cap. anaéro]
Ven    [Entretien]    [+ filière]
Sam    [Compét.]      [—]
```

- 6 lignes (Lun → Sam), 2 colonnes (Matin / Soir)
- Cellules : chip coloré de filière ou bouton `+`
- Tap sur chip = bottom sheet pour changer/supprimer
- Tap sur `+` = bottom sheet avec liste des 8 filières (sélection single-tap)

### Filières prédéfinies (demo)

| ID | Nom complet | Nom court | Couleur |
|----|-------------|-----------|---------|
| entretien-aerobie | Entretien aérobie | Entretien | sky |
| capacite-aerobie | Capacité aérobie | Cap. aéro. | emerald |
| puissance-aerobie | Puissance aérobie | Puiss. aéro. | orange |
| capacite-anaerobie-lact | Cap. anaérobie lactique | Cap. ana. lact. | red |
| puissance-anaerobie-lact | Puiss. anaérobie lactique | Puiss. ana. lact. | violet |
| capacite-anaerobie-alact | Cap. anaérobie alactique | Cap. ana. alact. | slate |
| puissance-anaerobie-alact | Puiss. anaérobie alactique | Puiss. ana. alact. | zinc |
| technique | Technique | Technique | cyan |

## Modèle de données

### Nouvelle table `swim_planning_slots`

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
group_id    integer REFERENCES groups(id)
week_start  date NOT NULL
day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 5)  -- 0=Lun, 5=Sam
time_slot   text NOT NULL CHECK (time_slot IN ('morning','evening'))
filiere     text NOT NULL
session_id  uuid REFERENCES swim_sessions(id) NULL  -- futur
created_at  timestamptz DEFAULT now()

UNIQUE(group_id, week_start, day_of_week, time_slot)
```

### Réutilisation de `training_weeks`

Méta-info semaine (type + notes) via la table existante, rattachée à un cycle "demo" auto-créé par groupe.

### Persistance

- Les semaines sont générées côté frontend (pas en DB tant qu'aucune donnée)
- Un slot n'est persisté que quand le coach assigne une filière
- Pas de lignes vides en DB

## Fichiers

### À créer

| Fichier | Rôle |
|---------|------|
| `src/pages/coach/SwimPlanningDemo.tsx` | Page principale |
| `src/lib/api/swim-planning.ts` | API CRUD swim_planning_slots |
| `src/lib/swimFilieres.ts` | Constantes filières |
| `supabase/migrations/XXXX_swim_planning_slots.sql` | Table + RLS |

### À modifier

| Fichier | Modification |
|---------|-------------|
| `src/lib/api/types.ts` | SwimPlanningSlot + SwimPlanningSlotInput |
| `src/lib/api/index.ts` | Re-export swim-planning |
| `src/lib/api.ts` | Façade swim-planning |
| Routing (App.tsx) | Route /#/coach/swim-planning-demo |
| Dashboard coach | Bouton/card "Planification Natation (Demo)" |

## Hors scope (futur)

- CRUD filières personnalisées (table dédiée + admin)
- Assignation de séances depuis la grille (session_id)
- Transition depuis SwimmerPlanningTab actuel
- Vue nageur de la planification nage
