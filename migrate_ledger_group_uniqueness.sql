-- =============================================
-- MIGRATION: Remove duplicate default ledger groups
-- and enforce uniqueness for future inserts
-- Run this in Supabase SQL Editor
-- =============================================

WITH ranked_groups AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::UUID), LOWER(name)
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM ledger_groups
)
DELETE FROM ledger_groups
WHERE id IN (
  SELECT id
  FROM ranked_groups
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ledger_groups_user_parent_name_type_unique_idx
ON ledger_groups (
  user_id,
  type,
  COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::UUID),
  LOWER(name)
);
