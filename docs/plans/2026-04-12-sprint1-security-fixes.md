# Sprint 1 — Security Fixes (Critical RLS & Edge Function)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger 4 failles de sécurité critiques identifiées par l'audit du 2026-04-12 : abuse de l'edge function `push-send`, audit log falsifiable, créneaux d'entraînement modifiables cross-coach, storage avatars non protégé.

**Architecture :** Une seule migration SQL consolidée (`00102_sprint1_security_fixes.sql`) appliquée via MCP Supabase + un patch Edge Function `push-send` pour vérifier l'appelant. Tous les fixes sont indépendants et idempotents (`DROP POLICY IF EXISTS` partout).

**Tech Stack :** Supabase PostgreSQL RLS, Deno Edge Functions, MCP `mcp__plugin_supabase_supabase__apply_migration`.

**Failles écartées (faux positifs de l'audit) :**
- `chrono_records` policy `auth.uid()` — coach_id est UUID `auth.users(id)`, le code insère `user.id` (auth UUID) → comparaison correcte (vérifié `src/lib/api/chrono-records.ts:21`).
- `objectives.athlete_id` UUID/INTEGER mismatch — colonne UUID `auth.users(id)`, policy `= auth.uid()` cohérente.
- `notifications` SELECT trop ouvert — déjà corrigée par `00016_fix_notifications_rls.sql` sur `notification_targets`.

---

## Pré-requis

- Branche dédiée : `git checkout -b sprint1-security-fixes`
- MCP Supabase opérationnel (project ID `fscnobivsgornxdwqwlk`)
- Aucun déploiement local de l'app — tout passe par GitHub Actions

---

## Task 1 — Audit log INSERT lock-down

**Faille :** `00061_rls_audit_and_notif_log.sql:13-14` — `WITH CHECK (true)` permet à n'importe quel utilisateur authentifié de polluer le journal d'audit.

**Files:**
- Create: `supabase/migrations/00102_sprint1_security_fixes.sql` (création initiale)

**Step 1 — Créer la migration avec le premier fix**

```sql
-- Sprint 1 security fixes — 2026-04-12
-- Fix 1/4: admin_audit_log INSERT must be admin-only

DROP POLICY IF EXISTS "System can insert audit log" ON public.admin_audit_log;

CREATE POLICY "Admin can insert audit log" ON public.admin_audit_log
  FOR INSERT WITH CHECK (app_user_role() = 'admin');
```

**Step 2 — Vérifier qu'aucun code applicatif n'insère dans `admin_audit_log` en tant que coach/athlete**

```bash
grep -rn "admin_audit_log" src/ supabase/functions/
```

Attendu : seules les références viennent de `admin-user` Edge Function (qui utilise service_role → bypass RLS) ou de triggers DB. Si un appel client direct existe en tant que coach/athlete, il faudra en discuter avant de continuer.

**Step 3 — Commit (ne pas appliquer encore, on consolide les 4 fixes en un seul apply)**

```bash
git add supabase/migrations/00102_sprint1_security_fixes.sql
git commit -m "fix(rls): restrict admin_audit_log INSERT to admin role"
```

---

## Task 2 — Training slots ownership check

**Faille :** `00041_training_slots.sql:64-97` — `training_slots`, `training_slot_assignments`, `training_slot_overrides` UPDATE/DELETE ne vérifient que `app_user_role() IN ('coach','admin')`. Un Coach A peut DELETE les créneaux d'un Coach B.

**Décision design :** `training_slots.created_by` existe (`00041:11`). On exige `created_by = app_user_id() OR app_user_role() = 'admin'` pour UPDATE/DELETE. Pour `training_slot_assignments` et `training_slot_overrides`, on vérifie via le créneau parent.

**Files:**
- Modify: `supabase/migrations/00102_sprint1_security_fixes.sql`

**Step 1 — Ajouter les policies à la migration**

```sql
-- Fix 2/4: training_slots ownership check (no cross-coach mutations)

DROP POLICY IF EXISTS "training_slots_coach_update" ON training_slots;
CREATE POLICY "training_slots_coach_update" ON training_slots
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND created_by = app_user_id())
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND created_by = app_user_id())
  );

DROP POLICY IF EXISTS "training_slots_coach_delete" ON training_slots;
CREATE POLICY "training_slots_coach_delete" ON training_slots
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND created_by = app_user_id())
  );

-- Assignments: vérifier propriété via le slot parent
DROP POLICY IF EXISTS "training_slot_assignments_coach_update" ON training_slot_assignments;
CREATE POLICY "training_slot_assignments_coach_update" ON training_slot_assignments
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_assignments.slot_id
        AND s.created_by = app_user_id()
    )
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_assignments.slot_id
        AND s.created_by = app_user_id()
    )
  );

DROP POLICY IF EXISTS "training_slot_assignments_coach_delete" ON training_slot_assignments;
CREATE POLICY "training_slot_assignments_coach_delete" ON training_slot_assignments
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_assignments.slot_id
        AND s.created_by = app_user_id()
    )
  );

-- Overrides: idem
DROP POLICY IF EXISTS "training_slot_overrides_coach_update" ON training_slot_overrides;
CREATE POLICY "training_slot_overrides_coach_update" ON training_slot_overrides
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_overrides.slot_id
        AND s.created_by = app_user_id()
    )
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_overrides.slot_id
        AND s.created_by = app_user_id()
    )
  );

DROP POLICY IF EXISTS "training_slot_overrides_coach_delete" ON training_slot_overrides;
CREATE POLICY "training_slot_overrides_coach_delete" ON training_slot_overrides
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_overrides.slot_id
        AND s.created_by = app_user_id()
    )
  );
```

**Step 2 — Vérifier que `training_slots.created_by` est bien renseigné côté front**

```bash
grep -rn "training_slots" src/lib/api/training-slots.ts
```

Attendu : `insert({ ..., created_by: <user.id INT> })`. Si le front n'envoie pas `created_by`, **toute UPDATE/DELETE échouera après la migration** pour les créneaux historiques (existe `created_by IS NULL`). Mitigation prévue à l'étape suivante.

**Step 3 — Backfill `created_by` pour les créneaux orphelins existants**

Ajouter en haut de la migration (avant les policies du Task 2) :

```sql
-- Backfill created_by avec le premier admin si NULL
UPDATE training_slots
   SET created_by = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
 WHERE created_by IS NULL;
```

**Step 4 — Si `training_slots.create()` côté front n'envoie pas `created_by`, le patcher**

Lire `src/lib/api/training-slots.ts` et confirmer. Si manquant :
```ts
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } = await supabase.from("users").select("id").eq("auth_user_id", user.id).single();
// puis insert({ ..., created_by: profile.id })
```
*(à valider lors de l'exécution selon la convention existante du fichier)*

**Step 5 — Commit**

```bash
git add supabase/migrations/00102_sprint1_security_fixes.sql src/lib/api/training-slots.ts
git commit -m "fix(rls): training_slots requires created_by ownership for mutations"
```

---

## Task 3 — Avatars storage ownership

**Faille :** `00028_avatars_storage.sql:19-33` — UPDATE/DELETE sur bucket `avatars` n'exigent que `auth.role() = 'authenticated'`. N'importe quel user peut effacer/écraser l'avatar d'un autre.

**Convention storage Supabase :** chemin attendu `<auth_user_uuid>/avatar.png`. La policy doit comparer `(storage.foldername(name))[1]` à `auth.uid()::text`.

**Files:**
- Modify: `supabase/migrations/00102_sprint1_security_fixes.sql`

**Step 1 — Vérifier la convention de path utilisée actuellement**

```bash
grep -rn "from.*storage.*avatars\|\.upload\(" src/lib/ src/components/
```

Attendu : confirmer que l'upload utilise `${user.id}/avatar.<ext>` ou similaire. Si la convention est différente, adapter la regex de la policy.

**Step 2 — Ajouter les policies storage**

```sql
-- Fix 3/4: avatars storage ownership

DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;
CREATE POLICY "avatars_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

**Step 3 — Faire la même chose pour `exercise-gifs` si la convention path le permet**

Lire `00012_exercise_notes_and_storage.sql` et `src/lib/gifEncoder.ts` + `src/components/coach/strength/MediaSourceSheet.tsx` pour vérifier le path d'upload. Si les GIFs sont uploadés par les coaches uniquement, restreindre INSERT/UPDATE/DELETE à `app_user_role() IN ('coach','admin')` plutôt qu'à un check ownership.

```sql
-- exercise-gifs : coach/admin only pour mutations
DROP POLICY IF EXISTS "exercise_gifs_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_auth_delete" ON storage.objects;

CREATE POLICY "exercise_gifs_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exercise-gifs' AND app_user_role() IN ('coach','admin'));

CREATE POLICY "exercise_gifs_coach_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'exercise-gifs' AND app_user_role() IN ('coach','admin'));

CREATE POLICY "exercise_gifs_coach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'exercise-gifs' AND app_user_role() IN ('coach','admin'));
```

**Step 4 — Commit**

```bash
git add supabase/migrations/00102_sprint1_security_fixes.sql
git commit -m "fix(storage): enforce avatar ownership and coach-only exercise-gifs"
```

---

## Task 4 — Edge function `push-send` JWT verification

**Faille :** `supabase/functions/push-send/index.ts:53-162` — aucun contrôle de l'appelant. La fonction utilise `SERVICE_ROLE_KEY` pour ses opérations DB, donc tout appelant possédant l'`anon key` (publique) peut envoyer n'importe quel push à n'importe qui via `target_user_ids` (ligne 104).

**Contrainte :** la fonction est aussi appelée par un webhook DB trigger (`00044_push_webhook_trigger.sql`) avec payload `{type:"INSERT", record:{...}}`. Il faut authentifier les deux chemins :
- **Webhook** : header secret partagé `x-webhook-secret` comparé à `Deno.env.get("PUSH_WEBHOOK_SECRET")`.
- **Appel manuel** (depuis le front) : JWT vérifié + rôle `coach`/`admin` requis pour les broadcasts arbitraires.

**Files:**
- Modify: `supabase/functions/push-send/index.ts`
- Modify: `supabase/migrations/00044_push_webhook_trigger.sql` (ajouter le header secret au trigger HTTP)

**Step 1 — Lire les deux fichiers et confirmer la structure du webhook**

```bash
cat supabase/migrations/00044_push_webhook_trigger.sql
```

Identifier où le header HTTP est défini lors de l'appel `net.http_post(...)`. On y ajoutera `x-webhook-secret`.

**Step 2 — Patcher `push-send/index.ts` : ajouter `verifyCaller()` au début du `Deno.serve`**

Insérer après ligne 61 (`if (req.method !== "POST")`), avant `try {`:

```ts
// --- Authentication gate ----------------------------------------------------
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const providedSecret = req.headers.get("x-webhook-secret") ?? "";
const isWebhookCall = WEBHOOK_SECRET.length > 0 && providedSecret === WEBHOOK_SECRET;

let isAuthorizedManualCaller = false;
if (!isWebhookCall) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice("Bearer ".length);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const role = (userData.user.app_metadata?.app_user_role as string | undefined) ?? null;
  if (!role || !["coach", "admin"].includes(role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  isAuthorizedManualCaller = true;
}
```

Puis dans la branche `else` (ligne 100-105) qui traite l'appel manuel, ajouter une garde :

```ts
} else {
  if (!isAuthorizedManualCaller) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  title = payload.title || "EAC Natation";
  // ... reste inchangé
}
```

**Step 3 — Vérifier que `app_user_role` est bien dans `app_metadata` du JWT**

```bash
grep -rn "app_user_role\|app_metadata" supabase/migrations/ src/lib/auth.ts
```

Si le rôle est dans `user_metadata` plutôt que `app_metadata`, ajuster. Si aucun trigger ne synchronise le rôle dans le JWT, fallback : query `users` table avec `userClient` :

```ts
const { data: profile } = await userClient
  .from("users")
  .select("role")
  .eq("auth_user_id", userData.user.id)
  .single();
const role = profile?.role ?? null;
```

**Step 4 — Configurer le secret côté Supabase**

```bash
# Génère un secret aléatoire
openssl rand -hex 32
# Puis via dashboard Supabase ou CLI :
# Settings > Edge Functions > Secrets > add PUSH_WEBHOOK_SECRET
```

⚠️ **Action utilisateur requise** — demander confirmation avant de définir le secret en production.

**Step 5 — Patcher `00044_push_webhook_trigger.sql` (ou créer une nouvelle migration `00103_push_webhook_secret.sql`) pour ajouter le header au trigger**

Le trigger utilise `net.http_post(url, body, headers)`. Modifier le `headers` JSONB pour inclure :

```sql
jsonb_build_object(
  'Content-Type', 'application/json',
  'x-webhook-secret', current_setting('app.push_webhook_secret', true)
)
```

Et définir le setting via :
```sql
ALTER DATABASE postgres SET app.push_webhook_secret = '<même secret>';
```

⚠️ Le secret en clair dans `ALTER DATABASE` est visible aux superusers — acceptable pour Supabase mais à confirmer avec l'utilisateur. Alternative : utiliser `vault.secrets` si disponible.

**Step 6 — Vérifier les appels front au push-send**

```bash
grep -rn "push-send\|functions.invoke" src/
```

Tous les appels manuels doivent utiliser `supabase.functions.invoke('push-send', { body })` qui injecte automatiquement le JWT. Si un fetch direct existe, le migrer vers `invoke()`.

**Step 7 — Commit**

```bash
git add supabase/functions/push-send/index.ts supabase/migrations/
git commit -m "fix(edge): authenticate push-send callers (webhook secret + JWT role)"
```

---

## Task 5 — Application de la migration consolidée

**Step 1 — Relire la migration entière**

```bash
cat supabase/migrations/00102_sprint1_security_fixes.sql
```

Vérifier : présence de `BEGIN; ... COMMIT;` autour, idempotence, ordre logique (backfill avant policies).

**Step 2 — Appliquer via MCP Supabase**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` avec le contenu du fichier. Project ID : `fscnobivsgornxdwqwlk`.

**Step 3 — Tests de fumée RLS via dashboard Supabase**

Pour chacun des 4 fixes, créer un JWT de test (via Auth > Users > Generate JWT) pour les rôles `athlete`, `coach`, `admin` et exécuter dans SQL Editor avec `SET LOCAL request.jwt.claims = '...'` :

| Test | Rôle | Action attendue |
|---|---|---|
| `INSERT INTO admin_audit_log (...)` | athlete | ❌ refusé |
| `INSERT INTO admin_audit_log (...)` | admin | ✅ accepté |
| `DELETE FROM training_slots WHERE id=<slot_créé_par_coachA>` | coachB | ❌ refusé |
| `DELETE FROM training_slots WHERE id=<slot_créé_par_coachA>` | coachA | ✅ accepté |
| `DELETE FROM training_slots WHERE id=<slot_créé_par_coachA>` | admin | ✅ accepté |
| Storage `DELETE` `<other_uuid>/avatar.png` | athlete X | ❌ refusé |
| Storage `DELETE` `<own_uuid>/avatar.png` | athlete X | ✅ accepté |

**Step 4 — Test `push-send` end-to-end**

```bash
# Sans header → 401
curl -X POST https://<project>.supabase.co/functions/v1/push-send \
  -H "Content-Type: application/json" \
  -d '{"target_user_ids":[1],"title":"test","body":"test"}'
# Attendu : 401 Unauthorized

# Avec JWT athlete → 403
curl -X POST ... -H "Authorization: Bearer <athlete_jwt>" -d '{...}'
# Attendu : 403 Forbidden

# Avec JWT coach → 200
curl -X POST ... -H "Authorization: Bearer <coach_jwt>" -d '{...}'
# Attendu : 200 + push délivré

# Avec secret webhook → 200
curl -X POST ... -H "x-webhook-secret: <SECRET>" -d '{"type":"INSERT","record":{...}}'
# Attendu : 200
```

**Step 5 — Vérifier qu'aucun flux fonctionnel n'est cassé**

À tester manuellement dans l'app déployée sur preview :
- Coach crée un créneau, l'édite, le supprime → OK
- Coach A ne voit pas d'erreur en lisant les créneaux du Coach B → OK (SELECT reste ouvert)
- Athlete change son avatar → OK
- Notification push automatique sur création d'entretien (déclenche le webhook) → OK
- Notification push manuelle depuis l'écran SMS coach → OK

**Step 6 — Mettre à jour la documentation**

Ajouter une entrée dans `docs/implementation-log.md` :
- Contexte : audit sécurité du 2026-04-12 → 4 failles critiques
- Changements : migration 00102, patch push-send, secret webhook
- Tests : matrice ci-dessus
- Limites connues : aucun audit trail des nouvelles policies (à voir Sprint 4)

**Step 7 — Push, PR, déploiement**

```bash
git push -u origin sprint1-security-fixes
gh pr create --title "fix(security): Sprint 1 — RLS lock-down + push-send auth" \
  --body "Voir docs/plans/2026-04-12-sprint1-security-fixes.md"
```

⚠️ **Avant merge** : confirmer avec l'utilisateur que le secret `PUSH_WEBHOOK_SECRET` est bien configuré côté Supabase (Edge Function env) ET côté DB (`ALTER DATABASE SET app.push_webhook_secret = ...`). Sinon les notifications push automatiques seront cassées dès le merge.

---

## Critères de done

- [ ] Migration `00102_sprint1_security_fixes.sql` créée et appliquée via MCP
- [ ] Patch `push-send/index.ts` mergé
- [ ] Secret `PUSH_WEBHOOK_SECRET` configuré (Edge Function + DB setting)
- [ ] Matrice de tests RLS exécutée (7 cas) — tous PASS
- [ ] Tests fumée push-send (4 cas curl) — tous PASS
- [ ] Workflows fonctionnels validés en preview (créneau, avatar, push manuel, push webhook)
- [ ] `implementation-log.md` mis à jour
- [ ] PR mergée et déployée

---

## Risques

1. **Backfill `created_by`** : si le premier admin n'existe pas, le UPDATE échoue silencieusement → tous les créneaux historiques deviendront immutables. Mitigation : vérifier `SELECT count(*) FROM users WHERE role='admin'` avant migration.
2. **`app_user_role` non dans JWT** : Step 3 du Task 4 a un fallback DB query mais coût latence +1 round-trip par push manuel. Acceptable.
3. **Secret webhook DB setting** : `ALTER DATABASE` nécessite redémarrage de connexion pour être visible. Pgbouncer peut cacher l'ancienne valeur. Tester explicitement après application.
4. **Rollback** : si la migration casse un flux en prod, créer immédiatement `00103_revert_sprint1.sql` qui rétablit les policies originales (les sauvegarder dans le commit).
