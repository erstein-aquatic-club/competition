-- 00178_strength_session_items_mesocycle_idx.sql
-- §294 — Index sur strength_session_items.raw_payload->>'mesocycle_id'.
--
-- La RPC revert_strength_mesocycle (00173) et l'API
-- getMesocycleSessionsContent (src/lib/api/strength-mesocycles.ts) filtrent
-- les items par cette clé JSON. Sans index → seq scan complet.
--
-- Index partiel : ne couvre que les items posés par un mésocycle (clé
-- présente dans raw_payload), pour ne pas alourdir les inserts hors-mésocycle.

BEGIN;

CREATE INDEX strength_session_items_mesocycle_idx
    ON strength_session_items ((raw_payload->>'mesocycle_id'))
 WHERE raw_payload ? 'mesocycle_id';

COMMIT;
