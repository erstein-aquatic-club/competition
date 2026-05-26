-- 00209 — Focus événement forcé pour les sprints (§322).
-- (00208 pris par §321 `groups_select` anon — autre terminal, même session.)
--
-- Retour terrain (François 50 m) : la priorisation `emphasis × (100 − score)`
-- entraîne le point FAIBLE de l'athlète. Pour un sprinteur déjà puissant, la
-- puissance haute explosive (la qualité que l'épreuve DEMANDE — McEvoy : « la
-- traction explosive domine ») n'était donc pas forcément travaillée.
--
-- Solution : `forced_focus` dans le `structure` jsonb du profil de distance →
-- les seaux listés sont garantis en focus quel que soit le score (cf.
-- `prioritizeBuckets` §322, après l'override mobilité sécurité). Pour 50 m et
-- 100 m : `upper_power` (traction explosive / med-ball). Coach-tunable (jsonb).
--
-- Aucune RLS touchée. Réversible : `structure = structure - 'forced_focus'`.

UPDATE strength_distance_profiles
   SET structure = jsonb_set(structure, '{forced_focus}', '["upper_power"]'::jsonb),
       updated_at = now()
 WHERE distance_key IN ('50', '100');

-- Vérif :
--   SELECT distance_key, kind, structure->'forced_focus' FROM strength_distance_profiles
--    WHERE distance_key IN ('50','100') ORDER BY 1,2;
