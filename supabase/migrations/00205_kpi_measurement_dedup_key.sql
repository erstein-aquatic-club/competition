-- 00205 — Idempotence des mesures KPI hors-ligne (#3 Slice B, audit §314).
--
-- Contexte : `strength_kpi_measurements` est append-only (INSERT). Pour mettre
-- les mesures en file offline (réseau salle instable), il faut les rendre
-- idempotentes : si le replay envoie l'INSERT, que le serveur le commit mais
-- que l'ACK se perd, la file re-rejoue → SANS garde, doublon de mesure.
--
-- Solution : une clé de déduplication générée côté client (UUID), stable par
-- mesure (réutilisée à chaque retry / replay). UPSERT `ON CONFLICT
-- (client_dedup_key)` côté API (recordKpiMeasurement) → le 2ᵉ envoi met à jour
-- la ligne au lieu d'en créer une seconde.
--
-- L'index unique est sur la SEULE colonne `client_dedup_key` : en Postgres les
-- NULL sont distincts dans un index unique → les lignes historiques (clé NULL)
-- et toute écriture sans clé (autres appelants) ne sont PAS contraintes. Aucune
-- RLS/policy touchée (ajout de colonne + index). Réversible : DROP INDEX + DROP
-- COLUMN.

ALTER TABLE strength_kpi_measurements
  ADD COLUMN IF NOT EXISTS client_dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS strength_kpi_measurements_client_dedup_key_uidx
  ON strength_kpi_measurements (client_dedup_key);

-- Vérif (post-apply) :
--   \d strength_kpi_measurements  → colonne client_dedup_key + index unique.
