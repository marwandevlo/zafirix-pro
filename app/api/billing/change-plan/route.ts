/**
 * POST /api/billing/change-plan — request upgrade (no payment yet)
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { changeWorkspacePlan, ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import type { PlanCode } from '@/app/types/atlas-billing';
import { PLAN_CODES } from '@/app/types/atlas-billing';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireWorkspaceRole, permissionJsonResponse } from '@/app/lib/atlas-permissions';
import { queueSubscriptionEmail } from '@/lib/email';
import { resolveAuthUserContact } from '@/app/lib/email-transactional';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { planCode?: string; workspaceId?: string };
  const planCode = body.planCode?.trim().toUpperCase() as PlanCode;
  if (!planCode || !PLAN_CODES.includes(planCode)) {
    return NextResponse.json({ error: 'invalid_plan_code' }, { status: 400 });
  }

  const db = getSupabaseServiceRoleClient();
  const { workspaceId } = await ensureWorkspaceSubscription(db, userId, body.workspaceId ?? null);

  const perm = await requireWorkspaceRole(db, userId, workspaceId, 'manager');
  if (!perm.ok) return permissionJsonResponse(perm);

  const subscription = await changeWorkspacePlan(db, userId, workspaceId, planCode);

  const contact = await resolveAuthUserContact(db, userId);
  if (contact) {
    queueSubscriptionEmail(contact.email, contact.displayName, subscription.planName || planCode, 'change');
  }

  return NextResponse.json({
    ok: true,
    message: 'Demande de changement enregistrée. Paiement non requis pour cette étape.',
    subscription,
  });
}
