/**
 * Bypass trial/quota enforcement for local dev, beta testing, and privileged accounts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlatformSuperAdminProfile } from '@/app/lib/owner';

/** True when billing limits should not block uploads/OCR (development or explicit env flag). */
export function isDevelopmentBillingBypass(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.ATLAS_BYPASS_BILLING === 'true' ||
    process.env.ATLAS_BYPASS_BILLING === '1'
  );
}

/** Skip trial expiration and quota blocks for dev mode, env flag, admin/owner profiles. */
export async function shouldBypassBillingEnforcement(
  db: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (isDevelopmentBillingBypass()) return true;
  if (!userId) return false;

  const { data } = await db.from('profiles').select('role, email').eq('id', userId).maybeSingle();
  if (!data) return false;

  if (isPlatformSuperAdminProfile(data.role as string | null | undefined, data.email as string | null | undefined)) {
    return true;
  }

  return false;
}
