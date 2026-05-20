-- 00179_sprint_50_template_align_max_weeks.sql
-- §294 — Aligne Σ_max_weeks avec max_week_count sur le template sprint_50
-- season (mig 00175).
--
-- Audit §293 (2026-05-20) : Σ_max_weeks = 2+4+2+4+2+2+1 = 17 mais
-- max_week_count = 16. Asymétrie sans impact UI immédiat (slider clampé à 16)
-- mais le moteur periodize accepte targetWeekCount=17 si appelé directement.
--
-- Fix : on comprime la phase 'puissance' (index 3) de max=4 à max=3. Le bloc
-- puissance reste cohérent McEvoy avec 3 semaines (Trap Bar Jump + Box Jump),
-- et le bloc force_max conserve son max=4 (priorité du sprinter).
--
-- Σ_max post-fix : 2+4+2+3+2+2+1 = 16 ✅ (= max_week_count, symétrie atteinte)

BEGIN;

UPDATE strength_periodization_templates
   SET structure = jsonb_set(
         structure,
         '{phases,3,max_weeks}',  -- index 3 = phase 'puissance'
         to_jsonb(3)
       ),
       updated_at = now()
 WHERE event_group = 'sprint_50' AND kind = 'season';

COMMIT;
