# Notification matinale bien-être — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Envoyer une push notification à 6h00 chaque matin aux nageurs qui n'ont pas encore rempli leur bien-être du jour, avec deep link vers le formulaire.

**Architecture:** Un cron job pg_cron INSERT dans `notifications` + `notification_targets` pour chaque nageur ciblé, ce qui déclenche le trigger existant `push-send`. Côté frontend, le Dashboard lit un query param `wellness=open` pour ouvrir le drawer automatiquement.

**Tech Stack:** pg_cron, pg_net, Supabase Edge Functions (existantes), React (Dashboard.tsx)

---

### Task 1: Migration SQL — cron job wellness matinal

**Files:**
- Create: `supabase/migrations/00070_wellness_morning_cron.sql`

**Step 1: Écrire la migration**

```sql
-- 00070_wellness_morning_cron.sql
-- Daily 6:00 AM (CEST) push notification for athletes missing wellness check.
-- Uses pg_cron (already enabled in 00049) + existing notification_targets trigger pipeline.

CREATE OR REPLACE FUNCTION send_wellness_morning_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_notif_id INTEGER;
  v_athlete RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Find athletes with push subscriptions who haven't filled wellness today
  FOR v_athlete IN
    SELECT DISTINCT ps.user_id
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role = 'athlete'
      AND NOT EXISTS (
        SELECT 1 FROM wellness_checks wc
        WHERE wc.user_id = ps.user_id AND wc.date = v_today
      )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  -- Skip if nobody to notify
  IF v_count = 0 THEN RETURN; END IF;

  -- Create a single notification
  INSERT INTO notifications (title, body, type, metadata)
  VALUES (
    'Comment te sens-tu ce matin ?',
    'Remplis ton bien-être en 30 secondes',
    'wellness',
    '{"url": "#/?wellness=open"}'::jsonb
  )
  RETURNING id INTO v_notif_id;

  -- Create one target per athlete (trigger fires push-send for each)
  FOR v_athlete IN
    SELECT DISTINCT ps.user_id
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role = 'athlete'
      AND NOT EXISTS (
        SELECT 1 FROM wellness_checks wc
        WHERE wc.user_id = ps.user_id AND wc.date = v_today
      )
  LOOP
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notif_id, v_athlete.user_id);
  END LOOP;
END;
$$;

-- Schedule: 04:00 UTC = 06:00 CEST (heure d'été France)
SELECT cron.schedule(
  'wellness-morning-push',
  '0 4 * * *',
  $$ SELECT send_wellness_morning_push(); $$
);
```

**Step 2: Vérifier que la migration est syntaxiquement valide**

Run: `cd supabase && grep -c 'cron.schedule' migrations/00070_wellness_morning_cron.sql`
Expected: `1`

**Step 3: Commit**

```bash
git add supabase/migrations/00070_wellness_morning_cron.sql
git commit -m "feat: add morning wellness push notification cron job (§96)"
```

---

### Task 2: Dashboard — auto-ouvrir le drawer wellness via query param

**Files:**
- Modify: `src/pages/Dashboard.tsx` (~ligne 143)

**Step 1: Lire le query param et ouvrir le drawer**

Dans `Dashboard()`, après la déclaration de `wellnessOpen` (ligne 143), ajouter :

```tsx
// Auto-open wellness drawer from push notification deep link (?wellness=open)
React.useEffect(() => {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (params.get('wellness') === 'open') {
    setWellnessOpen(true);
    // Clean up URL param
    const hashBase = window.location.hash.split('?')[0];
    window.history.replaceState(null, '', window.location.pathname + hashBase);
  }
}, []);
```

**Step 2: Vérifier le build**

Run: `npm run build`
Expected: Build réussi sans erreurs

**Step 3: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: auto-open wellness drawer from push deep link (§96)"
```

---

### Task 3: Mise à jour push-send pour le type wellness

**Files:**
- Modify: `supabase/functions/push-send/index.ts` (~ligne 32)

**Step 1: Ajouter le routage URL pour type wellness**

Dans `resolveNotificationUrl()`, ajouter une clause :

```typescript
if (type === "wellness") {
  return "#/?wellness=open";
}
```

Avant le `return "#/profile?section=messages"` final.

**Step 2: Commit**

```bash
git add supabase/functions/push-send/index.ts
git commit -m "feat: route wellness notification to deep link (§96)"
```

---

### Task 4: Documentation

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `CLAUDE.md`

**Step 1: Ajouter entrée implementation-log**

```markdown
## §96 — Notification matinale bien-être (2026-04-08)

**Contexte** : Les nageurs oublient souvent de saisir leur bien-être quotidien. Ajout d'une notification push automatique à 6h00 chaque matin.

**Changements** :
- `supabase/migrations/00070_wellness_morning_cron.sql` — Cron job pg_cron `0 4 * * *` (6h00 CEST). Fonction `send_wellness_morning_push()` qui identifie les nageurs (rôle athlete) avec push actif sans wellness du jour, crée une notification et des targets individuels.
- `src/pages/Dashboard.tsx` — Lecture du query param `?wellness=open` au montage pour ouvrir automatiquement le drawer WellnessForm.
- `supabase/functions/push-send/index.ts` — Ajout routage type `wellness` → `#/?wellness=open`.

**Décisions** :
- Utilise le pipeline notifications existant (INSERT notification_targets → trigger → push-send) plutôt qu'un appel HTTP direct, pour la cohérence et la traçabilité.
- Heure fixe UTC (04:00 = 06:00 CEST). En hiver CET, ça donnera 05:00 local.
- Notification unique partagée avec targets individuels pour éviter les doublons en base.
```

**Step 2: Mettre à jour CLAUDE.md — ajouter §96 dans le tableau des chantiers**

**Step 3: Commit**

```bash
git add docs/implementation-log.md CLAUDE.md
git commit -m "docs: log wellness morning notification implementation (§96)"
```
