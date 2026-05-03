# Vue Info Compétition — Design

**Date** : 2026-05-03
**Auteur** : Claude (brainstormé avec François)
**Statut** : Validé, prêt pour writing-plans

## Problème

Aujourd'hui, `tap` sur la bannière compétition (InlineBanner amber dans `SwimmerHome` Section D et dans le calendrier `Dashboard`) ouvre directement la page `/competition/:id` qui affiche un menu de **préparation** à 4 tabs : Check (checklist), Courses (races), Routines, Jour J (timeline). C'est immédiatement actionnable mais ne donne pas de **vue d'ensemble informationnelle** ("c'est quoi ce meet, où ça se passe, qu'est-ce que je dois y faire, qui y va").

L'utilisateur veut une nouvelle vue "info" qui devienne la landing par défaut, avec un lien vers la page prep actuelle.

## Décisions

### Périmètre
- **Tous les rôles** voient la nouvelle vue info (nageur, coach, comité, admin) avec contenu adapté.
- **CTA "Préparer la compétition →"** visible pour tous (la page prep existante n'a pas de cloisonnement par rôle aujourd'hui, on n'introduit pas de régression).

### Routing
| Avant | Après |
|---|---|
| `/competition/:id` → tabs prep | `/competition/:id` → **vue info (NEW)** |
| — | `/competition/:id/prep` → tabs prep (déplacés) |

- `App.tsx` : 2 `<Route>` au lieu d'1.
- Le composant tabs actuel `CompetitionDetail.tsx` est **renommé** en `CompetitionPrep.tsx`. Logique inchangée. Seul changement : le bouton back arrow → `navigate(\`/competition/${id}\`)` au lieu de `window.history.back()` (préserve la chaîne de navigation info → prep → info).
- `CompetitionDetail.tsx` est **réécrit** pour être la vue info.
- Tous les call sites existants (`navigate(\`/competition/${nextCompetition.id}\`)` dans `SwimmerHome.tsx` L600 et `Dashboard.tsx` L848+L502, push notif `data.url` dans `CompetitionPrep.tsx` L179) atterrissent désormais sur l'info — comportement souhaité, aucun changement à faire côté call sites.

### Contenu de la vue info

**1. Header (commun, repris du composant actuel L220-259)**
- Bouton back (← retour Home/calendar selon historique).
- Nom de la compétition.
- Badge J-X / Aujourd'hui / Terminée.
- Dates (`formatDateRange`).
- Lieu (icône MapPin).
- Description (line-clamp 2 → expandable au tap si trop long).

**2. Section nageur — Mes objectifs + meilleures perfs glissantes**

Tableau fusionné, 1 ligne par objectif sur cette compétition :

| Épreuve | Cible | PB 12 mois | Δ |
|---|---|---|---|
| 50 NL | 0:24.50 | 0:24.82 | +0.32 |
| 100 PAP | 1:05.00 | — | — |
| 200 4N | 2:18.00 | 2:17.85 | -0.15 |

- **Δ rouge** si positif (PB encore au-dessus de la cible → effort restant).
- **Δ vert** si négatif (PB déjà sous la cible → marge confortable).
- État vide : "Aucun objectif défini sur cette compétition" + lien `/profile?section=objectives`.
- Format chrono : `m:ss.cc` (réutiliser le helper existant `formatTimeChrono` ou équivalent).

**3. Section coach/comité/admin — Nageurs participants**

Liste compacte avec mini-stats :

```
┌──────────────────────────────────┐
│ [Avatar] Nom Prénom              │
│          Groupe Compet. M [3 obj]│
├──────────────────────────────────┤
│ [Avatar] Nom Prénom              │
│          Groupe Compet. F [—]    │
└──────────────────────────────────┘
```

- Tri : groupe ASC → nom ASC.
- Compteur d'objectifs : badge "N obj" si > 0, sinon "—" discret.
- Tap ligne → `navigate(\`/profile/${athleteId}\`)`.
- Header section : "Nageurs participants (12)".

**4. CTA "Préparer la compétition" (commun)**
- Sticky bottom (mobile) ou inline en bas du contenu (desktop).
- Style cohérent avec les autres boutons primary du projet (`Button` shadcn variant default + chevron à droite).
- `onClick` → `navigate(\`/competition/${id}/prep\`)`.

## Composants & fichiers

### Nouveaux

| Fichier | Rôle | Taille estimée |
|---|---|---|
| `src/components/competition/InfoMyObjectives.tsx` | Section nageur (table objectifs + PB) | ~120 LOC |
| `src/components/competition/InfoMyObjectives.helpers.ts` | `computeObjectivePerfRow(objective, perfs)` pur | ~40 LOC |
| `src/components/competition/InfoParticipants.tsx` | Section coach/comité (liste participants) | ~100 LOC |
| `src/components/competition/InfoParticipants.helpers.ts` | `groupAndSortAssignments(...)` pur | ~30 LOC |

### Modifiés

| Fichier | Changement |
|---|---|
| `src/pages/CompetitionDetail.tsx` | **Réécrit** : vue info (header + sections rôle + CTA). |
| `src/pages/CompetitionPrep.tsx` | **NEW**, déplacement de l'ancien CompetitionDetail (tabs). Back arrow → `/competition/:id`. |
| `src/App.tsx` | Ajouter route `/competition/:id/prep` → `CompetitionPrep`. |

### Inchangés
- `src/components/competition/{ChecklistTab,RacesTab,RoutinesTab,TimelineTab}.tsx` : utilisés par `CompetitionPrep`, aucune modif.
- Les InlineBanner (SwimmerHome, Dashboard) : aucune modif (route inchangée).

## Data flow

### Vue info (nageur)
1. `useQuery(["competitions"])` → trouve compétition par id.
2. `useQuery(["my-objectives", userId])` → filtre `competition_id === id` côté client.
3. Pour chaque objectif avec `event_code` + `target_time_seconds` :
   - `useQuery(["swimmer-performance-best", userId, event_code, poolLength])` →
     - `api.getSwimmerPerformances({ user_id, event_code, since: today - 365j })`
     - prend `min(time_seconds)`
4. Render table.

### Vue info (coach/comité/admin)
1. `useQuery(["competitions"])`.
2. `useQuery(["competition-assignments", id])` → liste athletes.
3. `useQuery(["competition-objectives-by-athlete", id])` → agrège `count(*) GROUP BY athlete_id` (nouvelle requête API ou agrégation côté client à partir de `getObjectives({ competition_id })`).
4. Render liste triée.

## Adaptation par rôle

```tsx
const role = useUserRole();

return (
  <>
    <Header competition={competition} />
    {role === "athlete" && <InfoMyObjectives competitionId={id} userId={userId} />}
    {role !== "athlete" && <InfoParticipants competitionId={id} />}
    <CTAPreparer onClick={() => navigate(`/competition/${id}/prep`)} />
  </>
);
```

Cas coach-qui-est-aussi-nageur : on privilégie la vue coach (cohérence avec la nav coach actuelle). Si besoin futur, ajouter un toggle dans le header.

## Tests

### Helpers purs (TDD obligatoire)

- `computeObjectivePerfRow.test.ts` :
  - Cible parseable + perf existante → renvoie objet avec delta correct.
  - Cible parseable + perf absente → renvoie `{ pb: null, delta: null }`.
  - Cible non parseable (ex: "Sub minute") → renvoie `{ target: null, ... }` mais affiche le texte tel quel.
  - Delta positif (PB > cible).
  - Delta négatif (PB < cible).

- `groupAndSortAssignments.test.ts` :
  - Tri groupe ASC → nom ASC stable.
  - Athlete sans groupe → bucket "Sans groupe" en queue.

### Composants
- `InfoMyObjectives.test.tsx` : empty state quand aucun objectif.
- `InfoParticipants.test.tsx` : compteur en header + 0 participants → message vide.

### Smoke test routing
- `/competition/:id` rend la vue info.
- Click CTA → `/competition/:id/prep`.
- Back arrow de prep → `/competition/:id`.

## Non-goals (volontairement exclus)

- Pas de section "Mes courses" (b écarté en brainstorm).
- Pas de progression checklist en preview (d écarté).
- Pas de routines dans la vue info (f écarté — accessible via prep).
- Pas de refacto de la page prep elle-même (juste rename).
- Pas de modification du push notif handler (l'URL `#/competition/${id}` continue de marcher, atterrit sur info — l'utilisateur navigue ensuite vers prep s'il veut).
- Pas de dark mode adjustments spécifiques (les composants utilisent les tokens existants).

## Risques

| Risque | Mitigation |
|---|---|
| Perte de "actionnable immédiat" pour utilisateur du jour J qui veut aller direct à la timeline | CTA "Préparer" sticky bien visible, 1 tap. Acceptable. |
| Coach habitué à atterrir sur la checklist devra faire 1 tap de plus | Doc utilisateur ou onboarding inline (tooltip 1ère fois). Reportable si pas critique. |
| Push notif "🏊 50 NL — Échauffement c'est parti !" atterrit sur info au lieu de routines | Acceptable : info → CTA → routines = 2 taps. Si problème UX, changer `data.url` vers `/competition/${id}/prep` à terme. |
| 2 nouvelles queries (perfs glissantes par épreuve) sur la vue nageur | React Query cache + queries `enabled: !!event_code`. Charge faible (typiquement 1-3 objectifs par compet). |

## Suite

Invoquer `superpowers:writing-plans` pour produire le plan d'implémentation détaillé étape par étape.
