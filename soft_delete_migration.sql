-- =============================================
-- Soft Delete Migration for Khetbook
-- Adds deleted_at column to key tables
-- Run this in Supabase SQL Editor
-- =============================================
-- IMPORTANT: Take a database backup before running this migration!
-- Supabase Dashboard → Settings → Database → Backups

-- 1. Add deleted_at column to vouchers
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add deleted_at column to ledger_groups
ALTER TABLE ledger_groups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Add deleted_at column to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Add indexes for soft-delete filtering (performance)
CREATE INDEX IF NOT EXISTS vouchers_deleted_at_idx ON vouchers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ledger_groups_deleted_at_idx ON ledger_groups(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS items_deleted_at_idx ON items(deleted_at) WHERE deleted_at IS NULL;

-- 5. Update RLS policies to filter out soft-deleted rows for normal queries
-- Vouchers: Users see only their own non-deleted vouchers
DROP POLICY IF EXISTS "Users can manage own vouchers" ON vouchers;
CREATE POLICY "Users can manage own vouchers" ON vouchers
FOR ALL
USING (auth.uid() = user_id);
-- Note: We keep RLS simple (no deleted_at filter in policy) because
-- the app handles soft-delete filtering in queries. This lets us
-- still query deleted items for the Trash view.

-- Family sessions: only show non-deleted vouchers
DROP POLICY IF EXISTS "Family sessions can read shared vouchers" ON vouchers;
CREATE POLICY "Family sessions can read shared vouchers" ON vouchers
FOR SELECT
USING (
    deleted_at IS NULL
    AND EXISTS (
        SELECT 1
        FROM farm_members
        WHERE farm_members.user_id = vouchers.user_id
          AND farm_members.session_token = auth.uid()::text
          AND farm_members.is_active = true
    )
);

-- 6. Cleanup function: permanently delete items trashed for > 15 days
-- Run this manually or set up a Supabase cron job (pg_cron)
CREATE OR REPLACE FUNCTION cleanup_soft_deleted()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete voucher_lines for soft-deleted vouchers older than 15 days
    DELETE FROM voucher_lines
    WHERE voucher_id IN (
        SELECT id FROM vouchers
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - INTERVAL '15 days'
    );

    -- Delete soft-deleted vouchers older than 15 days
    DELETE FROM vouchers
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - INTERVAL '15 days';

    -- Delete soft-deleted ledger_groups older than 15 days
    DELETE FROM ledger_groups
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - INTERVAL '15 days';

    -- Delete soft-deleted items older than 15 days
    DELETE FROM items
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - INTERVAL '15 days';
END;
$$;

-- To set up automatic cleanup (run once in SQL editor):
-- SELECT cron.schedule('cleanup-trash', '0 3 * * *', 'SELECT cleanup_soft_deleted()');
-- This runs daily at 3 AM. Requires pg_cron extension enabled in Supabase.
-- If pg_cron is not available, just run SELECT cleanup_soft_deleted() manually.
