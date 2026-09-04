'use server';

import { requireAdminSession } from '@/app/lib/admin/require-admin-session';
import {
  approveUserAccount,
  type ApproveUserAccountResult,
  type ApprovedUserSnapshot,
} from '@/app/lib/admin/approve-user-account';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';

export type ApproveUserActionResult =
  | { ok: true; user: ApprovedUserSnapshot; alreadyApproved: boolean; emailQueued: boolean }
  | { ok: false; error: string; message?: string };

/**
 * Admin Server Action: persist profiles.status = active and queue the approval email.
 * Resend is fire-and-forget inside approveUserAccount — this action returns after the DB write.
 */
export async function approveUser(userId: string): Promise<ApproveUserActionResult> {
  try {
    const guard = await requireAdminSession();
    if (!guard.ok) {
      return { ok: false, error: guard.error };
    }

    const result: ApproveUserAccountResult = await approveUserAccount({
      userId,
      adminUserId: guard.adminUserId,
      adminEmail: guard.adminEmail,
    });

    if (!result.ok) {
      logAtlasServerEvent('admin', 'error', 'approve_user_failed', {
        userId,
        error: result.error,
        message: result.message ?? null,
      });
      return { ok: false, error: result.error, message: result.message };
    }

    logAtlasServerEvent('admin', 'info', 'approve_user_ok', {
      userId,
      alreadyApproved: result.alreadyApproved,
      emailQueued: result.emailQueued,
    });

    return {
      ok: true,
      user: result.user,
      alreadyApproved: result.alreadyApproved,
      emailQueued: result.emailQueued,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logAtlasServerEvent('admin', 'error', 'approve_user_threw', { userId, message });
    return { ok: false, error: 'server_error', message };
  }
}

export async function approvePendingUser(userId: string): Promise<ApproveUserActionResult> {
  return approveUser(userId);
}
