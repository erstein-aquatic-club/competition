-- 00213_trap_bar_squat_selection_priority.sql
-- §329 — Trap bar squat = staple `lower_strength` (coach-pilotable, cf. §319/§320).
--
-- Le seau jambes PAP ajouté à l'amorce (§329) pioche le 1ᵉʳ exo CORE de
-- `lower_strength` via `firstCore`. Sans priorité, plusieurs squats core (arrière,
-- bulgare, trap bar) sont à égalité (prio 0) → le trap bar n'était pas garanti.
-- Le coach veut le trap bar comme LE squat de référence (retour terrain François
-- : « trap bar squat le jeudi »). On le remonte à 100 (pair de Box Jump = staple
-- `lower_power`) → il devient le pick `lower_strength` à l'amorce ET en dév.
-- Rétrocompatible (les autres squats restent à 0, départagés ensuite). Coach peut
-- réajuster via l'UI `ExercisePrioritySelector` (§320).

UPDATE dim_exercices
   SET selection_priority = 100
 WHERE id = 7
   AND nom_exercice = 'Soulevé de terre trap bar';
