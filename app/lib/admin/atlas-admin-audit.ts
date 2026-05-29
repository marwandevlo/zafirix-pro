import { createClient } from '@supabase/supabase-js';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';

export type AtlasAdminAuditInput = {
  actorUserId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Append-only admin audit row. Requires service role; no-ops if key missing.
 * RLS on `atlas_admin_logs` denies JWT access — only service role / bypass writes.
 */
export async function logAtlasAdminAction(input: AtlasAdminAuditInput): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!url || !key) {
    logAtlasServerEvent('admin_audit', 'warn', 'skip_audit_no_service_role', { action: input.action });
    return;
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from('atlas_admin_logs').insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    logAtlasServerEvent('admin_audit', 'error', 'atlas_admin_logs_insert_failed', {
      message: error.message,
      action: input.action,
    });
  }
}
