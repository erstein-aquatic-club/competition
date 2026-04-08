# Notification matinale bien-être — Design

## Contexte
Les nageurs disposent d'un formulaire bien-être quotidien (sommeil, fatigue, courbatures, humeur, stress) accessible via le Dashboard. Actuellement, seul un banner passif les invite à le remplir. On veut envoyer une **push notification à 6h00** pour les inciter à saisir leur bien-être dès le réveil.

## Mécanisme
- **Cron pg_cron** à `0 4 * * *` (UTC) = 6h00 CEST (heure d'été France)
- Cible : nageurs (rôle `athlete`) ayant un abonnement push actif et **sans** `wellness_checks` pour la date du jour
- Utilise le pipeline existant : INSERT `notifications` + `notification_targets` → trigger → `push-send` Edge Function

## Notification
- **Titre** : `Comment te sens-tu ce matin ?`
- **Body** : `Remplis ton bien-être en 30 secondes`
- **URL** : `#/?wellness=open`
- **Tag** : `wellness-morning`

## Frontend
- Dashboard lit le query param `wellness=open` au montage → ouvre automatiquement le drawer WellnessForm

## Fichiers impactés
| Fichier | Changement |
|---------|-----------|
| `supabase/migrations/00070_wellness_morning_cron.sql` | Cron job 6h00 |
| `src/pages/Dashboard.tsx` | Lire `?wellness=open` → ouvrir drawer |
