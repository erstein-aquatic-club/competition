# Business Journey Fixes — Design Document

**Date:** 2026-03-29
**Contexte:** Audit exhaustif des parcours métier (nageur, coach, admin) ayant identifié 13 blocages validés.

---

## Chantier 1 — Résilience données

### 1. Sauvegarde incrémentale musculation
- Après chaque série logguée dans WorkoutRunner, sauvegarder le state complet (runId, logs, exercice courant, step) dans `localStorage` sous clé `eac-strength-run-{runId}`
- Au lancement de Strength.tsx, vérifier si un run local existe → proposer "Reprendre la séance interrompue ?"
- Nettoyage automatique à la fin de la séance (summary affiché → clear localStorage)

### 17. Mode offline basique
- Service Worker avec stratégie "stale-while-revalidate" pour les données fréquentes (sessions, assignments, profil, exercises)
- Détection online/offline avec banner visuel "Hors connexion — données en lecture seule"
- Queue des mutations offline (synced au retour réseau) pour : saisie séance natation, logs musculation
- Workbox pour le cache des assets statiques (déjà en place partiellement)

---

## Chantier 2 — Auth & Admin

### 3. Approbation par coach et comité
- Modifier l'edge function `admin-user` : ajouter `"approve_user"` et `"reject_user"` dans les permissions de `coach` et `comite` (en plus de `admin`)
- Extraire le composant "Inscriptions en attente" dans un composant partagé `PendingApprovals.tsx`
- L'afficher dans le dashboard coach (CoachHome) sous forme de banner "X inscription(s) en attente"
- L'afficher aussi dans la page Comité

### 4. Page "En attente d'approbation" pour coach
- Quand `is_approved === false` et `role === "coach"`, afficher une page dédiée :
  - Logo EAC + message "Votre compte est en attente de validation par un responsable du club"
  - Bouton "Se déconnecter"
  - Nav cachée

### 5. RecordsAdmin dans la navigation
- Ajouter entrée dans `navItems.ts` pour le rôle `admin` : "Records" → `/records-admin`
- Accès rapide depuis CoachHome (carte existante)

### 12. Audit trail admin
- Table `admin_audit_log` : `id`, `actor_id`, `action` (enum: approve, reject, change_role, disable, create_coach), `target_user_id`, `details` (jsonb), `created_at`
- Logger dans l'edge function `admin-user` à chaque action
- Onglet "Historique" dans Admin.tsx (liste chronologique)

---

## Chantier 3 — UX Coach

### 7. Wizard "Première planification"
- Condition : nageur sans cycles NI objectifs NI créneaux perso
- 3 étapes :
  1. Créer macro-cycle (nom, dates, compétition cible)
  2. Définir objectifs (1 à 3 chrono et/ou texte)
  3. Personnaliser créneaux (hériter groupe + modifier)
- Bouton "Terminer" → crée tout, bascule en mode collapsibles classiques
- Si au moins un élément existe → wizard masqué

### 10. Historique notifications
- Table `notification_log` : `id`, `sender_id`, `title`, `body`, `target_type`, `target_ids`, `recipient_count`, `created_at`
- Logger dans `notifications_send()`
- Onglet "Historique" dans CoachComms

### 16. Notes post-séance coach
- Colonne `coach_notes` (text, nullable) sur table `sessions`
- Bouton "Note" dans SwimmerFeedbackTab → popover textarea → save
- Côté nageur : affichage note coach sous la séance (bulle distincte)

---

## Chantier 4 — UX Nageur

### 2. Bouton retour en focus mode
- Bouton "← Quitter" sticky en haut du WorkoutRunner
- Modal confirmation "Quitter la séance ? Votre progression est sauvegardée."
- Si confirmé → screenMode "list", run reste "in_progress"

### 6. Fallback 1RM manquant
- Détection exercices sans 1RM au lancement séance %1RM
- Sheet "1RM requis" avec input poids par exercice → save + continue
- Alternative "Passer en poids libre" → ignore les % pour cette séance

### 11. Objectifs modifiables
- Côté nageur : tap objectif personnel → formulaire pré-rempli → update
- Objectifs coach = lecture seule (badge "Coach")
- Côté coach : déjà fonctionnel

### 15. Distinction slot vide vs pas d'assignation
- 3 états visuels dans Dashboard nageur :
  - Séance assignée : card pleine avec nom
  - Créneau sans séance : card pointillés "Créneau prévu — pas de séance"
  - Pas de créneau : rien
- Croisement `trainingSlots` × `assignments`

---

## Approche technique

### Streams parallèles pour agent teams
- **Stream 1 (Résilience)** : localStorage strength + offline/service worker
- **Stream 2 (Auth/Admin)** : edge function + migration audit + PendingApprovals + nav
- **Stream 3 (Coach UX)** : wizard planif + notification log + coach notes
- **Stream 4 (Nageur UX)** : focus mode retour + 1RM fallback + objectifs edit + slots distinction

### Fichiers principaux impactés
- Stream 1 : WorkoutRunner, Strength.tsx, service-worker, api client
- Stream 2 : admin-user edge function, Admin.tsx, CoachHome, navItems.ts, migration SQL
- Stream 3 : CoachSwimmerDetail, SwimmerPlanningTab, CoachComms, SwimmerFeedbackTab, migration SQL
- Stream 4 : WorkoutRunner, Strength.tsx, Dashboard.tsx, SwimmerObjectivesView

### UI/UX
Tous les composants UI seront conçus via /frontend-design pour garantir la cohérence design.
