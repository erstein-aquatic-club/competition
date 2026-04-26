# QA manuelle — Audit robustesse infrastructure (§171)

Date du protocole : 2026-04-26
Plan source : `docs/plans/2026-04-26-infrastructure-robustness-fixes.md`
Audit source : conversation du 2026-04-26 (rapport en tête de session)

Ce document liste les scénarios à exécuter manuellement pour valider les fixes §171 sur device réel ou environnement de prod. Les tests unitaires Vitest et RLS couvrent le code, ces scénarios couvrent le **comportement système**.

---

## Scénario A — Offline queue robustesse

**Préconditions :** Compte nageur connecté, séance muscu assignée pour aujourd'hui, navigateur Chrome ou iOS Safari.

**Steps :**
1. Ouvrir l'app, démarrer la séance (mode focus WorkoutRunner)
2. Couper le réseau (mode avion ou DevTools → Network → Offline)
3. Effectuer 5 sets (3 reps, 50 kg, difficulté 3)
4. Vérifier `localStorage.getItem("eac-offline-queue")` → doit contenir 5 items de type `strength-set-log`
5. Reconnecter le réseau
6. Attendre la sync auto (toast "Données synchronisées" doit apparaître < 5s)
7. Côté Supabase Studio : `SELECT count(*) FROM strength_set_logs WHERE run_id = <id>` → 5

**Critère de succès :** 5 lignes en DB (pas 0, pas 10), aucune erreur en console, queue vidée.

**Edge case :** Re-couper le réseau pendant le drain (pas évident à reproduire). Validation : la queue conserve les items non drainés.

---

## Scénario B — Quota localStorage saturé

**Préconditions :** iOS Safari PWA installée, test debug.

**Steps :**
1. Console JS : remplir localStorage jusqu'au quota
   ```js
   try {
     for (let i = 0; i < 1000; i++) localStorage.setItem(`pad${i}`, "x".repeat(10000));
   } catch (e) { console.log("quota hit at i=" + i); }
   ```
2. Démarrer une séance muscu offline
3. Effectuer 1 set
4. Vérifier : toast destructif **"Mémoire pleine"** (pas de toast "Données synchronisées")
5. Le set ne doit PAS apparaître comme validé en UI (l'écran reste sur le set en cours)

**Critère de succès :** Pas de perte silencieuse — l'utilisateur est informé.

---

## Scénario C — iOS PWA standalone return-from-background

**Préconditions :** iPhone réel, app installée sur écran d'accueil.

**Steps :**
1. Login, naviguer vers `/strength`
2. Mettre en arrière-plan 15 minutes (verrouiller l'iPhone, ouvrir Safari, etc.)
3. Revenir sur l'app (icône écran d'accueil)
4. Vérifier :
   - (a) **pas de page blanche**
   - (b) **données fraîches** chargées (pas un état stale)
   - (c) **session valide** (pas redirigé sur Login)
   - (d) Console Safari (Mac) : log `[EAC] Build: ...` toujours présent
5. Tester aussi 60 minutes en background — le `visibilitychange` doit déclencher un `refreshSession`

**Critère de succès :** UX seamless, jamais déconnecté à tort.

---

## Scénario D — Update mid-session

**Préconditions :** App installée, séance en cours.

**Steps :**
1. Ouvrir l'app, démarrer une séance muscu (3 sets faits)
2. Push une nouvelle version sur `main` (CI auto-deploy)
3. Attendre 30 minutes OU exposer `(window as any).__pwaRegistration.update()` en console pour forcer
4. Vérifier : toast "Mise à jour disponible" (composant UpdateNotification)
5. **Sans cliquer**, continuer la séance — le set #4 doit s'enregistrer normalement (le SW v2 est en attente, pas activé)
6. Cliquer "Mettre à jour" → app reload, session préservée
7. Reprendre la séance (activeRunId persistant via React Query cache → DB)

**Critère de succès :** Pas de page blanche au reload, pas de perte des sets en cours.

---

## Scénario E — Cross-coach assignment hijack (FIX P0 #1)

**Préconditions :** 2 comptes coach distincts (Carol, Eve), 1 assignation `target_user_id` athlète en DB créée par Carol.

**Steps (via Supabase Studio SQL Editor, en tant qu'Eve) :**
```sql
-- En tant qu'Eve (compte coach différent)
UPDATE session_assignments SET status = 'completed' WHERE assigned_by = 3; -- Carol's id
DELETE FROM session_assignments WHERE assigned_by = 3;
```

**Critère de succès :** Les deux requêtes retournent **0 rows affected** (la policy `assignments_update`/`assignments_delete` bloque). Avant fix : N rows affected.

Idem pour le RPC :
```sql
-- En tant qu'Eve, tenter de marquer terminée une assignation d'un autre nageur
SELECT save_strength_run_atomic('{
  "athlete_id": 1,
  "assignment_id": 999,
  "started_at": "2026-04-26T08:00:00Z",
  "logs": [],
  "one_rm_estimates": []
}'::jsonb);
```

Doit lever `forbidden: assignment 999 does not target athlete 1`.

---

## Scénario F — Reset password robustness

**Préconditions :** Email valide configuré dans Supabase.

**Steps :**
1. Demander reset password (page Login → Mot de passe oublié)
2. Cliquer le lien email
3. **Attendre 1h sans soumettre** (token expire)
4. Soumettre un nouveau mot de passe
5. Vérifier : message d'erreur clair (pas crash, pas écran blanc, pas de redirection silencieuse vers Login)
6. Re-cliquer le lien (refus serveur attendu sur token réutilisé)

**Critère de succès :** UX dégradée mais informative, pas de plantage.

---

## Notes générales

- Tests RLS automatisés (Tasks 2, 4, 14, 15, 16 du plan) **non exécutés** — Docker non lancé sur la machine de dev. À reprendre via `npm run test:rls` quand Docker dispo.
- Build PWA : vérifier que `dist/sw.js` ne fait pas `self.skipWaiting()` automatique (uniquement sur message `SKIP_WAITING`).
- Console expected logs en prod après §171 :
  - `[EAC] Build: <iso>` au démarrage
  - `[auth] INITIAL_SESSION arrived null but token present — ignoring` au resume iOS
  - `[auth] visibilitychange refresh failed` ou succès silencieux

## Statut

- [ ] Scénario A — Offline queue robustesse
- [ ] Scénario B — Quota localStorage saturé
- [ ] Scénario C — iOS PWA return-from-background
- [ ] Scénario D — Update mid-session
- [ ] Scénario E — Cross-coach assignment hijack
- [ ] Scénario F — Reset password robustness
