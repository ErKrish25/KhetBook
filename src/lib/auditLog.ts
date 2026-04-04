import { supabase } from './supabase';

type AuditAction = 'create' | 'update' | 'delete' | 'restore';

/**
 * Log an action to the audit_log table.
 * Fire-and-forget — never blocks the user or throws errors.
 */
export function logAction(
  action: AuditAction,
  tableName: string,
  recordId: string | null,
  oldData?: Record<string, unknown> | null,
  newData?: Record<string, unknown> | null
): void {
  // Get user from session synchronously (already cached by supabase-js)
  supabase.auth.getSession().then(({ data }) => {
    const userId = data?.session?.user?.id;
    if (!userId) return;

    supabase
      .from('audit_log')
      .insert({
        user_id: userId,
        action,
        table_name: tableName,
        record_id: recordId,
        old_data: oldData ?? null,
        new_data: newData ?? null,
      })
      .then(({ error }) => {
        if (error) console.warn('[audit] Failed to log action:', error.message);
      });
  });
}
