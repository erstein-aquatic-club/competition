-- ─────────────────────────────────────────────────────────────
-- 00103 — Training slots: shared write access across coaches
-- ─────────────────────────────────────────────────────────────
--
-- Contexte:
--   La migration 00102 (sprint1 security fixes) a restreint
--   update/delete sur training_slots (+ assignments + overrides)
--   au créateur uniquement (`created_by = app_user_id()`), pour
--   prévenir les mutations cross-coach.
--
--   Problème concret: EAC est un club unique, les créneaux
--   hebdomadaires sont des ressources partagées entre tous les
--   coachs. De plus, 00102 a backfillé `created_by` sur un compte
--   admin pour les lignes orphelines — aucun coach ne peut donc
--   plus les modifier/supprimer. Résultat: le soft-delete
--   `UPDATE training_slots SET is_active=false` émis par
--   `deleteTrainingSlot` est silencieusement filtré par RLS
--   (0 lignes, aucune erreur) et le créneau "ne se supprime pas".
--
-- Décision: tout utilisateur de rôle `coach` (ou `admin`) peut
--   modifier/supprimer n'importe quel training_slot et ses
--   assignments/overrides. `created_by` reste l'audit trail.
--   Les athlètes / comité restent bloqués en écriture.

-- ── training_slots ──────────────────────────────────────────
DROP POLICY IF EXISTS "training_slots_coach_update" ON training_slots;
CREATE POLICY "training_slots_coach_update" ON training_slots
  FOR UPDATE TO authenticated
  USING (app_user_role() IN ('admin', 'coach'))
  WITH CHECK (app_user_role() IN ('admin', 'coach'));

DROP POLICY IF EXISTS "training_slots_coach_delete" ON training_slots;
CREATE POLICY "training_slots_coach_delete" ON training_slots
  FOR DELETE TO authenticated
  USING (app_user_role() IN ('admin', 'coach'));

-- ── training_slot_assignments ───────────────────────────────
DROP POLICY IF EXISTS "training_slot_assignments_coach_update" ON training_slot_assignments;
CREATE POLICY "training_slot_assignments_coach_update" ON training_slot_assignments
  FOR UPDATE TO authenticated
  USING (app_user_role() IN ('admin', 'coach'))
  WITH CHECK (app_user_role() IN ('admin', 'coach'));

DROP POLICY IF EXISTS "training_slot_assignments_coach_delete" ON training_slot_assignments;
CREATE POLICY "training_slot_assignments_coach_delete" ON training_slot_assignments
  FOR DELETE TO authenticated
  USING (app_user_role() IN ('admin', 'coach'));

-- ── training_slot_overrides ─────────────────────────────────
DROP POLICY IF EXISTS "training_slot_overrides_coach_update" ON training_slot_overrides;
CREATE POLICY "training_slot_overrides_coach_update" ON training_slot_overrides
  FOR UPDATE TO authenticated
  USING (app_user_role() IN ('admin', 'coach'))
  WITH CHECK (app_user_role() IN ('admin', 'coach'));

DROP POLICY IF EXISTS "training_slot_overrides_coach_delete" ON training_slot_overrides;
CREATE POLICY "training_slot_overrides_coach_delete" ON training_slot_overrides
  FOR DELETE TO authenticated
  USING (app_user_role() IN ('admin', 'coach'));
