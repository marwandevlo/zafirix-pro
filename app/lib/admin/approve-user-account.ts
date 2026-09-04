import 'server-only';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { writeAdminLog } from '@/app/lib/admin/require-admin';
import { revalidateAdminSurfaces } from '@/app/lib/admin/revalidate-admin-paths';
import { isOwnerEmail } from '@/app/lib/owner';
import { isUuid } from '@/app/lib/admin/atlas-admin-profile-fields';
import { isAccountAcceptedStatus } from '@/app/lib/email-account-status';
import { queueApprovalEmail } from '@/lib/email';

export const APPROVED_PROFILE_STATUS = 'active' as const;

export type ApprovedUserSnapshot = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  plan: string;
  status: string;
};

export type ApproveUserAccountResult =
  | { ok: true; user: ApprovedUserSnapshot; alreadyApproved: boolean; emailQueued: boolean }
  | { ok: false; error: string; message?: string; status: 400 | 403 | 404 | 500 };

export type ApproveUserAccountInput = {
  userId: string;
  adminUserId: string;
  adminEmail: string;
};

/**
 * Persist profiles.status = active (admin approval) and queue the Resend email.
 * The email is fire-and-forget so the caller can return immediately.
 */
export async function approveUserAccount(input: ApproveUserAccountInput): Promise<ApproveUserAccountResult> {
  const userId = String(input.userId ?? '').trim();
  if (!userId || !isUuid(userId)) {
    return { ok: false, error: 'invalid_user_id', status: 400 };
  }

  if (atlasDataBackend() !== 'supabase') {
    return { ok: false, error: 'not_enabled', status: 400 };
  }

  let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'SUPABASE_SERVICE_ROLE_KEY missing';
    return { ok: false, error: 'server_misconfigured', message, status: 500 };
  }

  const [{ data: targetProf }, { data: targetAuth, error: authErr }] = await Promise.all([
    admin.from('profiles').select('id, email, full_name, role, plan, status').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  if (authErr) {
    return { ok: false, error: 'admin_api_error', message: authErr.message, status: 500 };
  }

  const authUser = targetAuth?.user ?? null;
  if (!targetProf && !authUser) {
    return { ok: false, error: 'not_found', status: 404 };
  }

  const prev = (targetProf ?? {}) as {
    email?: string | null;
    full_name?: string | null;
    role?: string | null;
    plan?: string | null;
    status?: string | null;
  };
  const authEmail = String(authUser?.email ?? '').trim();
  const profileEmail = String(prev.email ?? '').trim();
  const targetEmail = profileEmail || authEmail;
  const prevStatus = String(prev.status ?? '').trim().toLowerCase();
  const actorIsOwner = isOwnerEmail(input.adminEmail);
  const targetIsOwner = isOwnerEmail(profileEmail) || isOwnerEmail(authEmail);

  if (targetIsOwner && !actorIsOwner) {
    return { ok: false, error: 'owner_immutable', status: 403 };
  }

  if (!targetProf) {
    const { error: insertErr } = await admin
      .from('profiles')
      .upsert({ id: userId, email: authEmail || null, status: APPROVED_PROFILE_STATUS }, { onConflict: 'id', ignoreDuplicates: true });
    if (insertErr) {
      return { ok: false, error: 'db_error', message: insertErr.message, status: 500 };
    }
  }

  const alreadyApproved = isAccountAcceptedStatus(prevStatus);
  if (!alreadyApproved) {
    const { error: upErr } = await admin
      .from('profiles')
      .update({ status: APPROVED_PROFILE_STATUS, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (upErr) {
      return { ok: false, error: 'db_error', message: upErr.message, status: 500 };
    }

    const { data: verifyRow } = await admin.from('profiles').select('status').eq('id', userId).maybeSingle();
    const persisted = String((verifyRow as { status?: string | null } | null)?.status ?? '');
    if (!isAccountAcceptedStatus(persisted)) {
      console.error('[approveUserAccount] update_not_persisted', { userId, requested: APPROVED_PROFILE_STATUS, actual: persisted });
      return {
        ok: false,
        error: 'update_not_persisted',
        message:
          'Le statut n’a pas été persisté. Vérifiez le trigger profiles_protect_privileged_fields (migration 20260904120000).',
        status: 500,
      };
    }
  }

  const { data: finalProf } = await admin
    .from('profiles')
    .select('id, email, full_name, role, plan, status')
    .eq('id', userId)
    .maybeSingle();
  const fp = (finalProf ?? {}) as {
    email?: string | null;
    full_name?: string | null;
    role?: string | null;
    plan?: string | null;
    status?: string | null;
  };

  const snapshot: ApprovedUserSnapshot = {
    id: userId,
    email: String(fp.email ?? targetEmail),
    full_name: String(fp.full_name ?? ''),
    role: String(fp.role ?? 'user'),
    plan: String(fp.plan ?? 'free'),
    status: String(fp.status ?? APPROVED_PROFILE_STATUS),
  };

  if (!alreadyApproved) {
    await writeAdminLog({
      adminId: input.adminUserId,
      targetUserId: userId,
      action: 'USER_APPROVED',
      details: { status: APPROVED_PROFILE_STATUS, prevStatus: prevStatus || null },
    });
  }

  revalidateAdminSurfaces([`/admin/users/${userId}`, '/admin/users']);

  const recipient = snapshot.email.trim();
  const emailQueued = Boolean(recipient) && !alreadyApproved;
  if (emailQueued) {
    queueApprovalEmail({
      to: recipient,
      displayName: snapshot.full_name || recipient,
      userId,
      admin,
    });
  }

  return { ok: true, user: snapshot, alreadyApproved, emailQueued };
}
