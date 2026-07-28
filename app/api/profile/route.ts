import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { ensureUserProfile } from '@/app/lib/ensure-user-profile';
import {
  normalizeProfilePlan,
  normalizeProfileRole,
  profileGuardErrorMessage,
} from '@/app/lib/atlas-profile-guards';
import { normalizeStatus, type ProfileStatus } from '@/app/types/auth';
import type { AtlasProfile, AtlasProfileUserPatch } from '@/app/types/atlas-profile';

export const dynamic = 'force-dynamic';

const PROFILE_SELECT =
  'id, email, role, plan, status, full_name, company_name, phone, onboarding_completed, created_at, updated_at';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

type ProfileRow = {
  id: string;
  email?: string | null;
  role?: string | null;
  plan?: string | null;
  status?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  onboarding_completed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
}

function createServiceRoleClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToProfile(row: ProfileRow, fallbackEmail = ''): AtlasProfile {
  const status: ProfileStatus = normalizeStatus(row.status);
  return {
    id: row.id,
    email: String(row.email ?? fallbackEmail).trim(),
    role: normalizeProfileRole(row.role),
    plan: normalizeProfilePlan(row.plan),
    status,
    full_name: String(row.full_name ?? '').trim(),
    company_name: String(row.company_name ?? '').trim(),
    phone: String(row.phone ?? '').trim(),
    onboarding_completed: Boolean(row.onboarding_completed),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function fallbackProfile(user: User): AtlasProfile {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === 'string'
      ? meta.full_name
      : typeof meta?.name === 'string'
        ? meta.name
        : '';
  const now = new Date().toISOString();
  return {
    id: user.id,
    email: String(user.email ?? '').trim(),
    role: 'user',
    plan: 'free',
    status: 'pending',
    full_name: fullName.trim(),
    company_name: '',
    phone: '',
    onboarding_completed: false,
    created_at: now,
    updated_at: now,
  };
}

async function loadProfile(admin: SupabaseClient, user: User): Promise<AtlasProfile> {
  const ensured = await ensureUserProfile(admin, user, { source: 'api/profile' });
  if (!ensured.ok) {
    console.warn('[api/profile] ensureUserProfile failed, returning fallback profile:', ensured.error);
    return fallbackProfile(user);
  }

  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) {
    console.warn('[api/profile] profile read failed after ensure, returning fallback:', error?.message);
    return fallbackProfile(user);
  }

  return rowToProfile(data as ProfileRow, user.email ?? '');
}

function validatePatch(body: AtlasProfileUserPatch): { ok: true } | { ok: false; error: string } {
  if (body.full_name !== undefined && body.full_name.trim().length > 120) {
    return { ok: false, error: 'invalid_full_name' };
  }
  if (body.company_name !== undefined && body.company_name.trim().length > 200) {
    return { ok: false, error: 'invalid_company_name' };
  }
  if (body.phone !== undefined && body.phone !== null && body.phone.trim().length > 40) {
    return { ok: false, error: 'invalid_phone' };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.code }, { status: session.status, headers: NO_STORE_HEADERS });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    console.error('[api/profile] GET misconfigured: SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'misconfigured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(session.userId);
    if (authError) {
      console.error('[api/profile] GET auth.admin.getUserById failed:', authError.message);
      return NextResponse.json({ error: 'auth_lookup_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (!authUser.user) {
      return NextResponse.json({ error: 'auth_lookup_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const profile = await loadProfile(admin, authUser.user);
    return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/profile] GET unexpected error:', message);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function PATCH(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.code }, { status: session.status, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => ({}))) as AtlasProfileUserPatch;
  const valid = validatePatch(body);
  if (!valid.ok) {
    return NextResponse.json(
      { error: valid.error, message: profileGuardErrorMessage(valid.error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    console.error('[api/profile] PATCH misconfigured: SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'misconfigured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.full_name !== undefined) patch.full_name = body.full_name.trim();
    if (body.company_name !== undefined) patch.company_name = body.company_name.trim();
    if (body.phone !== undefined) patch.phone = body.phone?.trim() || null;
    if (body.onboarding_completed !== undefined) patch.onboarding_completed = body.onboarding_completed;

    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(session.userId);
    if (authError || !authUser.user) {
      console.error('[api/profile] PATCH auth lookup failed:', authError?.message ?? 'missing_user');
      return NextResponse.json({ error: 'auth_lookup_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const ensured = await ensureUserProfile(admin, authUser.user, { source: 'api/profile PATCH' });
    if (!ensured.ok) {
      console.error('[api/profile] PATCH ensure failed:', ensured.error);
      return NextResponse.json({ error: 'profile_ensure_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const email = authUser.user.email ?? '';
    const upsertPayload = {
      id: session.userId,
      email: email || null,
      updated_at: patch.updated_at,
      ...(patch.full_name !== undefined ? { full_name: patch.full_name } : {}),
      ...(patch.company_name !== undefined ? { company_name: patch.company_name } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.onboarding_completed !== undefined ? { onboarding_completed: patch.onboarding_completed } : {}),
    };

    const { data, error } = await admin
      .from('profiles')
      .upsert(upsertPayload, { onConflict: 'id' })
      .select(PROFILE_SELECT)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (!data) {
      return NextResponse.json({ profile: fallbackProfile(authUser.user) }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ profile: rowToProfile(data as ProfileRow, email) }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/profile] PATCH unexpected error:', message);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
