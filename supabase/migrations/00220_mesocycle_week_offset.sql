-- 00220_mesocycle_week_offset.sql — §358 progression globale après ajustement.
-- Offset = nombre de semaines déjà entraînées avant le pivot (start_week_monday).
-- Défaut 0 = comportement actuel (génération normale / mésos existants).
ALTER TABLE strength_mesocycles ADD COLUMN IF NOT EXISTS week_offset int NOT NULL DEFAULT 0;

-- Backfill one-off : méso ajusté actif de François (user 1) — 2 semaines faites
-- avant le pivot (18 + 25 mai) → bannière « Semaine 3/6 » immédiate.
UPDATE strength_mesocycles SET week_offset = 2
WHERE id = 'c9c42226-4736-4faa-a3cf-365f04cc2e60';
