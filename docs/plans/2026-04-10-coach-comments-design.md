# Design : Commentaires nageurs sur la home coach + push notification

**Date** : 2026-04-10
**Statut** : Validé

## Contexte

Quand un nageur saisit un commentaire textuel dans son ressenti (champ `comments` de `dim_sessions`), le coach n'en est pas informé sauf s'il consulte manuellement la fiche du nageur. On veut rendre ces commentaires visibles et proactifs.

## Objectifs

1. **Notification push immédiate** au coach quand un nageur écrit un commentaire
2. **Badge compteur** sur la page d'accueil coach (commentaires des dernières 48h)
3. **Ecran dédié** listant tous les commentaires avec état lu/non-lu

## Décisions de design

| Question | Décision |
|----------|----------|
| Visibilité home | Badge compteur simple + section compacte (max 3 commentaires) |
| Timing push | Immédiat à chaque commentaire textuel |
| Lu/non-lu | Commentaires >48h disparaissent du badge home mais restent non-lus dans la liste |
| Navigation liste | Ecran dédié `section=comments` dans le router coach |
| Contenu carte | Nom nageur, date, créneau, 4 indicateurs colorés, texte complet |

## 1. Notification push

- **Déclencheur** : trigger PostgreSQL `AFTER INSERT OR UPDATE ON dim_sessions` quand `comments IS NOT NULL AND comments != ''`
- **Condition UPDATE** : ne déclenche que si `NEW.comments IS DISTINCT FROM OLD.comments` (évite les re-notifications sur edit d'autres champs)
- **Destinataires** : tous les utilisateurs avec rôle `coach` (query `users` WHERE `role = 'coach'`)
- **Contenu** :
  - Titre : "Commentaire de [Prénom Nom]"
  - Body : 100 premiers caractères du commentaire, tronqué avec "..."
  - URL : `#/coach?section=comments`
- **Pipeline** : réutilise le système existant `notifications` -> `notification_targets` -> webhook `push-send`

## 2. Badge sur la Home Coach

- **Position** : nouvelle section après les alertes fatigue, avant "Accès rapides"
- **Style** : fond `violet-50` / `dark:violet-950/25`, bordure `violet-200`, icône `MessageSquareText`
- **Compteur** : nombre de commentaires textuels des dernières 48h non lus
- **Contenu** : max 3 commentaires compacts (avatar + nom + 1 ligne tronquée + horodatage relatif)
- **Action** : bouton "Voir tous" -> navigue vers `section=comments`
- **Masquage** : section invisible si 0 commentaire dans les 48h
- **Requête** : `dim_sessions` WHERE `comments IS NOT NULL AND comments != ''` AND `created_at > now() - interval '48 hours'`, LEFT JOIN `coach_comment_reads` pour exclure les lus du compteur

## 3. Ecran CoachCommentsScreen

- **Route** : `section=comments` dans le router coach (nouveau `CoachSection`)
- **Design** : style inbox mobile, cartes empilées chronologiquement (récent en haut)
- **Carte commentaire** :
  - Bord gauche `border-l-4` coloré selon le pire indicateur (rouge si fatigue/diff >= 4, emerald sinon)
  - Ligne 1 : Avatar (32px cercle) + Nom nageur (bold) + horodatage relatif (aligné droite)
  - Ligne 2 : Date session + créneau + 4 badges indicateurs (pattern identique à SwimmerFeedbackTab)
  - Ligne 3 : Texte commentaire complet (pre-wrap)
  - Pastille violette `h-2 w-2` sur les non-lus
  - Clic -> navigue vers fiche nageur onglet Feedback
- **Pagination** : "Charger plus" (20 par page)
- **Empty state** : "Aucun commentaire" centré

## 4. Table coach_comment_reads

```sql
CREATE TABLE coach_comment_reads (
  coach_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id integer NOT NULL REFERENCES dim_sessions(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, session_id)
);
```

- Marquage automatique : quand le coach ouvre l'écran commentaires, les commentaires visibles sont marqués comme lus
- Badge home = count(sessions avec commentaire dans 48h) - count(reads correspondants)

## 5. Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `supabase/migrations/00XXX_coach_comment_push.sql` | Trigger auto-notification + table `coach_comment_reads` + RLS |
| `src/pages/Coach.tsx` | Ajout section "comments" au router, section commentaires dans CoachHome |
| Nouveau : `src/pages/coach/CoachCommentsScreen.tsx` | Ecran liste commentaires |
| `src/lib/api/notifications.ts` ou `src/lib/api.ts` | Fonctions query commentaires récents + mark as read |

## 6. Palette couleurs

- Violet pour la thématique "commentaires" (non utilisé ailleurs dans les accès rapides)
  - Light : `violet-50`, `violet-100`, `violet-200`, `violet-600`, `violet-800`
  - Dark : `violet-950/25`, `violet-900/30`, `violet-400`
- Réutilisation des couleurs indicateurs existantes (emerald/amber/red)
- Bord gauche carte : rouge (`red-400`) si pire indicateur >= 4 en mode hard, emerald (`emerald-400`) sinon
