import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isOwnerEmail, OWNER_PROFILE_DEFAULTS } from '@/app/lib/owner';
import { elevateOwnerProfileIfNeeded } from '@/app/lib/admin/platform-super-admin';
import { isAccountAcceptedStatus } from '@/app/lib/email-account-status';

export type EnsureUserProfileOptions = {
  /** When true (default), set status to active if the auth user email is confirmed. */
  activateIfEmailConfirmed?: boolean;
  source?: string;
};

export type EnsureUserProfileResult = {
  ok: boolean;
  status: string;
  created: boolean;
  previousStatus?: string;
  createdAt?: string | null;
  activated: boolean;
  error?: string;
};

/**
 * Idempotent profiles row for authenticated users.
 * Uses service_role so RLS/triggers on INSERT do not strip privileged defaults.
 * Must stay Edge-safe: do not import Resend or other Node-only packages here.
 */
export async function ensureUserProfile(
  admin: SupabaseClient,
  user: User,
  options: EnsureUserProfileOptions = {},
): Promise<EnsureUserProfileResult> {
  const source = options.source ?? 'ensureUserProfile';
  const activateIfEmailConfirmed = options.activateIfEmailConfirmed !== false;

  const email = user.email?.trim() ?? '';
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === 'string'
      ? meta.full_name
      : typeof meta?.name === 'string'
        ? meta.name
        : '';

  const emailConfirmed = Boolean(user.email_confirmed_at);
  const isOwner = isOwnerEmail(email);

  const defaultStatus = isOwner
    ? 'active'
    : activateIfEmailConfirmed && emailConfirmed
      ? 'active'
      : 'pending';

  const { data: existing, error: readError } = await admin
    .from('profiles')
    .select('id, email, full_name, status, role, plan, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    console.error(`[${source}] profile read failed`, readError.message);
    return { ok: false, status: 'pending', created: false, activated: false, error: readError.message };
  }

  if (!existing) {
    const { error: insertError } = await admin.from('profiles').insert({
      id: user.id,
      email: email || null,
      full_name: fullName,
      role: isOwner ? OWNER_PROFILE_DEFAULTS.role : 'user',
      plan: isOwner ? OWNER_PROFILE_DEFAULTS.plan : 'free',
      status: defaultStatus,
    });

    if (insertError) {
      console.error(`[${source}] profile insert failed`, insertError.message);
      return { ok: false, status: defaultStatus, created: false, activated: false, error: insertError.message };
    }

    console.info(`[${source}] profile created`, { userId: user.id, status: defaultStatus });
    return {
      ok: true,
      status: defaultStatus,
      created: true,
      previousStatus: undefined,
      createdAt: new Date().toISOString(),
      activated: false,
    };
  }

  if (isOwner) {
    await elevateOwnerProfileIfNeeded(admin, user.id, email);
    return {
      ok: true,
      status: OWNER_PROFILE_DEFAULTS.status,
      created: false,
      previousStatus: OWNER_PROFILE_DEFAULTS.status,
      createdAt: String((existing as { created_at?: string | null }).created_at ?? '') || null,
      activated: false,
    };
  }

  const currentStatus = String((existing as { status?: string | null }).status ?? '').trim().toLowerCase();
  const createdAt = String((existing as { created_at?: string | null }).created_at ?? '') || null;
  const patch: Record<string, unknown> = {};

  if (email && !String((existing as { email?: string | null }).email ?? '').trim()) {
    patch.email = email;
  }
  if (fullName && !String((existing as { full_name?: string | null }).full_name ?? '').trim()) {
    patch.full_name = fullName;
  }

  if (activateIfEmailConfirmed && emailConfirmed && currentStatus === 'pending' && !isOwner) {
    patch.status = 'active';
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { error: updateError } = await admin.from('profiles').update(patch).eq('id', user.id);
    if (updateError) {
      console.error(`[${source}] profile update failed`, updateError.message);
      return {
        ok: false,
        status: currentStatus || defaultStatus,
        created: false,
        previousStatus: currentStatus,
        createdAt,
        activated: false,
        error: updateError.message,
      };
    }
    if (patch.status === 'active') {
      console.info(`[${source}] email-confirmed user activated`, { userId: user.id });
    }
  }

  const finalStatus = String(patch.status ?? currentStatus ?? defaultStatus);
  const activated = !isAccountAcceptedStatus(currentStatus) && isAccountAcceptedStatus(finalStatus);

  return {
    ok: true,
    status: finalStatus,
    created: false,
    previousStatus: currentStatus,
    createdAt,
    activated,
  };
}
