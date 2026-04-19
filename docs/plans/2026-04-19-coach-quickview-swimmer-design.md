# Coach QuickView — Fiche nageur non-assigné (mode dépannage)

*Design doc — 2026-04-19*

## 1. Contexte & problème

Aujourd'hui, `CoachSwimmerDetail.tsx` (533 LOC) bloque brutalement un coach qui clique sur la fiche d'un nageur qu'il ne prend pas en charge : *"Ce nageur ne fait pas partie de vos nageurs."* + bouton Retour.

Or, le besoin terrain réel existe : **un coach qui remplace un collègue absent doit pouvoir animer la séance du jour** sans accès au suivi long terme du nageur. Il lui faut un briefing synthétique, actionnable en 10 secondes, sans fuiter l'intimité du lien nageur ↔ coach titulaire.

## 2. Décisions validées (brainstorming)

| Question | Choix |
|---|---|
| Cas d'usage principal | **A — Dépannage / remplacement** (animer la séance du jour) |
| Actions autorisées | **B — Lecture + présence + commentaire de séance** |
| Scope rôles | **A — Coach non-assigné uniquement** (admin/comité inchangés) |
| Traçabilité | **B — Attribution visible dans la donnée, pas de notification** |

## 3. Architecture

**Un seul point d'entrée**, décision côté composant :

```
CoachSwimmerDetail (routeur, ~30 LOC)
├── role === 'coach' && !hasAccess → <CoachSwimmerQuickView />   ← nouveau
└── sinon                          → <CoachSwimmerFullView />    ← renommage de l'actuel
```

- Pas de nouvelle URL → un lien partagé entre coachs résout naturellement la bonne vue selon leurs droits
- Transition automatique : dès qu'un coach devient assigné, il bascule sur la vue complète
- Approche 3 validée (cf. brainstorming) : page dédiée + extraction de sous-composants KPI partagés

## 4. Contenu de l'écran QuickView

Lecture top-down, une seule colonne scrollable, pas d'onglets.

| # | Bloc | Contenu visible | Masqué |
|---|---|---|---|
| 1 | En-tête | Avatar, nom, groupe, âge, sexe. Badge *"🔒 Mode dépannage"* | — |
| 2 | 🚨 Briefing du jour | Forme (wellness jour), douleurs actives (zones + nb signalements 7j), restrictions médicales, disponibilité | Notes libres nageur, circonstances douleurs, historique blessures |
| 3 | ⚡ Charge récente | Badge ACWR, volume 7j vs moy 4 sem, séances manquées 30j | RPE détaillé par séance |
| 4 | 🎯 Objectifs en cours | Chips (titre + horizon), max 4 | Entretiens/commentaires liés |
| 5 | 🏆 Perf récentes | Rail horizontal 2-3 dernières compét + progression | Historique complet |
| 6 | 📅 Séance du jour | Titre, contenu, notes **du jour uniquement** | Planning semaine/mois |
| 7 | 🤝 Actions (sticky) | Boutons *Noter la présence* / *Commenter la séance* + note attribution | — |

**Totalement absent** (vs vue complète) : Échanges, Comms, Planning multi-semaines, détail bien-être (cycle, humeur texte), historique RPE/wellness jour par jour.

### États vides

- Wellness jour absent → *"Non renseigné aujourd'hui"*
- Aucune douleur 7j → *"Aucune douleur signalée sur 7j"* (vert)
- Nageur récent (< 2 sem) → *"Données insuffisantes"* + masquer ACWR
- 0 compétition 90j → bloc Perf masqué
- Pas de séance planifiée → message + boutons d'action masqués

## 5. Actions de dépannage

### Noter la présence
- Modal compact : radio `Présent` / `Absent` / `Retard` + commentaire court optionnel (max 200 car)
- Écrit dans `session_attendance` avec `recorded_by = app_user_id()`
- Si la ligne existe déjà (titulaire a coché) : toast d'avertissement avant écrasement

### Commenter la séance
- Modal : textarea max 500 car
- Écrit dans `session_comments` (table à créer si inexistante) avec `recorded_by`

### Attribution visible
- **Côté titulaire** (vue complète) : badge gris *"saisi par Coach Martin • dépannage"*
- **Côté nageur** (feedback perso) : *"Commentaire de Coach Martin (remplaçant)"*

