import { NextRequest, NextResponse } from 'next/server';
import type { PlanCode, SubscriptionStatus } from '@/app/types/atlas-billing';
import { PLAN_CODES } from '@/app/types/atlas-billing';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireAdmin, writeAdminLog } from '@/app/lib/admin/require-admin';
import { revalidateAdminSurfaces } from '@/app/lib/admin/revalidate-admin-paths';
import { isOwnerEmail } from '@/app/lib/owner';
import { isUuid, ATLAS_PROFILE_PLANS, type AtlasProfilePlan } from '@/app/lib/admin/atlas-admin-profile-fields';
import {
  applyAdminEntitlementOverride,
  loadAdminEntitlementSnapshot,
} from '@/app/lib/admin/admin-entitlement-override';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUB_STATUSES = ['trial', 'active', 'expired', 'cancelled'] as const;

function isPlanCode(v: string): v is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(v);
}

function isProfilePlan(v: string): v is AtlasProfilePlan {
  return (ATLAS_PROFILE_PLANS as readonly string[]).includes(v);
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const userId = String(id ?? '').trim();
  if (!userId || !isUuid(userId)) return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();
  try {
    const snapshot = await loadAdminEntitlementSnapshot(admin, userId);
    return NextResponse.json({ ok: true, entitlement: snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'load_failed';
    return NextResponse.json({ error: 'load_failed', message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const userId = String(id ?? '').trim();
  if (!userId || !isUuid(userId)) return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as null | {
    plan?: string;
    workspacePlanCode?: string;
    subscriptionStatus?: string;
    trialEndsAt?: string | null;
    permanent?: boolean;
    trialExtendDays?: number;
    resetQuotas?: boolean;
    note?: string;
  };

  const plan = typeof body?.plan === 'string' ? body.plan.trim().toLowerCase() : undefined;
  const workspacePlanCode =
    typeof body?.workspacePlanCode === 'string' ? body.workspacePlanCode.trim().toUpperCase() : undefined;
  const subscriptionStatus =
    typeof body?.subscriptionStatus === 'string' ? body.subscriptionStatus.trim().toLowerCase() : undefined;

  if (plan && !isProfilePlan(plan)) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  if (workspacePlanCode && !isPlanCode(workspacePlanCode)) {
    return NextResponse.json({ error: 'invalid_workspace_plan' }, { status: 400 });
  }
  if (subscriptionStatus && !(SUB_STATUSES as readonly string[]).includes(subscriptionStatus)) {
    return NextResponse.json({ error: 'invalid_subscription_status' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const [{ data: targetProf }, { data: targetAuth }] = await Promise.all([
    admin.from('profiles').select('email').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const targetEmail = String((targetProf as { email?: string | null } | null)?.email ?? '').trim().toLowerCase();
  const targetAuthEmail = String(targetAuth?.user?.email ?? '').trim().toLowerCase();
  const targetIsOwner = isOwnerEmail(targetEmail) || isOwnerEmail(targetAuthEmail);
  const actorIsOwner = isOwnerEmail(guard.adminEmail);
  if (targetIsOwner && !actorIsOwner) {
    return NextResponse.json({ error: 'owner_immutable' }, { status: 403 });
  }

  const result = await applyAdminEntitlementOverride(admin, userId, {
    plan: plan && isProfilePlan(plan) ? plan : undefined,
    workspacePlanCode: workspacePlanCode && isPlanCode(workspacePlanCode) ? workspacePlanCode : undefined,
    subscriptionStatus: subscriptionStatus as Extract<SubscriptionStatus, 'trial' | 'active' | 'expired' | 'cancelled'> | undefined,
    trialEndsAt: body?.trialEndsAt === undefined ? undefined : body.trialEndsAt,
    permanent: body?.permanent === true,
    trialExtendDays: typeof body?.trialExtendDays === 'number' ? body.trialExtendDays : undefined,
    resetQuotas: body?.resetQuotas === true,
    note: typeof body?.note === 'string' ? body.note : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.error }, { status: 400 });
  }

  await writeAdminLog({
    adminId: guard.adminUserId,
    targetUserId: userId,
    action: 'USER_ENTITLEMENT_OVERRIDE',
    details: {
      plan: plan ?? null,
      workspacePlanCode: workspacePlanCode ?? null,
      subscriptionStatus: subscriptionStatus ?? null,
      permanent: body?.permanent === true,
      trialExtendDays: body?.trialExtendDays ?? null,
      trialEndsAt: body?.trialEndsAt ?? null,
      resetQuotas: body?.resetQuotas === true,
      note: body?.note ?? null,
    },
  });

  revalidateAdminSurfaces([`/admin/users/${userId}`, '/admin/users']);

  return NextResponse.json({ ok: true, entitlement: result.snapshot });
}
