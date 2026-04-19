-- Consolidation RLS push_subscriptions : -18 warnings multiple_permissive_policies.
--
-- Problème : la policy "Service role full access" (cmd=ALL, TO public) se superpose
-- aux 3 user policies pour chaque role × chaque action → 3 actions × 6 roles = 18 warnings.
--
-- Fix : scoper la policy service_role à `TO service_role` (et non `TO public`).
-- Les user policies deviennent `TO authenticated` (elles visaient déjà uniquement
-- des utilisateurs authentifiés via `user_id = app_user_id()`).
--
-- Comportement identique : service_role continue à avoir full access, users authentifiés
-- continuent à CRUD leurs propres subscriptions. Impact fonctionnel = nul.

DROP POLICY IF EXISTS "Service role full access" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON push_subscriptions;

CREATE POLICY "push_subscriptions_service_all"
  ON push_subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "push_subscriptions_select_own"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = app_user_id());

CREATE POLICY "push_subscriptions_insert_own"
  ON push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = app_user_id());

CREATE POLICY "push_subscriptions_delete_own"
  ON push_subscriptions FOR DELETE
  TO authenticated
  USING (user_id = app_user_id());
