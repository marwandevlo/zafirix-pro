'use server';

import { dispatchPasswordResetForEmail } from '@/app/lib/email-auth-dispatch';
import { getServerUser } from '@/app/lib/supabase-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  queueSecurityAlertEmail,
  resolveAuthUserContact,
  type SecurityAlertKind,
} from '@/app/lib/email-transactional';

/**
 * Server Action: branded password-reset email. Always returns ok for valid addresses.
 */
export async function requestPasswordResetEmail(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return dispatchPasswordResetForEmail(email);
}

/**
 * Server Action: security alert for the cookie-session user.
 */
export async function notifySignedInUserSecurity(
  kind: SecurityAlertKind,
  changedFields?: string[],
): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  const user = await getServerUser();
  if (!user) return { ok: false, error: 'auth_required' };

  try {
    const admin = getSupabaseServiceRoleClient();
    const contact = await resolveAuthUserContact(admin, user.id);
    if (!contact) return { ok: true, queued: false };
    queueSecurityAlertEmail({
      kind,
      to: contact.email,
      displayName: contact.displayName,
      userId: user.id,
      changedFields,
    });
    return { ok: true, queued: true };
  } catch {
    return { ok: true, queued: false };
  }
}
