import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireAdmin, writeAdminLog } from '@/app/lib/admin/require-admin';
import { isOwnerEmail } from '@/app/lib/owner';
import { roleGrantsAdminAccess } from '@/app/lib/admin/can-access-admin';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type Role = 'user' | 'admin' | 'moderator' | 'owner';
type Plan = 'free' | 'pro' | 'vip' | 'enterprise';
type Status = 'pending' | 'active' | 'suspended' | 'banned';

function isRole(v: string): v is Role {
  return v === 'user' || v === 'admin' || v === 'moderator' || v === 'owner';
}
function isPlan(v: string): v is Plan {
  return v === 'free' || v === 'pro' || v === 'vip' || v === 'enterprise';
}
function isStatus(v: string): v is Status {
  return v === 'pending' || v === 'active' || v === 'suspended' || v === 'banned';
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const userId = String(id ?? '').trim();
  if (!userId || !isUuid(userId)) return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();

  type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
    plan: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
    last_login: string | null;
  };
  type SubscriptionRow = {
    id: string;
    plan_id: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string | null;
    metadata: unknown;
  };
  type AdminLogRow = { id: string; admin_id: string; target_user_id: string | null; action: string; details: unknown; created_at: string };

  const [{ data: userWrap }, { data: profile }, { data: subs }, { data: logs }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, plan, status, created_at, updated_at, last_login')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('atlas_subscriptions')
      .select('id, plan_id, status, start_date, end_date, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25),
    admin
      .from('admin_logs')
      .select('id, admin_id, target_user_id, action, details, created_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const p = (profile ?? null) as ProfileRow | null;
  const authUser = userWrap?.user ?? null;
  const appMeta = (authUser?.app_metadata ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    user: {
      id: userId,
      email: p?.email ?? authUser?.email ?? '',
      full_name: p?.full_name ?? '',
      avatar_url: p?.avatar_url ?? '',
      role: p?.role ?? String(appMeta.role ?? 'user'),
      plan: p?.plan ?? 'free',
      status: p?.status ?? 'active',
      created_at: p?.created_at ?? authUser?.created_at ?? null,
      last_login: p?.last_login ?? null,
      app_metadata: appMeta,
    },
    subscriptions: (subs ?? []) as SubscriptionRow[],
    adminLogs: (logs ?? []) as AdminLogRow[],
  });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const userId = String(id ?? '').trim();
  if (!userId || !isUuid(userId)) return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as
    | null
    | { role?: string; plan?: string; status?: string; full_name?: string };

  const role = typeof body?.role === 'string' ? body.role.trim() : undefined;
  const plan = typeof body?.plan === 'string' ? body.plan.trim() : undefined;
  const status = typeof body?.status === 'string' ? body.status.trim() : undefined;
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : undefined;

  if (role && !isRole(role)) return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  if (plan && !isPlan(plan)) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  if (status && !isStatus(status)) return NextResponse.json({ error: 'invalid_status' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();

  const [{ data: targetProf }, { data: targetAuth }] = await Promise.all([
    admin.from('profiles').select('email, role, status').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const targetEmail = String((targetProf as { email?: string | null } | null)?.email ?? '').trim().toLowerCase();
  const targetAuthEmail = String(targetAuth?.user?.email ?? '').trim().toLowerCase();
  const targetIsOwner = isOwnerEmail(targetEmail) || isOwnerEmail(targetAuthEmail);
  const prevStatus = String((targetProf as { status?: string | null } | null)?.status ?? '').trim().toLowerCase();

  if (targetIsOwner) {
    // Owner is immutable from the admin panel.
    if (role && role !== 'owner') return NextResponse.json({ error: 'owner_immutable' }, { status: 403 });
    if (status && status !== 'active') return NextResponse.json({ error: 'owner_immutable' }, { status: 403 });
    if (plan && plan !== 'enterprise') return NextResponse.json({ error: 'owner_immutable' }, { status: 403 });
  }

  if (guard.adminUserId === userId && status && status !== 'active') {
    return NextResponse.json({ error: 'cannot_disable_self' }, { status: 400 });
  }
  if (guard.adminUserId === userId && role && !roleGrantsAdminAccess(role)) {
    return NextResponse.json({ error: 'cannot_demote_self' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (role) updates.role = role;
  if (plan) updates.plan = plan;
  if (status) updates.status = status;
  if (fullName !== undefined) updates.full_name = fullName;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  // Ensure profile exists
  await admin.from('profiles').upsert({ id: userId, email: null }, { onConflict: 'id' });

  const { error: upErr } = await admin.from('profiles').update(updates).eq('id', userId);
  if (upErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  // Keep JWT metadata role in sync for middleware protection.
  if (role) {
    if (role === 'owner' && !targetIsOwner) {
      return NextResponse.json({ error: 'owner_email_only' }, { status: 400 });
    }
    await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
  }

  const nextStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  const isApproval = prevStatus === 'pending' && nextStatus === 'active';
  const isRejection = prevStatus === 'pending' && nextStatus === 'banned';

  await writeAdminLog({
    adminId: guard.adminUserId,
    targetUserId: userId,
    action: isApproval ? 'USER_APPROVED' : isRejection ? 'USER_REJECTED' : 'USER_UPDATED',
    details: { updates, prevStatus: prevStatus || null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const userId = String(id ?? '').trim();
  if (!userId || !isUuid(userId)) return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });

  if (guard.adminUserId === userId) {
    return NextResponse.json({ error: 'cannot_delete_self' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const [{ data: prof }, { data: authWrap }] = await Promise.all([
    admin.from('profiles').select('email').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const profileEmail = String((prof as { email?: string | null } | null)?.email ?? '').trim().toLowerCase();
  const authEmail = String(authWrap?.user?.email ?? '').trim().toLowerCase();
  if (isOwnerEmail(profileEmail) || isOwnerEmail(authEmail)) {
    return NextResponse.json({ error: 'cannot_delete_owner' }, { status: 403 });
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: 'admin_api_error' }, { status: 500 });

  await writeAdminLog({
    adminId: guard.adminUserId,
    targetUserId: userId,
    action: 'USER_DELETED',
    details: {},
  });

  return NextResponse.json({ ok: true });
}

