-- §169 — Records club filtrés par appartenance historique au club.
-- Ajoute le club d'appartenance au moment de la performance (capté depuis FFN
-- par le parser _shared/ffn-parser.ts) et expose le libellé du club "maison"
-- dans app_settings pour que recalculateClubRecords filtre dessus.

ALTER TABLE swimmer_performances ADD COLUMN IF NOT EXISTS club_name TEXT;

CREATE INDEX IF NOT EXISTS idx_perf_club_name
  ON swimmer_performances(club_name)
  WHERE club_name IS NOT NULL;

-- Libellé exact du club tel que retourné par la cellule club de la table
-- "Performances" FFN. Si la FFN renomme le club, mettre à jour cette valeur :
-- UPDATE app_settings SET value = '"NOUVEAU LIBELLE"'::jsonb WHERE key = 'home_club_name';
INSERT INTO app_settings (key, value) VALUES (
  'home_club_name',
  '"ERSTEIN AQUATIC CLUB"'::jsonb
) ON CONFLICT (key) DO NOTHING;