### NON autorisé depuis QuickView
Modification séance planifiée, objectifs, entretien, message, profil, groupes, records.

## 6. Data & RLS

### Nouveaux champs / tables

- `session_attendance` : ajouter colonne `recorded_by UUID REFERENCES users(auth_uid)` nullable
- `session_comments` : à vérifier via MCP Supabase ; sinon table à créer :
  ```sql
  id, session_id, athlete_id, author_user_id, recorded_by, body TEXT, created_at
  ```

### Lecture — approche *"fonction SECURITY DEFINER + policies étroites"*

Le coach non-assigné ne doit **jamais** avoir accès direct à `wellness_entries`, `athlete_feedback`, `athlete_interviews`, `messages`. Policies existantes inchangées.

Une unique fonction SQL :
```sql
get_swimmer_quickview_briefing(p_athlete_id bigint) RETURNS jsonb
  -- { wellness_today, pain_summary, load_7d, acwr,
  --   objectives_short, recent_perfs, today_session }
  SECURITY DEFINER
```
Renvoie uniquement des champs agrégés/autorisés — jamais de texte libre sensible. Seule interface appelée côté lecture QuickView.

### Écriture

Policies classiques :
- `INSERT/UPDATE session_attendance` pour `role='coach'` **si** `recorded_by = app_user_id()`
- Idem `INSERT session_comments`
- Aucune autre écriture autorisée depuis le front en mode dépannage

### API côté JS

Nouveau module `src/lib/api/coach-quickview.ts` :
- `getSwimmerBriefing(athleteId)` → RPC
- `recordAttendanceAsSub({ sessionId, status, comment })`
- `addSessionCommentAsSub({ sessionId, body })`

### Perf & cache

- 1 RPC unique par ouverture (cible < 300ms)
- React Query, staleTime 2 min
- Invalidation ciblée après action

## 7. Tests

1. **Unit/UI (Vitest)** : routeur dispatche correctement selon rôle + hasAccess
2. **Composants KPI extraits** : tests légers (rendu, états vides)
3. **RLS intégration** (`supabase/tests/rls/`) — §121 :
   - Coach non-assigné peut appeler `get_swimmer_quickview_briefing()` mais pas `SELECT * FROM wellness_entries`
   - Peut `INSERT session_attendance` avec `recorded_by = self`
   - Ne peut pas `INSERT` avec `recorded_by = autre coach`
   - Ne peut pas `INSERT/UPDATE athlete_objectives`, `athlete_interviews`, `messages`
   - Titulaire voit bien `recorded_by` sur ses lignes
4. **E2E manuel avant merge** : scénario dépannage complet

## 8. Livrables

### Nouveaux fichiers
- `src/pages/coach/CoachSwimmerQuickView.tsx`
- `src/pages/coach/CoachSwimmerFullView.tsx` *(renommage actuel `CoachSwimmerDetail`)*
- `src/components/coach/swimmer-kpis/SwimmerFormBadge.tsx`
- `src/components/coach/swimmer-kpis/PainIndicator.tsx`
- `src/components/coach/swimmer-kpis/LoadMini.tsx`
- `src/components/coach/swimmer-kpis/ObjectiveChips.tsx`
- `src/lib/api/coach-quickview.ts`
- Migration SQL (`recorded_by` + table `session_comments` si besoin + RPC briefing)
- Tests RLS nouveau fichier

### Modifiés
- `src/pages/coach/CoachSwimmerDetail.tsx` → routeur ~30 LOC
- `src/lib/api/index.ts` → re-export du nouveau module

## 9. Points ouverts (à trancher en implémentation)

1. Existence de `session_comments` à vérifier via MCP Supabase au lancement
2. Existence de `recorded_by` sur `session_attendance` idem
3. Réutiliser les fonctions SQL existantes pour ACWR/load (cf. §148 `get_feedback_rates_all_athletes`) plutôt que dupliquer
4. Cible perf RPC < 300 ms ; cache matérialisé si nécessaire (YAGNI pour MVP)

## 10. Hors-scope (YAGNI)

- CTA *"demander l'accès complet au titulaire"*
- Notification push au titulaire
- Badge *"activité externe"* sur la fiche titulaire
- Historique des remplaçants ayant consulté
- Vue mobile spécifique (responsive natif suffit)
