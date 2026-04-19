-- Migration 00116: Unify dim_sessions dedup constraint
--
-- Context
-- -------
-- Migration 00086 introduced two *disjoint* partial UNIQUE indexes:
--   idx_dim_sessions_dedupe_v2     — (athlete_id, session_date, assignment_id) WHERE assignment_id IS NOT NULL
--   idx_dim_sessions_dedupe_legacy — (athlete_id, session_date, time_slot)      WHERE assignment_id IS NULL
-- Because they live in non-overlapping partitions, they cannot prevent the
-- legacy ↔ new doublet: a row with assignment_id=NULL and a row with
-- assignment_id=X for the *same* (athlete_id, session_date, time_slot) both
-- pass their respective checks independently. A swimmer who logged manually
-- first, then re-saved on the assignment-aware UI, ends up with two rows for
-- the same physical slot — and Progress.tsx, which sums distance naively,
-- triple-counts.
--
-- This migration:
--   1. Drops the two partial indexes up front (so the in-flight UPDATE does
--      not momentarily violate idx_dim_sessions_dedupe_v2 while the legacy
--      and new rows briefly share the same assignment_id).
--   2. Fuses existing legacy↔new duplicates onto the legacy row (keeps its
--      earliest created_at, copies the most recent feedback fields + the
--      assignment_id), then deletes the redundant new row.
--   3. Installs a single unified UNIQUE index on (athlete_id, session_date,
--      time_slot) so future duplicates are rejected at the DB level,
--      regardless of whether assignment_id is set.
--
-- The application-side syncSession() resolves 23505 by UPDATE (api.ts), so
-- this tightening is transparent: a second save for the same slot promotes
-- the existing row in place instead of creating a second one.

DROP INDEX IF EXISTS idx_dim_sessions_dedupe_v2;
DROP INDEX IF EXISTS idx_dim_sessions_dedupe_legacy;

CREATE TEMP TABLE dim_sessions_merge_work AS
SELECT DISTINCT ON (l.id)
  l.id                    AS legacy_id,
  n.id                    AS new_id,
  n.assignment_id         AS new_assignment_id,
  n.distance              AS new_distance,
  n.duration              AS new_duration,
  n.rpe                   AS new_rpe,
  n.performance           AS new_performance,
  n.engagement            AS new_engagement,
  n.fatigue               AS new_fatigue,
  n.comments              AS new_comments
FROM dim_sessions l
JOIN dim_sessions n
  ON n.athlete_id   = l.athlete_id
 AND n.session_date = l.session_date
 AND n.time_slot    = l.time_slot
 AND n.id <> l.id
WHERE l.assignment_id IS NULL
  AND n.assignment_id IS NOT NULL
  AND l.athlete_id IS NOT NULL
ORDER BY l.id, n.created_at DESC;

UPDATE dim_sessions d
SET assignment_id = m.new_assignment_id,
    distance      = m.new_distance,
    duration      = m.new_duration,
    rpe           = m.new_rpe,
    performance   = m.new_performance,
    engagement    = m.new_engagement,
    fatigue       = m.new_fatigue,
    comments      = m.new_comments
FROM dim_sessions_merge_work m
WHERE d.id = m.legacy_id;

DELETE FROM dim_sessions
WHERE id IN (SELECT new_id FROM dim_sessions_merge_work);

CREATE UNIQUE INDEX idx_dim_sessions_unique
  ON dim_sessions (athlete_id, session_date, time_slot)
  WHERE athlete_id IS NOT NULL;

DROP TABLE dim_sessions_merge_work;
