-- =============================================
-- Audit Log Migration for Khetbook
-- Simple action log for tracking data changes
-- Run this in Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id, created_at DESC);

-- Index for querying by table/record
CREATE INDEX IF NOT EXISTS audit_log_table_record_idx ON audit_log(table_name, record_id);

-- RLS: Users can only see and create their own audit logs
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own audit logs" ON audit_log;
CREATE POLICY "Users can manage own audit logs" ON audit_log
FOR ALL
USING (auth.uid() = user_id);
